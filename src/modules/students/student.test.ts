import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  shortId,
} from '../../test/helpers'

const app = createApp()

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Test',
    lastName: 'Student',
    email: `${shortId('student')}@example.com`,
    phone: '+91 9000000000',
    rollNumber: shortId('R'),
    gender: 'OTHER',
    dateOfBirth: '2003-01-01',
    admissionDate: '2023-06-01',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('students routes', () => {
  let tenant: Awaited<ReturnType<typeof setUpAuthenticatedTenant>>['tenant']
  let token: string
  let department: Awaited<ReturnType<typeof createTestDepartment>>
  let inactiveDepartment: Awaited<ReturnType<typeof createTestDepartment>>

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    department = await createTestDepartment(tenant.id, { name: 'Computer Science' })
    inactiveDepartment = await createTestDepartment(tenant.id, { name: 'Physics', status: 'INACTIVE' })
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/students')
    expect(res.status).toBe(401)
  })

  it('creates a student', async () => {
    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id }),
    )

    expect(res.status).toBe(201)
    expect(res.body.departmentId).toBe(department.id)
    expect(res.body.status).toBe('ACTIVE')
  })

  it('rejects a department that does not exist', async () => {
    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: 'not-a-real-id' }),
    )
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_DEPARTMENT')
  })

  it('rejects an inactive department', async () => {
    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: inactiveDepartment.id }),
    )
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('DEPARTMENT_INACTIVE')
  })

  it('rejects a duplicate email', async () => {
    const email = `${shortId('dup')}@example.com`
    await authed(request(app).post('/api/v1/students')).send(baseInput({ departmentId: department.id, email }))

    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id, email }),
    )
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_EMAIL')
  })

  it('rejects a duplicate roll number', async () => {
    const rollNumber = shortId('DR')
    await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id, rollNumber }),
    )

    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id, rollNumber }),
    )
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_ROLL_NUMBER')
  })

  it('lists and filters students by department', async () => {
    const res = await authed(request(app).get('/api/v1/students')).query({ departmentId: department.id })
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data.every((s: { departmentId: string }) => s.departmentId === department.id)).toBe(true)
  })

  it('updates a student', async () => {
    const created = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id }),
    )

    const res = await authed(request(app).put(`/api/v1/students/${created.body.id}`)).send(
      baseInput({
        departmentId: department.id,
        firstName: 'Updated',
        email: created.body.email,
        rollNumber: created.body.rollNumber,
      }),
    )

    expect(res.status).toBe(200)
    expect(res.body.firstName).toBe('Updated')
  })

  it('deletes a student', async () => {
    const created = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id }),
    )

    const res = await authed(request(app).delete(`/api/v1/students/${created.body.id}`))
    expect(res.status).toBe(204)

    const getRes = await authed(request(app).get(`/api/v1/students/${created.body.id}`))
    expect(getRes.status).toBe(404)
  })
})
