import type { Faculty, User } from '@prisma/client'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { hashPassword } from '../auth/auth.service'
import { logActivity } from '../shared/activityLog'
import type { FacultyCreateInput, FacultyUpdateInput, ListFacultyQuery } from './faculty.schema'

type FacultyWithUser = Faculty & { user: Pick<User, 'name' | 'email' | 'isActive'> }

function toFacultyDto(row: FacultyWithUser) {
  const { user, ...rest } = row
  return { ...rest, name: user.name, email: user.email, isActive: user.isActive }
}

const withUser = { user: { select: { name: true, email: true, isActive: true } } } as const

export async function listFaculty(params: ListFacultyQuery) {
  const { page, pageSize, search, departmentId, status } = params

  const where = {
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { employeeCode: { contains: search, mode: 'insensitive' as const } },
            { designation: { contains: search, mode: 'insensitive' as const } },
            { user: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.faculty.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'asc' }, include: withUser }),
    prisma.faculty.count({ where }),
  ])

  return { data: rows.map(toFacultyDto), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getFaculty(id: string) {
  const row = await prisma.faculty.findUnique({ where: { id }, include: withUser })
  if (!row) throw ApiError.notFound('Faculty member not found')
  return toFacultyDto(row)
}

/**
 * Faculty 360 — the same "everything about this person" aggregation
 * as Student 360 (see student.service.ts's getStudent360), just across
 * the tables a Faculty row participates in. Queries Prisma directly
 * per section rather than reusing each module's own paginated list
 * function.
 */
export async function getFaculty360(id: string) {
  const row = await prisma.faculty.findUnique({
    where: { id },
    include: { ...withUser, department: true },
  })
  if (!row) throw ApiError.notFound('Faculty member not found')

  const { department, ...rest } = row
  const faculty = { ...toFacultyDto(rest), departmentName: department.name }

  const [
    subjects,
    timetableEntries,
    sessionsTaken,
    recentSessions,
    assignmentCount,
    recentAssignments,
    leaveReviewedCount,
  ] = await Promise.all([
    prisma.subject.findMany({
      where: { facultyId: id },
      select: { id: true, code: true, name: true, semesterNumber: true, credits: true },
    }),
    prisma.timetableEntry.findMany({
      where: { facultyId: id },
      include: { section: true, subject: true, room: true },
    }),
    prisma.attendanceSession.count({ where: { facultyId: id } }),
    prisma.attendanceSession.findMany({
      where: { facultyId: id },
      orderBy: { date: 'desc' },
      take: 10,
      include: { section: true, subject: true },
    }),
    prisma.assignment.count({ where: { facultyId: id } }),
    prisma.assignment.findMany({
      where: { facultyId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, dueDate: true },
    }),
    prisma.leaveRequest.count({ where: { reviewedByUserId: row.userId } }),
  ])

  return {
    faculty,
    teaching: {
      subjectCount: subjects.length,
      subjects,
    },
    timetable: {
      weeklyPeriods: timetableEntries.length,
      entries: timetableEntries.map((entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
        sectionName: entry.section.name,
        subjectName: entry.subject.name,
        roomName: entry.room.name,
      })),
    },
    attendance: {
      sessionsTaken,
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        date: session.date,
        status: session.status,
        sectionName: session.section.name,
        subjectName: session.subject.name,
      })),
    },
    assignments: {
      count: assignmentCount,
      recent: recentAssignments,
    },
    leaveReviewed: {
      count: leaveReviewedCount,
    },
  }
}

async function assertDepartmentExists(departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } })
  if (!department) throw ApiError.badRequest('Department not found.', { departmentId: ['Invalid department'] })
}

async function assertUniqueEmployeeCode(employeeCode: string, excludeId?: string) {
  const existing = await prisma.faculty.findFirst({
    where: { employeeCode: { equals: employeeCode, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  if (existing) throw ApiError.conflict(`Employee code "${employeeCode}" is already in use.`, 'DUPLICATE_EMPLOYEE_CODE')
}

export async function createFaculty(tenantId: string, input: FacultyCreateInput) {
  const { name, email, password, ...facultyFields } = input

  await assertDepartmentExists(facultyFields.departmentId)
  await assertUniqueEmployeeCode(facultyFields.employeeCode)

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) throw ApiError.conflict(`A user with email "${email}" already exists.`, 'DUPLICATE_EMAIL')

  const facultyRole = await prisma.role.findFirstOrThrow({ where: { tenantId, name: 'FACULTY' } })
  const passwordHash = await hashPassword(password)

  const user = await prisma.user.create({ data: { tenantId, name, email, passwordHash, isActive: true } })
  await prisma.userRole.create({ data: { tenantId, userId: user.id, roleId: facultyRole.id } })
  const faculty = await prisma.faculty.create({ data: { tenantId, userId: user.id, ...facultyFields }, include: withUser })

  await logActivity(`added ${name} to the faculty`, { entity: 'Faculty', entityId: faculty.id, action: 'CREATE' })
  return toFacultyDto(faculty)
}

export async function updateFaculty(id: string, input: FacultyUpdateInput) {
  const existing = await prisma.faculty.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Faculty member not found')

  const { name, ...facultyFields } = input
  await assertDepartmentExists(facultyFields.departmentId)
  await assertUniqueEmployeeCode(facultyFields.employeeCode, id)

  await prisma.user.update({ where: { id: existing.userId }, data: { name } })
  const faculty = await prisma.faculty.update({ where: { id }, data: facultyFields, include: withUser })

  await logActivity(`updated faculty details for ${name}`, { entity: 'Faculty', entityId: id, action: 'UPDATE' })
  return toFacultyDto(faculty)
}

export async function deleteFaculty(id: string) {
  const existing = await prisma.faculty.findUnique({ where: { id }, include: withUser })
  if (!existing) throw ApiError.notFound('Faculty member not found')

  const timetableCount = await prisma.timetableEntry.count({ where: { facultyId: id } })
  if (timetableCount > 0) {
    throw ApiError.conflict('Cannot remove a faculty member with timetable entries assigned.', 'FACULTY_IN_USE')
  }

  // Deactivate the account rather than deleting it — preserves audit
  // trail references (AuditLog.actorUserId) and login history.
  await prisma.user.update({ where: { id: existing.userId }, data: { isActive: false } })
  await prisma.faculty.delete({ where: { id } })
  await logActivity(`removed ${existing.user.name} from the faculty`, { entity: 'Faculty', entityId: id, action: 'DELETE' })
}
