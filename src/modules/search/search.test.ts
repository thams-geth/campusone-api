import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import {
  createTestDepartment,
  createTestFaculty,
  createTestStudent,
  createTestTenant,
  createTestUser,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('search routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let department: Awaited<ReturnType<typeof createTestDepartment>>
  let uniqueDeptName: string
  let uniqueStudentName: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token

    uniqueDeptName = `Astrophysics${Date.now()}`
    department = await createTestDepartment(tenant.id, { name: uniqueDeptName })

    uniqueStudentName = `Zenobia${Date.now()}`
    const createdStudent = await createTestStudent(tenant.id, department.id, {
      email: `${uniqueStudentName.toLowerCase()}@example.com`,
    })
    await requestContext.run({ tenantId: tenant.id, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () => {
      await prisma.student.update({ where: { id: createdStudent.id }, data: { firstName: uniqueStudentName } })
    })

    await createTestFaculty(tenant.id, department.id)
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test, bearer = token) {
    return req.set('Authorization', `Bearer ${bearer}`)
  }

  it('rejects a query below the 2-character minimum with a validation error', async () => {
    const res = await authed(request(app).get('/api/v1/search')).query({ q: 'a' })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/search').query({ q: 'test' })
    expect(res.status).toBe(401)
  })

  it('returns every category key, matching a seeded department by partial name', async () => {
    const res = await authed(request(app).get('/api/v1/search')).query({ q: uniqueDeptName.slice(0, 8) })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('students')
    expect(res.body).toHaveProperty('faculty')
    expect(res.body).toHaveProperty('departments')
    expect(res.body).toHaveProperty('programs')
    expect(res.body).toHaveProperty('batches')
    expect(res.body).toHaveProperty('sections')
    expect(res.body).toHaveProperty('subjects')

    expect(res.body.departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: department.id, type: 'department', label: uniqueDeptName, subtitle: department.code }),
      ]),
    )
  })

  it('matches a seeded student by partial name', async () => {
    const res = await authed(request(app).get('/api/v1/search')).query({ q: uniqueStudentName.slice(0, 8) })

    expect(res.status).toBe(200)
    expect(res.body.students).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'student', label: expect.stringContaining(uniqueStudentName) })]),
    )
  })

  it('hides categories a role lacks permission for while still returning ones it has', async () => {
    // EXAM_ADMIN grants STUDENT_READ but not FACULTY_READ (see
    // permissions.ts) — a real role split, not a contrived one.
    const examAdminUser = await createTestUser(tenant.id, 'EXAM_ADMIN', 'search-exam-admin')
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: examAdminUser.email, password: TEST_PASSWORD })
    const examAdminToken = loginRes.body.token as string

    const res = await authed(request(app).get('/api/v1/search'), examAdminToken).query({
      q: uniqueStudentName.slice(0, 8),
    })

    expect(res.status).toBe(200)
    expect(res.body.faculty).toEqual([])
    expect(res.body.students).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'student', label: expect.stringContaining(uniqueStudentName) })]),
    )
  })
})
