import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as webhookController from './webhook.controller'

export const webhooksRouter = Router()

webhooksRouter.use(requireAuth, requireModule('CORE'))

webhooksRouter.get('/', requirePermission('WEBHOOK_READ'), webhookController.listEndpoints)
webhooksRouter.post('/', requirePermission('WEBHOOK_MANAGE'), webhookController.createEndpoint)
webhooksRouter.patch('/:id', requirePermission('WEBHOOK_MANAGE'), webhookController.updateEndpoint)
webhooksRouter.delete('/:id', requirePermission('WEBHOOK_MANAGE'), webhookController.deleteEndpoint)
webhooksRouter.get('/:id/deliveries', requirePermission('WEBHOOK_READ'), webhookController.listDeliveries)
