import { ApiError } from '../../utils/ApiError'
import { parseCsv, stringifyCsv } from '../../utils/csv'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { createStudent } from '../students/student.service'
import { studentInputSchema } from '../students/student.schema'
import type { ExportStudentsQuery } from './importExport.schema'

const STUDENT_CSV_COLUMNS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'rollNumber',
  'departmentId',
  'gender',
  'dateOfBirth',
  'admissionDate',
  'status',
  'sectionId',
  'currentSemester',
  'guardianName',
  'guardianPhone',
  'address',
] as const

function csvToRecords(csv: string): Record<string, string>[] {
  const rows = parseCsv(csv)
  if (rows.length === 0) return []
  const [header, ...dataRows] = rows
  return dataRows.map((row) => {
    const record: Record<string, string> = {}
    header.forEach((column, index) => {
      record[column.trim()] = row[index] ?? ''
    })
    return record
  })
}

function recordToStudentInput(record: Record<string, string>) {
  return {
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    phone: record.phone,
    rollNumber: record.rollNumber,
    departmentId: record.departmentId,
    sectionId: record.sectionId || undefined,
    currentSemester: record.currentSemester || undefined,
    gender: record.gender,
    dateOfBirth: record.dateOfBirth,
    admissionDate: record.admissionDate,
    status: record.status || 'ACTIVE',
    guardianName: record.guardianName || undefined,
    guardianPhone: record.guardianPhone || undefined,
    address: record.address || undefined,
  }
}

/** Validates every row against the live studentInputSchema without creating anything — the "preview" step of upload -> validate -> preview -> confirm (roadmap #27). */
export function previewStudentImport(csv: string) {
  const records = csvToRecords(csv)
  const results = records.map((record, index) => {
    const parsed = studentInputSchema.safeParse(recordToStudentInput(record))
    return parsed.success
      ? { row: index + 2, valid: true as const }
      : { row: index + 2, valid: false as const, errors: parsed.error.flatten().fieldErrors }
  })

  return {
    totalRows: records.length,
    validCount: results.filter((r) => r.valid).length,
    invalidCount: results.filter((r) => !r.valid).length,
    results,
  }
}

/** Re-validates and creates only valid rows — an invalid row is reported, never partially inserted. */
export async function commitStudentImport(tenantId: string, csv: string) {
  const records = csvToRecords(csv)
  let created = 0
  const failed: { row: number; errors: unknown }[] = []

  for (let index = 0; index < records.length; index++) {
    const parsed = studentInputSchema.safeParse(recordToStudentInput(records[index]))
    if (!parsed.success) {
      failed.push({ row: index + 2, errors: parsed.error.flatten().fieldErrors })
      continue
    }
    try {
      await createStudent(tenantId, parsed.data)
      created += 1
    } catch (err) {
      failed.push({ row: index + 2, errors: [err instanceof ApiError ? err.message : 'Unknown error'] })
    }
  }

  await logActivity(`bulk-imported ${created} student${created === 1 ? '' : 's'}`, { entity: 'Student', action: 'BULK_IMPORT' })
  return { createdCount: created, failedCount: failed.length, failed }
}

export async function exportStudentsCsv(params: ExportStudentsQuery): Promise<string> {
  const students = await prisma.student.findMany({
    where: { ...(params.departmentId ? { departmentId: params.departmentId } : {}), ...(params.status ? { status: params.status } : {}) },
    orderBy: { createdAt: 'asc' },
  })

  const rows = students.map((student) =>
    STUDENT_CSV_COLUMNS.map((column) => {
      const value = student[column as keyof typeof student]
      if (value == null) return ''
      if (value instanceof Date) return value.toISOString().slice(0, 10)
      return String(value)
    }),
  )

  return stringifyCsv([...STUDENT_CSV_COLUMNS], rows)
}
