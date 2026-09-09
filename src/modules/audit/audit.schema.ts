import { z } from 'zod'

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entity: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  actorUserId: z.string().trim().optional(),
})

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>
