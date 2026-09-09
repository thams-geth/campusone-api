import { z } from 'zod'
import { AnnouncementAudience, AnnouncementPriority } from '@prisma/client'

export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(160),
    content: z.string().trim().min(1, 'Content is required').max(4000),
    audience: z.nativeEnum(AnnouncementAudience),
    departmentId: z.string().min(1).optional(),
    programId: z.string().min(1).optional(),
    batchId: z.string().min(1).optional(),
    sectionId: z.string().min(1).optional(),
    priority: z.nativeEnum(AnnouncementPriority).default('MEDIUM'),
    publishAt: z.coerce.date().optional(),
    expiryAt: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.audience === 'COLLEGE') return true
      const scopeField = { DEPARTMENT: data.departmentId, PROGRAM: data.programId, BATCH: data.batchId, SECTION: data.sectionId }[
        data.audience
      ]
      return Boolean(scopeField)
    },
    { message: 'The matching scope id is required for this audience', path: ['audience'] },
  )
export type AnnouncementInput = z.infer<typeof announcementInputSchema>

export const listAnnouncementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  audience: z.nativeEnum(AnnouncementAudience).optional(),
})
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>
