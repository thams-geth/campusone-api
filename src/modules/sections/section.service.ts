import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { ListSectionsQuery, SectionInput } from './section.schema'

export async function listSections(params: ListSectionsQuery) {
  const { page, pageSize, search, batchId, status } = params

  const where = {
    ...(batchId ? { batchId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.section.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: 'asc' } }),
    prisma.section.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getSection(id: string) {
  const section = await prisma.section.findUnique({ where: { id } })
  if (!section) throw ApiError.notFound('Section not found')
  return section
}

async function assertBatchExists(batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } })
  if (!batch) throw ApiError.badRequest('Batch not found.', { batchId: ['Invalid batch'] })
}

async function assertUniqueName(batchId: string, name: string, excludeId?: string) {
  const existing = await prisma.section.findFirst({
    where: { batchId, name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Section "${name}" already exists for this batch.`, 'DUPLICATE_SECTION')
}

export async function createSection(tenantId: string, input: SectionInput) {
  await assertBatchExists(input.batchId)
  await assertUniqueName(input.batchId, input.name)
  const section = await prisma.section.create({ data: { tenantId, ...input } })
  await logActivity(`added section ${section.name}`, { entity: 'Section', entityId: section.id, action: 'CREATE' })
  return section
}

export async function updateSection(id: string, input: SectionInput) {
  const existing = await prisma.section.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Section not found')

  await assertBatchExists(input.batchId)
  await assertUniqueName(input.batchId, input.name, id)
  const section = await prisma.section.update({ where: { id }, data: input })
  await logActivity(`updated section ${section.name}`, { entity: 'Section', entityId: section.id, action: 'UPDATE' })
  return section
}

export async function deleteSection(id: string) {
  const existing = await prisma.section.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Section not found')

  const [studentCount, timetableCount] = await Promise.all([
    prisma.student.count({ where: { sectionId: id } }),
    prisma.timetableEntry.count({ where: { sectionId: id } }),
  ])
  if (studentCount > 0 || timetableCount > 0) {
    throw ApiError.conflict('Cannot delete a section with students or timetable entries assigned.', 'SECTION_IN_USE')
  }

  await prisma.section.delete({ where: { id } })
  await logActivity(`removed section ${existing.name}`, { entity: 'Section', entityId: id, action: 'DELETE' })
}
