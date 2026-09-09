import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as sectionController from './section.controller'

export const sectionsRouter = Router()

sectionsRouter.use(requireAuth, requireModule('CORE'))

sectionsRouter.get('/', requirePermission('SECTION_READ'), sectionController.list)
sectionsRouter.get('/:id', requirePermission('SECTION_READ'), sectionController.getById)
sectionsRouter.post('/', requirePermission('SECTION_CREATE'), sectionController.create)
sectionsRouter.put('/:id', requirePermission('SECTION_UPDATE'), sectionController.update)
sectionsRouter.delete('/:id', requirePermission('SECTION_DELETE'), sectionController.remove)
