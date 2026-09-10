import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestProgram, createTestTenant, enableModule, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('admissions routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let programId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    await enableModule(tenant.id, 'ADMISSIONS')

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
    const res = await request(app).get('/api/v1/admissions')
    expect(res.status).toBe(401)
  })

  it('walks an application through the full lifecycle to enrollment, creating a linked Student', async () => {
    const email = `${shortId('applicant')}@example.com`
    const created = await authed(request(app).post('/api/v1/admissions')).send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      phone: '+91 9000000000',
      dateOfBirth: '2005-01-01',
      programId,
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('APPLIED')
    const applicationId = created.body.id

    const stages = ['DOCUMENT_VERIFICATION', 'SHORTLISTED', 'APPROVED', 'OFFERED', 'ACCEPTED']
    for (const stage of stages) {
      const advanced = await authed(request(app).post(`/api/v1/admissions/${applicationId}/advance`)).send({})
      expect(advanced.status).toBe(200)
      expect(advanced.body.status).toBe(stage)
    }

    const blockedAdvance = await authed(request(app).post(`/api/v1/admissions/${applicationId}/advance`)).send({})
    expect(blockedAdvance.status).toBe(409)
    expect(blockedAdvance.body.code).toBe('ALREADY_AT_FINAL_STAGE')

    const rollNumber = shortId('ADM')
    const enrolled = await authed(request(app).post(`/api/v1/admissions/${applicationId}/enroll`)).send({
      rollNumber,
      gender: 'FEMALE',
    })
    expect(enrolled.status).toBe(201)
    expect(enrolled.body.admissionApplicationId).toBe(applicationId)
    expect(enrolled.body.rollNumber).toBe(rollNumber)

    const application = await authed(request(app).get(`/api/v1/admissions/${applicationId}`))
    expect(application.body.status).toBe('ENROLLED')

    const studentRes = await authed(request(app).get('/api/v1/students')).query({ search: rollNumber })
    expect(studentRes.body.data[0]).toMatchObject({ rollNumber, firstName: 'Ada' })
  })

  it('blocks a duplicate application from the same email for the same program', async () => {
    const email = `${shortId('dup')}@example.com`
    await authed(request(app).post('/api/v1/admissions')).send({
      firstName: 'Grace',
      lastName: 'Hopper',
      email,
      phone: '+91 9000000001',
      dateOfBirth: '2005-01-01',
      programId,
    })
    const dup = await authed(request(app).post('/api/v1/admissions')).send({
      firstName: 'Grace',
      lastName: 'Hopper',
      email,
      phone: '+91 9000000001',
      dateOfBirth: '2005-01-01',
      programId,
    })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_APPLICATION')
  })

  it('blocks enrolling an application that is not ACCEPTED', async () => {
    const email = `${shortId('notaccepted')}@example.com`
    const created = await authed(request(app).post('/api/v1/admissions')).send({
      firstName: 'Not',
      lastName: 'Accepted',
      email,
      phone: '+91 9000000002',
      dateOfBirth: '2005-01-01',
      programId,
    })
    const res = await authed(request(app).post(`/api/v1/admissions/${created.body.id}/enroll`)).send({
      rollNumber: shortId('X'),
      gender: 'OTHER',
    })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOT_ACCEPTED')
  })

  it('blocks any further action once rejected', async () => {
    const email = `${shortId('rej')}@example.com`
    const created = await authed(request(app).post('/api/v1/admissions')).send({
      firstName: 'To',
      lastName: 'Reject',
      email,
      phone: '+91 9000000003',
      dateOfBirth: '2005-01-01',
      programId,
    })
    await authed(request(app).post(`/api/v1/admissions/${created.body.id}/reject`)).send({})
    const res = await authed(request(app).post(`/api/v1/admissions/${created.body.id}/advance`)).send({})
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('APPLICATION_FINALIZED')
  })
})
