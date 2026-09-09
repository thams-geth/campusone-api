import { prisma } from '../../prisma/client'

// No Admissions module exists yet (out of V1 scope) — matches the
// frontend's mock dashboard, which hardcodes the same placeholder.
// Replace with a real count once that module lands.
const PENDING_ADMISSIONS_PLACEHOLDER = 7

export async function getSummary() {
  const [totalStudents, activeStudents, activeDepartments] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.department.findMany({ where: { status: 'ACTIVE' }, select: { facultyCount: true } }),
  ])

  return {
    totalStudents,
    activeStudents,
    totalDepartments: activeDepartments.length,
    totalFaculty: activeDepartments.reduce((sum, d) => sum + d.facultyCount, 0),
    pendingAdmissions: PENDING_ADMISSIONS_PLACEHOLDER,
  }
}

export async function getEnrollmentTrend() {
  const students = await prisma.student.findMany({ select: { admissionDate: true } })

  const counts = new Map<string, number>()
  for (const { admissionDate } of students) {
    const key = `${admissionDate.getUTCFullYear()}-${String(admissionDate.getUTCMonth() + 1).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([key, count]) => {
      const [year, month] = key.split('-')
      const label = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      })
      return { month: label, count }
    })
}

export async function getDepartmentDistribution() {
  const departments = await prisma.department.findMany({
    where: { status: 'ACTIVE' },
    include: { _count: { select: { students: true } } },
  })

  return departments.map((d) => ({
    departmentId: d.id,
    name: d.name,
    code: d.code,
    studentCount: d._count.students,
  }))
}

export async function getRecentActivity(limit = 10) {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return entries.map((entry) => ({
    id: entry.id,
    message: entry.message,
    actor: entry.actorName,
    timestamp: entry.createdAt,
  }))
}
