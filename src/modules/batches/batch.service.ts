import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { BatchInput, ListBatchesQuery } from './batch.schema'

export async function listBatches(params: ListBatchesQuery) {
  const { page, pageSize, search, programId, academicYearId, status } = params

  const where = {
    ...(programId ? { programId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.batch.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'asc' } }),
    prisma.batch.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getBatch(id: string) {
  const batch = await prisma.batch.findUnique({ where: { id } })
  if (!batch) throw ApiError.notFound('Batch not found')
  return batch
}

async function assertRelationsExist(programId: string, academicYearId: string) {
  const [program, academicYear] = await Promise.all([
    prisma.program.findUnique({ where: { id: programId } }),
    prisma.academicYear.findUnique({ where: { id: academicYearId } }),
  ])
  if (!program) throw ApiError.badRequest('Program not found.', { programId: ['Invalid program'] })
  if (!academicYear) throw ApiError.badRequest('Academic year not found.', { academicYearId: ['Invalid academic year'] })
}

async function assertUniqueName(programId: string, name: string, excludeId?: string) {
  const existing = await prisma.batch.findFirst({
    where: { programId, name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Batch "${name}" already exists for this program.`, 'DUPLICATE_BATCH')
}

export async function createBatch(tenantId: string, input: BatchInput) {
  await assertRelationsExist(input.programId, input.academicYearId)
  await assertUniqueName(input.programId, input.name)
  const batch = await prisma.batch.create({ data: { tenantId, ...input } })
  await logActivity(`added the ${batch.name} batch`, { entity: 'Batch', entityId: batch.id, action: 'CREATE' })
  return batch
}

export async function updateBatch(id: string, input: BatchInput) {
  const existing = await prisma.batch.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Batch not found')

  await assertRelationsExist(input.programId, input.academicYearId)
  await assertUniqueName(input.programId, input.name, id)
  const batch = await prisma.batch.update({ where: { id }, data: input })
  await logActivity(`updated the ${batch.name} batch`, { entity: 'Batch', entityId: batch.id, action: 'UPDATE' })
  return batch
}

export async function deleteBatch(id: string) {
  const existing = await prisma.batch.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Batch not found')

  const sectionCount = await prisma.section.count({ where: { batchId: id } })
  if (sectionCount > 0) {
    throw ApiError.conflict('Cannot delete a batch that still has sections.', 'BATCH_IN_USE')
  }

  await prisma.batch.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} batch`, { entity: 'Batch', entityId: id, action: 'DELETE' })
}
