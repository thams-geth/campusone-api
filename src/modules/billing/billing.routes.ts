import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as billingController from './billing.controller'

export const billingRouter = Router()

billingRouter.use(requireAuth, requireModule('CORE'))

billingRouter.get('/plans', requirePermission('BILLING_READ'), billingController.listPlans)

billingRouter.get('/subscription', requirePermission('BILLING_READ'), billingController.getSubscription)
billingRouter.put('/subscription', requirePermission('BILLING_MANAGE'), billingController.setSubscription)
billingRouter.post('/subscription/cancel', requirePermission('BILLING_MANAGE'), billingController.cancelSubscription)

billingRouter.get('/invoices', requirePermission('BILLING_READ'), billingController.listInvoices)
billingRouter.post('/invoices', requirePermission('BILLING_MANAGE'), billingController.createInvoice)
billingRouter.post('/invoices/:id/pay', requirePermission('BILLING_MANAGE'), billingController.payInvoice)

billingRouter.get('/usage', requirePermission('BILLING_READ'), billingController.getUsage)
