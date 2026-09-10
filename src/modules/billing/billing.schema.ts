import { z } from 'zod'

export const setSubscriptionSchema = z.object({
  planId: z.string().min(1, 'Plan is required'),
})
export type SetSubscriptionInput = z.infer<typeof setSubscriptionSchema>

export const createInvoiceSchema = z.object({
  amount: z.coerce.number().int().min(0).optional(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
})
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE']).optional(),
})
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>
