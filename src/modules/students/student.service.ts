import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import type { ListStudentsQuery, StudentInput } from './student.schema'

export async function listStudents(params: ListStudentsQuery) {
  const { page, pageSize, search, departmentId, status } = params

  const where = {
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { rollNumber: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.student.count({ where }),
  ])

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

export async function getStudent(id: string) {
  const student = await prisma.student.findUnique({ where: { id } })
  if (!student) throw ApiError.notFound('Student not found')
  return student
}

async function assertDepartmentUsable(departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } })
  if (!department) {
    throw new ApiError('Selected department does not exist.', 422, 'INVALID_DEPARTMENT')
  }
  if (department.status !== 'ACTIVE') {
    throw new ApiError(
      `Department "${department.name}" is inactive and cannot accept new students.`,
      422,
      'DEPARTMENT_INACTIVE',
    )
  }
}

async function assertUniqueEmail(email: string, excludeId?: string) {
  const existing = await prisma.student.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) {
    throw ApiError.conflict(`Email "${email}" is already registered to another student.`, 'DUPLICATE_EMAIL')
  }
}

async function assertUniqueRollNumber(rollNumber: string, excludeId?: string) {
  const existing = await prisma.student.findFirst({
    where: {
      rollNumber: { equals: rollNumber, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })
  if (existing) {
    throw ApiError.conflict(`Roll number "${rollNumber}" is already in use.`, 'DUPLICATE_ROLL_NUMBER')
  }
}

export async function createStudent(tenantId: string, input: StudentInput) {
  await assertDepartmentUsable(input.departmentId)
  await assertUniqueEmail(input.email)
  await assertUniqueRollNumber(input.rollNumber)

  return prisma.student.create({
    data: {
      tenantId,
      ...input,
      guardianName: input.guardianName || undefined,
      guardianPhone: input.guardianPhone || undefined,
      address: input.address || undefined,
    },
  })
}

export async function updateStudent(id: string, input: StudentInput) {
  const existing = await prisma.student.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Student not found')

  await assertDepartmentUsable(input.departmentId)
  await assertUniqueEmail(input.email, id)
  await assertUniqueRollNumber(input.rollNumber, id)

  return prisma.student.update({
    where: { id },
    data: {
      ...input,
      guardianName: input.guardianName || undefined,
      guardianPhone: input.guardianPhone || undefined,
      address: input.address || undefined,
    },
  })
}

export async function deleteStudent(id: string) {
  const existing = await prisma.student.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Student not found')
  await prisma.student.delete({ where: { id } })
}
