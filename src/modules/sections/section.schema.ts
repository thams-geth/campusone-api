import { z } from 'zod'
import { SectionStatus } from '@prisma/client'

export const sectionInputSchema = z.object({
  batchId: z.string().min(1, 'Batch is required'),
  name: z.string().trim().min(1, 'Name is required').max(10),
  currentSemester: z.coerce.number().int().min(1).max(12),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  status: z.nativeEnum(SectionStatus).default('ACTIVE'),
})

export type SectionInput = z.infer<typeof sectionInputSchema>

export const listSectionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
  status: z.nativeEnum(SectionStatus).optional(),
})

export type ListSectionsQuery = z.infer<typeof listSectionsQuerySchema>
