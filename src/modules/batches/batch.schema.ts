import { z } from 'zod'
import { BatchStatus } from '@prisma/client'

export const batchInputSchema = z
  .object({
    programId: z.string().min(1, 'Program is required'),
    academicYearId: z.string().min(1, 'Academic year is required'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(40),
    startYear: z.coerce.number().int().min(2000).max(2100),
    endYear: z.coerce.number().int().min(2000).max(2100),
    status: z.nativeEnum(BatchStatus).default('ACTIVE'),
  })
  .refine((data) => data.endYear > data.startYear, { message: 'End year must be after start year', path: ['endYear'] })

export type BatchInput = z.infer<typeof batchInputSchema>

export const listBatchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  academicYearId: z.string().trim().optional(),
  status: z.nativeEnum(BatchStatus).optional(),
})

export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>
