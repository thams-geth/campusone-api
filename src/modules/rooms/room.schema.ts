import { z } from 'zod'
import { RoomStatus } from '@prisma/client'

export const roomInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Only letters, numbers, and hyphens allowed')
    .transform((value) => value.toUpperCase()),
  capacity: z.coerce.number().int().min(1).max(2000).optional(),
  status: z.nativeEnum(RoomStatus).default('ACTIVE'),
})

export type RoomInput = z.infer<typeof roomInputSchema>

export const listRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.nativeEnum(RoomStatus).optional(),
})

export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>
