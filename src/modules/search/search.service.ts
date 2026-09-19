import { prisma } from '../../prisma/client'
import { getPermissionsForRole } from '../rbac/permissionCache'

const RESULT_CAP = 8

export interface SearchResult {
  id: string
  type: string
  label: string
  subtitle: string
}

export interface GlobalSearchResponse {
  students: SearchResult[]
  faculty: SearchResult[]
  departments: SearchResult[]
  programs: SearchResult[]
  batches: SearchResult[]
  sections: SearchResult[]
  subjects: SearchResult[]
}

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const })

async function searchStudents(q: string): Promise<SearchResult[]> {
  const rows = await prisma.student.findMany({
    where: {
      OR: [
        { firstName: insensitive(q) },
        { lastName: insensitive(q) },
        { email: insensitive(q) },
        { rollNumber: insensitive(q) },
      ],
    },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
    include: { department: { select: { name: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'student',
    label: `${row.firstName} ${row.lastName}`,
    subtitle: `${row.rollNumber} · ${row.department.name}`,
  }))
}

async function searchFaculty(q: string): Promise<SearchResult[]> {
  const rows = await prisma.faculty.findMany({
    where: {
      OR: [
        { employeeCode: insensitive(q) },
        { user: { name: insensitive(q) } },
        { user: { email: insensitive(q) } },
      ],
    },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'faculty',
    label: row.user.name,
    subtitle: `${row.employeeCode} · ${row.designation}`,
  }))
}

async function searchDepartments(q: string): Promise<SearchResult[]> {
  const rows = await prisma.department.findMany({
    where: { OR: [{ name: insensitive(q) }, { code: insensitive(q) }] },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({ id: row.id, type: 'department', label: row.name, subtitle: row.code }))
}

async function searchPrograms(q: string): Promise<SearchResult[]> {
  const rows = await prisma.program.findMany({
    where: { OR: [{ name: insensitive(q) }, { code: insensitive(q) }] },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({ id: row.id, type: 'program', label: row.name, subtitle: row.code }))
}

async function searchBatches(q: string): Promise<SearchResult[]> {
  const rows = await prisma.batch.findMany({
    where: { name: insensitive(q) },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({ id: row.id, type: 'batch', label: row.name, subtitle: '' }))
}

async function searchSections(q: string): Promise<SearchResult[]> {
  const rows = await prisma.section.findMany({
    where: { name: insensitive(q) },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({ id: row.id, type: 'section', label: row.name, subtitle: '' }))
}

async function searchSubjects(q: string): Promise<SearchResult[]> {
  const rows = await prisma.subject.findMany({
    where: { OR: [{ name: insensitive(q) }, { code: insensitive(q) }] },
    take: RESULT_CAP,
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({ id: row.id, type: 'subject', label: row.name, subtitle: row.code }))
}

/**
 * Cross-entity search for the admin console's search bar. Which
 * categories actually run (and therefore ever return non-empty) is
 * gated per-caller on the same permission keys their role would need
 * to view that entity directly — a role missing e.g. FACULTY_READ
 * always gets `faculty: []` here, never a partial leak of names it
 * can't otherwise read.
 */
export async function globalSearch(tenantId: string, role: string, q: string): Promise<GlobalSearchResponse> {
  const granted = await getPermissionsForRole(tenantId, role)

  const [students, faculty, departments, programs, batches, sections, subjects] = await Promise.all([
    granted.has('STUDENT_READ') ? searchStudents(q) : Promise.resolve([]),
    granted.has('FACULTY_READ') ? searchFaculty(q) : Promise.resolve([]),
    granted.has('DEPARTMENT_READ') ? searchDepartments(q) : Promise.resolve([]),
    granted.has('PROGRAM_READ') ? searchPrograms(q) : Promise.resolve([]),
    granted.has('BATCH_READ') ? searchBatches(q) : Promise.resolve([]),
    granted.has('SECTION_READ') ? searchSections(q) : Promise.resolve([]),
    granted.has('SUBJECT_READ') ? searchSubjects(q) : Promise.resolve([]),
  ])

  return { students, faculty, departments, programs, batches, sections, subjects }
}
