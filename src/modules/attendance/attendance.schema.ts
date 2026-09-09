import { z } from 'zod'
import { AttendanceStatus } from '@prisma/client'

export const createSessionSchema = z.object({
  sectionId: z.string().min(1, 'Section is required'),
  subjectId: z.string().min(1, 'Subject is required'),
  date: z.coerce.date(),
  // Optional: lets an admin create a session on a faculty member's
  // behalf. Omitted, it resolves to the caller's own Faculty profile
  // (see attendance.service.ts's createSession) — the normal case of a
  // faculty member taking their own class's attendance.
  facultyId: z.string().min(1).optional(),
})
export type CreateSessionInput = z.infer<typeof createSessionSchema>

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sectionId: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  facultyId: z.string().trim().optional(),
})
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>

export const markRecordsSchema = z.object({
  records: z
    .array(z.object({ studentId: z.string().min(1), status: z.nativeEnum(AttendanceStatus) }))
    .min(1, 'At least one record is required'),
})
export type MarkRecordsInput = z.infer<typeof markRecordsSchema>

export const listRecordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})
export type ListRecordsQuery = z.infer<typeof listRecordsQuerySchema>

export const requestCorrectionSchema = z.object({
  requestedStatus: z.nativeEnum(AttendanceStatus),
  reason: z.string().trim().min(3, 'Reason is required').max(300),
})
export type RequestCorrectionInput = z.infer<typeof requestCorrectionSchema>

export const listCorrectionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
})
export type ListCorrectionsQuery = z.infer<typeof listCorrectionsQuerySchema>
