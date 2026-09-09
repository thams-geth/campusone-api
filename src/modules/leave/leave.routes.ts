import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as leaveController from './leave.controller'

export const leaveRouter = Router()

leaveRouter.use(requireAuth, requireModule('ACADEMICS'))

leaveRouter.get('/types', requirePermission('LEAVE_READ'), leaveController.listTypes)
leaveRouter.post('/types', requirePermission('LEAVE_APPROVE'), leaveController.createType)
leaveRouter.put('/types/:id', requirePermission('LEAVE_APPROVE'), leaveController.updateType)
leaveRouter.delete('/types/:id', requirePermission('LEAVE_APPROVE'), leaveController.removeType)

leaveRouter.post('/requests', requirePermission('LEAVE_REQUEST'), leaveController.createRequest)
leaveRouter.get('/requests', requirePermission('LEAVE_READ'), leaveController.listRequests)
leaveRouter.get('/requests/:id', requirePermission('LEAVE_READ'), leaveController.getRequest)
leaveRouter.post('/requests/:id/approve', requirePermission('LEAVE_APPROVE'), leaveController.approveRequest)
leaveRouter.post('/requests/:id/reject', requirePermission('LEAVE_APPROVE'), leaveController.rejectRequest)

leaveRouter.get('/balance/:studentId', requirePermission('LEAVE_READ'), leaveController.getBalance)
