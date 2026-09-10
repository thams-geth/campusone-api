import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as classGroupService from './classGroup.service'
import { listClassGroupMessagesQuerySchema, postClassGroupMessageSchema } from './classGroup.schema'

export async function listMessages(req: Request, res: Response) {
  const query = listClassGroupMessagesQuerySchema.parse(req.query)
  const { userId, tenantId, role } = req.auth!
  res.json(await classGroupService.listMessages(tenantId, userId, role, requireParam(req, 'sectionId'), query))
}

export async function postMessage(req: Request, res: Response) {
  const input = postClassGroupMessageSchema.parse(req.body)
  const { userId, tenantId, role } = req.auth!
  res.status(201).json(await classGroupService.postMessage(tenantId, userId, role, requireParam(req, 'sectionId'), input))
}
