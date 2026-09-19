import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as facultyController from './faculty.controller'

export const facultyRouter = Router()

facultyRouter.use(requireAuth, requireModule('CORE'))

facultyRouter.get('/', requirePermission('FACULTY_READ'), facultyController.list)
facultyRouter.get('/:id/360', requirePermission('FACULTY_READ'), facultyController.get360)
facultyRouter.get('/:id', requirePermission('FACULTY_READ'), facultyController.getById)
facultyRouter.post('/', requirePermission('FACULTY_CREATE'), facultyController.create)
facultyRouter.put('/:id', requirePermission('FACULTY_UPDATE'), facultyController.update)
facultyRouter.delete('/:id', requirePermission('FACULTY_DELETE'), facultyController.remove)
