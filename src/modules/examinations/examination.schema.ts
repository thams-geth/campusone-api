import { z } from 'zod'
import { ExamType, MarksSpecialStatus } from '@prisma/client'

export const examInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    examType: z.nativeEnum(ExamType),
    academicYearId: z.string().min(1, 'Academic year is required'),
    semesterNumber: z.coerce.number().int().min(1).max(12),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.endDate >= data.startDate, { message: 'End date must be on or after start date', path: ['endDate'] })
export type ExamInput = z.infer<typeof examInputSchema>

export const listExamsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  academicYearId: z.string().trim().optional(),
  semesterNumber: z.coerce.number().int().min(1).max(12).optional(),
  status: z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED']).optional(),
})
export type ListExamsQuery = z.infer<typeof listExamsQuerySchema>

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use 24h HH:mm, e.g. "09:00"')

export const examScheduleInputSchema = z
  .object({
    subjectId: z.string().min(1, 'Subject is required'),
    examDate: z.coerce.date(),
    startTime: timeOfDay,
    endTime: timeOfDay,
    roomId: z.string().min(1, 'Room is required'),
  })
  .refine((data) => data.endTime > data.startTime, { message: 'End time must be after start time', path: ['endTime'] })
export type ExamScheduleInput = z.infer<typeof examScheduleInputSchema>

export const enterMarksSchema = z.object({
  marks: z
    .array(
      z.object({
        studentId: z.string().min(1),
        marksObtained: z.coerce.number().int().min(0).optional(),
        maxMarks: z.coerce.number().int().min(1),
        specialStatus: z.nativeEnum(MarksSpecialStatus).optional(),
      }),
    )
    .min(1, 'At least one mark entry is required'),
})
export type EnterMarksInput = z.infer<typeof enterMarksSchema>

export const reviseMarksSchema = z.object({
  marksObtained: z.coerce.number().int().min(0),
  reason: z.string().trim().min(3, 'A reason is required for revising published marks').max(300),
})
export type ReviseMarksInput = z.infer<typeof reviseMarksSchema>

export const editMarksSchema = z.object({
  marksObtained: z.coerce.number().int().min(0).optional(),
  specialStatus: z.nativeEnum(MarksSpecialStatus).optional(),
})
export type EditMarksInput = z.infer<typeof editMarksSchema>
