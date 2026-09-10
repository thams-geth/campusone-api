import { z } from 'zod'
import { ApprovalStatus } from '@prisma/client'

export const createApprovalRequestSchema = z.object({
  type: z.string().trim().min(1, 'Type is required').max(60),
  entity: z.string().trim().min(1, 'Entity is required').max(60),
  entityId: z.string().trim().min(1, 'Entity id is required'),
  reason: z.string().trim().max(500).optional(),
})
export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>

export const decideApprovalRequestSchema = z.object({
  decisionNotes: z.string().trim().max(500).optional(),
})
export type DecideApprovalRequestInput = z.infer<typeof decideApprovalRequestSchema>

export const listApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ApprovalStatus).optional(),
  type: z.string().trim().optional(),
})
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>
