import { z } from 'zod'

export const hostelInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
})
export type HostelInput = z.infer<typeof hostelInputSchema>

export const hostelRoomInputSchema = z.object({
  hostelId: z.string().min(1, 'Hostel is required'),
  roomNumber: z.string().trim().min(1, 'Room number is required').max(20),
  capacity: z.coerce.number().int().min(1).max(20),
})
export type HostelRoomInput = z.infer<typeof hostelRoomInputSchema>

export const listHostelRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  hostelId: z.string().trim().optional(),
})
export type ListHostelRoomsQuery = z.infer<typeof listHostelRoomsQuerySchema>

export const hostelAllocationInputSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  hostelRoomId: z.string().min(1, 'Room is required'),
  startDate: z.coerce.date(),
})
export type HostelAllocationInput = z.infer<typeof hostelAllocationInputSchema>

export const listHostelAllocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  hostelRoomId: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})
export type ListHostelAllocationsQuery = z.infer<typeof listHostelAllocationsQuerySchema>
