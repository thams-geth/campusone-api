import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/requireAuth'
import * as departmentController from './department.controller'

export const departmentsRouter = Router()

// Matches the frontend's route-level gate: the whole section is
// admin-only, not just the mutating routes.
departmentsRouter.use(requireAuth, requireRole('SUPER_ADMIN', 'COLLEGE_ADMIN', 'DEPARTMENT_ADMIN'))

departmentsRouter.get('/', departmentController.list)
departmentsRouter.get('/:id', departmentController.getById)
departmentsRouter.post('/', departmentController.create)
departmentsRouter.put('/:id', departmentController.update)
departmentsRouter.delete('/:id', departmentController.remove)
