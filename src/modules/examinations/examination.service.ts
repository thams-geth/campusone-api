import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  EditMarksInput,
  EnterMarksInput,
  ExamInput,
  ExamScheduleInput,
  ListExamsQuery,
  ReviseMarksInput,
} from './examination.schema'

// ---- Exams ----

export async function listExams(params: ListExamsQuery) {
  const { page, pageSize, academicYearId, semesterNumber, status } = params
  const where = {
    ...(academicYearId ? { academicYearId } : {}),
    ...(semesterNumber ? { semesterNumber } : {}),
    ...(status ? { status } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.exam.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { startDate: 'desc' } }),
    prisma.exam.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getExam(id: string) {
  const exam = await prisma.exam.findUnique({ where: { id }, include: { schedules: true } })
  if (!exam) throw ApiError.notFound('Exam not found')
  return exam
}

export async function createExam(tenantId: string, input: ExamInput) {
  const academicYear = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } })
  if (!academicYear) throw ApiError.badRequest('Academic year not found.', { academicYearId: ['Invalid academic year'] })

  const exam = await prisma.exam.create({ data: { tenantId, ...input } })
  await logActivity(`created the ${exam.name} exam`, { entity: 'Exam', entityId: exam.id, action: 'CREATE' })
  return exam
}

export async function updateExam(id: string, input: ExamInput) {
  const existing = await prisma.exam.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Exam not found')

  const academicYear = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } })
  if (!academicYear) throw ApiError.badRequest('Academic year not found.', { academicYearId: ['Invalid academic year'] })

  const exam = await prisma.exam.update({ where: { id }, data: input })
  await logActivity(`updated the ${exam.name} exam`, { entity: 'Exam', entityId: exam.id, action: 'UPDATE' })
  return exam
}

