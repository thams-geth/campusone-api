import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as notificationController from './notification.controller'

export const notificationsRouter = Router()

notificationsRouter.use(requireAuth, requireModule('CORE'), requirePermission('NOTIFICATION_READ'))

notificationsRouter.get('/', notificationController.list)
notificationsRouter.get('/unread-count', notificationController.unreadCount)
notificationsRouter.post('/read-all', notificationController.markAllRead)
notificationsRouter.post('/:id/read', notificationController.markRead)

notificationsRouter.get('/preferences', notificationController.listPreferences)
notificationsRouter.put('/preferences/:channel', notificationController.setPreference)
