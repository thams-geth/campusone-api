import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestFaculty,
  createTestRoom,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
} from '../../test/helpers'

const app = createApp()

describe('timetable routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let sectionId: string
  let subjectId: string
  let facultyId: string
  let roomId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token

    const department = await createTestDepartment(tenant.id)
    const faculty = await createTestFaculty(tenant.id, department.id)
    facultyId = faculty.id
    const room = await createTestRoom(tenant.id)
    roomId = room.id
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('403s while the ACADEMICS module is disabled', async () => {
    const res = await authed(request(app).get('/api/v1/timetable'))
    expect(res.status).toBe(403)
  })

  it('creates timetable entries and detects conflicts once the module is enabled', async () => {
    await enableModule(tenant.id, 'ACADEMICS')

    const dept = await authed(request(app).post('/api/v1/departments')).send({ name: 'TT Dept', code: 'TTD1', status: 'ACTIVE' })
    const program = await authed(request(app).post('/api/v1/programs')).send({
      departmentId: dept.body.id,
      name: 'TT Program',
      code: 'TTP1',
      durationYears: 4,
    })
    const academicYear = await authed(request(app).post('/api/v1/academic-years')).send({
      name: 'TT Year',
      startDate: '2024-06-01',
      endDate: '2025-05-31',
    })
    const batch = await authed(request(app).post('/api/v1/batches')).send({
      programId: program.body.id,
      academicYearId: academicYear.body.id,
      name: 'TT Batch',
      startYear: 2024,
      endYear: 2028,
    })
    const section = await authed(request(app).post('/api/v1/sections')).send({ batchId: batch.body.id, name: 'A', currentSemester: 1 })
    sectionId = section.body.id
    const subject = await authed(request(app).post('/api/v1/subjects')).send({
      programId: program.body.id,
      semesterNumber: 1,
      code: 'TTSUB1',
      name: 'TT Subject',
      credits: 4,
    })
    subjectId = subject.body.id

    const created = await authed(request(app).post('/api/v1/timetable')).send({
      sectionId,
      subjectId,
      facultyId,
      roomId,
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '10:00',
    })
    expect(created.status).toBe(201)

    const facultyConflict = await authed(request(app).post('/api/v1/timetable')).send({
      sectionId,
      subjectId,
      facultyId,
      roomId,
      dayOfWeek: 'MONDAY',
      startTime: '09:30',
      endTime: '10:30',
    })
    expect(facultyConflict.status).toBe(409)
    expect(facultyConflict.body.code).toBe('FACULTY_CONFLICT')

    const noConflict = await authed(request(app).post('/api/v1/timetable')).send({
      sectionId,
      subjectId,
      facultyId,
      roomId,
      dayOfWeek: 'MONDAY',
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(noConflict.status).toBe(201)
  })

  it('rejects an end time before the start time', async () => {
    const res = await authed(request(app).post('/api/v1/timetable')).send({
      sectionId,
      subjectId,
      facultyId,
      roomId,
      dayOfWeek: 'TUESDAY',
      startTime: '11:00',
      endTime: '10:00',
    })
    expect(res.status).toBe(422)
  })
})
