import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as documentController from './document.controller'

export const documentsRouter = Router()

documentsRouter.use(requireAuth, requireModule('CORE'))

const staffTier = requirePermission('DOCUMENT_MANAGE', 'DOCUMENT_VERIFY')
documentsRouter.get('/', staffTier, documentController.list)
documentsRouter.get('/mine', requirePermission('DOCUMENT_READ'), documentController.listMine)
documentsRouter.get('/:id', staffTier, documentController.getById)
documentsRouter.post('/', requirePermission('DOCUMENT_MANAGE'), documentController.create)
documentsRouter.put('/:id', requirePermission('DOCUMENT_MANAGE'), documentController.update)
documentsRouter.delete('/:id', requirePermission('DOCUMENT_MANAGE'), documentController.remove)
documentsRouter.post('/:id/verify', requirePermission('DOCUMENT_VERIFY'), documentController.verify)
documentsRouter.post('/:id/reject', requirePermission('DOCUMENT_VERIFY'), documentController.reject)
