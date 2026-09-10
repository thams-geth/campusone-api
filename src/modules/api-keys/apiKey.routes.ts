import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as apiKeyController from './apiKey.controller'

export const apiKeysRouter = Router()

apiKeysRouter.use(requireAuth, requireModule('CORE'))

apiKeysRouter.get('/', requirePermission('API_KEY_READ'), apiKeyController.listApiKeys)
apiKeysRouter.post('/', requirePermission('API_KEY_MANAGE'), apiKeyController.createApiKey)
apiKeysRouter.delete('/:id', requirePermission('API_KEY_MANAGE'), apiKeyController.revokeApiKey)
