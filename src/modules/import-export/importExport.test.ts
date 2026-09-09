import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

const HEADER = 'firstName,lastName,email,phone,rollNumber,departmentId,gender,dateOfBirth,admissionDate,status,sectionId,currentSemester,guardianName,guardianPhone,address'

describe('import-export routes', () => {
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
    const res = await request(app).post('/api/v1/import-export/students/preview').send({ csv: HEADER })
    expect(res.status).toBe(401)
  })

  it('previews a CSV, flagging invalid rows without creating anything', async () => {
    const validEmail = `${shortId('imp')}@example.com`
    const validRoll = shortId('IMP')
    const csv = [
      HEADER,
      `Ada,Lovelace,${validEmail},+91 9000000001,${validRoll},${departmentId},FEMALE,2003-01-01,2023-06-01,ACTIVE,,,,,`,
      `Bad,Row,not-an-email,+91 9000000002,,${departmentId},FEMALE,2003-01-01,2023-06-01,ACTIVE,,,,,`,
    ].join('\n')

    const preview = await authed(request(app).post('/api/v1/import-export/students/preview')).send({ csv })
    expect(preview.status).toBe(200)
    expect(preview.body.totalRows).toBe(2)
    expect(preview.body.validCount).toBe(1)
    expect(preview.body.invalidCount).toBe(1)
    expect(preview.body.results[1].errors).toBeTruthy()

    const listRes = await authed(request(app).get('/api/v1/students')).query({ search: validEmail })
    expect(listRes.body.data).toHaveLength(0)
  })

  it('commits only the valid rows, then exports them back out as CSV', async () => {
    const validEmail = `${shortId('imp2')}@example.com`
    const validRoll = shortId('IMP2')
    const csv = [
      HEADER,
      `Grace,Hopper,${validEmail},+91 9000000003,${validRoll},${departmentId},FEMALE,2003-01-01,2023-06-01,ACTIVE,,,,,`,
      `Bad,Row,not-an-email,+91 9000000004,,${departmentId},FEMALE,2003-01-01,2023-06-01,ACTIVE,,,,,`,
    ].join('\n')

    const commit = await authed(request(app).post('/api/v1/import-export/students/commit')).send({ csv })
    expect(commit.status).toBe(200)
    expect(commit.body.createdCount).toBe(1)
    expect(commit.body.failedCount).toBe(1)

    const exportRes = await authed(request(app).get('/api/v1/import-export/students/export')).query({ departmentId })
    expect(exportRes.status).toBe(200)
    expect(exportRes.text).toContain(validEmail)
    expect(exportRes.text.split('\n')[0]).toBe(HEADER)
  })
})
