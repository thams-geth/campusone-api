import { z } from 'zod'
import { NotificationChannel } from '@prisma/client'

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
})
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>

export const setPreferenceSchema = z.object({
  enabled: z.boolean(),
})
export type SetPreferenceInput = z.infer<typeof setPreferenceSchema>

export const notificationChannelParamSchema = z.nativeEnum(NotificationChannel)
