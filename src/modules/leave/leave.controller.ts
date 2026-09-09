import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as leaveService from './leave.service'
import {
  createLeaveRequestSchema,
  leaveTypeInputSchema,
  listLeaveRequestsQuerySchema,
  listLeaveTypesQuerySchema,
} from './leave.schema'

export async function listTypes(req: Request, res: Response) {
  const query = listLeaveTypesQuerySchema.parse(req.query)
  res.json(await leaveService.listLeaveTypes(query))
}

export async function createType(req: Request, res: Response) {
  const input = leaveTypeInputSchema.parse(req.body)
  res.status(201).json(await leaveService.createLeaveType(req.auth!.tenantId, input))
}

export async function updateType(req: Request, res: Response) {
  const input = leaveTypeInputSchema.parse(req.body)
  res.json(await leaveService.updateLeaveType(requireParam(req, 'id'), input))
}

export async function removeType(req: Request, res: Response) {
  await leaveService.deleteLeaveType(requireParam(req, 'id'))
  res.status(204).end()
}

export async function createRequest(req: Request, res: Response) {
  const input = createLeaveRequestSchema.parse(req.body)
  res.status(201).json(await leaveService.createLeaveRequest(req.auth!.tenantId, req.auth!.userId, input))
}

export async function listRequests(req: Request, res: Response) {
  const query = listLeaveRequestsQuerySchema.parse(req.query)
  res.json(await leaveService.listLeaveRequests(query))
}

export async function getRequest(req: Request, res: Response) {
  res.json(await leaveService.getLeaveRequest(requireParam(req, 'id')))
}

export async function approveRequest(req: Request, res: Response) {
  res.json(await leaveService.reviewLeaveRequest(requireParam(req, 'id'), req.auth!.userId, 'APPROVED'))
}

export async function rejectRequest(req: Request, res: Response) {
  res.json(await leaveService.reviewLeaveRequest(requireParam(req, 'id'), req.auth!.userId, 'REJECTED'))
}

export async function getBalance(req: Request, res: Response) {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear()
  res.json(await leaveService.getLeaveBalance(requireParam(req, 'studentId'), year))
}
