import { PrismaPg } from '@prisma/adapter-pg'
import { DepartmentStatus, ModuleId, PrismaClient, type Weekday } from '@prisma/client'
import request from 'supertest'
import type { Express } from 'express'
import { env } from '../config/env'
import { prisma } from '../prisma/client'
import { requestContext } from '../prisma/tenantContext'
import { hashPassword } from '../modules/auth/auth.service'
import { seedTenantRoles } from '../modules/rbac/rbac.seed'
import type { SystemRoleName } from '../modules/rbac/permissions'
import { seedPlanCatalogue } from '../modules/billing/billing.seed'

/**
 * Runs a fixture-creation callback inside a bootstrap request context.
 * Prisma promises are lazy — the await must happen INSIDE the run()
 * callback or AsyncLocalStorage loses the context by the time it
 * actually executes (see src/prisma/client.ts).
 */
function withBootstrapContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return requestContext.run({ tenantId, userId: 'bootstrap', role: 'SUPER_ADMIN' }, fn)
}

/** Codes/slugs are length-capped in the schema — keep test identifiers short. */
export function shortId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export const rawTestPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })

export const TEST_PASSWORD = 'Passw0rd!'

export async function createTestTenant(namePrefix: string) {
  const tenant = await rawTestPrisma.tenant.create({
    data: { name: `${namePrefix} College`, slug: `${namePrefix.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  })
  // Every tenant needs its system roles + default grants before any
  // user can log in — see rbac.seed.ts. The plan catalogue is global
  // reference data (see billing.seed.ts) but still needs SOME request
  // context to write through the tenant-scoped client.
  await seedTenantRoles(tenant.id)
  await withBootstrapContext(tenant.id, seedPlanCatalogue)
  return tenant
}

export async function createTestUser(tenantId: string, roleName: SystemRoleName, emailPrefix: string) {
  const passwordHash = await hashPassword(TEST_PASSWORD)
  // Must await the Prisma call INSIDE this callback (Prisma promises are
  // lazy, so a bare `() => prisma.x()` loses the AsyncLocalStorage
  // context by the time it actually runs — see src/prisma/client.ts).
  return requestContext.run({ tenantId, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId, name: roleName } })
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: `${emailPrefix} Test User`,
        email: `${emailPrefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`,
        passwordHash,
        isActive: true,
      },
    })
    await prisma.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } })
    return user
  })
}

export async function createTestDepartment(
  tenantId: string,
  overrides: Partial<{ name: string; code: string; status: DepartmentStatus }> = {},
) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.department.create({
      data: {
        tenantId,
        name: overrides.name ?? 'Test Department',
        code: overrides.code ?? shortId('D'),
        status: overrides.status ?? DepartmentStatus.ACTIVE,
      },
    }),
  )
}

export async function createTestAcademicYear(tenantId: string, overrides: Partial<{ name: string; isCurrent: boolean }> = {}) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.academicYear.create({
      data: {
        tenantId,
        name: overrides.name ?? shortId('AY'),
        startDate: new Date('2024-06-01'),
        endDate: new Date('2025-05-31'),
        isCurrent: overrides.isCurrent ?? false,
      },
    }),
  )
}

export async function createTestProgram(tenantId: string, departmentId: string, overrides: Partial<{ name: string; code: string }> = {}) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.program.create({
      data: {
        tenantId,
        departmentId,
        name: overrides.name ?? 'Test Program',
        code: overrides.code ?? shortId('P'),
        durationYears: 4,
      },
    }),
  )
}

export async function createTestBatch(
  tenantId: string,
  programId: string,
  academicYearId: string,
  overrides: Partial<{ name: string }> = {},
) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.batch.create({
      data: {
        tenantId,
        programId,
        academicYearId,
        name: overrides.name ?? shortId('B'),
        startYear: 2024,
        endYear: 2028,
      },
    }),
  )
}

export async function createTestSection(tenantId: string, batchId: string, overrides: Partial<{ name: string }> = {}) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.section.create({
      data: {
        tenantId,
        batchId,
        name: overrides.name ?? 'A',
        currentSemester: 1,
      },
    }),
  )
}

export async function createTestRoom(tenantId: string, overrides: Partial<{ name: string; code: string }> = {}) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.room.create({
      data: {
        tenantId,
        name: overrides.name ?? 'Test Room',
        code: overrides.code ?? shortId('R'),
      },
    }),
  )
}

export async function createTestSubject(tenantId: string, programId: string, overrides: Partial<{ code: string; name: string }> = {}) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.subject.create({
      data: {
        tenantId,
        programId,
        semesterNumber: 1,
        code: overrides.code ?? shortId('S'),
        name: overrides.name ?? 'Test Subject',
        credits: 4,
      },
    }),
  )
}

/** Creates a Faculty profile backed by a fresh User+UserRole, matching how faculty.service.ts provisions one. */
export async function createTestFaculty(tenantId: string, departmentId: string, overrides: Partial<{ employeeCode: string }> = {}) {
  return withBootstrapContext(tenantId, async () => {
    const facultyRole = await prisma.role.findFirstOrThrow({ where: { tenantId, name: 'FACULTY' } })
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: 'Test Faculty',
        email: `faculty.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`,
        passwordHash: await hashPassword(TEST_PASSWORD),
        isActive: true,
      },
    })
    await prisma.userRole.create({ data: { tenantId, userId: user.id, roleId: facultyRole.id } })
    return await prisma.faculty.create({
      data: {
        tenantId,
        userId: user.id,
        employeeCode: overrides.employeeCode ?? shortId('EMP'),
        departmentId,
        designation: 'Assistant Professor',
        joiningDate: new Date('2020-06-01'),
      },
      include: { user: { select: { name: true, email: true, isActive: true } } },
    })
  })
}

export async function createTestStudent(
  tenantId: string,
  departmentId: string,
  overrides: Partial<{ sectionId: string; rollNumber: string; email: string }> = {},
) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.student.create({
      data: {
        tenantId,
        firstName: 'Test',
        lastName: 'Student',
        email: overrides.email ?? `${shortId('student')}@example.com`,
        phone: '+91 9000000000',
        rollNumber: overrides.rollNumber ?? shortId('R'),
        departmentId,
        sectionId: overrides.sectionId,
        gender: 'OTHER',
        dateOfBirth: new Date('2003-01-01'),
        admissionDate: new Date('2023-06-01'),
        status: 'ACTIVE',
      },
    }),
  )
}

/**
 * Creates a Student *with* a linked login account (role STUDENT) — for
 * self-service tests (leave requests, assignment submissions, viewing
 * own marks). Most students created via createTestStudent have no
 * login at all, matching production (Student.userId is nullable, no
 * self-registration flow exists yet).
 */
export async function createTestStudentUser(
  tenantId: string,
  departmentId: string,
  overrides: Partial<{ sectionId: string }> = {},
) {
  return withBootstrapContext(tenantId, async () => {
    const studentRole = await prisma.role.findFirstOrThrow({ where: { tenantId, name: 'STUDENT' } })
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: 'Test Student',
        email: `${shortId('studentuser')}@example.com`,
        passwordHash: await hashPassword(TEST_PASSWORD),
        isActive: true,
      },
    })
    await prisma.userRole.create({ data: { tenantId, userId: user.id, roleId: studentRole.id } })
    const student = await prisma.student.create({
      data: {
        tenantId,
        userId: user.id,
        firstName: 'Test',
        lastName: 'Student',
        email: user.email,
        phone: '+91 9000000000',
        rollNumber: shortId('R'),
        departmentId,
        sectionId: overrides.sectionId,
        gender: 'OTHER',
        dateOfBirth: new Date('2003-01-01'),
        admissionDate: new Date('2023-06-01'),
        status: 'ACTIVE',
      },
    })
    return { student, user }
  })
}

export async function createTestTimetableEntry(
  tenantId: string,
  sectionId: string,
  subjectId: string,
  facultyId: string,
  roomId: string,
  overrides: Partial<{ dayOfWeek: Weekday; startTime: string; endTime: string }> = {},
) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.timetableEntry.create({
      data: {
        tenantId,
        sectionId,
        subjectId,
        facultyId,
        roomId,
        dayOfWeek: overrides.dayOfWeek ?? 'MONDAY',
        startTime: overrides.startTime ?? '09:00',
        endTime: overrides.endTime ?? '10:00',
      },
    }),
  )
}

/** Every module besides CORE starts disabled — flip one on for a test tenant (see requireModule). */
export async function enableModule(tenantId: string, moduleId: ModuleId) {
  return withBootstrapContext(tenantId, async () =>
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      update: { enabled: true },
      create: { tenantId, moduleId, enabled: true },
    }),
  )
}

/** Creates a tenant + an admin user, and logs in for a bearer token. */
export async function setUpAuthenticatedTenant(app: Express, roleName: SystemRoleName = 'SUPER_ADMIN') {
  const tenant = await createTestTenant('Auth Helper')
  const user = await createTestUser(tenant.id, roleName, 'helper')
  const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  return { tenant, user, token: loginRes.body.token as string }
}
