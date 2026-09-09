import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  CreateLeaveRequestInput,
  LeaveTypeInput,
  ListLeaveRequestsQuery,
  ListLeaveTypesQuery,
} from './leave.schema'

export async function listLeaveTypes(params: ListLeaveTypesQuery) {
  const { page, pageSize } = params
  const [data, total] = await Promise.all([
    prisma.leaveType.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: 'asc' } }),
    prisma.leaveType.count(),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

async function assertUniqueLeaveTypeName(name: string, excludeId?: string) {
  const existing = await prisma.leaveType.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Leave type "${name}" already exists.`, 'DUPLICATE_LEAVE_TYPE')
}

export async function createLeaveType(tenantId: string, input: LeaveTypeInput) {
  await assertUniqueLeaveTypeName(input.name)
  const leaveType = await prisma.leaveType.create({ data: { tenantId, ...input } })
  await logActivity(`added the ${leaveType.name} leave type`, { entity: 'LeaveType', entityId: leaveType.id, action: 'CREATE' })
  return leaveType
}

export async function updateLeaveType(id: string, input: LeaveTypeInput) {
  const existing = await prisma.leaveType.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Leave type not found')

  await assertUniqueLeaveTypeName(input.name, id)
  const leaveType = await prisma.leaveType.update({ where: { id }, data: input })
  await logActivity(`updated the ${leaveType.name} leave type`, { entity: 'LeaveType', entityId: leaveType.id, action: 'UPDATE' })
  return leaveType
}

export async function deleteLeaveType(id: string) {
  const existing = await prisma.leaveType.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Leave type not found')

  const requestCount = await prisma.leaveRequest.count({ where: { leaveTypeId: id } })
  if (requestCount > 0) {
    throw ApiError.conflict('Cannot delete a leave type that already has requests against it.', 'LEAVE_TYPE_IN_USE')
  }

  await prisma.leaveType.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} leave type`, { entity: 'LeaveType', entityId: id, action: 'DELETE' })
}

export async function createLeaveRequest(tenantId: string, callerUserId: string, input: CreateLeaveRequestInput) {
  const studentId = await resolveOwnStudentId(callerUserId, input.studentId)

  const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } })
  if (!leaveType) throw ApiError.badRequest('Leave type not found.', { leaveTypeId: ['Invalid leave type'] })

  const leaveRequest = await prisma.leaveRequest.create({
    data: { tenantId, studentId, leaveTypeId: input.leaveTypeId, startDate: input.startDate, endDate: input.endDate, reason: input.reason },
  })
  await logActivity('submitted a leave request', { entity: 'LeaveRequest', entityId: leaveRequest.id, action: 'CREATE' })
  return leaveRequest
}

export async function listLeaveRequests(params: ListLeaveRequestsQuery) {
  const { page, pageSize, studentId, status } = params
  const where = { ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.leaveRequest.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.leaveRequest.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getLeaveRequest(id: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!leaveRequest) throw ApiError.notFound('Leave request not found')
  return leaveRequest
}

/** Approving updates any existing attendance records for the student in the date range to ON_LEAVE — roadmap #16's "leave and attendance should be integrated." */
export async function reviewLeaveRequest(id: string, reviewedByUserId: string, decision: 'APPROVED' | 'REJECTED') {
  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!leaveRequest) throw ApiError.notFound('Leave request not found')
  if (leaveRequest.status !== 'PENDING') {
    throw ApiError.conflict('This leave request has already been reviewed.', 'ALREADY_REVIEWED')
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: decision, reviewedByUserId, reviewedAt: new Date() },
  })

  if (decision === 'APPROVED') {
    const result = await prisma.attendanceRecord.updateMany({
      where: {
        studentId: leaveRequest.studentId,
        session: { date: { gte: leaveRequest.startDate, lte: leaveRequest.endDate } },
      },
      data: { status: 'ON_LEAVE' },
    })
    await logActivity('approved a leave request', {
      entity: 'LeaveRequest',
      entityId: id,
      action: 'APPROVE',
      after: { attendanceRecordsUpdated: result.count },
    })
  } else {
    await logActivity('rejected a leave request', { entity: 'LeaveRequest', entityId: id, action: 'REJECT' })
  }

  return updated
}

/** Approved days per leave type for a student in a given year — computed on read, not a stored ledger (see LeaveType's doc comment). */
export async function getLeaveBalance(studentId: string, year: number) {
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59))

  const [leaveTypes, approvedRequests] = await Promise.all([
    prisma.leaveType.findMany(),
    prisma.leaveRequest.findMany({
      where: { studentId, status: 'APPROVED', startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
    }),
  ])

  const msPerDay = 24 * 60 * 60 * 1000
  return leaveTypes.map((type) => {
    const usedDays = approvedRequests
      .filter((r) => r.leaveTypeId === type.id)
      .reduce((sum, r) => sum + Math.round((r.endDate.getTime() - r.startDate.getTime()) / msPerDay) + 1, 0)

    return {
      leaveTypeId: type.id,
      leaveTypeName: type.name,
      defaultDaysPerYear: type.defaultDaysPerYear,
      usedDays,
      remainingDays: Math.max(0, type.defaultDaysPerYear - usedDays),
    }
  })
}
