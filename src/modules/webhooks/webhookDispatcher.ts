import crypto from 'node:crypto'
import { assertPublicHttpsUrl } from '../../utils/ssrfGuard'
import { prisma } from '../../prisma/client'
import { logger } from '../../config/logger'

const DELIVERY_TIMEOUT_MS = 5000

function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

async function deliverOne(endpoint: { id: string; url: string; secret: string }, eventType: string, deliveryId: string, body: string) {
  try {
    // Re-checked immediately before the request, not just at
    // registration — DNS can be rebound between the two (see
    // src/utils/ssrfGuard.ts).
    await assertPublicHttpsUrl(endpoint.url)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': eventType,
          'X-Webhook-Signature': signPayload(endpoint.secret, body),
        },
        body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: response.ok ? 'DELIVERED' : 'FAILED',
        responseStatus: response.status,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    })
  } catch (err) {
    logger.warn({ err, webhookEndpointId: endpoint.id }, 'Webhook delivery failed')
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', attempts: { increment: 1 }, lastAttemptAt: new Date() },
    })
  }
}

/**
 * Fires a single inline delivery attempt per matching, enabled endpoint
 * — no retry queue (matching "no BullMQ until a module actually needs
 * one"); WebhookDelivery is what a future queue-backed retry would
 * read from. Never throws: a webhook subsystem failure must not break
 * the primary operation (e.g. creating a student) that triggered it.
 */
export async function triggerWebhooks(tenantId: string, eventType: string, payload: unknown): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId, enabled: true, eventTypes: { has: eventType } },
    })
    if (endpoints.length === 0) return

    const body = JSON.stringify({ event: eventType, data: payload })

    await Promise.all(
      endpoints.map(async (endpoint) => {
        const delivery = await prisma.webhookDelivery.create({
          data: { tenantId, webhookEndpointId: endpoint.id, eventType, payload: payload as never, status: 'PENDING' },
        })
        await deliverOne(endpoint, eventType, delivery.id, body)
      }),
    )
  } catch (err) {
    logger.warn({ err, tenantId, eventType }, 'Webhook dispatch failed')
  }
}
