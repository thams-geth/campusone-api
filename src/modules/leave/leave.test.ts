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

describe('leave routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let studentId: string
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

    const { student, user } = await createTestStudentUser(tenant.id, department.id, { sectionId: section.id })
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
    const res = await request(app).get('/api/v1/leave/requests')
    expect(res.status).toBe(401)
  })

  it('creates a leave type and blocks a duplicate name', async () => {
    const created = await asAdmin(request(app).post('/api/v1/leave/types')).send({ name: 'Sick Leave', defaultDaysPerYear: 12 })
    expect(created.status).toBe(201)

    const dup = await asAdmin(request(app).post('/api/v1/leave/types')).send({ name: 'sick leave', defaultDaysPerYear: 10 })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_LEAVE_TYPE')
  })

  it('lets a student self-service a leave request, then integrates with attendance on approval', async () => {
    const typeRes = await asAdmin(request(app).post('/api/v1/leave/types')).send({ name: 'Casual Leave', defaultDaysPerYear: 8 })
    const leaveTypeId = typeRes.body.id

    // A locked attendance session on a date inside the leave range.
    const session = await asAdmin(request(app).post('/api/v1/attendance/sessions')).send({
      sectionId,
      subjectId,
      facultyId,
      date: '2024-08-15',
    })
    const recordId = session.body.records.find((r: { studentId: string }) => r.studentId === studentId)?.id
    expect(recordId).toBeTruthy()
    await asAdmin(request(app).post(`/api/v1/attendance/sessions/${session.body.id}/submit`))
    await asAdmin(request(app).post(`/api/v1/attendance/sessions/${session.body.id}/lock`))

    const created = await asStudent(request(app).post('/api/v1/leave/requests')).send({
      leaveTypeId,
      startDate: '2024-08-14',
      endDate: '2024-08-16',
      reason: 'Family event',
    })
    expect(created.status).toBe(201)
    expect(created.body.studentId).toBe(studentId)
    expect(created.body.status).toBe('PENDING')

    const approved = await asAdmin(request(app).post(`/api/v1/leave/requests/${created.body.id}/approve`))
    expect(approved.status).toBe(200)
    expect(approved.body.status).toBe('APPROVED')

    const updatedSession = await asAdmin(request(app).get(`/api/v1/attendance/sessions/${session.body.id}`))
    expect(updatedSession.body.records.find((r: { id: string }) => r.id === recordId).status).toBe('ON_LEAVE')

    const balance = await asAdmin(request(app).get(`/api/v1/leave/balance/${studentId}`)).query({ year: 2024 })
    const casual = balance.body.find((b: { leaveTypeId: string }) => b.leaveTypeId === leaveTypeId)
    expect(casual).toMatchObject({ usedDays: 3, remainingDays: 5 })
  })

  it('rejects reviewing an already-reviewed request', async () => {
    const typeRes = await asAdmin(request(app).post('/api/v1/leave/types')).send({ name: 'Medical Leave', defaultDaysPerYear: 5 })
    const created = await asStudent(request(app).post('/api/v1/leave/requests')).send({
      leaveTypeId: typeRes.body.id,
      startDate: '2024-09-01',
      endDate: '2024-09-01',
      reason: 'Doctor visit',
    })

    await asAdmin(request(app).post(`/api/v1/leave/requests/${created.body.id}/reject`))
    const res = await asAdmin(request(app).post(`/api/v1/leave/requests/${created.body.id}/approve`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ALREADY_REVIEWED')
  })
})
