import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as programController from './program.controller'

export const programsRouter = Router()

programsRouter.use(requireAuth, requireModule('CORE'))

programsRouter.get('/', requirePermission('PROGRAM_READ'), programController.list)
programsRouter.get('/:id', requirePermission('PROGRAM_READ'), programController.getById)
programsRouter.post('/', requirePermission('PROGRAM_CREATE'), programController.create)
programsRouter.put('/:id', requirePermission('PROGRAM_UPDATE'), programController.update)
programsRouter.delete('/:id', requirePermission('PROGRAM_DELETE'), programController.remove)
