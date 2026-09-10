import crypto from 'node:crypto'
import { ApiError } from '../../utils/ApiError'
import { assertPublicHttpsUrl } from '../../utils/ssrfGuard'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { CreateWebhookEndpointInput, ListDeliveriesQuery, UpdateWebhookEndpointInput } from './webhook.schema'

const SECRET_BYTES = 32

export async function listEndpoints(tenantId: string) {
  return prisma.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
}

async function getOwnEndpoint(tenantId: string, id: string) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } })
  if (!endpoint || endpoint.tenantId !== tenantId) {
    throw ApiError.notFound('Webhook endpoint not found')
  }
  return endpoint
}

export async function createEndpoint(tenantId: string, input: CreateWebhookEndpointInput) {
  await assertPublicHttpsUrl(input.url)

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      tenantId,
      url: input.url,
      eventTypes: input.eventTypes,
      enabled: input.enabled ?? true,
      secret: crypto.randomBytes(SECRET_BYTES).toString('hex'),
    },
  })
  await logActivity(`registered a webhook endpoint for ${input.url}`, { entity: 'WebhookEndpoint', entityId: endpoint.id, action: 'CREATE' })
  return endpoint
}

export async function updateEndpoint(tenantId: string, id: string, input: UpdateWebhookEndpointInput) {
  await getOwnEndpoint(tenantId, id)
  if (input.url) {
    await assertPublicHttpsUrl(input.url)
  }

  const endpoint = await prisma.webhookEndpoint.update({
    where: { id },
    data: { url: input.url, eventTypes: input.eventTypes, enabled: input.enabled },
  })
  await logActivity('updated a webhook endpoint', { entity: 'WebhookEndpoint', entityId: id, action: 'UPDATE' })
  return endpoint
}

export async function deleteEndpoint(tenantId: string, id: string) {
  await getOwnEndpoint(tenantId, id)
  await prisma.webhookEndpoint.delete({ where: { id } })
  await logActivity('deleted a webhook endpoint', { entity: 'WebhookEndpoint', entityId: id, action: 'DELETE' })
}

export async function listDeliveries(tenantId: string, endpointId: string, params: ListDeliveriesQuery) {
  await getOwnEndpoint(tenantId, endpointId)
  const { page, pageSize } = params
  const where = { tenantId, webhookEndpointId: endpointId }

  const [data, total] = await Promise.all([
    prisma.webhookDelivery.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.webhookDelivery.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}
