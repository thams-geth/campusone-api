import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as webhookService from './webhook.service'
import { createWebhookEndpointSchema, listDeliveriesQuerySchema, updateWebhookEndpointSchema } from './webhook.schema'

export async function listEndpoints(req: Request, res: Response) {
  res.json(await webhookService.listEndpoints(req.auth!.tenantId))
}

export async function createEndpoint(req: Request, res: Response) {
  const input = createWebhookEndpointSchema.parse(req.body)
  res.status(201).json(await webhookService.createEndpoint(req.auth!.tenantId, input))
}

export async function updateEndpoint(req: Request, res: Response) {
  const input = updateWebhookEndpointSchema.parse(req.body)
  res.json(await webhookService.updateEndpoint(req.auth!.tenantId, requireParam(req, 'id'), input))
}

export async function deleteEndpoint(req: Request, res: Response) {
  await webhookService.deleteEndpoint(req.auth!.tenantId, requireParam(req, 'id'))
  res.status(204).end()
}

export async function listDeliveries(req: Request, res: Response) {
  const query = listDeliveriesQuerySchema.parse(req.query)
  res.json(await webhookService.listDeliveries(req.auth!.tenantId, requireParam(req, 'id'), query))
}
