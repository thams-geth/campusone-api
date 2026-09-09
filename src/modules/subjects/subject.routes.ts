import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as subjectController from './subject.controller'

export const subjectsRouter = Router()

subjectsRouter.use(requireAuth, requireModule('CORE'))

subjectsRouter.get('/', requirePermission('SUBJECT_READ'), subjectController.list)
subjectsRouter.get('/:id', requirePermission('SUBJECT_READ'), subjectController.getById)
subjectsRouter.post('/', requirePermission('SUBJECT_CREATE'), subjectController.create)
subjectsRouter.put('/:id', requirePermission('SUBJECT_UPDATE'), subjectController.update)
subjectsRouter.delete('/:id', requirePermission('SUBJECT_DELETE'), subjectController.remove)
