import { z } from 'zod'

export const leaveTypeInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  defaultDaysPerYear: z.coerce.number().int().min(0).max(365),
})
export type LeaveTypeInput = z.infer<typeof leaveTypeInputSchema>

export const listLeaveTypesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListLeaveTypesQuery = z.infer<typeof listLeaveTypesQuerySchema>

export const createLeaveRequestSchema = z
  .object({
    studentId: z.string().min(1).optional(),
    leaveTypeId: z.string().min(1, 'Leave type is required'),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().trim().min(3, 'Reason is required').max(300),
  })
  .refine((data) => data.endDate >= data.startDate, { message: 'End date must be on or after start date', path: ['endDate'] })
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>

export const listLeaveRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
})
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>
