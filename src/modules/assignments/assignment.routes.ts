import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as assignmentController from './assignment.controller'

export const assignmentsRouter = Router()

assignmentsRouter.use(requireAuth, requireModule('ACADEMICS'))

assignmentsRouter.get('/', requirePermission('ASSIGNMENT_READ'), assignmentController.list)
assignmentsRouter.get('/:id', requirePermission('ASSIGNMENT_READ'), assignmentController.getById)
assignmentsRouter.post('/', requirePermission('ASSIGNMENT_MANAGE'), assignmentController.create)
assignmentsRouter.put('/:id', requirePermission('ASSIGNMENT_MANAGE'), assignmentController.update)
assignmentsRouter.delete('/:id', requirePermission('ASSIGNMENT_MANAGE'), assignmentController.remove)
assignmentsRouter.post('/:id/publish', requirePermission('ASSIGNMENT_MANAGE'), assignmentController.publish)
assignmentsRouter.post('/:id/close', requirePermission('ASSIGNMENT_MANAGE'), assignmentController.close)

assignmentsRouter.post('/:id/submissions', requirePermission('ASSIGNMENT_SUBMIT'), assignmentController.submit)
assignmentsRouter.get('/:id/submissions', requirePermission('ASSIGNMENT_READ'), assignmentController.listSubmissions)
assignmentsRouter.put(
  '/submissions/:submissionId/evaluate',
  requirePermission('ASSIGNMENT_EVALUATE'),
  assignmentController.evaluate,
)
