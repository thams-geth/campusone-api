import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { triggerWebhooks } from '../webhooks/webhookDispatcher'
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
  return department
}

async function assertSectionExists(sectionId: string | undefined) {
  if (!sectionId) return
  const section = await prisma.section.findUnique({ where: { id: sectionId } })
  if (!section) {
    throw new ApiError('Selected section does not exist.', 422, 'INVALID_SECTION')
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
  const department = await assertDepartmentUsable(input.departmentId)
  await assertSectionExists(input.sectionId)
  await assertUniqueEmail(input.email)
  await assertUniqueRollNumber(input.rollNumber)

  const student = await prisma.student.create({
    data: {
      tenantId,
      ...input,
      guardianName: input.guardianName || undefined,
      guardianPhone: input.guardianPhone || undefined,
      address: input.address || undefined,
    },
  })
  await logActivity(`added a new student to ${department.code}`, { entity: 'Student', entityId: student.id, action: 'CREATE' })
  await triggerWebhooks(tenantId, 'student.created', { id: student.id, rollNumber: student.rollNumber, departmentId: student.departmentId })
  return student
}

export async function updateStudent(id: string, input: StudentInput) {
  const existing = await prisma.student.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Student not found')

  await assertDepartmentUsable(input.departmentId)
  await assertSectionExists(input.sectionId)
  await assertUniqueEmail(input.email, id)
  await assertUniqueRollNumber(input.rollNumber, id)

  const student = await prisma.student.update({
    where: { id },
    data: {
      ...input,
      guardianName: input.guardianName || undefined,
      guardianPhone: input.guardianPhone || undefined,
      address: input.address || undefined,
    },
  })
  await logActivity(`updated contact info for ${student.firstName} ${student.lastName}`, {
    entity: 'Student',
    entityId: student.id,
    action: 'UPDATE',
  })
  return student
}

export async function deleteStudent(id: string) {
  const existing = await prisma.student.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Student not found')
  await prisma.student.delete({ where: { id } })
  await logActivity(`removed student ${existing.firstName} ${existing.lastName}`, {
    entity: 'Student',
    entityId: id,
    action: 'DELETE',
  })
}
