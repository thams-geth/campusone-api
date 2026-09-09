import { z } from 'zod'

export const assignmentInputSchema = z
  .object({
    subjectId: z.string().min(1, 'Subject is required'),
    sectionId: z.string().min(1, 'Section is required'),
    facultyId: z.string().min(1).optional(),
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(160),
    description: z.string().trim().max(2000).optional(),
    startDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    maxMarks: z.coerce.number().int().min(1).max(1000),
  })
  .refine((data) => data.dueDate > data.startDate, { message: 'Due date must be after start date', path: ['dueDate'] })
export type AssignmentInput = z.infer<typeof assignmentInputSchema>

export const listAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sectionId: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
})
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>

export const submitAssignmentSchema = z.object({
  studentId: z.string().min(1).optional(),
  attachmentUrl: z.string().trim().url().optional(),
})
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>

export const evaluateSubmissionSchema = z.object({
  marksObtained: z.coerce.number().int().min(0),
  feedback: z.string().trim().max(1000).optional(),
})
export type EvaluateSubmissionInput = z.infer<typeof evaluateSubmissionSchema>

export const listSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['SUBMITTED', 'LATE', 'EVALUATED']).optional(),
})
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>
