import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/requireAuth'
import * as studentController from './student.controller'

export const studentsRouter = Router()

// Matches the frontend's nav gate: every staff role can reach Students,
// not just admins (unlike Departments).
studentsRouter.use(
  requireAuth,
  requireRole('SUPER_ADMIN', 'COLLEGE_ADMIN', 'DEPARTMENT_ADMIN', 'FACULTY', 'STAFF'),
)

studentsRouter.get('/', studentController.list)
studentsRouter.get('/:id', studentController.getById)
studentsRouter.post('/', studentController.create)
studentsRouter.put('/:id', studentController.update)
studentsRouter.delete('/:id', studentController.remove)
