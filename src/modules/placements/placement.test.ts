import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestStudentUser,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('placements routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'PLACEMENT_ALUMNI')

    const department = await createTestDepartment(tenant.id)
    const { user } = await createTestStudentUser(tenant.id, department.id)
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
    const res = await request(app).get('/api/v1/placements/companies')
    expect(res.status).toBe(401)
  })

  it('lets a student apply and staff progress the application to SELECTED', async () => {
    const company = await asAdmin(request(app).post('/api/v1/placements/companies')).send({ name: 'Acme Corp' })
    const opening = await asAdmin(request(app).post('/api/v1/placements/openings')).send({
      companyId: company.body.id,
      title: 'Software Engineer',
    })

    const applied = await asStudent(request(app).post(`/api/v1/placements/openings/${opening.body.id}/apply`)).send({})
    expect(applied.status).toBe(201)
    expect(applied.body.status).toBe('APPLIED')

    const dup = await asStudent(request(app).post(`/api/v1/placements/openings/${opening.body.id}/apply`)).send({})
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('ALREADY_APPLIED')

    const shortlisted = await asAdmin(request(app).put(`/api/v1/placements/applications/${applied.body.id}/status`)).send({
      status: 'SHORTLISTED',
    })
    expect(shortlisted.status).toBe(200)

    const selected = await asAdmin(request(app).put(`/api/v1/placements/applications/${applied.body.id}/status`)).send({
      status: 'SELECTED',
      offeredCtc: 1200000,
    })
    expect(selected.body.status).toBe('SELECTED')
    expect(selected.body.offeredCtc).toBe(1200000)

    const blocked = await asAdmin(request(app).put(`/api/v1/placements/applications/${applied.body.id}/status`)).send({
      status: 'REJECTED',
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('APPLICATION_FINALIZED')

    const mine = await asStudent(request(app).get('/api/v1/placements/applications/mine'))
    expect(mine.body[0].status).toBe('SELECTED')
  })

  it('blocks applying when the student does not meet the minimum CGPA (no published marks yet)', async () => {
    const company = await asAdmin(request(app).post('/api/v1/placements/companies')).send({ name: 'Selective Corp' })
    const opening = await asAdmin(request(app).post('/api/v1/placements/openings')).send({
      companyId: company.body.id,
      title: 'Senior Role',
      minCgpa: 8,
    })

    const res = await asStudent(request(app).post(`/api/v1/placements/openings/${opening.body.id}/apply`)).send({})
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CGPA_NOT_MET')
  })

  it('blocks deleting a company with job openings', async () => {
    const company = await asAdmin(request(app).post('/api/v1/placements/companies')).send({ name: 'Blocked Corp' })
    await asAdmin(request(app).post('/api/v1/placements/openings')).send({ companyId: company.body.id, title: 'Role' })

    const res = await asAdmin(request(app).delete(`/api/v1/placements/companies/${company.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('COMPANY_IN_USE')
  })
})
