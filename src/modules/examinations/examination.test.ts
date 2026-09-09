import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestDepartment,
  createTestProgram,
  createTestRoom,
  createTestStudentUser,
  createTestSubject,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('examinations routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let studentId: string
  let subjectId: string
  let roomId: string
  let academicYearId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'EXAMINATION')

    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    const academicYear = await createTestAcademicYear(tenant.id)
    academicYearId = academicYear.id
    const subject = await createTestSubject(tenant.id, program.id, {})
    subjectId = subject.id
    const room = await createTestRoom(tenant.id)
    roomId = room.id

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

  it('403s while the EXAMINATION module is disabled for a fresh tenant', async () => {
    const other = await setUpAuthenticatedTenant(app)
    const res = await request(app).get('/api/v1/examinations/exams').set('Authorization', `Bearer ${other.token}`)
    expect(res.status).toBe(403)
  })

  it('runs the full exam -> schedule -> marks workflow through to results and CGPA', async () => {
    const exam = await asAdmin(request(app).post('/api/v1/examinations/exams')).send({
      name: 'Semester 1 Finals',
      examType: 'FINAL',
      academicYearId,
      semesterNumber: 1,
      startDate: '2024-12-01',
      endDate: '2024-12-10',
    })
    expect(exam.status).toBe(201)

    const schedule = await asAdmin(request(app).post(`/api/v1/examinations/exams/${exam.body.id}/schedules`)).send({
      subjectId,
      examDate: '2024-12-02',
      startTime: '09:00',
      endTime: '12:00',
      roomId,
    })
    expect(schedule.status).toBe(201)
    const scheduleId = schedule.body.id

    const entered = await asAdmin(request(app).post(`/api/v1/examinations/schedules/${scheduleId}/marks`)).send({
      marks: [{ studentId, marksObtained: 85, maxMarks: 100 }],
    })
    expect(entered.status).toBe(200)
    expect(entered.body[0].status).toBe('DRAFT')

    const submitted = await asAdmin(request(app).post(`/api/v1/examinations/schedules/${scheduleId}/marks/submit`))
    expect(submitted.status).toBe(200)
    expect(submitted.body[0].status).toBe('SUBMITTED')

    // A student cannot see the full roster.
    const forbiddenRoster = await asStudent(request(app).get(`/api/v1/examinations/schedules/${scheduleId}/marks`))
    expect(forbiddenRoster.status).toBe(403)

    const verified = await asAdmin(request(app).post(`/api/v1/examinations/schedules/${scheduleId}/marks/verify`))
    expect(verified.body[0].status).toBe('VERIFIED')

    const published = await asAdmin(request(app).post(`/api/v1/examinations/schedules/${scheduleId}/marks/publish`))
    expect(published.body[0].status).toBe('PUBLISHED')

    const markId = published.body[0].id
    const blockedEdit = await asAdmin(request(app).put(`/api/v1/examinations/marks/${markId}`)).send({ marksObtained: 90 })
    expect(blockedEdit.status).toBe(409)
    expect(blockedEdit.body.code).toBe('MARKS_NOT_EDITABLE')

    // 85/100 -> A+ (9 points); with one subject, SGPA == the subject's grade points.
    const result = await asStudent(request(app).get('/api/v1/examinations/results/semester/1'))
    expect(result.status).toBe(200)
    expect(result.body.studentId).toBe(studentId)
    expect(result.body.subjects[0]).toMatchObject({ subjectId, grade: 'A+', gradePoints: 9 })
    expect(result.body.sgpa).toBe(9)

    const cgpa = await asStudent(request(app).get('/api/v1/examinations/results/cgpa'))
    expect(cgpa.status).toBe(200)
    expect(cgpa.body.cgpa).toBe(9)

    const revised = await asAdmin(request(app).put(`/api/v1/examinations/marks/${markId}/revise`)).send({
      marksObtained: 95,
      reason: 'Re-evaluation after student appeal.',
    })
    expect(revised.status).toBe(200)
    expect(revised.body.marksObtained).toBe(95)

    const auditRes = await asAdmin(request(app).get('/api/v1/audit-logs').query({ entity: 'Marks', entityId: markId }))
    expect(auditRes.body.data[0]).toMatchObject({
      action: 'REVISE',
      before: { marksObtained: 85 },
      after: { marksObtained: 95 },
    })
  })

  it('blocks scheduling the same subject twice for one exam', async () => {
    const exam = await asAdmin(request(app).post('/api/v1/examinations/exams')).send({
      name: 'Midterm',
      examType: 'MIDTERM',
      academicYearId,
      semesterNumber: 1,
      startDate: '2024-10-01',
      endDate: '2024-10-05',
    })
    await asAdmin(request(app).post(`/api/v1/examinations/exams/${exam.body.id}/schedules`)).send({
      subjectId,
      examDate: '2024-10-02',
      startTime: '09:00',
      endTime: '10:00',
      roomId,
    })
    const dup = await asAdmin(request(app).post(`/api/v1/examinations/exams/${exam.body.id}/schedules`)).send({
      subjectId,
      examDate: '2024-10-03',
      startTime: '09:00',
      endTime: '10:00',
      roomId,
    })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_SCHEDULE')
  })
})
