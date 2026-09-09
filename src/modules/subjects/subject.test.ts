import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestProgram, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('subjects routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let programId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    const department = await createTestDepartment(tenant.id)
    const program = await createTestProgram(tenant.id, department.id)
    programId = program.id
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/subjects')
    expect(res.status).toBe(401)
  })

  it('creates a subject and blocks a duplicate code', async () => {
    const code = shortId('S')
    const created = await authed(request(app).post('/api/v1/subjects')).send({
      programId,
      semesterNumber: 1,
      code,
      name: 'Data Structures',
      credits: 4,
      type: 'CORE',
    })
    expect(created.status).toBe(201)
    expect(created.body.code).toBe(code.toUpperCase())

    const dup = await authed(request(app).post('/api/v1/subjects')).send({
      programId,
      semesterNumber: 2,
      code,
      name: 'Duplicate',
      credits: 3,
    })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_CODE')
  })

  it('filters by semester number', async () => {
    const res = await authed(request(app).get('/api/v1/subjects')).query({ programId, semesterNumber: 1 })
    expect(res.status).toBe(200)
    expect(res.body.data.every((s: { semesterNumber: number }) => s.semesterNumber === 1)).toBe(true)
  })
})
