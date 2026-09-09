import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestBatch,
  createTestDepartment,
  createTestFaculty,
  createTestProgram,
  createTestSection,
  createTestStudentUser,
  createTestSubject,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('assignments routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let sectionId: string
  let subjectId: string
  let facultyId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'ACADEMICS')

    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    const academicYear = await createTestAcademicYear(tenant.id)
    const batch = await createTestBatch(tenant.id, program.id, academicYear.id)
    const section = await createTestSection(tenant.id, batch.id)
    sectionId = section.id
    const subject = await createTestSubject(tenant.id, program.id)
    subjectId = subject.id
    const faculty = await createTestFaculty(tenant.id, department.id)
    facultyId = faculty.id

    const { user } = await createTestStudentUser(tenant.id, department.id, { sectionId: section.id })
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
    const res = await request(app).get('/api/v1/assignments')
    expect(res.status).toBe(401)
  })

  it('runs the full draft -> publish -> submit -> evaluate lifecycle', async () => {
    const created = await asAdmin(request(app).post('/api/v1/assignments')).send({
      subjectId,
      sectionId,
      facultyId,
      title: 'Lab Report 1',
      startDate: '2024-08-01',
      dueDate: '2099-08-10',
      maxMarks: 20,
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('DRAFT')

    const blockedSubmit = await asStudent(request(app).post(`/api/v1/assignments/${created.body.id}/submissions`)).send({})
    expect(blockedSubmit.status).toBe(409)
    expect(blockedSubmit.body.code).toBe('ASSIGNMENT_NOT_PUBLISHED')

    const published = await asAdmin(request(app).post(`/api/v1/assignments/${created.body.id}/publish`))
    expect(published.status).toBe(200)
    expect(published.body.status).toBe('PUBLISHED')

    const submitted = await asStudent(request(app).post(`/api/v1/assignments/${created.body.id}/submissions`)).send({
      attachmentUrl: 'https://example.com/report.pdf',
    })
    expect(submitted.status).toBe(201)
    expect(submitted.body.status).toBe('SUBMITTED')

    const dup = await asStudent(request(app).post(`/api/v1/assignments/${created.body.id}/submissions`)).send({})
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('ALREADY_SUBMITTED')

    const overMax = await asAdmin(
      request(app).put(`/api/v1/assignments/submissions/${submitted.body.id}/evaluate`),
    ).send({ marksObtained: 25 })
    expect(overMax.status).toBe(400)

    const evaluated = await asAdmin(
      request(app).put(`/api/v1/assignments/submissions/${submitted.body.id}/evaluate`),
    ).send({ marksObtained: 18, feedback: 'Well done' })
    expect(evaluated.status).toBe(200)
    expect(evaluated.body.status).toBe('EVALUATED')
    expect(evaluated.body.marksObtained).toBe(18)

    const closed = await asAdmin(request(app).post(`/api/v1/assignments/${created.body.id}/close`))
    expect(closed.status).toBe(200)
    expect(closed.body.status).toBe('CLOSED')

    const blockedEdit = await asAdmin(request(app).put(`/api/v1/assignments/${created.body.id}`)).send({
      subjectId,
      sectionId,
      title: 'Renamed',
      startDate: '2024-08-01',
      dueDate: '2024-08-10',
      maxMarks: 20,
    })
    expect(blockedEdit.status).toBe(409)
    expect(blockedEdit.body.code).toBe('ASSIGNMENT_CLOSED')

    const blockedDelete = await asAdmin(request(app).delete(`/api/v1/assignments/${created.body.id}`))
    expect(blockedDelete.status).toBe(409)
    expect(blockedDelete.body.code).toBe('ASSIGNMENT_IN_USE')
  })
})
