import type { Request, Response } from 'express'
import { institutionUpdateSchema } from './institution.schema'
import * as institutionService from './institution.service'

export async function get(req: Request, res: Response) {
  res.json(await institutionService.getInstitution(req.auth!.tenantId))
}

export async function update(req: Request, res: Response) {
  const input = institutionUpdateSchema.parse(req.body)
  res.json(await institutionService.updateInstitution(req.auth!.tenantId, input))
}
