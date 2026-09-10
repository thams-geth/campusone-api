import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import type { AttendanceReportQuery, ExamResultsQuery, StudentStrengthQuery, SubjectPerformanceQuery } from './report.schema'

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100
}

export async function studentStrength(params: StudentStrengthQuery) {
  const { departmentId, programId, batchId, sectionId } = params
  const where = {
    status: 'ACTIVE' as const,
    ...(departmentId ? { departmentId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(programId || batchId
      ? { section: { batch: { ...(programId ? { programId } : {}), ...(batchId ? { id: batchId } : {}) } } }
      : {}),
  }

  const [total, byDepartment] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.groupBy({ by: ['departmentId'], where, _count: { _all: true } }),
  ])

  return {
    total,
    byDepartment: byDepartment.map((row) => ({ departmentId: row.departmentId, count: row._count._all })),
  }
}

export async function attendanceReport(params: AttendanceReportQuery) {
  const { sectionId, subjectId, dateFrom, dateTo } = params
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      ...(sectionId ? { sectionId } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
    },
    include: { records: true },
  })

  let presentCount = 0
  let totalRecords = 0
  for (const session of sessions) {
    for (const record of session.records) {
      totalRecords += 1
      if (record.status === 'PRESENT' || record.status === 'LATE') presentCount += 1
    }
  }

  return {
    totalSessions: sessions.length,
    totalRecords,
    presentCount,
    attendancePercentage: totalRecords > 0 ? Math.round((presentCount / totalRecords) * 10000) / 100 : 0,
  }
}

export async function departmentPerformance() {
  const departments = await prisma.department.findMany({ where: { status: 'ACTIVE' } })

  return Promise.all(
    departments.map(async (department) => {
      const [studentCount, marks] = await Promise.all([
        prisma.student.count({ where: { departmentId: department.id, status: 'ACTIVE' } }),
        prisma.marks.findMany({
          where: { status: 'PUBLISHED', marksObtained: { not: null }, student: { departmentId: department.id } },
        }),
      ])

      const percentages = marks.map((m) => ((m.marksObtained ?? 0) / m.maxMarks) * 100)
      return {
        departmentId: department.id,
        name: department.name,
        studentCount,
        studentsAssessed: marks.length,
        averageMarksPercentage: average(percentages),
      }
    }),
  )
}

export async function subjectPerformance(params: SubjectPerformanceQuery) {
  const subjects = await prisma.subject.findMany({ where: { ...(params.programId ? { programId: params.programId } : {}) } })

  return Promise.all(
    subjects.map(async (subject) => {
      const marks = await prisma.marks.findMany({
        where: { status: 'PUBLISHED', marksObtained: { not: null }, examSchedule: { subjectId: subject.id } },
      })
      const percentages = marks.map((m) => ((m.marksObtained ?? 0) / m.maxMarks) * 100)
      return {
        subjectId: subject.id,
        name: subject.name,
        code: subject.code,
        studentsAssessed: marks.length,
        averageMarksPercentage: average(percentages),
      }
    }),
  )
}

const PASS_PERCENTAGE = 40

export async function examResults(params: ExamResultsQuery) {
  const exam = await prisma.exam.findUnique({ where: { id: params.examId } })
  if (!exam) throw ApiError.notFound('Exam not found')

  const marks = await prisma.marks.findMany({
    where: { status: 'PUBLISHED', marksObtained: { not: null }, examSchedule: { examId: params.examId } },
  })

  const percentages = marks.map((m) => ((m.marksObtained ?? 0) / m.maxMarks) * 100)
  const passCount = percentages.filter((p) => p >= PASS_PERCENTAGE).length

  return {
    examId: exam.id,
    examName: exam.name,
    totalAssessed: marks.length,
    passCount,
    failCount: marks.length - passCount,
    averagePercentage: average(percentages),
  }
}

/** Mirrors fee.service.ts's recomputeInvoiceStatus payable calculation — a WAIVED invoice owes nothing further regardless of its face amount. */
export async function financialSummary() {
  const invoices = await prisma.feeInvoice.findMany({ include: { adjustments: true, payments: true } })

  const byCategory = new Map<string, { invoiced: number; collected: number }>()
  let totalInvoiced = 0
  let totalCollected = 0

  for (const invoice of invoices) {
    const netPaid = invoice.payments.reduce((sum, p) => sum + (p.isRefund ? -p.amount : p.amount), 0)
    const adjustmentDelta = invoice.adjustments.reduce((sum, a) => (a.type === 'FINE' ? sum + a.amount : sum - a.amount), 0)
    const payable = invoice.status === 'WAIVED' ? netPaid : Math.max(0, invoice.amount + adjustmentDelta)

    totalInvoiced += payable
    totalCollected += netPaid

    const bucket = byCategory.get(invoice.category) ?? { invoiced: 0, collected: 0 }
    bucket.invoiced += payable
    bucket.collected += netPaid
    byCategory.set(invoice.category, bucket)
  }

  return {
    totalInvoiced,
    totalCollected,
    totalOutstanding: Math.max(0, totalInvoiced - totalCollected),
    byCategory: Array.from(byCategory.entries()).map(([category, v]) => ({
      category,
      invoiced: v.invoiced,
      collected: v.collected,
      outstanding: Math.max(0, v.invoiced - v.collected),
    })),
  }
}

/** "Dropout" per the roadmap: INACTIVE without ever reaching ALUMNI — i.e. left without graduating. */
export async function dropoutReport() {
  const students = await prisma.student.findMany({
    where: { status: 'INACTIVE' },
    select: { id: true, firstName: true, lastName: true, rollNumber: true, departmentId: true },
    orderBy: { rollNumber: 'asc' },
  })
  const byDepartment = await prisma.student.groupBy({
    by: ['departmentId'],
    where: { status: 'INACTIVE' },
    _count: { _all: true },
  })

  return {
    total: students.length,
    byDepartment: byDepartment.map((row) => ({ departmentId: row.departmentId, count: row._count._all })),
    students,
  }
}

export async function facultyWorkload() {
  const facultyList = await prisma.faculty.findMany({
    where: { status: 'ACTIVE' },
    include: { user: { select: { name: true } } },
  })

  return Promise.all(
    facultyList.map(async (faculty) => {
      const [subjectsAssigned, weeklyPeriods] = await Promise.all([
        prisma.subject.count({ where: { facultyId: faculty.id } }),
        prisma.timetableEntry.count({ where: { facultyId: faculty.id } }),
      ])
      return { facultyId: faculty.id, name: faculty.user.name, subjectsAssigned, weeklyPeriods }
    }),
  )
}
