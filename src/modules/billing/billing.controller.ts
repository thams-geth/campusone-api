import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as billingService from './billing.service'
import { createInvoiceSchema, listInvoicesQuerySchema, setSubscriptionSchema } from './billing.schema'

export async function listPlans(_req: Request, res: Response) {
  res.json(await billingService.listPlans())
}

export async function getSubscription(req: Request, res: Response) {
  res.json(await billingService.getSubscription(req.auth!.tenantId))
}

export async function setSubscription(req: Request, res: Response) {
  const input = setSubscriptionSchema.parse(req.body)
  res.status(200).json(await billingService.setSubscription(req.auth!.tenantId, input))
}

export async function cancelSubscription(req: Request, res: Response) {
  res.json(await billingService.cancelSubscription(req.auth!.tenantId))
}

export async function listInvoices(req: Request, res: Response) {
  const query = listInvoicesQuerySchema.parse(req.query)
  res.json(await billingService.listInvoices(req.auth!.tenantId, query))
}

export async function createInvoice(req: Request, res: Response) {
  const input = createInvoiceSchema.parse(req.body)
  res.status(201).json(await billingService.createInvoice(req.auth!.tenantId, input))
}

export async function payInvoice(req: Request, res: Response) {
  res.json(await billingService.payInvoice(requireParam(req, 'id')))
}

export async function getUsage(req: Request, res: Response) {
  res.json(await billingService.getUsage(req.auth!.tenantId))
}
