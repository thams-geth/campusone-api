import { z } from 'zod'
import { DepartmentStatus } from '@prisma/client'

export const departmentInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Only letters, numbers, and hyphens allowed')
    .transform((value) => value.toUpperCase()),
  headOfDepartment: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  status: z.nativeEnum(DepartmentStatus),
})

export type DepartmentInput = z.infer<typeof departmentInputSchema>

export const listDepartmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.nativeEnum(DepartmentStatus).optional(),
})

export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>
