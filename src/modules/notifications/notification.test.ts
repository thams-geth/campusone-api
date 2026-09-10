import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestBatch,
  createTestDepartment,
  createTestProgram,
  createTestSection,
  createTestStudentUser,
  createTestTenant,
  rawTestPrisma,
  setUpAuthenticatedTenant,
} from '../../test/helpers'

const app = createApp()

describe('notification routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let sectionId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token

    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    const academicYear = await createTestAcademicYear(tenant.id)
    const batch = await createTestBatch(tenant.id, program.id, academicYear.id)
    const section = await createTestSection(tenant.id, batch.id)
    sectionId = section.id

    const { user } = await createTestStudentUser(tenant.id, department.id, { sectionId })
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Passw0rd!' })
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
    const res = await request(app).get('/api/v1/notifications')
    expect(res.status).toBe(401)
  })

  it('delivers a class-group message as an in-app notification, then supports read/unread tracking', async () => {
    const before = await asStudent(request(app).get('/api/v1/notifications/unread-count'))
    expect(before.status).toBe(200)
    const startingCount = before.body.count as number

    const postRes = await asAdmin(request(app).post(`/api/v1/class-groups/${sectionId}/messages`)).send({
      body: 'Welcome to the section group chat.',
    })
    expect(postRes.status).toBe(201)

    const afterCount = await asStudent(request(app).get('/api/v1/notifications/unread-count'))
    expect(afterCount.body.count).toBe(startingCount + 1)

    const listRes = await asStudent(request(app).get('/api/v1/notifications'))
    expect(listRes.status).toBe(200)
    const notification = listRes.body.data.find((n: { type: string }) => n.type === 'CLASS_GROUP_MESSAGE')
    expect(notification).toBeTruthy()
    expect(notification.readAt).toBeNull()

    const readRes = await asStudent(request(app).post(`/api/v1/notifications/${notification.id}/read`))
    expect(readRes.status).toBe(204)

    const afterReadCount = await asStudent(request(app).get('/api/v1/notifications/unread-count'))
    expect(afterReadCount.body.count).toBe(startingCount)
  })

  it('mark-all-read clears every unread notification', async () => {
    await asAdmin(request(app).post(`/api/v1/class-groups/${sectionId}/messages`)).send({ body: 'Reminder: exam tomorrow.' })
    await asAdmin(request(app).post(`/api/v1/class-groups/${sectionId}/messages`)).send({ body: 'Bring your calculator.' })

    const before = await asStudent(request(app).get('/api/v1/notifications/unread-count'))
    expect(before.body.count).toBeGreaterThanOrEqual(2)

    const res = await asStudent(request(app).post('/api/v1/notifications/read-all'))
    expect(res.status).toBe(204)

    const after = await asStudent(request(app).get('/api/v1/notifications/unread-count'))
    expect(after.body.count).toBe(0)
  })

  it('manages notification channel preferences', async () => {
    const listRes = await asStudent(request(app).get('/api/v1/notifications/preferences'))
    expect(listRes.status).toBe(200)
    expect(listRes.body).toEqual(
      expect.arrayContaining([
        { channel: 'EMAIL', enabled: true },
        { channel: 'SMS', enabled: true },
        { channel: 'PUSH', enabled: true },
      ]),
    )

    const disableRes = await asStudent(request(app).put('/api/v1/notifications/preferences/EMAIL')).send({ enabled: false })
    expect(disableRes.status).toBe(200)
    expect(disableRes.body).toEqual({ channel: 'EMAIL', enabled: false })

    const afterRes = await asStudent(request(app).get('/api/v1/notifications/preferences'))
    expect(afterRes.body).toEqual(
      expect.arrayContaining([
        { channel: 'EMAIL', enabled: false },
        { channel: 'SMS', enabled: true },
      ]),
    )

    const rejectInApp = await asStudent(request(app).put('/api/v1/notifications/preferences/IN_APP')).send({ enabled: false })
    expect(rejectInApp.status).toBe(400)
  })
})
