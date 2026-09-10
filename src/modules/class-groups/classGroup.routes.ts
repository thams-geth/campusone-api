import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as classGroupController from './classGroup.controller'

export const classGroupsRouter = Router()

classGroupsRouter.use(requireAuth, requireModule('CORE'))

classGroupsRouter.get(
  '/:sectionId/messages',
  requirePermission('CLASS_GROUP_READ', 'CLASS_GROUP_MANAGE'),
  classGroupController.listMessages,
)
classGroupsRouter.post(
  '/:sectionId/messages',
  requirePermission('CLASS_GROUP_POST', 'CLASS_GROUP_MANAGE'),
  classGroupController.postMessage,
)
