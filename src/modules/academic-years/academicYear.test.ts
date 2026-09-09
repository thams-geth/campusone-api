import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('academic-years routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/academic-years')
    expect(res.status).toBe(401)
  })

  it('rejects a role without ACADEMIC_YEAR_READ', async () => {
    const otherSetup = await setUpAuthenticatedTenant(app, 'STUDENT')
    const res = await request(app).get('/api/v1/academic-years').set('Authorization', `Bearer ${otherSetup.token}`)
    expect(res.status).toBe(403)
  })

  it('creates an academic year and clears any other current year', async () => {
    const firstName = shortId('AY')
    const first = await authed(request(app).post('/api/v1/academic-years')).send({
      name: firstName,
      startDate: '2023-06-01',
      endDate: '2024-05-31',
      isCurrent: true,
    })
    expect(first.status).toBe(201)
    expect(first.body.isCurrent).toBe(true)

    const secondName = shortId('AY')
    const second = await authed(request(app).post('/api/v1/academic-years')).send({
      name: secondName,
      startDate: '2024-06-01',
      endDate: '2025-05-31',
      isCurrent: true,
    })
    expect(second.status).toBe(201)

    const refetchedFirst = await authed(request(app).get(`/api/v1/academic-years/${first.body.id}`))
    expect(refetchedFirst.body.isCurrent).toBe(false)
  })

  it('rejects an end date before the start date', async () => {
    const res = await authed(request(app).post('/api/v1/academic-years')).send({
      name: shortId('AY'),
      startDate: '2024-06-01',
      endDate: '2023-05-31',
    })
    expect(res.status).toBe(422)
  })

  it('blocks a duplicate name', async () => {
    const name = shortId('AY')
    await authed(request(app).post('/api/v1/academic-years')).send({ name, startDate: '2023-06-01', endDate: '2024-05-31' })
    const res = await authed(request(app).post('/api/v1/academic-years')).send({ name, startDate: '2024-06-01', endDate: '2025-05-31' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_ACADEMIC_YEAR')
  })

  it('blocks deleting an academic year that still has batches', async () => {
    const year = await authed(request(app).post('/api/v1/academic-years')).send({
      name: shortId('AY'),
      startDate: '2023-06-01',
      endDate: '2024-05-31',
    })
    const dept = await authed(request(app).post('/api/v1/departments')).send({ name: 'Test Dept', code: shortId('D'), status: 'ACTIVE' })
    const program = await authed(request(app).post('/api/v1/programs')).send({
      departmentId: dept.body.id,
      name: 'Test Program',
      code: shortId('P'),
      durationYears: 4,
    })
    await authed(request(app).post('/api/v1/batches')).send({
      programId: program.body.id,
      academicYearId: year.body.id,
      name: shortId('B'),
      startYear: 2024,
      endYear: 2028,
    })

    const res = await authed(request(app).delete(`/api/v1/academic-years/${year.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACADEMIC_YEAR_IN_USE')
  })
})
