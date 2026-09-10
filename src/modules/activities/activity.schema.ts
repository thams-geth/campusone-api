import { z } from 'zod'
import { ActivityType } from '@prisma/client'

export const activityInputSchema = z.object({
  studentId: z.string().min(1).optional(),
  type: z.nativeEnum(ActivityType),
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(160),
  description: z.string().trim().max(1000).optional(),
  date: z.coerce.date(),
  certificateUrl: z.string().trim().url().optional(),
})
export type ActivityInput = z.infer<typeof activityInputSchema>

export const listActivitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  type: z.nativeEnum(ActivityType).optional(),
})
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>
