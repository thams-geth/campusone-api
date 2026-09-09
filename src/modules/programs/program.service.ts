import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { ListProgramsQuery, ProgramInput } from './program.schema'

export async function listPrograms(params: ListProgramsQuery) {
  const { page, pageSize, search, departmentId, status } = params

  const where = {
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } }] }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.program.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'asc' } }),
    prisma.program.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } })
  if (!program) throw ApiError.notFound('Program not found')
  return program
}

async function assertDepartmentExists(departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } })
  if (!department) throw ApiError.badRequest('Department not found.', { departmentId: ['Invalid department'] })
}

async function assertUniqueCode(code: string, excludeId?: string) {
  const existing = await prisma.program.findFirst({
    where: { code: { equals: code, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Program code "${code}" is already in use.`, 'DUPLICATE_CODE')
}

export async function createProgram(tenantId: string, input: ProgramInput) {
  await assertDepartmentExists(input.departmentId)
  await assertUniqueCode(input.code)
  const program = await prisma.program.create({ data: { tenantId, ...input } })
  await logActivity(`added the ${program.name} program`, { entity: 'Program', entityId: program.id, action: 'CREATE' })
  return program
}

export async function updateProgram(id: string, input: ProgramInput) {
  const existing = await prisma.program.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Program not found')

  await assertDepartmentExists(input.departmentId)
  await assertUniqueCode(input.code, id)
  const program = await prisma.program.update({ where: { id }, data: input })
  await logActivity(`updated the ${program.name} program`, { entity: 'Program', entityId: program.id, action: 'UPDATE' })
  return program
}

export async function deleteProgram(id: string) {
  const existing = await prisma.program.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Program not found')

  const [batchCount, subjectCount] = await Promise.all([
    prisma.batch.count({ where: { programId: id } }),
    prisma.subject.count({ where: { programId: id } }),
  ])
  if (batchCount > 0 || subjectCount > 0) {
    throw ApiError.conflict('Cannot delete a program that still has batches or subjects.', 'PROGRAM_IN_USE')
  }

  await prisma.program.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} program`, { entity: 'Program', entityId: id, action: 'DELETE' })
}
