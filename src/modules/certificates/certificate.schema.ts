import { z } from 'zod'

export const certificateTypeInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  category: z.string().trim().max(60).optional(),
})
export type CertificateTypeInput = z.infer<typeof certificateTypeInputSchema>

export const createCertificateRequestSchema = z.object({
  certificateTypeId: z.string().min(1, 'Certificate type is required'),
  studentId: z.string().min(1).optional(),
})
export type CreateCertificateRequestInput = z.infer<typeof createCertificateRequestSchema>

export const listCertificateRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  status: z.enum(['REQUESTED', 'ISSUED', 'REJECTED']).optional(),
})
export type ListCertificateRequestsQuery = z.infer<typeof listCertificateRequestsQuerySchema>

export const rejectCertificateRequestSchema = z.object({
  rejectionReason: z.string().trim().min(3, 'A reason is required').max(300),
})
export type RejectCertificateRequestInput = z.infer<typeof rejectCertificateRequestSchema>
