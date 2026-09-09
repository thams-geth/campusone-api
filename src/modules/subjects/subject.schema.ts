import { z } from 'zod'
import { SubjectType } from '@prisma/client'

export const subjectInputSchema = z.object({
  programId: z.string().min(1, 'Program is required'),
  semesterNumber: z.coerce.number().int().min(1).max(12),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Only letters, numbers, and hyphens allowed')
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  credits: z.coerce.number().int().min(1).max(10),
  type: z.nativeEnum(SubjectType).default('CORE'),
  facultyId: z.string().min(1).optional(),
})

export type SubjectInput = z.infer<typeof subjectInputSchema>

export const listSubjectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  semesterNumber: z.coerce.number().int().min(1).max(12).optional(),
  type: z.nativeEnum(SubjectType).optional(),
})

export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>
