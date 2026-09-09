import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { AcademicYearInput, ListAcademicYearsQuery } from './academicYear.schema'

export async function listAcademicYears(params: ListAcademicYearsQuery) {
  const { page, pageSize, search, status } = params

  const where = {
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.academicYear.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { startDate: 'desc' },
    }),
    prisma.academicYear.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getAcademicYear(id: string) {
  const year = await prisma.academicYear.findUnique({ where: { id } })
  if (!year) throw ApiError.notFound('Academic year not found')
  return year
}

async function assertUniqueName(name: string, excludeId?: string) {
  const existing = await prisma.academicYear.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) {
    throw ApiError.conflict(`Academic year "${name}" already exists.`, 'DUPLICATE_ACADEMIC_YEAR')
  }
}

// Only one academic year can be "current" at a time — clear any other
// tenant's current year rather than enforcing this with a DB
// constraint, since it's a soft business rule, not a data invariant.
async function clearOtherCurrentYears(excludeId?: string) {
  await prisma.academicYear.updateMany({
    where: { isCurrent: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    data: { isCurrent: false },
  })
}

export async function createAcademicYear(tenantId: string, input: AcademicYearInput) {
  await assertUniqueName(input.name)
  const year = await prisma.academicYear.create({ data: { tenantId, ...input } })
  if (year.isCurrent) await clearOtherCurrentYears(year.id)
  await logActivity(`added the ${year.name} academic year`, { entity: 'AcademicYear', entityId: year.id, action: 'CREATE' })
  return year
}

export async function updateAcademicYear(id: string, input: AcademicYearInput) {
  const existing = await prisma.academicYear.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Academic year not found')

  await assertUniqueName(input.name, id)
  const year = await prisma.academicYear.update({ where: { id }, data: input })
  if (year.isCurrent) await clearOtherCurrentYears(year.id)
  await logActivity(`updated the ${year.name} academic year`, { entity: 'AcademicYear', entityId: year.id, action: 'UPDATE' })
  return year
}

export async function deleteAcademicYear(id: string) {
  const existing = await prisma.academicYear.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Academic year not found')

  const batchCount = await prisma.batch.count({ where: { academicYearId: id } })
  if (batchCount > 0) {
    throw ApiError.conflict('Cannot delete an academic year that still has batches.', 'ACADEMIC_YEAR_IN_USE')
  }

  await prisma.academicYear.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} academic year`, { entity: 'AcademicYear', entityId: id, action: 'DELETE' })
}
