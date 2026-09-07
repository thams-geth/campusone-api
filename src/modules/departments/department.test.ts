import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import { createTestTenant, createTestUser, rawTestPrisma, setUpAuthenticatedTenant, TEST_PASSWORD } from '../../test/helpers'

const app = createApp()

// Department codes are capped at 12 chars — a raw Date.now() blows past
// that, so build short-but-unique codes from a base36 timestamp instead.
function shortCode(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`
}

describe('departments routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/departments')
    expect(res.status).toBe(401)
  })

  it('rejects a role outside the admin allow-list', async () => {
    const facultyUser = await createTestUser(tenant.id, 'FACULTY', 'faculty')
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: facultyUser.email, password: TEST_PASSWORD })

    const res = await request(app).get('/api/departments').set('Authorization', `Bearer ${loginRes.body.token}`)
    expect(res.status).toBe(403)
  })

  it('creates a department and uppercases the code', async () => {
    const lowercaseCode = shortCode('cse-')
    const res = await authed(request(app).post('/api/departments')).send({
      name: 'Computer Science',
      code: lowercaseCode,
      status: 'ACTIVE',
    })

    expect(res.status).toBe(201)
    expect(res.body.code).toBe(lowercaseCode.toUpperCase())
    expect(res.body.studentCount).toBe(0)
  })

  it('rejects a duplicate department code', async () => {
    const code = shortCode('DUP')
    await authed(request(app).post('/api/departments')).send({ name: 'First', code, status: 'ACTIVE' })

    const res = await authed(request(app).post('/api/departments')).send({ name: 'Second', code, status: 'ACTIVE' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_CODE')
  })

  it('lists and filters departments by search', async () => {
    const unique = `Zeta${Date.now()}`
    await authed(request(app).post('/api/departments')).send({
      name: unique,
      code: shortCode('Z'),
      status: 'ACTIVE',
    })

    const res = await authed(request(app).get('/api/departments')).query({ search: unique })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].name).toBe(unique)
  })

  it('updates a department', async () => {
    const created = await authed(request(app).post('/api/departments')).send({
      name: 'Original',
      code: shortCode('UPD'),
      status: 'ACTIVE',
    })

    const res = await authed(request(app).put(`/api/departments/${created.body.id}`)).send({
      name: 'Renamed',
      code: created.body.code,
      status: 'INACTIVE',
    })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Renamed')
    expect(res.body.status).toBe('INACTIVE')
  })

  it('404s for a department in another tenant', async () => {
    const otherTenant = await createTestTenant('Other')
    const otherDept = await requestContext.run(
      { tenantId: otherTenant.id, userId: 'bootstrap', role: 'SUPER_ADMIN' },
      async () =>
        await prisma.department.create({
          data: { tenantId: otherTenant.id, name: 'Other Dept', code: shortCode('OTH'), status: 'ACTIVE' },
        }),
    )

    const res = await authed(request(app).get(`/api/departments/${otherDept.id}`))
    expect(res.status).toBe(404)

    await rawTestPrisma.tenant.delete({ where: { id: otherTenant.id } })
  })

  it('refuses to delete a department that still has students', async () => {
    const dept = await authed(request(app).post('/api/departments')).send({
      name: 'HasStudents',
      code: shortCode('HS'),
      status: 'ACTIVE',
    })

    await requestContext.run({ tenantId: tenant.id, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () =>
      await prisma.student.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Test',
          lastName: 'Student',
          email: `student.${Date.now()}@example.com`,
          phone: '+91 9000000000',
          rollNumber: `R-${Date.now()}`,
          departmentId: dept.body.id,
          gender: 'OTHER',
          dateOfBirth: new Date('2003-01-01'),
          admissionDate: new Date('2023-06-01'),
          status: 'ACTIVE',
        },
      }),
    )

    const res = await authed(request(app).delete(`/api/departments/${dept.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DEPARTMENT_IN_USE')
  })

  it('deletes a department with no students', async () => {
    const dept = await authed(request(app).post('/api/departments')).send({
      name: 'NoStudents',
      code: shortCode('NS'),
      status: 'ACTIVE',
    })

    const res = await authed(request(app).delete(`/api/departments/${dept.body.id}`))
    expect(res.status).toBe(204)

    const getRes = await authed(request(app).get(`/api/departments/${dept.body.id}`))
    expect(getRes.status).toBe(404)
  })
})
