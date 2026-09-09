import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { assignRoleSchema } from './rbac.schema'
import * as rbacService from './rbac.service'

export async function listRoles(req: Request, res: Response) {
  res.json(await rbacService.listRoles(req.auth!.tenantId))
}

export async function listPermissions(_req: Request, res: Response) {
  res.json(rbacService.listPermissions())
}

export async function assignRole(req: Request, res: Response) {
  const input = assignRoleSchema.parse(req.body)
  res.json(await rbacService.assignRole(req.auth!.tenantId, requireParam(req, 'id'), input))
}
