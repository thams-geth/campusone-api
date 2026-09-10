import { z } from 'zod'
import { Gender } from '@prisma/client'

export const admissionApplicationInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().trim().min(7).max(20),
  dateOfBirth: z.coerce.date(),
  programId: z.string().min(1, 'Program is required'),
})
export type AdmissionApplicationInput = z.infer<typeof admissionApplicationInputSchema>

export const listAdmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  programId: z.string().trim().optional(),
  status: z
    .enum(['APPLIED', 'DOCUMENT_VERIFICATION', 'SHORTLISTED', 'APPROVED', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'])
    .optional(),
})
export type ListAdmissionsQuery = z.infer<typeof listAdmissionsQuerySchema>

export const advanceApplicationSchema = z.object({
  reviewNotes: z.string().trim().max(500).optional(),
})
export type AdvanceApplicationInput = z.infer<typeof advanceApplicationSchema>

export const enrollApplicationSchema = z.object({
  rollNumber: z.string().trim().min(2, 'Roll number is required').max(20),
  gender: z.nativeEnum(Gender),
  sectionId: z.string().min(1).optional(),
})
export type EnrollApplicationInput = z.infer<typeof enrollApplicationSchema>
