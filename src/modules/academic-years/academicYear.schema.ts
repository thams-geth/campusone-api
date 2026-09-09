import { z } from 'zod'
import { AcademicYearStatus } from '@prisma/client'

export const academicYearInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(20),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isCurrent: z.boolean().default(false),
    status: z.nativeEnum(AcademicYearStatus).default('ACTIVE'),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  })

export type AcademicYearInput = z.infer<typeof academicYearInputSchema>

export const listAcademicYearsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.nativeEnum(AcademicYearStatus).optional(),
})

export type ListAcademicYearsQuery = z.infer<typeof listAcademicYearsQuerySchema>
