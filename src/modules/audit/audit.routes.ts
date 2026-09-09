import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as auditController from './audit.controller'

export const auditRouter = Router()

auditRouter.use(requireAuth, requireModule('CORE'), requirePermission('AUDIT_LOG_READ'))

auditRouter.get('/', auditController.list)
