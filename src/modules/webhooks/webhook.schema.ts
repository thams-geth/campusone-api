import { z } from 'zod'

export const createWebhookEndpointSchema = z.object({
  url: z.string().trim().min(1, 'URL is required'),
  eventTypes: z.array(z.string().trim().min(1)).min(1, 'At least one event type is required'),
  enabled: z.boolean().optional(),
})
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>

export const updateWebhookEndpointSchema = z.object({
  url: z.string().trim().min(1).optional(),
  eventTypes: z.array(z.string().trim().min(1)).min(1).optional(),
  enabled: z.boolean().optional(),
})
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>

export const listDeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>
