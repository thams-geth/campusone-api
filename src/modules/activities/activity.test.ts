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

describe('activities routes', () => {
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
    const res = await request(app).get('/api/v1/activities/mine')
    expect(res.status).toBe(401)
  })

  it('lets a student self-report an activity, visible in their own list but not editable by them', async () => {
    const created = await asStudent(request(app).post('/api/v1/activities')).send({
      type: 'ACHIEVEMENT',
      title: 'Won hackathon',
      date: '2024-05-01',
    })
    expect(created.status).toBe(201)
    expect(created.body.studentId).toBe(studentId)

    const mine = await asStudent(request(app).get('/api/v1/activities/mine'))
    expect(mine.status).toBe(200)
    expect(mine.body).toHaveLength(1)

    const forbiddenEdit = await asStudent(request(app).put(`/api/v1/activities/${created.body.id}`)).send({
      type: 'ACHIEVEMENT',
      title: 'Edited title',
      date: '2024-05-01',
    })
    expect(forbiddenEdit.status).toBe(403)

    const forbiddenRoster = await asStudent(request(app).get('/api/v1/activities'))
    expect(forbiddenRoster.status).toBe(403)
  })

  it('lets staff record and manage an activity on behalf of a student', async () => {
    const created = await asAdmin(request(app).post('/api/v1/activities')).send({
      studentId,
      type: 'SPORTS',
      title: 'Inter-college cricket',
      date: '2024-06-01',
    })
    expect(created.status).toBe(201)

    const updated = await asAdmin(request(app).put(`/api/v1/activities/${created.body.id}`)).send({
      studentId,
      type: 'SPORTS',
      title: 'Inter-college cricket tournament',
      date: '2024-06-01',
    })
    expect(updated.status).toBe(200)
    expect(updated.body.title).toBe('Inter-college cricket tournament')

    const removed = await asAdmin(request(app).delete(`/api/v1/activities/${created.body.id}`))
    expect(removed.status).toBe(204)
  })
})
