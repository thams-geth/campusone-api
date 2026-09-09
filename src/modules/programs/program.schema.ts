import { z } from 'zod'
import { ProgramStatus } from '@prisma/client'

export const programInputSchema = z.object({
  departmentId: z.string().min(1, 'Department is required'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Only letters, numbers, and hyphens allowed')
    .transform((value) => value.toUpperCase()),
  durationYears: z.coerce.number().int().min(1).max(10),
  status: z.nativeEnum(ProgramStatus).default('ACTIVE'),
})

export type ProgramInput = z.infer<typeof programInputSchema>

export const listProgramsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  status: z.nativeEnum(ProgramStatus).optional(),
})

export type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>
