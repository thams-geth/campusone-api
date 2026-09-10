import { z } from 'zod'
import { FeeAdjustmentType, FeeCategory, PaymentMethod } from '@prisma/client'

export const feeStructureInputSchema = z.object({
  programId: z.string().min(1, 'Program is required'),
  academicYearId: z.string().min(1, 'Academic year is required'),
  category: z.nativeEnum(FeeCategory),
  amount: z.coerce.number().int().min(1),
})
export type FeeStructureInput = z.infer<typeof feeStructureInputSchema>

export const listFeeStructuresQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  programId: z.string().trim().optional(),
  academicYearId: z.string().trim().optional(),
})
export type ListFeeStructuresQuery = z.infer<typeof listFeeStructuresQuerySchema>

export const feeInvoiceInputSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  feeStructureId: z.string().min(1).optional(),
  category: z.nativeEnum(FeeCategory),
  amount: z.coerce.number().int().min(1),
  dueDate: z.coerce.date(),
})
export type FeeInvoiceInput = z.infer<typeof feeInvoiceInputSchema>

export const listFeeInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED']).optional(),
  category: z.nativeEnum(FeeCategory).optional(),
})
export type ListFeeInvoicesQuery = z.infer<typeof listFeeInvoicesQuerySchema>

export const feeAdjustmentInputSchema = z.object({
  type: z.nativeEnum(FeeAdjustmentType),
  amount: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3, 'A reason is required').max(300),
})
export type FeeAdjustmentInput = z.infer<typeof feeAdjustmentInputSchema>

export const paymentInputSchema = z.object({
  amount: z.coerce.number().int().min(1),
  method: z.nativeEnum(PaymentMethod),
  transactionRef: z.string().trim().max(100).optional(),
})
export type PaymentInput = z.infer<typeof paymentInputSchema>

export const refundInputSchema = z.object({
  amount: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3, 'A reason is required').max(300),
})
export type RefundInput = z.infer<typeof refundInputSchema>