export async function deleteExam(id: string) {
  const existing = await prisma.exam.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Exam not found')

  const scheduleCount = await prisma.examSchedule.count({ where: { examId: id } })
  if (scheduleCount > 0) throw ApiError.conflict('Cannot delete an exam that still has schedules.', 'EXAM_IN_USE')

  await prisma.exam.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} exam`, { entity: 'Exam', entityId: id, action: 'DELETE' })
}

// ---- Exam schedules ----

export async function listSchedules(examId: string) {
  return prisma.examSchedule.findMany({ where: { examId }, orderBy: { examDate: 'asc' } })
}

export async function createSchedule(tenantId: string, examId: string, input: ExamScheduleInput) {
  const [exam, subject, room] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.room.findUnique({ where: { id: input.roomId } }),
  ])
  if (!exam) throw ApiError.notFound('Exam not found')
  if (!subject) throw ApiError.badRequest('Subject not found.', { subjectId: ['Invalid subject'] })
  if (!room) throw ApiError.badRequest('Room not found.', { roomId: ['Invalid room'] })

  const existing = await prisma.examSchedule.findFirst({ where: { examId, subjectId: input.subjectId } })
  if (existing) throw ApiError.conflict('This subject is already scheduled for this exam.', 'DUPLICATE_SCHEDULE')

  const schedule = await prisma.examSchedule.create({ data: { tenantId, examId, ...input } })
  await logActivity('scheduled an exam subject', { entity: 'ExamSchedule', entityId: schedule.id, action: 'CREATE' })
  return schedule
}

export async function updateSchedule(id: string, input: ExamScheduleInput) {
  const existing = await prisma.examSchedule.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Exam schedule not found')

  const [subject, room] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.room.findUnique({ where: { id: input.roomId } }),
  ])
  if (!subject) throw ApiError.badRequest('Subject not found.', { subjectId: ['Invalid subject'] })
  if (!room) throw ApiError.badRequest('Room not found.', { roomId: ['Invalid room'] })

  const schedule = await prisma.examSchedule.update({ where: { id }, data: input })
  await logActivity('updated an exam schedule', { entity: 'ExamSchedule', entityId: id, action: 'UPDATE' })
  return schedule
}

export async function deleteSchedule(id: string) {
  const existing = await prisma.examSchedule.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Exam schedule not found')

  const marksCount = await prisma.marks.count({ where: { examScheduleId: id } })
  if (marksCount > 0) throw ApiError.conflict('Cannot delete a schedule that already has marks entered.', 'SCHEDULE_IN_USE')

  await prisma.examSchedule.delete({ where: { id } })
  await logActivity('removed an exam schedule', { entity: 'ExamSchedule', entityId: id, action: 'DELETE' })
}

// ---- Marks workflow: DRAFT -> SUBMITTED -> VERIFIED -> PUBLISHED ----

export async function enterMarks(tenantId: string, enteredByUserId: string, examScheduleId: string, input: EnterMarksInput) {
  const schedule = await prisma.examSchedule.findUnique({ where: { id: examScheduleId } })
  if (!schedule) throw ApiError.notFound('Exam schedule not found')

  for (const entry of input.marks) {
    const existing = await prisma.marks.findUnique({
      where: { examScheduleId_studentId: { examScheduleId, studentId: entry.studentId } },
    })
    if (existing && existing.status !== 'DRAFT') {
      throw ApiError.conflict(`Marks for one or more students are already ${existing.status.toLowerCase()} — use revise instead.`, 'MARKS_NOT_EDITABLE')
    }

    await prisma.marks.upsert({
      where: { examScheduleId_studentId: { examScheduleId, studentId: entry.studentId } },
      update: { marksObtained: entry.marksObtained, maxMarks: entry.maxMarks, specialStatus: entry.specialStatus, enteredByUserId },
      create: {
        tenantId,
        examScheduleId,
        studentId: entry.studentId,
        marksObtained: entry.marksObtained,
        maxMarks: entry.maxMarks,
        specialStatus: entry.specialStatus,
        enteredByUserId,
      },
    })
  }

  await logActivity('entered marks', { entity: 'ExamSchedule', entityId: examScheduleId, action: 'MARKS_ENTER' })
  return prisma.marks.findMany({ where: { examScheduleId } })
}

export async function listMarksForSchedule(examScheduleId: string) {
  return prisma.marks.findMany({ where: { examScheduleId }, include: { student: true } })
}

async function transitionScheduleMarks(examScheduleId: string, from: 'DRAFT' | 'SUBMITTED' | 'VERIFIED', to: 'SUBMITTED' | 'VERIFIED' | 'PUBLISHED', userField: 'enteredByUserId' | 'verifiedByUserId' | 'publishedByUserId', userId: string) {
  const marks = await prisma.marks.findMany({ where: { examScheduleId, status: from } })
  if (marks.length === 0) {
    throw ApiError.conflict(`No marks are in ${from} status for this schedule.`, 'NO_MARKS_TO_TRANSITION')
  }

  await prisma.marks.updateMany({ where: { examScheduleId, status: from }, data: { status: to, [userField]: userId } })
  return prisma.marks.findMany({ where: { examScheduleId } })
}

export async function submitMarks(examScheduleId: string, userId: string) {
  const result = await transitionScheduleMarks(examScheduleId, 'DRAFT', 'SUBMITTED', 'enteredByUserId', userId)
  await logActivity('submitted marks', { entity: 'ExamSchedule', entityId: examScheduleId, action: 'MARKS_SUBMIT' })
  return result
}

export async function verifyMarks(examScheduleId: string, userId: string) {
  const result = await transitionScheduleMarks(examScheduleId, 'SUBMITTED', 'VERIFIED', 'verifiedByUserId', userId)
  await logActivity('verified marks', { entity: 'ExamSchedule', entityId: examScheduleId, action: 'MARKS_VERIFY' })
  return result
}

export async function publishMarks(examScheduleId: string, userId: string) {
  const result = await transitionScheduleMarks(examScheduleId, 'VERIFIED', 'PUBLISHED', 'publishedByUserId', userId)
  await logActivity('published marks', { entity: 'ExamSchedule', entityId: examScheduleId, action: 'MARKS_PUBLISH' })
  return result
}

export async function editMarks(id: string, input: EditMarksInput) {
  const existing = await prisma.marks.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Marks entry not found')
  if (existing.status === 'VERIFIED' || existing.status === 'PUBLISHED') {
    throw ApiError.conflict('Marks that have been verified or published cannot be edited directly — use revise.', 'MARKS_NOT_EDITABLE')
  }

  const updated = await prisma.marks.update({ where: { id }, data: input })
  await logActivity('edited marks', { entity: 'Marks', entityId: id, action: 'UPDATE' })
  return updated
}

/** Revising already-published marks — a separate, more sensitive permission (MARKS_REVISE) with a mandatory before/after audit record. */
export async function reviseMarks(id: string, input: ReviseMarksInput) {
  const existing = await prisma.marks.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Marks entry not found')
  if (existing.status !== 'PUBLISHED') {
    throw ApiError.conflict('Only published marks need revision — edit directly instead.', 'MARKS_NOT_PUBLISHED')
  }

  const before = existing.marksObtained
  const updated = await prisma.marks.update({ where: { id }, data: { marksObtained: input.marksObtained } })

  await logActivity(`revised published marks: ${input.reason}`, {
    entity: 'Marks',
    entityId: id,
    action: 'REVISE',
    before: { marksObtained: before },
    after: { marksObtained: input.marksObtained },
  })
  return updated
}

// ---- Results: grade / SGPA / CGPA, computed on read from PUBLISHED marks only ----

function gradeFromPercentage(pct: number): { letter: string; points: number } {
  if (pct >= 90) return { letter: 'O', points: 10 }
  if (pct >= 80) return { letter: 'A+', points: 9 }
  if (pct >= 70) return { letter: 'A', points: 8 }
  if (pct >= 60) return { letter: 'B+', points: 7 }
  if (pct >= 50) return { letter: 'B', points: 6 }
  if (pct >= 40) return { letter: 'C', points: 5 }
  return { letter: 'F', points: 0 }
}

interface SubjectAggregate {
  subjectId: string
  subjectName: string
  subjectCode: string
  credits: number
  marksObtained: number
  maxMarks: number
}

async function aggregatePublishedMarksBySubject(studentId: string, semesterNumber?: number) {
  const marks = await prisma.marks.findMany({
    where: {
      studentId,
      status: 'PUBLISHED',
      marksObtained: { not: null },
      ...(semesterNumber ? { examSchedule: { subject: { semesterNumber } } } : {}),
    },
    include: { examSchedule: { include: { subject: true } } },
  })

  const bySubject = new Map<string, SubjectAggregate>()
  for (const mark of marks) {
    const subject = mark.examSchedule.subject
    const key = subject.id
    const existing = bySubject.get(key)
    if (existing) {
      existing.marksObtained += mark.marksObtained ?? 0
      existing.maxMarks += mark.maxMarks
    } else {
      bySubject.set(key, {
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code,
        credits: subject.credits,
        marksObtained: mark.marksObtained ?? 0,
        maxMarks: mark.maxMarks,
      })
    }
  }
  return [...bySubject.values()]
}

export async function getSemesterResult(callerUserId: string, explicitStudentId: string | undefined, semesterNumber: number) {
  const studentId = await resolveOwnStudentId(callerUserId, explicitStudentId)
  const subjects = await aggregatePublishedMarksBySubject(studentId, semesterNumber)

  const rows = subjects.map((s) => {
    const percentage = s.maxMarks > 0 ? (s.marksObtained / s.maxMarks) * 100 : 0
    const grade = gradeFromPercentage(percentage)
    return { ...s, percentage: Math.round(percentage * 100) / 100, grade: grade.letter, gradePoints: grade.points }
  })

  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0)
  const sgpa = totalCredits > 0 ? rows.reduce((sum, r) => sum + r.gradePoints * r.credits, 0) / totalCredits : 0

  return { studentId, semesterNumber, subjects: rows, sgpa: Math.round(sgpa * 100) / 100 }
}

export async function getCgpa(callerUserId: string, explicitStudentId: string | undefined) {
  const studentId = await resolveOwnStudentId(callerUserId, explicitStudentId)
  const subjects = await aggregatePublishedMarksBySubject(studentId)

  const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0)
  const totalPoints = subjects.reduce((sum, s) => {
    const percentage = s.maxMarks > 0 ? (s.marksObtained / s.maxMarks) * 100 : 0
    return sum + gradeFromPercentage(percentage).points * s.credits
  }, 0)
  const cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0

  return { studentId, subjectsCounted: subjects.length, totalCredits, cgpa: Math.round(cgpa * 100) / 100 }
}
