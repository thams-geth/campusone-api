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
  createTestStudent,
  createTestSubject,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
} from '../../test/helpers'

const app = createApp()

describe('attendance routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let sectionId: string
  let subjectId: string
  let facultyId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
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

    // One active student in the section so session creation pre-populates a record.
    await createTestStudent(tenant.id, department.id, { sectionId: section.id })
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/attendance/sessions')
    expect(res.status).toBe(401)
  })

  it('creates a session pre-populated with PRESENT records, then runs the full lock/correction workflow', async () => {
    const created = await authed(request(app).post('/api/v1/attendance/sessions')).send({
      sectionId,
      subjectId,
      facultyId,
      date: '2024-08-01',
    })
    expect(created.status).toBe(201)
    expect(created.body.records).toHaveLength(1)
    expect(created.body.records[0].status).toBe('PRESENT')
    const sessionId = created.body.id
    const studentId = created.body.records[0].studentId

    const marked = await authed(request(app).put(`/api/v1/attendance/sessions/${sessionId}/records`)).send({
      records: [{ studentId, status: 'ABSENT' }],
    })
    expect(marked.status).toBe(200)
    expect(marked.body.records[0].status).toBe('ABSENT')

    const submitted = await authed(request(app).post(`/api/v1/attendance/sessions/${sessionId}/submit`))
    expect(submitted.status).toBe(200)
    expect(submitted.body.status).toBe('SUBMITTED')

    const locked = await authed(request(app).post(`/api/v1/attendance/sessions/${sessionId}/lock`))
    expect(locked.status).toBe(200)
    expect(locked.body.status).toBe('LOCKED')

    // Direct edits are blocked once locked.
    const blockedEdit = await authed(request(app).put(`/api/v1/attendance/sessions/${sessionId}/records`)).send({
      records: [{ studentId, status: 'PRESENT' }],
    })
    expect(blockedEdit.status).toBe(409)
    expect(blockedEdit.body.code).toBe('SESSION_LOCKED')

    const recordId = created.body.records[0].id
    const correction = await authed(request(app).post(`/api/v1/attendance/records/${recordId}/correction`)).send({
      requestedStatus: 'PRESENT',
      reason: 'Student was actually present, marked in error.',
    })
    expect(correction.status).toBe(201)
    expect(correction.body.status).toBe('PENDING')

    const approved = await authed(request(app).post(`/api/v1/attendance/corrections/${correction.body.id}/approve`))
    expect(approved.status).toBe(200)
    expect(approved.body.status).toBe('APPROVED')

    const finalSession = await authed(request(app).get(`/api/v1/attendance/sessions/${sessionId}`))
    expect(finalSession.body.records.find((r: { id: string }) => r.id === recordId).status).toBe('PRESENT')

    const auditRes = await authed(
      request(app).get('/api/v1/audit-logs').query({ entity: 'AttendanceRecord', entityId: recordId }),
    )
    expect(auditRes.body.data[0]).toMatchObject({
      action: 'CORRECTION_APPROVED',
      before: { status: 'ABSENT' },
      after: { status: 'PRESENT' },
    })
  })

  it('blocks a duplicate session for the same section/subject/date', async () => {
    await authed(request(app).post('/api/v1/attendance/sessions')).send({ sectionId, subjectId, facultyId, date: '2024-09-01' })
    const dup = await authed(request(app).post('/api/v1/attendance/sessions')).send({ sectionId, subjectId, facultyId, date: '2024-09-01' })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_SESSION')
  })

  it('rejects locking a session that has not been submitted', async () => {
    const created = await authed(request(app).post('/api/v1/attendance/sessions')).send({
      sectionId,
      subjectId,
      facultyId,
      date: '2024-10-01',
    })
    const res = await authed(request(app).post(`/api/v1/attendance/sessions/${created.body.id}/lock`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_SESSION_STATUS')
  })
})
