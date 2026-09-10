import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestBatch,
  createTestDepartment,
  createTestFaculty,
  createTestProgram,
  createTestRoom,
  createTestSection,
  createTestStudentUser,
  createTestSubject,
  createTestTenant,
  createTestTimetableEntry,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('class group routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let memberStudentToken: string
  let outsiderStudentToken: string
  let facultyToken: string
  let sectionId: string
  let otherSectionId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token

    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    const academicYear = await createTestAcademicYear(tenant.id)
    const batch = await createTestBatch(tenant.id, program.id, academicYear.id)
    const section = await createTestSection(tenant.id, batch.id, { name: 'A' })
    sectionId = section.id
    const otherSection = await createTestSection(tenant.id, batch.id, { name: 'B' })
    otherSectionId = otherSection.id

    const { user: memberStudent } = await createTestStudentUser(tenant.id, department.id, { sectionId })
    memberStudentToken = (
      await request(app).post('/api/v1/auth/login').send({ email: memberStudent.email, password: TEST_PASSWORD })
    ).body.token

    const { user: outsiderStudent } = await createTestStudentUser(tenant.id, department.id, { sectionId: otherSectionId })
    outsiderStudentToken = (
      await request(app).post('/api/v1/auth/login').send({ email: outsiderStudent.email, password: TEST_PASSWORD })
    ).body.token

    const faculty = await createTestFaculty(tenant.id, department.id)
    const subject = await createTestSubject(tenant.id, program.id)
    const room = await createTestRoom(tenant.id)
    await createTestTimetableEntry(tenant.id, sectionId, subject.id, faculty.id, room.id)
    facultyToken = (
      await request(app).post('/api/v1/auth/login').send({ email: faculty.user.email, password: TEST_PASSWORD })
    ).body.token
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(token: string, req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get(`/api/v1/class-groups/${sectionId}/messages`)
    expect(res.status).toBe(401)
  })

  it('404s an unknown section', async () => {
    const res = await authed(adminToken, request(app).get('/api/v1/class-groups/does-not-exist/messages'))
    expect(res.status).toBe(404)
  })

  it('lets a member student post and read messages in their own section', async () => {
    const postRes = await authed(memberStudentToken, request(app).post(`/api/v1/class-groups/${sectionId}/messages`)).send({
      body: 'Hey everyone!',
    })
    expect(postRes.status).toBe(201)
    expect(postRes.body.body).toBe('Hey everyone!')
    expect(postRes.body.author.id).toBeTruthy()

    const listRes = await authed(memberStudentToken, request(app).get(`/api/v1/class-groups/${sectionId}/messages`))
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.some((m: { body: string }) => m.body === 'Hey everyone!')).toBe(true)
  })

  it('lets a faculty member who teaches the section post and read too', async () => {
    const postRes = await authed(facultyToken, request(app).post(`/api/v1/class-groups/${sectionId}/messages`)).send({
      body: 'Reminder: submit your assignment by Friday.',
    })
    expect(postRes.status).toBe(201)
  })

  it('blocks a student who is not a member of the section', async () => {
    const postRes = await authed(outsiderStudentToken, request(app).post(`/api/v1/class-groups/${sectionId}/messages`)).send({
      body: 'I should not be able to post here.',
    })
    expect(postRes.status).toBe(403)

    const listRes = await authed(outsiderStudentToken, request(app).get(`/api/v1/class-groups/${sectionId}/messages`))
    expect(listRes.status).toBe(403)
  })

  it('lets an admin-tier caller (CLASS_GROUP_MANAGE) post/read any section regardless of membership', async () => {
    const postRes = await authed(adminToken, request(app).post(`/api/v1/class-groups/${otherSectionId}/messages`)).send({
      body: 'Admin broadcast.',
    })
    expect(postRes.status).toBe(201)

    const listRes = await authed(adminToken, request(app).get(`/api/v1/class-groups/${otherSectionId}/messages`))
    expect(listRes.status).toBe(200)
  })
})
