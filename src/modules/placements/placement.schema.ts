import { z } from 'zod'

export const companyInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(160),
  website: z.string().trim().url().optional(),
})
export type CompanyInput = z.infer<typeof companyInputSchema>

export const jobOpeningInputSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(160),
  description: z.string().trim().max(2000).optional(),
  minCgpa: z.coerce.number().min(0).max(10).optional(),
  ctcOffered: z.coerce.number().int().min(0).optional(),
  applicationDeadline: z.coerce.date().optional(),
})
export type JobOpeningInput = z.infer<typeof jobOpeningInputSchema>

export const listJobOpeningsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  companyId: z.string().trim().optional(),
})
export type ListJobOpeningsQuery = z.infer<typeof listJobOpeningsQuerySchema>

export const applyToJobSchema = z.object({
  studentId: z.string().min(1).optional(),
})
export type ApplyToJobInput = z.infer<typeof applyToJobSchema>

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED']),
  notes: z.string().trim().max(500).optional(),
  offeredCtc: z.coerce.number().int().min(0).optional(),
})
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>

export const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  jobOpeningId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  status: z.enum(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED']).optional(),
})
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>
