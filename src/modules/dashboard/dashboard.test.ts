import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('dashboard routes', () => {
  let tenant: Awaited<ReturnType<typeof setUpAuthenticatedTenant>>['tenant']
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
    const res = await request(app).get('/api/v1/dashboard/summary')
    expect(res.status).toBe(401)
  })

  it('reflects real counts in the summary after creating data', async () => {
    const dept = await createTestDepartment(tenant.id, { name: 'Summary Dept' })
    await authed(request(app).post('/api/v1/students')).send({
      firstName: 'Summary',
      lastName: 'Student',
      email: `${shortId('sum')}@example.com`,
      phone: '+91 9000000000',
      rollNumber: shortId('SR'),
      departmentId: dept.id,
      gender: 'OTHER',
      dateOfBirth: '2003-01-01',
      admissionDate: '2023-06-01',
      status: 'ACTIVE',
    })

    const res = await authed(request(app).get('/api/v1/dashboard/summary'))
    expect(res.status).toBe(200)
    expect(res.body.totalStudents).toBeGreaterThan(0)
    expect(res.body.activeStudents).toBeGreaterThan(0)
    expect(res.body.totalDepartments).toBeGreaterThan(0)
    expect(res.body.pendingAdmissions).toEqual(expect.any(Number))
  })

  it('groups the enrollment trend by admission month', async () => {
    const res = await authed(request(app).get('/api/v1/dashboard/trend'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    if (res.body.length > 0) {
      expect(res.body[0]).toEqual({ month: expect.any(String), count: expect.any(Number) })
    }
  })

  it('lists active departments with their student counts', async () => {
    const dept = await createTestDepartment(tenant.id, { name: 'Distribution Dept' })
    const res = await authed(request(app).get('/api/v1/dashboard/distribution'))

    expect(res.status).toBe(200)
    const entry = res.body.find((d: { departmentId: string }) => d.departmentId === dept.id)
    expect(entry).toMatchObject({ name: 'Distribution Dept', studentCount: 0 })
  })

  it('excludes inactive departments from the distribution', async () => {
    const dept = await createTestDepartment(tenant.id, { name: 'Inactive Dept', status: 'INACTIVE' })
    const res = await authed(request(app).get('/api/v1/dashboard/distribution'))

    expect(res.body.find((d: { departmentId: string }) => d.departmentId === dept.id)).toBeUndefined()
  })

  it('records recent activity from department and student mutations', async () => {
    const created = await authed(request(app).post('/api/v1/departments')).send({
      name: 'Activity Dept',
      code: shortId('A'),
      status: 'ACTIVE',
    })

    const res = await authed(request(app).get('/api/v1/dashboard/activity'))
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({
      message: `added the ${created.body.name} department`,
    })
    expect(res.body[0].actor).toEqual(expect.any(String))
    expect(res.body[0].timestamp).toEqual(expect.any(String))
  })
})
