import { z } from 'zod'

export const studentStrengthQuerySchema = z.object({
  departmentId: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
  sectionId: z.string().trim().optional(),
})
export type StudentStrengthQuery = z.infer<typeof studentStrengthQuerySchema>

export const attendanceReportQuerySchema = z.object({
  sectionId: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>

export const subjectPerformanceQuerySchema = z.object({
  programId: z.string().trim().optional(),
})
export type SubjectPerformanceQuery = z.infer<typeof subjectPerformanceQuerySchema>

export const examResultsQuerySchema = z.object({
  examId: z.string().min(1, 'examId is required'),
})
export type ExamResultsQuery = z.infer<typeof examResultsQuerySchema>
