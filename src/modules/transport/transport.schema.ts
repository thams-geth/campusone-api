import { z } from 'zod'

export const vehicleInputSchema = z.object({
  registrationNumber: z.string().trim().min(2, 'Registration number is required').max(20),
  driverName: z.string().trim().min(1, 'Driver name is required').max(120),
  driverPhone: z.string().trim().min(7).max(20),
  capacity: z.coerce.number().int().min(1).max(100),
})
export type VehicleInput = z.infer<typeof vehicleInputSchema>

export const routeInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  vehicleId: z.string().min(1).optional(),
})
export type RouteInput = z.infer<typeof routeInputSchema>

export const stopInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  sequence: z.coerce.number().int().min(1),
})
export type StopInput = z.infer<typeof stopInputSchema>

export const transportAllocationInputSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  routeId: z.string().min(1, 'Route is required'),
  stopId: z.string().min(1, 'Stop is required'),
})
export type TransportAllocationInput = z.infer<typeof transportAllocationInputSchema>

export const listTransportAllocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  routeId: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})
export type ListTransportAllocationsQuery = z.infer<typeof listTransportAllocationsQuerySchema>
