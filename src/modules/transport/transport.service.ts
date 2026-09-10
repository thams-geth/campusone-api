import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  ListTransportAllocationsQuery,
  RouteInput,
  StopInput,
  TransportAllocationInput,
  VehicleInput,
} from './transport.schema'

// ---- Vehicles ----

export async function listVehicles() {
  return prisma.vehicle.findMany({ orderBy: { registrationNumber: 'asc' } })
}

export async function createVehicle(tenantId: string, input: VehicleInput) {
  const existing = await prisma.vehicle.findFirst({
    where: { registrationNumber: { equals: input.registrationNumber, mode: 'insensitive' } },
  })
  if (existing) throw ApiError.conflict(`Vehicle "${input.registrationNumber}" is already registered.`, 'DUPLICATE_VEHICLE')

  const vehicle = await prisma.vehicle.create({ data: { tenantId, ...input } })
  await logActivity(`added vehicle ${vehicle.registrationNumber}`, { entity: 'Vehicle', entityId: vehicle.id, action: 'CREATE' })
  return vehicle
}

export async function deleteVehicle(id: string) {
  const existing = await prisma.vehicle.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Vehicle not found')

  const routeCount = await prisma.route.count({ where: { vehicleId: id } })
  if (routeCount > 0) throw ApiError.conflict('Cannot delete a vehicle assigned to routes.', 'VEHICLE_IN_USE')

  await prisma.vehicle.delete({ where: { id } })
  await logActivity(`removed vehicle ${existing.registrationNumber}`, { entity: 'Vehicle', entityId: id, action: 'DELETE' })
}

// ---- Routes & stops ----

export async function listRoutes() {
  return prisma.route.findMany({ orderBy: { name: 'asc' }, include: { stops: { orderBy: { sequence: 'asc' } } } })
}

export async function createRoute(tenantId: string, input: RouteInput) {
  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } })
    if (!vehicle) throw ApiError.badRequest('Vehicle not found.', { vehicleId: ['Invalid vehicle'] })
  }
  const existing = await prisma.route.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })
  if (existing) throw ApiError.conflict(`Route "${input.name}" already exists.`, 'DUPLICATE_ROUTE')

  const route = await prisma.route.create({ data: { tenantId, ...input } })
  await logActivity(`added route ${route.name}`, { entity: 'Route', entityId: route.id, action: 'CREATE' })
  return route
}

export async function deleteRoute(id: string) {
  const existing = await prisma.route.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Route not found')

  const [stopCount, allocationCount] = await Promise.all([
    prisma.stop.count({ where: { routeId: id } }),
    // Any allocation, not just ACTIVE ones — the FK is RESTRICT
    // regardless of status, so a vacated allocation still blocks delete
    // at the DB level; check for what would actually fail.
    prisma.studentTransport.count({ where: { routeId: id } }),
  ])
  if (stopCount > 0 || allocationCount > 0) throw ApiError.conflict('Cannot delete a route with stops or allocation history.', 'ROUTE_IN_USE')

  await prisma.route.delete({ where: { id } })
  await logActivity(`removed route ${existing.name}`, { entity: 'Route', entityId: id, action: 'DELETE' })
}

export async function addStop(tenantId: string, routeId: string, input: StopInput) {
  const route = await prisma.route.findUnique({ where: { id: routeId } })
  if (!route) throw ApiError.notFound('Route not found')

  const existing = await prisma.stop.findFirst({ where: { routeId, sequence: input.sequence } })
  if (existing) throw ApiError.conflict(`Sequence ${input.sequence} is already used on this route.`, 'DUPLICATE_SEQUENCE')

  const stop = await prisma.stop.create({ data: { tenantId, routeId, ...input } })
  await logActivity(`added a stop to route ${route.name}`, { entity: 'Stop', entityId: stop.id, action: 'CREATE' })
  return stop
}

export async function deleteStop(id: string) {
  const existing = await prisma.stop.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Stop not found')

  // Any allocation, not just ACTIVE — see deleteRoute's comment.
  const allocationCount = await prisma.studentTransport.count({ where: { stopId: id } })
  if (allocationCount > 0) throw ApiError.conflict('Cannot delete a stop with allocation history.', 'STOP_IN_USE')

  await prisma.stop.delete({ where: { id } })
  await logActivity('removed a stop', { entity: 'Stop', entityId: id, action: 'DELETE' })
}

// ---- Allocations ----

export async function listAllocations(params: ListTransportAllocationsQuery) {
  const { page, pageSize, studentId, routeId, status } = params
  const where = { ...(studentId ? { studentId } : {}), ...(routeId ? { routeId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.studentTransport.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.studentTransport.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listMyAllocations(callerUserId: string) {
  const studentId = await resolveOwnStudentId(callerUserId, undefined)
  return prisma.studentTransport.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } })
}

export async function createAllocation(tenantId: string, input: TransportAllocationInput) {
  const [student, route, stop] = await Promise.all([
    prisma.student.findUnique({ where: { id: input.studentId } }),
    prisma.route.findUnique({ where: { id: input.routeId } }),
    prisma.stop.findUnique({ where: { id: input.stopId } }),
  ])
  if (!student) throw ApiError.badRequest('Student not found.', { studentId: ['Invalid student'] })
  if (!route) throw ApiError.badRequest('Route not found.', { routeId: ['Invalid route'] })
  if (!stop || stop.routeId !== input.routeId) throw ApiError.badRequest('Stop not found on this route.', { stopId: ['Invalid stop'] })

  const existing = await prisma.studentTransport.findFirst({ where: { studentId: input.studentId, status: 'ACTIVE' } })
  if (existing) throw ApiError.conflict('This student already has an active transport allocation.', 'ALREADY_ALLOCATED')

  const allocation = await prisma.studentTransport.create({ data: { tenantId, ...input } })
  await logActivity('allocated a transport route', { entity: 'StudentTransport', entityId: allocation.id, action: 'CREATE' })
  return allocation
}

export async function removeAllocation(id: string) {
  const allocation = await prisma.studentTransport.findUnique({ where: { id } })
  if (!allocation) throw ApiError.notFound('Allocation not found')
  if (allocation.status === 'INACTIVE') throw ApiError.conflict('This allocation is already removed.', 'ALREADY_REMOVED')

  const updated = await prisma.studentTransport.update({ where: { id }, data: { status: 'INACTIVE' } })
  await logActivity('removed a transport allocation', { entity: 'StudentTransport', entityId: id, action: 'REMOVE' })
  return updated
}
