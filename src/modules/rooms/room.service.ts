import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { ListRoomsQuery, RoomInput } from './room.schema'

export async function listRooms(params: ListRoomsQuery) {
  const { page, pageSize, search, status } = params

  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } }] }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.room.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { code: 'asc' } }),
    prisma.room.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getRoom(id: string) {
  const room = await prisma.room.findUnique({ where: { id } })
  if (!room) throw ApiError.notFound('Room not found')
  return room
}

async function assertUniqueCode(code: string, excludeId?: string) {
  const existing = await prisma.room.findFirst({
    where: { code: { equals: code, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Room code "${code}" is already in use.`, 'DUPLICATE_CODE')
}

export async function createRoom(tenantId: string, input: RoomInput) {
  await assertUniqueCode(input.code)
  const room = await prisma.room.create({ data: { tenantId, ...input } })
  await logActivity(`added room ${room.name}`, { entity: 'Room', entityId: room.id, action: 'CREATE' })
  return room
}

export async function updateRoom(id: string, input: RoomInput) {
  const existing = await prisma.room.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Room not found')

  await assertUniqueCode(input.code, id)
  const room = await prisma.room.update({ where: { id }, data: input })
  await logActivity(`updated room ${room.name}`, { entity: 'Room', entityId: room.id, action: 'UPDATE' })
  return room
}

export async function deleteRoom(id: string) {
  const existing = await prisma.room.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Room not found')

  const timetableCount = await prisma.timetableEntry.count({ where: { roomId: id } })
  if (timetableCount > 0) {
    throw ApiError.conflict('Cannot delete a room that still has timetable entries.', 'ROOM_IN_USE')
  }

  await prisma.room.delete({ where: { id } })
  await logActivity(`removed room ${existing.name}`, { entity: 'Room', entityId: id, action: 'DELETE' })
}
