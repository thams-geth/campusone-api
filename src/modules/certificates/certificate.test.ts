import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestStudentUser,
  createTestTenant,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('certificates routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token

    const department = await createTestDepartment(tenant.id)
    const { user } = await createTestStudentUser(tenant.id, department.id)
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    studentToken = loginRes.body.token
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function asAdmin(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`)
  }
  function asStudent(req: request.Test) {
    return req.set('Authorization', `Bearer ${studentToken}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/certificates/types')
    expect(res.status).toBe(401)
  })

  it('runs the full self-service request -> issue -> verify flow', async () => {
    const type = await asAdmin(request(app).post('/api/v1/certificates/types')).send({ name: 'Bonafide Certificate' })
    expect(type.status).toBe(201)

    const created = await asStudent(request(app).post('/api/v1/certificates/requests')).send({ certificateTypeId: type.body.id })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('REQUESTED')

    const issued = await asAdmin(request(app).post(`/api/v1/certificates/requests/${created.body.id}/issue`))
    expect(issued.status).toBe(200)
    expect(issued.body.status).toBe('ISSUED')
    expect(issued.body.verificationCode).toBeTruthy()

    const verified = await asAdmin(request(app).get(`/api/v1/certificates/verify/${issued.body.verificationCode}`))
    expect(verified.status).toBe(200)
    expect(verified.body).toMatchObject({ valid: true, certificateType: 'Bonafide Certificate' })

    const bogus = await asAdmin(request(app).get('/api/v1/certificates/verify/not-a-real-code'))
    expect(bogus.body).toEqual({ valid: false })

    const doubleIssue = await asAdmin(request(app).post(`/api/v1/certificates/requests/${created.body.id}/issue`))
    expect(doubleIssue.status).toBe(409)
    expect(doubleIssue.body.code).toBe('ALREADY_REVIEWED')
  })

  it('blocks deleting a certificate type with requests against it', async () => {
    const type = await asAdmin(request(app).post('/api/v1/certificates/types')).send({ name: 'Transfer Certificate' })
    await asStudent(request(app).post('/api/v1/certificates/requests')).send({ certificateTypeId: type.body.id })

    const res = await asAdmin(request(app).delete(`/api/v1/certificates/types/${type.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CERTIFICATE_TYPE_IN_USE')
  })
})
