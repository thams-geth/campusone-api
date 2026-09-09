import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('faculty routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let departmentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    const department = await createTestDepartment(tenant.id)
    departmentId = department.id
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/faculty')
    expect(res.status).toBe(401)
  })

  it('creates a faculty member with a login-capable account, and logs in as them', async () => {
    const email = `${shortId('fac')}@example.com`
    const created = await authed(request(app).post('/api/v1/faculty')).send({
      name: 'Dr. Ada Lovelace',
      email,
      password: 'Passw0rd!',
      employeeCode: shortId('EMP'),
      departmentId,
      designation: 'Professor',
      experienceYears: 10,
      joiningDate: '2015-06-01',
    })
    expect(created.status).toBe(201)
    expect(created.body.name).toBe('Dr. Ada Lovelace')
    expect(created.body).not.toHaveProperty('passwordHash')

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd!' })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.user.role).toBe('FACULTY')
  })

  it('blocks a duplicate email and a duplicate employee code', async () => {
    const email = `${shortId('dup')}@example.com`
    const employeeCode = shortId('EMP')
    await authed(request(app).post('/api/v1/faculty')).send({
      name: 'First Faculty',
      email,
      password: 'Passw0rd!',
      employeeCode,
      departmentId,
      designation: 'Lecturer',
      joiningDate: '2020-01-01',
    })

    const dupEmail = await authed(request(app).post('/api/v1/faculty')).send({
      name: 'Second Faculty',
      email,
      password: 'Passw0rd!',
      employeeCode: shortId('EMP'),
      departmentId,
      designation: 'Lecturer',
      joiningDate: '2020-01-01',
    })
    expect(dupEmail.status).toBe(409)
    expect(dupEmail.body.code).toBe('DUPLICATE_EMAIL')

    const dupCode = await authed(request(app).post('/api/v1/faculty')).send({
      name: 'Third Faculty',
      email: `${shortId('other')}@example.com`,
      password: 'Passw0rd!',
      employeeCode,
      departmentId,
      designation: 'Lecturer',
      joiningDate: '2020-01-01',
    })
    expect(dupCode.status).toBe(409)
    expect(dupCode.body.code).toBe('DUPLICATE_EMPLOYEE_CODE')
  })

  it('deactivates the linked account when a faculty member is removed', async () => {
    const email = `${shortId('rm')}@example.com`
    const created = await authed(request(app).post('/api/v1/faculty')).send({
      name: 'To Remove',
      email,
      password: 'Passw0rd!',
      employeeCode: shortId('EMP'),
      departmentId,
      designation: 'Lecturer',
      joiningDate: '2020-01-01',
    })

    const res = await authed(request(app).delete(`/api/v1/faculty/${created.body.id}`))
    expect(res.status).toBe(204)

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd!' })
    expect(loginRes.status).toBe(401)
  })
})
