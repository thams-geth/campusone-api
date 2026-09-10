import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  HostelAllocationInput,
  HostelInput,
  HostelRoomInput,
  ListHostelAllocationsQuery,
  ListHostelRoomsQuery,
} from './hostel.schema'

// ---- Hostels ----

export async function listHostels() {
  return prisma.hostel.findMany({ orderBy: { name: 'asc' } })
}

async function assertUniqueHostelName(name: string, excludeId?: string) {
  const existing = await prisma.hostel.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`A hostel named "${name}" already exists.`, 'DUPLICATE_HOSTEL')
}

export async function createHostel(tenantId: string, input: HostelInput) {
  await assertUniqueHostelName(input.name)
  const hostel = await prisma.hostel.create({ data: { tenantId, ...input } })
  await logActivity(`added the ${hostel.name} hostel`, { entity: 'Hostel', entityId: hostel.id, action: 'CREATE' })
  return hostel
}

export async function deleteHostel(id: string) {
  const existing = await prisma.hostel.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Hostel not found')

  const roomCount = await prisma.hostelRoom.count({ where: { hostelId: id } })
  if (roomCount > 0) throw ApiError.conflict('Cannot delete a hostel that still has rooms.', 'HOSTEL_IN_USE')

  await prisma.hostel.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} hostel`, { entity: 'Hostel', entityId: id, action: 'DELETE' })
}

// ---- Hostel rooms ----

export async function listHostelRooms(params: ListHostelRoomsQuery) {
  const { page, pageSize, hostelId } = params
  const where = { ...(hostelId ? { hostelId } : {}) }

  const [data, total] = await Promise.all([
    prisma.hostelRoom.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { roomNumber: 'asc' } }),
    prisma.hostelRoom.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function createHostelRoom(tenantId: string, input: HostelRoomInput) {
  const hostel = await prisma.hostel.findUnique({ where: { id: input.hostelId } })
  if (!hostel) throw ApiError.badRequest('Hostel not found.', { hostelId: ['Invalid hostel'] })

  const existing = await prisma.hostelRoom.findFirst({ where: { hostelId: input.hostelId, roomNumber: input.roomNumber } })
  if (existing) throw ApiError.conflict(`Room "${input.roomNumber}" already exists in this hostel.`, 'DUPLICATE_ROOM')

  const room = await prisma.hostelRoom.create({ data: { tenantId, ...input } })
  await logActivity(`added hostel room ${room.roomNumber}`, { entity: 'HostelRoom', entityId: room.id, action: 'CREATE' })
  return room
}

export async function deleteHostelRoom(id: string) {
  const existing = await prisma.hostelRoom.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Hostel room not found')

  // Any allocation, not just ACTIVE — the FK is RESTRICT regardless of
  // status, so a vacated allocation still blocks delete at the DB
  // level; check for what would actually fail (same as Transport's
  // Stop/Route deletion guards).
  const allocationCount = await prisma.hostelAllocation.count({ where: { hostelRoomId: id } })
  if (allocationCount > 0) throw ApiError.conflict('Cannot delete a room with allocation history.', 'ROOM_IN_USE')

  await prisma.hostelRoom.delete({ where: { id } })
  await logActivity(`removed hostel room ${existing.roomNumber}`, { entity: 'HostelRoom', entityId: id, action: 'DELETE' })
}

// ---- Allocations ----

export async function listAllocations(params: ListHostelAllocationsQuery) {
  const { page, pageSize, studentId, hostelRoomId, status } = params
  const where = { ...(studentId ? { studentId } : {}), ...(hostelRoomId ? { hostelRoomId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.hostelAllocation.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { startDate: 'desc' } }),
    prisma.hostelAllocation.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listMyAllocations(callerUserId: string) {
  const studentId = await resolveOwnStudentId(callerUserId, undefined)
  return prisma.hostelAllocation.findMany({ where: { studentId }, orderBy: { startDate: 'desc' } })
}

export async function createAllocation(tenantId: string, input: HostelAllocationInput) {
  const [student, room] = await Promise.all([
    prisma.student.findUnique({ where: { id: input.studentId } }),
    prisma.hostelRoom.findUnique({ where: { id: input.hostelRoomId } }),
  ])
  if (!student) throw ApiError.badRequest('Student not found.', { studentId: ['Invalid student'] })
  if (!room) throw ApiError.badRequest('Hostel room not found.', { hostelRoomId: ['Invalid room'] })

  const existingForStudent = await prisma.hostelAllocation.findFirst({ where: { studentId: input.studentId, status: 'ACTIVE' } })
  if (existingForStudent) throw ApiError.conflict('This student already has an active hostel allocation.', 'ALREADY_ALLOCATED')

  const activeInRoom = await prisma.hostelAllocation.findMany({ where: { hostelRoomId: input.hostelRoomId, status: 'ACTIVE' } })
  if (activeInRoom.length >= room.capacity) {
    throw ApiError.conflict('This room is at full capacity.', 'ROOM_FULL')
  }

  const takenBeds = new Set(activeInRoom.map((a) => a.bedNumber))
  let bedNumber = 1
  while (takenBeds.has(bedNumber)) bedNumber += 1

  const allocation = await prisma.hostelAllocation.create({
    data: { tenantId, studentId: input.studentId, hostelRoomId: input.hostelRoomId, bedNumber, startDate: input.startDate },
  })
  await logActivity('allocated a hostel room', { entity: 'HostelAllocation', entityId: allocation.id, action: 'CREATE' })
  return allocation
}

export async function vacateAllocation(id: string) {
  const allocation = await prisma.hostelAllocation.findUnique({ where: { id } })
  if (!allocation) throw ApiError.notFound('Allocation not found')
  if (allocation.status === 'INACTIVE') throw ApiError.conflict('This allocation is already vacated.', 'ALREADY_VACATED')

  const updated = await prisma.hostelAllocation.update({
    where: { id },
    data: { status: 'INACTIVE', endDate: new Date() },
  })
  await logActivity('vacated a hostel allocation', { entity: 'HostelAllocation', entityId: id, action: 'VACATE' })
  return updated
}
