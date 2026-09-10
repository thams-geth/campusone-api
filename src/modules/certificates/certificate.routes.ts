import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as certificateController from './certificate.controller'

export const certificatesRouter = Router()

certificatesRouter.use(requireAuth, requireModule('CORE'))

certificatesRouter.get('/types', requirePermission('CERTIFICATE_READ'), certificateController.listTypes)
certificatesRouter.post('/types', requirePermission('CERTIFICATE_ISSUE'), certificateController.createType)
certificatesRouter.delete('/types/:id', requirePermission('CERTIFICATE_ISSUE'), certificateController.removeType)

certificatesRouter.post('/requests', requirePermission('CERTIFICATE_REQUEST'), certificateController.createRequest)
certificatesRouter.get('/requests', requirePermission('CERTIFICATE_ISSUE'), certificateController.listRequests)
certificatesRouter.get('/requests/mine', requirePermission('CERTIFICATE_READ'), certificateController.listMyRequests)
certificatesRouter.post('/requests/:id/issue', requirePermission('CERTIFICATE_ISSUE'), certificateController.issueRequest)
certificatesRouter.post('/requests/:id/reject', requirePermission('CERTIFICATE_ISSUE'), certificateController.rejectRequest)

certificatesRouter.get('/verify/:code', requirePermission('CERTIFICATE_READ'), certificateController.verify)
