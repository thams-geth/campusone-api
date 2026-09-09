import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestStudentUser,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('announcements routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let departmentId: string
  let otherDepartmentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'COMMUNICATION')

    const department = await createTestDepartment(tenant.id)
    departmentId = department.id
    const otherDepartment = await createTestDepartment(tenant.id, { name: 'Other Dept' })
    otherDepartmentId = otherDepartment.id

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
    const res = await request(app).get('/api/v1/announcements')
    expect(res.status).toBe(401)
  })

  it('requires the matching scope id for a non-COLLEGE audience', async () => {
    const res = await asAdmin(request(app).post('/api/v1/announcements')).send({
      title: 'Missing scope',
      content: 'Body',
      audience: 'DEPARTMENT',
    })
    expect(res.status).toBe(422)
  })

  it("includes college-wide and the student's own department in their feed, excludes other departments", async () => {
    const college = await asAdmin(request(app).post('/api/v1/announcements')).send({
      title: 'Holiday',
      content: 'College closed Friday',
      audience: 'COLLEGE',
    })
    expect(college.status).toBe(201)

    const ownDept = await asAdmin(request(app).post('/api/v1/announcements')).send({
      title: 'Dept meeting',
      content: 'Room 101',
      audience: 'DEPARTMENT',
      departmentId,
    })
    expect(ownDept.status).toBe(201)

    const otherDept = await asAdmin(request(app).post('/api/v1/announcements')).send({
      title: 'Other dept notice',
      content: 'Not relevant',
      audience: 'DEPARTMENT',
      departmentId: otherDepartmentId,
    })
    expect(otherDept.status).toBe(201)

    const feed = await asStudent(request(app).get('/api/v1/announcements/feed'))
    expect(feed.status).toBe(200)
    const titles = feed.body.map((a: { title: string }) => a.title)
    expect(titles).toContain('Holiday')
    expect(titles).toContain('Dept meeting')
    expect(titles).not.toContain('Other dept notice')
  })

  it('excludes an expired announcement from the feed', async () => {
    const expired = await asAdmin(request(app).post('/api/v1/announcements')).send({
      title: 'Expired notice',
      content: 'Old',
      audience: 'COLLEGE',
      publishAt: '2020-01-01',
      expiryAt: '2020-02-01',
    })
    expect(expired.status).toBe(201)

    const feed = await asStudent(request(app).get('/api/v1/announcements/feed'))
    expect(feed.body.map((a: { title: string }) => a.title)).not.toContain('Expired notice')
  })
})
