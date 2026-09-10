import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as apiKeyService from './apiKey.service'
import { createApiKeySchema } from './apiKey.schema'

export async function listApiKeys(req: Request, res: Response) {
  res.json(await apiKeyService.listApiKeys(req.auth!.tenantId))
}

export async function createApiKey(req: Request, res: Response) {
  const input = createApiKeySchema.parse(req.body)
  res.status(201).json(await apiKeyService.createApiKey(req.auth!.tenantId, req.auth!.userId, input))
}

export async function revokeApiKey(req: Request, res: Response) {
  await apiKeyService.revokeApiKey(req.auth!.tenantId, requireParam(req, 'id'))
  res.status(204).end()
}
