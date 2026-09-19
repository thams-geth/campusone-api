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
  createTestTenant,
  createTestTimetableEntry,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  shortId,
  TEST_PASSWORD,
} from '../../test/helpers'

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

  describe('GET /faculty/:id/360', () => {
    let facultyId: string
    let facultyToken: string

    beforeAll(async () => {
      await enableModule(tenant.id, 'ACADEMICS')

      const program = await createTestProgram(tenant.id, departmentId)
      const academicYear = await createTestAcademicYear(tenant.id)
      const batch = await createTestBatch(tenant.id, program.id, academicYear.id)
      const section = await createTestSection(tenant.id, batch.id)
      const room = await createTestRoom(tenant.id)

      const faculty = await createTestFaculty(tenant.id, departmentId)
      facultyId = faculty.id
      facultyToken = (
        await request(app).post('/api/v1/auth/login').send({ email: faculty.user.email, password: TEST_PASSWORD })
      ).body.token

      const subject = await authed(request(app).post('/api/v1/subjects')).send({
        programId: program.id,
        semesterNumber: 1,
        code: shortId('S'),
        name: 'Test Subject',
        credits: 4,
        facultyId,
      })

      await createTestTimetableEntry(tenant.id, section.id, subject.body.id, facultyId, room.id)

      await authed(request(app).post('/api/v1/attendance/sessions')).send({
        sectionId: section.id,
        subjectId: subject.body.id,
        date: '2024-01-10',
        facultyId,
      })

      await authed(request(app).post('/api/v1/assignments')).send({
        subjectId: subject.body.id,
        sectionId: section.id,
        facultyId,
        title: 'Assignment 1',
        startDate: '2024-01-01',
        dueDate: '2024-01-20',
        maxMarks: 100,
      })

      const { user: studentUser } = await createTestStudentUser(tenant.id, departmentId, { sectionId: section.id })
      const leaveType = await authed(request(app).post('/api/v1/leave/types')).send({
        name: 'Casual Leave',
        defaultDaysPerYear: 12,
      })
      const studentToken = (
        await request(app).post('/api/v1/auth/login').send({ email: studentUser.email, password: TEST_PASSWORD })
      ).body.token
      const leaveRequest = await request(app)
        .post('/api/v1/leave/requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ leaveTypeId: leaveType.body.id, startDate: '2024-02-01', endDate: '2024-02-02', reason: 'Fever' })

      await request(app)
        .post(`/api/v1/leave/requests/${leaveRequest.body.id}/approve`)
        .set('Authorization', `Bearer ${facultyToken}`)
    })

    it('returns an aggregated 360 view with populated sections', async () => {
      const res = await authed(request(app).get(`/api/v1/faculty/${facultyId}/360`))

      expect(res.status).toBe(200)
      expect(res.body.faculty.id).toBe(facultyId)
      expect(res.body.faculty.departmentName).toBeTruthy()

      expect(res.body.teaching.subjectCount).toBe(1)
      expect(res.body.teaching.subjects).toHaveLength(1)

      expect(res.body.timetable.weeklyPeriods).toBe(1)
      expect(res.body.timetable.entries).toHaveLength(1)
      expect(res.body.timetable.entries[0]).toMatchObject({
        sectionName: expect.any(String),
        subjectName: 'Test Subject',
        roomName: expect.any(String),
      })

      expect(res.body.attendance.sessionsTaken).toBe(1)
      expect(res.body.attendance.recentSessions).toHaveLength(1)

      expect(res.body.assignments.count).toBe(1)
      expect(res.body.assignments.recent).toHaveLength(1)

      expect(res.body.leaveReviewed.count).toBe(1)
    })

    it('404s for an unknown faculty id', async () => {
      const res = await authed(request(app).get('/api/v1/faculty/does-not-exist/360'))
      expect(res.status).toBe(404)
    })

    it('returns zeroed sections for a faculty member with no relations', async () => {
      const bare = await createTestFaculty(tenant.id, departmentId)
      const res = await authed(request(app).get(`/api/v1/faculty/${bare.id}/360`))

      expect(res.status).toBe(200)
      expect(res.body.teaching).toEqual({ subjectCount: 0, subjects: [] })
      expect(res.body.timetable).toEqual({ weeklyPeriods: 0, entries: [] })
      expect(res.body.attendance).toEqual({ sessionsTaken: 0, recentSessions: [] })
      expect(res.body.assignments).toEqual({ count: 0, recent: [] })
      expect(res.body.leaveReviewed).toEqual({ count: 0 })
    })

    it('403s for a caller without FACULTY_READ', async () => {
      const { user } = await createTestStudentUser(tenant.id, departmentId)
      const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
      const res = await request(app)
        .get(`/api/v1/faculty/${facultyId}/360`)
        .set('Authorization', `Bearer ${loginRes.body.token}`)
      expect(res.status).toBe(403)
    })
  })
})
