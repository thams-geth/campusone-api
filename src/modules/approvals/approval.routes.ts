import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as approvalController from './approval.controller'

export const approvalsRouter = Router()

approvalsRouter.use(requireAuth, requireModule('CORE'))

approvalsRouter.get('/', requirePermission('APPROVAL_READ'), approvalController.listApprovals)
approvalsRouter.post('/', requirePermission('APPROVAL_MANAGE'), approvalController.createApprovalRequest)
approvalsRouter.post('/:id/approve', requirePermission('APPROVAL_MANAGE'), approvalController.approveRequest)
approvalsRouter.post('/:id/reject', requirePermission('APPROVAL_MANAGE'), approvalController.rejectRequest)
