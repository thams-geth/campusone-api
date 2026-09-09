import type { Request, Response } from 'express'
import { listAuditLogsQuerySchema } from './audit.schema'
import * as auditService from './audit.service'

export async function list(req: Request, res: Response) {
  const query = listAuditLogsQuerySchema.parse(req.query)
  res.json(await auditService.listAuditLogs(query))
}
