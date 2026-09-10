import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { CreateApprovalRequestInput, DecideApprovalRequestInput, ListApprovalsQuery } from './approval.schema'

export async function listApprovals(tenantId: string, params: ListApprovalsQuery) {
  const { page, pageSize, status, type } = params
  const where = { tenantId, ...(status ? { status } : {}), ...(type ? { type } : {}) }

  const [data, total] = await Promise.all([
    prisma.approvalRequest.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.approvalRequest.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function createApprovalRequest(tenantId: string, requestedByUserId: string, input: CreateApprovalRequestInput) {
  const approval = await prisma.approvalRequest.create({
    data: { tenantId, requestedByUserId, ...input },
  })
  await logActivity(`requested approval for ${input.entity}`, { entity: 'ApprovalRequest', entityId: approval.id, action: 'CREATE' })
  return approval
}

async function decide(id: string, decidedByUserId: string, status: 'APPROVED' | 'REJECTED', input: DecideApprovalRequestInput) {
  const approval = await prisma.approvalRequest.findUnique({ where: { id } })
  if (!approval) throw ApiError.notFound('Approval request not found')
  if (approval.status !== 'PENDING') {
    throw ApiError.conflict(`This request is already ${approval.status.toLowerCase()}.`, 'ALREADY_DECIDED')
  }

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status, decidedByUserId, decidedAt: new Date(), decisionNotes: input.decisionNotes },
  })
  await logActivity(`${status === 'APPROVED' ? 'approved' : 'rejected'} an approval request for ${approval.entity}`, {
    entity: 'ApprovalRequest',
    entityId: id,
    action: status,
  })
  return updated
}

export async function approveRequest(id: string, decidedByUserId: string, input: DecideApprovalRequestInput) {
  return decide(id, decidedByUserId, 'APPROVED', input)
}

export async function rejectRequest(id: string, decidedByUserId: string, input: DecideApprovalRequestInput) {
  return decide(id, decidedByUserId, 'REJECTED', input)
}
