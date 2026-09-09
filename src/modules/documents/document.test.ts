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

describe('documents routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let studentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token

    const department = await createTestDepartment(tenant.id)
    const { student, user } = await createTestStudentUser(tenant.id, department.id)
    studentId = student.id
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
    const res = await request(app).get('/api/v1/documents/mine')
    expect(res.status).toBe(401)
  })

  it('blocks a student from seeing the full roster', async () => {
    const res = await asStudent(request(app).get('/api/v1/documents'))
    expect(res.status).toBe(403)
  })

  it('creates, verifies, and lets the owner see it in their own list', async () => {
    const created = await asAdmin(request(app).post('/api/v1/documents')).send({
      ownerType: 'STUDENT',
      ownerId: studentId,
      type: 'BONAFIDE',
      fileUrl: 'https://example.com/bonafide.pdf',
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('PENDING')

    const mine = await asStudent(request(app).get('/api/v1/documents/mine'))
    expect(mine.status).toBe(200)
    expect(mine.body).toHaveLength(1)

    const verified = await asAdmin(request(app).post(`/api/v1/documents/${created.body.id}/verify`))
    expect(verified.status).toBe(200)
    expect(verified.body.status).toBe('VERIFIED')

    const reReview = await asAdmin(request(app).post(`/api/v1/documents/${created.body.id}/reject`))
    expect(reReview.status).toBe(409)
    expect(reReview.body.code).toBe('ALREADY_REVIEWED')
  })

  it('resets status to PENDING and bumps version on update', async () => {
    const created = await asAdmin(request(app).post('/api/v1/documents')).send({
      ownerType: 'STUDENT',
      ownerId: studentId,
      type: 'MARK_SHEET',
      fileUrl: 'https://example.com/marksheet-v1.pdf',
    })
    await asAdmin(request(app).post(`/api/v1/documents/${created.body.id}/verify`))

    const updated = await asAdmin(request(app).put(`/api/v1/documents/${created.body.id}`)).send({
      ownerType: 'STUDENT',
      ownerId: studentId,
      type: 'MARK_SHEET',
      fileUrl: 'https://example.com/marksheet-v2.pdf',
    })
    expect(updated.status).toBe(200)
    expect(updated.body.status).toBe('PENDING')
    expect(updated.body.version).toBe(2)
  })
})
