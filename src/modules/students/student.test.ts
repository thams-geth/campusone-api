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
  createTestStudentUser,
  createTestSubject,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  shortId,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Test',
    lastName: 'Student',
    email: `${shortId('student')}@example.com`,
    phone: '+91 9000000000',
    rollNumber: shortId('R'),
    gender: 'OTHER',
    dateOfBirth: '2003-01-01',
    admissionDate: '2023-06-01',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('students routes', () => {
  let tenant: Awaited<ReturnType<typeof setUpAuthenticatedTenant>>['tenant']
  let token: string
  let department: Awaited<ReturnType<typeof createTestDepartment>>
  let inactiveDepartment: Awaited<ReturnType<typeof createTestDepartment>>

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    department = await createTestDepartment(tenant.id, { name: 'Computer Science' })
    inactiveDepartment = await createTestDepartment(tenant.id, { name: 'Physics', status: 'INACTIVE' })
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/students')
    expect(res.status).toBe(401)
  })

  it('creates a student', async () => {
    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id }),
    )

    expect(res.status).toBe(201)
    expect(res.body.departmentId).toBe(department.id)
    expect(res.body.status).toBe('ACTIVE')
  })

  it('rejects a department that does not exist', async () => {
    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: 'not-a-real-id' }),
    )
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_DEPARTMENT')
  })

  it('rejects an inactive department', async () => {
    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: inactiveDepartment.id }),
    )
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('DEPARTMENT_INACTIVE')
  })

  it('rejects a duplicate email', async () => {
    const email = `${shortId('dup')}@example.com`
    await authed(request(app).post('/api/v1/students')).send(baseInput({ departmentId: department.id, email }))

    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id, email }),
    )
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_EMAIL')
  })

  it('rejects a duplicate roll number', async () => {
    const rollNumber = shortId('DR')
    await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id, rollNumber }),
    )

    const res = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id, rollNumber }),
    )
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_ROLL_NUMBER')
  })

  it('lists and filters students by department', async () => {
    const res = await authed(request(app).get('/api/v1/students')).query({ departmentId: department.id })
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data.every((s: { departmentId: string }) => s.departmentId === department.id)).toBe(true)
  })

  it('updates a student', async () => {
    const created = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id }),
    )

    const res = await authed(request(app).put(`/api/v1/students/${created.body.id}`)).send(
      baseInput({
        departmentId: department.id,
        firstName: 'Updated',
        email: created.body.email,
        rollNumber: created.body.rollNumber,
      }),
    )

    expect(res.status).toBe(200)
    expect(res.body.firstName).toBe('Updated')
  })

  it('deletes a student', async () => {
    const created = await authed(request(app).post('/api/v1/students')).send(
      baseInput({ departmentId: department.id }),
    )

    const res = await authed(request(app).delete(`/api/v1/students/${created.body.id}`))
    expect(res.status).toBe(204)

    const getRes = await authed(request(app).get(`/api/v1/students/${created.body.id}`))
    expect(getRes.status).toBe(404)
  })

  describe('GET /students/:id/360', () => {
    let studentId: string

    beforeAll(async () => {
      await enableModule(tenant.id, 'ACADEMICS')
      await enableModule(tenant.id, 'FINANCE')
      await enableModule(tenant.id, 'HOSTEL_TRANSPORT')

      const program = await createTestProgram(tenant.id, department.id)
      const academicYear = await createTestAcademicYear(tenant.id)
      const batch = await createTestBatch(tenant.id, program.id, academicYear.id)
      const section = await createTestSection(tenant.id, batch.id)
      const subject = await createTestSubject(tenant.id, program.id)
      const faculty = await createTestFaculty(tenant.id, department.id)

      const student = await createTestStudent(tenant.id, department.id, { sectionId: section.id })
      studentId = student.id

      // Creating the session auto-marks every ACTIVE student in the
      // section PRESENT (see attendance.service.ts's createSession) —
      // no separate markRecords call needed for one populated record.
      await authed(request(app).post('/api/v1/attendance/sessions')).send({
        sectionId: section.id,
        subjectId: subject.id,
        date: '2024-01-10',
        facultyId: faculty.id,
      })

      await authed(request(app).post('/api/v1/fees/invoices')).send({
        studentId,
        category: 'TUITION',
        amount: 5000,
        dueDate: '2099-01-01',
      })

      const leaveType = await authed(request(app).post('/api/v1/leave/types')).send({
        name: 'Sick Leave',
        defaultDaysPerYear: 10,
      })
      await authed(request(app).post('/api/v1/leave/requests')).send({
        studentId,
        leaveTypeId: leaveType.body.id,
        startDate: '2024-02-01',
        endDate: '2024-02-02',
        reason: 'Fever',
      })

      const hostel = await authed(request(app).post('/api/v1/hostel/hostels')).send({ name: `Block ${shortId()}` })
      const hostelRoom = await authed(request(app).post('/api/v1/hostel/rooms')).send({
        hostelId: hostel.body.id,
        roomNumber: '101',
        capacity: 2,
      })
      await authed(request(app).post('/api/v1/hostel/allocations')).send({
        studentId,
        hostelRoomId: hostelRoom.body.id,
        startDate: '2024-01-01',
      })
    })

    it('returns an aggregated 360 view with populated sections', async () => {
      const res = await authed(request(app).get(`/api/v1/students/${studentId}/360`))

      expect(res.status).toBe(200)
      expect(res.body.student.id).toBe(studentId)
      expect(res.body.student.departmentName).toBe(department.name)
      expect(res.body.student.sectionName).toBeTruthy()

      expect(res.body.attendance.totalRecords).toBe(1)
      expect(res.body.attendance.presentCount).toBe(1)
      expect(res.body.attendance.attendancePercentage).toBe(100)

      expect(res.body.academics.cgpa).toBeNull()

      expect(res.body.fees.invoiceCount).toBe(1)
      expect(res.body.fees.totalInvoiced).toBe(5000)
      expect(res.body.fees.totalOutstanding).toBe(5000)
      expect(res.body.fees.overdueCount).toBe(0)

      expect(res.body.hostelAllocation).toMatchObject({ roomNumber: '101', status: 'ACTIVE' })
      expect(res.body.transportAllocation).toBeNull()
      expect(res.body.library).toEqual({ activeIssueCount: 0, overdueIssueCount: 0 })

      expect(res.body.leave.pendingCount).toBe(1)
      expect(res.body.leave.approvedCount).toBe(0)
      expect(res.body.leave.rejectedCount).toBe(0)
      expect(res.body.leave.recent).toHaveLength(1)

      expect(res.body.documents).toEqual([])
      expect(res.body.certificateRequests).toEqual([])
      expect(res.body.activities).toEqual([])
    })

    it('returns zeroed sections and nulls for a student with no relations', async () => {
      const bare = await createTestStudent(tenant.id, department.id)
      const res = await authed(request(app).get(`/api/v1/students/${bare.id}/360`))

      expect(res.status).toBe(200)
      expect(res.body.attendance).toEqual({
        totalRecords: 0,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 0,
        onLeaveCount: 0,
        attendancePercentage: 0,
      })
      expect(res.body.academics.cgpa).toBeNull()
      expect(res.body.fees).toEqual({ invoiceCount: 0, totalInvoiced: 0, totalOutstanding: 0, overdueCount: 0 })
      expect(res.body.hostelAllocation).toBeNull()
      expect(res.body.transportAllocation).toBeNull()
      expect(res.body.leave).toEqual({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, recent: [] })
    })

    it('404s for an unknown student id', async () => {
      const res = await authed(request(app).get('/api/v1/students/does-not-exist/360'))
      expect(res.status).toBe(404)
    })

    it('403s for a caller without STUDENT_READ', async () => {
      const { user } = await createTestStudentUser(tenant.id, department.id)
      const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
      const res = await request(app)
        .get(`/api/v1/students/${studentId}/360`)
        .set('Authorization', `Bearer ${loginRes.body.token}`)
      expect(res.status).toBe(403)
    })
  })
})
