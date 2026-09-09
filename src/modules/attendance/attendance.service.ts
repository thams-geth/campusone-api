import { AttendanceStatus } from '@prisma/client'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnFacultyId } from '../shared/facultyContext'
import type {
  CreateSessionInput,
  ListCorrectionsQuery,
  ListRecordsQuery,
  ListSessionsQuery,
  MarkRecordsInput,
  RequestCorrectionInput,
} from './attendance.schema'

const withRecords = { records: { include: { student: true } } } as const

export async function listSessions(params: ListSessionsQuery) {
  const { page, pageSize, sectionId, subjectId, facultyId } = params
  const where = {
    ...(sectionId ? { sectionId } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(facultyId ? { facultyId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.attendanceSession.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { date: 'desc' } }),
    prisma.attendanceSession.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getSession(id: string) {
  const session = await prisma.attendanceSession.findUnique({ where: { id }, include: withRecords })
  if (!session) throw ApiError.notFound('Attendance session not found')
  return session
}

/** Creates a DRAFT session and pre-populates one PRESENT record per active student in the section — faculty then only toggles exceptions. */
export async function createSession(tenantId: string, callerUserId: string, input: CreateSessionInput) {
  const [section, subject, facultyId] = await Promise.all([
    prisma.section.findUnique({ where: { id: input.sectionId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    resolveOwnFacultyId(callerUserId, input.facultyId),
  ])
  if (!section) throw ApiError.badRequest('Section not found.', { sectionId: ['Invalid section'] })
  if (!subject) throw ApiError.badRequest('Subject not found.', { subjectId: ['Invalid subject'] })

  const existing = await prisma.attendanceSession.findFirst({
    where: { sectionId: input.sectionId, subjectId: input.subjectId, date: input.date },
  })
  if (existing) {
    throw ApiError.conflict('An attendance session already exists for this section/subject/date.', 'DUPLICATE_SESSION')
  }

  const students = await prisma.student.findMany({ where: { sectionId: input.sectionId, status: 'ACTIVE' } })

  const session = await prisma.attendanceSession.create({
    data: { tenantId, sectionId: input.sectionId, subjectId: input.subjectId, facultyId, date: input.date },
  })
  if (students.length > 0) {
    await prisma.attendanceRecord.createMany({
      data: students.map((student) => ({
        tenantId,
        sessionId: session.id,
        studentId: student.id,
        status: AttendanceStatus.PRESENT,
      })),
    })
  }

  await logActivity('created an attendance session', { entity: 'AttendanceSession', entityId: session.id, action: 'CREATE' })
  return getSession(session.id)
}

async function assertNotLocked(sessionId: string) {
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } })
  if (!session) throw ApiError.notFound('Attendance session not found')
  if (session.status === 'LOCKED') {
    throw ApiError.conflict('This session is locked. Request a correction instead of editing directly.', 'SESSION_LOCKED')
  }
  return session
}

export async function markRecords(sessionId: string, input: MarkRecordsInput) {
  const session = await assertNotLocked(sessionId)

  for (const record of input.records) {
    await prisma.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
      update: { status: record.status },
      create: { tenantId: session.tenantId, sessionId, studentId: record.studentId, status: record.status },
    })
  }

  await logActivity('updated attendance records', { entity: 'AttendanceSession', entityId: sessionId, action: 'UPDATE' })
  return getSession(sessionId)
}

export async function submitSession(id: string) {
  const session = await prisma.attendanceSession.findUnique({ where: { id } })
  if (!session) throw ApiError.notFound('Attendance session not found')
  if (session.status !== 'DRAFT') {
    throw ApiError.conflict('Only a DRAFT session can be submitted.', 'INVALID_SESSION_STATUS')
  }

  const updated = await prisma.attendanceSession.update({ where: { id }, data: { status: 'SUBMITTED' } })
  await logActivity('submitted an attendance session', { entity: 'AttendanceSession', entityId: id, action: 'SUBMIT' })
  return updated
}

export async function lockSession(id: string) {
  const session = await prisma.attendanceSession.findUnique({ where: { id } })
  if (!session) throw ApiError.notFound('Attendance session not found')
  if (session.status !== 'SUBMITTED') {
    throw ApiError.conflict('Only a SUBMITTED session can be locked.', 'INVALID_SESSION_STATUS')
  }

  const updated = await prisma.attendanceSession.update({ where: { id }, data: { status: 'LOCKED' } })
  await logActivity('locked an attendance session', { entity: 'AttendanceSession', entityId: id, action: 'LOCK' })
  return updated
}

export async function listRecordsByStudent(studentId: string, params: ListRecordsQuery) {
  const { page, pageSize, dateFrom, dateTo } = params
  const where = {
    studentId,
    ...(dateFrom || dateTo
      ? { session: { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { session: { date: 'desc' } },
      include: { session: true },
    }),
    prisma.attendanceRecord.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listRecordsBySection(sectionId: string, params: ListRecordsQuery) {
  const { page, pageSize, dateFrom, dateTo } = params
  const where = {
    session: {
      sectionId,
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
    },
  }

  const [data, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { session: { date: 'desc' } },
      include: { session: true, student: true },
    }),
    prisma.attendanceRecord.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listRecordsBySubject(subjectId: string, params: ListRecordsQuery) {
  const { page, pageSize, dateFrom, dateTo } = params
  const where = {
    session: {
      subjectId,
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
    },
  }

  const [data, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { session: { date: 'desc' } },
      include: { session: true, student: true },
    }),
    prisma.attendanceRecord.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function requestCorrection(tenantId: string, requestedByUserId: string, recordId: string, input: RequestCorrectionInput) {
  const record = await prisma.attendanceRecord.findUnique({ where: { id: recordId }, include: { session: true } })
  if (!record) throw ApiError.notFound('Attendance record not found')
  if (record.session.status !== 'LOCKED') {
    throw ApiError.conflict('Only a record in a LOCKED session needs a correction request — edit it directly instead.', 'SESSION_NOT_LOCKED')
  }

  const correction = await prisma.attendanceCorrection.create({
    data: { tenantId, recordId, requestedStatus: input.requestedStatus, reason: input.reason, requestedByUserId },
  })
  await logActivity('requested an attendance correction', { entity: 'AttendanceCorrection', entityId: correction.id, action: 'CREATE' })
  return correction
}

export async function listCorrections(params: ListCorrectionsQuery) {
  const { page, pageSize, status } = params
  const where = { ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.attendanceCorrection.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { record: true },
    }),
    prisma.attendanceCorrection.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function reviewCorrection(id: string, reviewedByUserId: string, decision: 'APPROVED' | 'REJECTED') {
  const correction = await prisma.attendanceCorrection.findUnique({ where: { id }, include: { record: true } })
  if (!correction) throw ApiError.notFound('Correction request not found')
  if (correction.status !== 'PENDING') {
    throw ApiError.conflict('This correction request has already been reviewed.', 'ALREADY_REVIEWED')
  }

  const updated = await prisma.attendanceCorrection.update({
    where: { id },
    data: { status: decision, reviewedByUserId, reviewedAt: new Date() },
  })

  if (decision === 'APPROVED') {
    const before = correction.record.status
    await prisma.attendanceRecord.update({ where: { id: correction.recordId }, data: { status: correction.requestedStatus } })
    // Before/after on the same audit entry (roadmap: "locked/published
    // changes require authorization and an audit record") rather than a
    // separate patch call, which risks touching unrelated rows.
    await logActivity('approved an attendance correction', {
      entity: 'AttendanceRecord',
      entityId: correction.recordId,
      action: 'CORRECTION_APPROVED',
      before: { status: before },
      after: { status: correction.requestedStatus },
    })
  } else {
    await logActivity('rejected an attendance correction', { entity: 'AttendanceCorrection', entityId: id, action: 'CORRECTION_REJECTED' })
  }

  return updated
}
