import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as batchController from './batch.controller'

export const batchesRouter = Router()

batchesRouter.use(requireAuth, requireModule('CORE'))

batchesRouter.get('/', requirePermission('BATCH_READ'), batchController.list)
batchesRouter.get('/:id', requirePermission('BATCH_READ'), batchController.getById)
batchesRouter.post('/', requirePermission('BATCH_CREATE'), batchController.create)
batchesRouter.put('/:id', requirePermission('BATCH_UPDATE'), batchController.update)
batchesRouter.delete('/:id', requirePermission('BATCH_DELETE'), batchController.remove)
