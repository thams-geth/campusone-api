import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as integrationService from './integration.service'
import { integrationProviderParamSchema, upsertIntegrationConfigSchema } from './integration.schema'

export async function listIntegrations(req: Request, res: Response) {
  res.json(await integrationService.listIntegrations(req.auth!.tenantId))
}

export async function upsertIntegration(req: Request, res: Response) {
  const provider = integrationProviderParamSchema.parse(requireParam(req, 'provider'))
  const input = upsertIntegrationConfigSchema.parse(req.body)
  res.json(await integrationService.upsertIntegration(req.auth!.tenantId, provider, input))
}
