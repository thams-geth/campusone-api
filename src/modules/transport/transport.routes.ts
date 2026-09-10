import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as transportController from './transport.controller'

export const transportRouter = Router()

transportRouter.use(requireAuth, requireModule('HOSTEL_TRANSPORT'))

transportRouter.get('/vehicles', requirePermission('TRANSPORT_READ'), transportController.listVehicles)
transportRouter.post('/vehicles', requirePermission('TRANSPORT_MANAGE'), transportController.createVehicle)
transportRouter.delete('/vehicles/:id', requirePermission('TRANSPORT_MANAGE'), transportController.removeVehicle)

transportRouter.get('/routes', requirePermission('TRANSPORT_READ'), transportController.listRoutes)
transportRouter.post('/routes', requirePermission('TRANSPORT_MANAGE'), transportController.createRoute)
transportRouter.delete('/routes/:id', requirePermission('TRANSPORT_MANAGE'), transportController.removeRoute)
transportRouter.post('/routes/:id/stops', requirePermission('TRANSPORT_MANAGE'), transportController.addStop)
transportRouter.delete('/stops/:id', requirePermission('TRANSPORT_MANAGE'), transportController.removeStop)

transportRouter.get('/allocations', requirePermission('TRANSPORT_MANAGE'), transportController.listAllocations)
transportRouter.get('/allocations/mine', requirePermission('TRANSPORT_READ'), transportController.listMyAllocations)
transportRouter.post('/allocations', requirePermission('TRANSPORT_ALLOCATE'), transportController.createAllocation)
transportRouter.post('/allocations/:id/remove', requirePermission('TRANSPORT_ALLOCATE'), transportController.removeAllocation)
