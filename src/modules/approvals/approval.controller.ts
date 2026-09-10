import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as approvalService from './approval.service'
import { createApprovalRequestSchema, decideApprovalRequestSchema, listApprovalsQuerySchema } from './approval.schema'

export async function listApprovals(req: Request, res: Response) {
  const query = listApprovalsQuerySchema.parse(req.query)
  res.json(await approvalService.listApprovals(req.auth!.tenantId, query))
}

export async function createApprovalRequest(req: Request, res: Response) {
  const input = createApprovalRequestSchema.parse(req.body)
  res.status(201).json(await approvalService.createApprovalRequest(req.auth!.tenantId, req.auth!.userId, input))
}

export async function approveRequest(req: Request, res: Response) {
  const input = decideApprovalRequestSchema.parse(req.body)
  res.json(await approvalService.approveRequest(requireParam(req, 'id'), req.auth!.userId, input))
}

export async function rejectRequest(req: Request, res: Response) {
  const input = decideApprovalRequestSchema.parse(req.body)
  res.json(await approvalService.rejectRequest(requireParam(req, 'id'), req.auth!.userId, input))
}
