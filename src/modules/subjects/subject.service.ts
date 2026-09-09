import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { ListSubjectsQuery, SubjectInput } from './subject.schema'

export async function listSubjects(params: ListSubjectsQuery) {
  const { page, pageSize, search, programId, semesterNumber, type } = params

  const where = {
    ...(programId ? { programId } : {}),
    ...(semesterNumber ? { semesterNumber } : {}),
    ...(type ? { type } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } }] }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.subject.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ semesterNumber: 'asc' }, { code: 'asc' }] }),
    prisma.subject.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getSubject(id: string) {
  const subject = await prisma.subject.findUnique({ where: { id } })
  if (!subject) throw ApiError.notFound('Subject not found')
  return subject
}

async function assertRelationsExist(programId: string, facultyId?: string) {
  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program) throw ApiError.badRequest('Program not found.', { programId: ['Invalid program'] })

  if (facultyId) {
    const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
    if (!faculty) throw ApiError.badRequest('Faculty member not found.', { facultyId: ['Invalid faculty'] })
  }
}

async function assertUniqueCode(code: string, excludeId?: string) {
  const existing = await prisma.subject.findFirst({
    where: { code: { equals: code, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Subject code "${code}" is already in use.`, 'DUPLICATE_CODE')
}

export async function createSubject(tenantId: string, input: SubjectInput) {
  await assertRelationsExist(input.programId, input.facultyId)
  await assertUniqueCode(input.code)
  const subject = await prisma.subject.create({ data: { tenantId, ...input } })
  await logActivity(`added the ${subject.name} subject`, { entity: 'Subject', entityId: subject.id, action: 'CREATE' })
  return subject
}

export async function updateSubject(id: string, input: SubjectInput) {
  const existing = await prisma.subject.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Subject not found')

  await assertRelationsExist(input.programId, input.facultyId)
  await assertUniqueCode(input.code, id)
  const subject = await prisma.subject.update({ where: { id }, data: input })
  await logActivity(`updated the ${subject.name} subject`, { entity: 'Subject', entityId: subject.id, action: 'UPDATE' })
  return subject
}

export async function deleteSubject(id: string) {
  const existing = await prisma.subject.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Subject not found')

  const timetableCount = await prisma.timetableEntry.count({ where: { subjectId: id } })
  if (timetableCount > 0) {
    throw ApiError.conflict('Cannot delete a subject that still has timetable entries.', 'SUBJECT_IN_USE')
  }

  await prisma.subject.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} subject`, { entity: 'Subject', entityId: id, action: 'DELETE' })
}
