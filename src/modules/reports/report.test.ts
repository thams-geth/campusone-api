import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestFaculty,
  createTestStudent,
  createTestTenant,
  setUpAuthenticatedTenant,
  rawTestPrisma,
} from '../../test/helpers'

const app = createApp()

describe('reports routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let departmentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token

    const department = await createTestDepartment(tenant.id)
    departmentId = department.id
    await createTestStudent(tenant.id, department.id)
    await createTestStudent(tenant.id, department.id)
    await createTestFaculty(tenant.id, department.id)
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/reports/student-strength')
    expect(res.status).toBe(401)
  })

  it('reports student strength scoped to a department', async () => {
    const res = await authed(request(app).get('/api/v1/reports/student-strength')).query({ departmentId })
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.byDepartment[0]).toMatchObject({ departmentId, count: 2 })
  })

  it('reports faculty workload with zero assignments for a fresh faculty member', async () => {
    const res = await authed(request(app).get('/api/v1/reports/faculty-workload'))
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ subjectsAssigned: 0, weeklyPeriods: 0 })
  })

  it('404s exam-results for an unknown exam', async () => {
    const res = await authed(request(app).get('/api/v1/reports/exam-results')).query({ examId: 'does-not-exist' })
    expect(res.status).toBe(404)
  })
})
