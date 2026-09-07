import type { Department } from '@prisma/client'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import type { DepartmentInput, ListDepartmentsQuery } from './department.schema'

type DepartmentWithCount = Department & { _count: { students: number } }

function toDepartmentDto(row: DepartmentWithCount) {
  const { _count, ...rest } = row
  return { ...rest, studentCount: _count.students }
}

const withStudentCount = { _count: { select: { students: true } } } as const

export async function listDepartments(params: ListDepartmentsQuery) {
  const { page, pageSize, search, status } = params

  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { code: { contains: search, mode: 'insensitive' as const } },
            { headOfDepartment: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.department.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
      include: withStudentCount,
    }),
    prisma.department.count({ where }),
  ])

  return {
    data: rows.map(toDepartmentDto),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

export async function getDepartment(id: string) {
  const row = await prisma.department.findUnique({ where: { id }, include: withStudentCount })
  if (!row) throw ApiError.notFound('Department not found')
  return toDepartmentDto(row)
}

async function assertUniqueCode(code: string, excludeId?: string) {
  const existing = await prisma.department.findFirst({
    where: {
      code: { equals: code, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })
  if (existing) {
    throw ApiError.conflict(`Department code "${code}" is already in use.`, 'DUPLICATE_CODE')
  }
}

export async function createDepartment(tenantId: string, input: DepartmentInput) {
  await assertUniqueCode(input.code)
  const row = await prisma.department.create({ data: { tenantId, ...input }, include: withStudentCount })
  return toDepartmentDto(row)
}

export async function updateDepartment(id: string, input: DepartmentInput) {
  const existing = await prisma.department.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Department not found')

  await assertUniqueCode(input.code, id)
  const row = await prisma.department.update({ where: { id }, data: input, include: withStudentCount })
  return toDepartmentDto(row)
}

export async function deleteDepartment(id: string) {
  const existing = await prisma.department.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Department not found')

  const studentCount = await prisma.student.count({ where: { departmentId: id } })
  if (studentCount > 0) {
    throw ApiError.conflict(
      'This department has students assigned to it. Reassign or remove them first.',
      'DEPARTMENT_IN_USE',
    )
  }

  await prisma.department.delete({ where: { id } })
}
