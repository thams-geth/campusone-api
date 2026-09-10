import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestStudent,
  createTestStudentUser,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('hostel routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let departmentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'HOSTEL_TRANSPORT')

    const department = await createTestDepartment(tenant.id)
    departmentId = department.id
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
    const res = await request(app).get('/api/v1/hostel/hostels')
    expect(res.status).toBe(401)
  })

  it('allocates within capacity, auto-assigns bed numbers, and blocks over capacity', async () => {
    const hostel = await asAdmin(request(app).post('/api/v1/hostel/hostels')).send({ name: 'Hostel A' })
    const room = await asAdmin(request(app).post('/api/v1/hostel/rooms')).send({ hostelId: hostel.body.id, roomNumber: '101', capacity: 2 })

    const student1 = await createTestStudent(tenant.id, departmentId)
    const student2 = await createTestStudent(tenant.id, departmentId)
    const student3 = await createTestStudent(tenant.id, departmentId)

    const alloc1 = await asAdmin(request(app).post('/api/v1/hostel/allocations')).send({
      studentId: student1.id,
      hostelRoomId: room.body.id,
      startDate: '2024-06-01',
    })
    expect(alloc1.status).toBe(201)
    expect(alloc1.body.bedNumber).toBe(1)

    const alloc2 = await asAdmin(request(app).post('/api/v1/hostel/allocations')).send({
      studentId: student2.id,
      hostelRoomId: room.body.id,
      startDate: '2024-06-01',
    })
    expect(alloc2.body.bedNumber).toBe(2)

    const overCapacity = await asAdmin(request(app).post('/api/v1/hostel/allocations')).send({
      studentId: student3.id,
      hostelRoomId: room.body.id,
      startDate: '2024-06-01',
    })
    expect(overCapacity.status).toBe(409)
    expect(overCapacity.body.code).toBe('ROOM_FULL')

    // Vacating frees up the bed for a new allocation.
    await asAdmin(request(app).post(`/api/v1/hostel/allocations/${alloc1.body.id}/vacate`))
    const alloc3 = await asAdmin(request(app).post('/api/v1/hostel/allocations')).send({
      studentId: student3.id,
      hostelRoomId: room.body.id,
      startDate: '2024-06-01',
    })
    expect(alloc3.status).toBe(201)
    expect(alloc3.body.bedNumber).toBe(1)
  })

  it('lets a student see their own allocation but not the full roster', async () => {
    const forbiddenRoster = await asStudent(request(app).get('/api/v1/hostel/allocations'))
    expect(forbiddenRoster.status).toBe(403)

    const mine = await asStudent(request(app).get('/api/v1/hostel/allocations/mine'))
    expect(mine.status).toBe(200)
    expect(Array.isArray(mine.body)).toBe(true)
  })
})
