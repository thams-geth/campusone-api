import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('programs routes', () => {
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
    const res = await request(app).get('/api/v1/programs')
    expect(res.status).toBe(401)
  })

  it('rejects an invalid department', async () => {
    const res = await authed(request(app).post('/api/v1/programs')).send({
      departmentId: 'does-not-exist',
      name: 'B.Tech CSE',
      code: shortId('P'),
      durationYears: 4,
    })
    expect(res.status).toBe(400)
  })

  it('creates, lists, and updates a program', async () => {
    const code = shortId('c')
    const created = await authed(request(app).post('/api/v1/programs')).send({
      departmentId,
      name: 'B.Tech Computer Science',
      code,
      durationYears: 4,
    })
    expect(created.status).toBe(201)
    expect(created.body.code).toBe(code.toUpperCase())

    const listRes = await authed(request(app).get('/api/v1/programs')).query({ departmentId })
    expect(listRes.body.data.some((p: { id: string }) => p.id === created.body.id)).toBe(true)

    const updated = await authed(request(app).put(`/api/v1/programs/${created.body.id}`)).send({
      departmentId,
      name: 'B.Tech Computer Science & Engineering',
      code,
      durationYears: 4,
    })
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe('B.Tech Computer Science & Engineering')
  })

  it('blocks a duplicate code', async () => {
    const code = shortId('d')
    await authed(request(app).post('/api/v1/programs')).send({ departmentId, name: 'First', code, durationYears: 3 })
    const res = await authed(request(app).post('/api/v1/programs')).send({ departmentId, name: 'Second', code, durationYears: 3 })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DUPLICATE_CODE')
  })

  it('blocks deleting a program that still has subjects', async () => {
    const program = await authed(request(app).post('/api/v1/programs')).send({
      departmentId,
      name: 'In Use Program',
      code: shortId('I'),
      durationYears: 4,
    })
    await authed(request(app).post('/api/v1/subjects')).send({
      programId: program.body.id,
      semesterNumber: 1,
      code: shortId('S'),
      name: 'Intro to Programming',
      credits: 4,
    })

    const res = await authed(request(app).delete(`/api/v1/programs/${program.body.id}`))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PROGRAM_IN_USE')
  })
})
