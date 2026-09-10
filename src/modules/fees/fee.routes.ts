import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as feeController from './fee.controller'

export const feesRouter = Router()

feesRouter.use(requireAuth, requireModule('FINANCE'))

feesRouter.get('/structures', requirePermission('FEE_READ'), feeController.listStructures)
feesRouter.post('/structures', requirePermission('FEE_MANAGE'), feeController.createStructure)
feesRouter.delete('/structures/:id', requirePermission('FEE_MANAGE'), feeController.removeStructure)

feesRouter.get('/invoices', requirePermission('FEE_MANAGE'), feeController.listInvoices)
feesRouter.get('/invoices/mine', requirePermission('FEE_READ'), feeController.listMyInvoices)
feesRouter.get('/invoices/:id', requirePermission('FEE_READ'), feeController.getInvoice)
feesRouter.post('/invoices', requirePermission('FEE_MANAGE'), feeController.createInvoice)
feesRouter.post('/invoices/:id/adjustments', requirePermission('FEE_MANAGE'), feeController.addAdjustment)
feesRouter.post('/invoices/:id/waive', requirePermission('FEE_MANAGE'), feeController.waiveInvoice)
feesRouter.post('/invoices/:id/payments', requirePermission('PAYMENT_RECORD'), feeController.recordPayment)
feesRouter.post('/payments/:id/refund', requirePermission('PAYMENT_REFUND'), feeController.refundPayment)
