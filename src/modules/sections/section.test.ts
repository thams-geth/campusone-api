import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestBatch,
  createTestDepartment,
  createTestProgram,
  createTestTenant,
  rawTestPrisma,
  setUpAuthenticatedTenant,
} from '../../test/helpers'

const app = createApp()

describe('sections routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let batchId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    const academicYear = await createTestAcademicYear(tenant.id)
    const batch = await createTestBatch(tenant.id, program.id, academicYear.id)
    batchId = batch.id
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/sections')
    expect(res.status).toBe(401)
  })

  it('creates a section and blocks a duplicate name within the same batch', async () => {
    const created = await authed(request(app).post('/api/v1/sections')).send({ batchId, name: 'A', currentSemester: 1 })
    expect(created.status).toBe(201)

    const dup = await authed(request(app).post('/api/v1/sections')).send({ batchId, name: 'a', currentSemester: 1 })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_SECTION')
  })

  it('blocks deleting a section that still has a student assigned', async () => {
    const section = await authed(request(app).post('/api/v1/sections')).send({ batchId, name: 'B', currentSemester: 1 })
    const dept = await authed(request(app).post('/api/v1/departments')).send({ name: 'Sect Dept', code: 'SD1', status: 'ACTIVE' })
    await authed(request(app).post('/api/v1/students')).send({
      firstName: 'Sec',
      lastName: 'Student',
      email: `sec.${Date.now()}@example.com`,
      phone: '+91 9000000000',
      rollNumber: `SEC${Date.now()}`,
      departmentId: dept.body.id,
      sectionId: section.body.id,
      gender: 'OTHER',
      dateOfBirth: '2003-01-01',
      admissionDate: '2023-06-01',
      status: 'ACTIVE',
    })

    const res = await authed(request(app).delete(`/api/v1/sections/${section.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SECTION_IN_USE')
  })
})
