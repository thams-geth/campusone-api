import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as institutionController from './institution.controller'

export const institutionRouter = Router()

institutionRouter.use(requireAuth, requireModule('CORE'))

institutionRouter.get('/', requirePermission('INSTITUTION_READ'), institutionController.get)
institutionRouter.put('/', requirePermission('INSTITUTION_UPDATE'), institutionController.update)
