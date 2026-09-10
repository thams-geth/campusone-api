import { z } from 'zod'

export const postClassGroupMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message is required').max(2000),
})
export type PostClassGroupMessageInput = z.infer<typeof postClassGroupMessageSchema>

export const listClassGroupMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListClassGroupMessagesQuery = z.infer<typeof listClassGroupMessagesQuerySchema>
