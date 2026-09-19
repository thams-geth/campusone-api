import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as studentController from './student.controller'

export const studentsRouter = Router()

studentsRouter.use(requireAuth, requireModule('CORE'))

studentsRouter.get('/', requirePermission('STUDENT_READ'), studentController.list)
studentsRouter.get('/:id/360', requirePermission('STUDENT_READ'), studentController.get360)
studentsRouter.get('/:id', requirePermission('STUDENT_READ'), studentController.getById)
studentsRouter.post('/', requirePermission('STUDENT_CREATE'), studentController.create)
studentsRouter.put('/:id', requirePermission('STUDENT_UPDATE'), studentController.update)
studentsRouter.delete('/:id', requirePermission('STUDENT_DELETE'), studentController.remove)
