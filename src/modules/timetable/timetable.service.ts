import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { ListTimetableQuery, TimetableEntryInput } from './timetable.schema'

export async function listTimetableEntries(params: ListTimetableQuery) {
  const { page, pageSize, sectionId, facultyId, roomId, dayOfWeek } = params

  const where = {
    ...(sectionId ? { sectionId } : {}),
    ...(facultyId ? { facultyId } : {}),
    ...(roomId ? { roomId } : {}),
    ...(dayOfWeek ? { dayOfWeek } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.timetableEntry.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.timetableEntry.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getTimetableEntry(id: string) {
  const entry = await prisma.timetableEntry.findUnique({ where: { id } })
  if (!entry) throw ApiError.notFound('Timetable entry not found')
  return entry
}

async function assertRelationsExist(input: TimetableEntryInput) {
  const [section, subject, faculty, room] = await Promise.all([
    prisma.section.findUnique({ where: { id: input.sectionId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.faculty.findUnique({ where: { id: input.facultyId } }),
    prisma.room.findUnique({ where: { id: input.roomId } }),
  ])
  if (!section) throw ApiError.badRequest('Section not found.', { sectionId: ['Invalid section'] })
  if (!subject) throw ApiError.badRequest('Subject not found.', { subjectId: ['Invalid subject'] })
  if (!faculty) throw ApiError.badRequest('Faculty member not found.', { facultyId: ['Invalid faculty'] })
  if (!room) throw ApiError.badRequest('Room not found.', { roomId: ['Invalid room'] })
}

// "HH:mm" strings sort lexicographically the same as chronologically,
// so plain string comparison is enough to detect overlap — no need to
// parse into minutes.
function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Faculty/room/section double-booking check (roadmap #6's "conflict detection"). */
async function assertNoConflicts(input: TimetableEntryInput, excludeId?: string) {
  const candidates = await prisma.timetableEntry.findMany({
    where: {
      dayOfWeek: input.dayOfWeek,
      OR: [{ facultyId: input.facultyId }, { roomId: input.roomId }, { sectionId: input.sectionId }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })

  for (const existing of candidates) {
    if (!timesOverlap(existing.startTime, existing.endTime, input.startTime, input.endTime)) continue
    if (existing.facultyId === input.facultyId) {
      throw ApiError.conflict('This faculty member is already scheduled at that time.', 'FACULTY_CONFLICT')
    }
    if (existing.roomId === input.roomId) {
      throw ApiError.conflict('This room is already booked at that time.', 'ROOM_CONFLICT')
    }
    if (existing.sectionId === input.sectionId) {
      throw ApiError.conflict('This section already has a class at that time.', 'SECTION_CONFLICT')
    }
  }
}

export async function createTimetableEntry(tenantId: string, input: TimetableEntryInput) {
  await assertRelationsExist(input)
  await assertNoConflicts(input)
  const entry = await prisma.timetableEntry.create({ data: { tenantId, ...input } })
  await logActivity('added a timetable entry', { entity: 'TimetableEntry', entityId: entry.id, action: 'CREATE' })
  return entry
}

export async function updateTimetableEntry(id: string, input: TimetableEntryInput) {
  const existing = await prisma.timetableEntry.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Timetable entry not found')

  await assertRelationsExist(input)
  await assertNoConflicts(input, id)
  const entry = await prisma.timetableEntry.update({ where: { id }, data: input })
  await logActivity('updated a timetable entry', { entity: 'TimetableEntry', entityId: entry.id, action: 'UPDATE' })
  return entry
}

export async function deleteTimetableEntry(id: string) {
  const existing = await prisma.timetableEntry.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Timetable entry not found')

  await prisma.timetableEntry.delete({ where: { id } })
  await logActivity('removed a timetable entry', { entity: 'TimetableEntry', entityId: id, action: 'DELETE' })
}
