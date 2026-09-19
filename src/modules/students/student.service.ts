import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { triggerWebhooks } from '../webhooks/webhookDispatcher'
import { getCgpaForStudent } from '../examinations/examination.service'
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

/**
 * Student 360 — a single "everything about this person" read for the
 * admin dashboard, aggregating across every module that references a
 * Student. Deliberately queries Prisma directly per section rather
 * than reusing each module's paginated list function (listStudents,
 * listInvoices, etc.) — those are shaped for their own list endpoints
 * (search/filter/pagination), not "give me everything for this id."
 */
export async function getStudent360(id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: { department: true, section: true },
  })
  if (!student) throw ApiError.notFound('Student not found')

  const { department, section, ...studentFields } = student

  const [
    attendanceRecords,
    cgpaResult,
    invoices,
    hostelAllocation,
    transportAllocation,
    activeIssueCount,
    overdueIssueCount,
    documents,
    certificateRequests,
    activities,
    pendingLeaveCount,
    approvedLeaveCount,
    rejectedLeaveCount,
    recentLeave,
  ] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { studentId: id }, select: { status: true } }),
    getCgpaForStudent(id),
    prisma.feeInvoice.findMany({ where: { studentId: id }, include: { adjustments: true, payments: true } }),
    prisma.hostelAllocation.findFirst({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      include: { hostelRoom: { include: { hostel: true } } },
    }),
    prisma.studentTransport.findFirst({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      include: { route: true, stop: true },
    }),
    prisma.bookIssue.count({ where: { ownerType: 'STUDENT', ownerId: id, returnedAt: null } }),
    prisma.bookIssue.count({
      where: { ownerType: 'STUDENT', ownerId: id, returnedAt: null, dueDate: { lt: new Date() } },
    }),
    prisma.document.findMany({
      where: { ownerType: 'STUDENT', ownerId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true },
    }),
    prisma.certificateRequest.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, certificateTypeId: true, status: true, createdAt: true },
    }),
    prisma.studentActivity.findMany({
      where: { studentId: id },
      orderBy: { date: 'desc' },
      take: 10,
      select: { id: true, type: true, title: true, date: true },
    }),
    prisma.leaveRequest.count({ where: { studentId: id, status: 'PENDING' } }),
    prisma.leaveRequest.count({ where: { studentId: id, status: 'APPROVED' } }),
    prisma.leaveRequest.count({ where: { studentId: id, status: 'REJECTED' } }),
    prisma.leaveRequest.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, leaveTypeId: true, startDate: true, endDate: true, status: true, createdAt: true },
    }),
  ])

  const totalRecords = attendanceRecords.length
  const presentCount = attendanceRecords.filter((r) => r.status === 'PRESENT').length
  const absentCount = attendanceRecords.filter((r) => r.status === 'ABSENT').length
  const lateCount = attendanceRecords.filter((r) => r.status === 'LATE').length
  const excusedCount = attendanceRecords.filter((r) => r.status === 'EXCUSED').length
  const onLeaveCount = attendanceRecords.filter((r) => r.status === 'ON_LEAVE').length

  // Same ledger math as fee.service.ts's recomputeInvoiceStatus (payable
  // = amount adjusted by fines/waivers, netPaid = payments minus
  // refunds) — kept in sync so this figure always agrees with what the
  // Fees UI shows for the same invoices.
  const outstandingStatuses = new Set(['PENDING', 'PARTIAL', 'OVERDUE'])
  const totalOutstanding = invoices
    .filter((invoice) => outstandingStatuses.has(invoice.status))
    .reduce((sum, invoice) => {
      const adjustmentDelta = invoice.adjustments.reduce(
        (s, a) => (a.type === 'FINE' ? s + a.amount : s - a.amount),
        0,
      )
      const payable = Math.max(0, invoice.amount + adjustmentDelta)
      const netPaid = invoice.payments.reduce((s, p) => s + (p.isRefund ? -p.amount : p.amount), 0)
      return sum + Math.max(0, payable - netPaid)
    }, 0)

  return {
    student: {
      ...studentFields,
      departmentName: department.name,
      sectionName: section?.name ?? null,
    },
    attendance: {
      totalRecords,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      onLeaveCount,
      attendancePercentage: totalRecords > 0 ? Math.round((presentCount / totalRecords) * 1000) / 10 : 0,
    },
    academics: {
      cgpa: cgpaResult.subjectsCounted === 0 ? null : cgpaResult.cgpa,
    },
    fees: {
      invoiceCount: invoices.length,
      totalInvoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
      totalOutstanding,
      overdueCount: invoices.filter((invoice) => invoice.status === 'OVERDUE').length,
    },
    hostelAllocation: hostelAllocation
      ? {
          hostelName: hostelAllocation.hostelRoom.hostel.name,
          roomNumber: hostelAllocation.hostelRoom.roomNumber,
          bedNumber: hostelAllocation.bedNumber,
          status: hostelAllocation.status,
        }
      : null,
    transportAllocation: transportAllocation
      ? {
          routeName: transportAllocation.route.name,
          stopName: transportAllocation.stop.name,
          status: transportAllocation.status,
        }
      : null,
    library: {
      activeIssueCount,
      overdueIssueCount,
    },
    documents,
    certificateRequests,
    activities,
    leave: {
      pendingCount: pendingLeaveCount,
      approvedCount: approvedLeaveCount,
      rejectedCount: rejectedLeaveCount,
      recent: recentLeave,
    },
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
