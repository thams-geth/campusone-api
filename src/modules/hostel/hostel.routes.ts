import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as hostelController from './hostel.controller'

export const hostelRouter = Router()

hostelRouter.use(requireAuth, requireModule('HOSTEL_TRANSPORT'))

hostelRouter.get('/hostels', requirePermission('HOSTEL_READ'), hostelController.listHostels)
hostelRouter.post('/hostels', requirePermission('HOSTEL_MANAGE'), hostelController.createHostel)
hostelRouter.delete('/hostels/:id', requirePermission('HOSTEL_MANAGE'), hostelController.removeHostel)

hostelRouter.get('/rooms', requirePermission('HOSTEL_READ'), hostelController.listRooms)
hostelRouter.post('/rooms', requirePermission('HOSTEL_MANAGE'), hostelController.createRoom)
hostelRouter.delete('/rooms/:id', requirePermission('HOSTEL_MANAGE'), hostelController.removeRoom)

hostelRouter.get('/allocations', requirePermission('HOSTEL_MANAGE'), hostelController.listAllocations)
hostelRouter.get('/allocations/mine', requirePermission('HOSTEL_READ'), hostelController.listMyAllocations)
hostelRouter.post('/allocations', requirePermission('HOSTEL_ALLOCATE'), hostelController.createAllocation)
hostelRouter.post('/allocations/:id/vacate', requirePermission('HOSTEL_ALLOCATE'), hostelController.vacateAllocation)
