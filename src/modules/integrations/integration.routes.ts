import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as integrationController from './integration.controller'

export const integrationsRouter = Router()

integrationsRouter.use(requireAuth, requireModule('CORE'))

integrationsRouter.get('/', requirePermission('INTEGRATION_READ'), integrationController.listIntegrations)
integrationsRouter.put('/:provider', requirePermission('INTEGRATION_MANAGE'), integrationController.upsertIntegration)
