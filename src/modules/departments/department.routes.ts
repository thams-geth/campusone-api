import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as departmentController from './department.controller'

export const departmentsRouter = Router()

departmentsRouter.use(requireAuth, requireModule('CORE'))

departmentsRouter.get('/', requirePermission('DEPARTMENT_READ'), departmentController.list)
departmentsRouter.get('/:id', requirePermission('DEPARTMENT_READ'), departmentController.getById)
departmentsRouter.post('/', requirePermission('DEPARTMENT_CREATE'), departmentController.create)
departmentsRouter.put('/:id', requirePermission('DEPARTMENT_UPDATE'), departmentController.update)
departmentsRouter.delete('/:id', requirePermission('DEPARTMENT_DELETE'), departmentController.remove)
