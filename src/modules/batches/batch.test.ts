import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestDepartment,
  createTestProgram,
  createTestTenant,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  shortId,
} from '../../test/helpers'

const app = createApp()

describe('batches routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let programId: string
  let academicYearId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    programId = program.id
    const academicYear = await createTestAcademicYear(tenant.id)
    academicYearId = academicYear.id
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/batches')
    expect(res.status).toBe(401)
  })

  it('rejects an end year before the start year', async () => {
    const res = await authed(request(app).post('/api/v1/batches')).send({
      programId,
      academicYearId,
      name: shortId('B'),
      startYear: 2028,
      endYear: 2024,
    })
    expect(res.status).toBe(422)
  })

  it('creates a batch and blocks deleting it while it still has sections', async () => {
    const created = await authed(request(app).post('/api/v1/batches')).send({
      programId,
      academicYearId,
      name: shortId('B'),
      startYear: 2024,
      endYear: 2028,
    })
    expect(created.status).toBe(201)

    await authed(request(app).post('/api/v1/sections')).send({
      batchId: created.body.id,
      name: 'A',
      currentSemester: 1,
    })

    const res = await authed(request(app).delete(`/api/v1/batches/${created.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('BATCH_IN_USE')
  })
})
