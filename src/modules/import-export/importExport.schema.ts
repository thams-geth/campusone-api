import { z } from 'zod'
import { StudentStatus } from '@prisma/client'

export const importCsvSchema = z.object({
  csv: z.string().min(1, 'CSV content is required'),
})
export type ImportCsvInput = z.infer<typeof importCsvSchema>

export const exportStudentsQuerySchema = z.object({
  departmentId: z.string().trim().optional(),
  status: z.nativeEnum(StudentStatus).optional(),
})
export type ExportStudentsQuery = z.infer<typeof exportStudentsQuerySchema>
