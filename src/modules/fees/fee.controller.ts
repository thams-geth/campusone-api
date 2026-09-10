import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as feeService from './fee.service'
import {
  feeAdjustmentInputSchema,
  feeInvoiceInputSchema,
  feeStructureInputSchema,
  listFeeInvoicesQuerySchema,
  listFeeStructuresQuerySchema,
  paymentInputSchema,
  refundInputSchema,
} from './fee.schema'

export async function listStructures(req: Request, res: Response) {
  const query = listFeeStructuresQuerySchema.parse(req.query)
  res.json(await feeService.listFeeStructures(query))
}

export async function createStructure(req: Request, res: Response) {
  const input = feeStructureInputSchema.parse(req.body)
  res.status(201).json(await feeService.createFeeStructure(req.auth!.tenantId, input))
}

export async function removeStructure(req: Request, res: Response) {
  await feeService.deleteFeeStructure(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listInvoices(req: Request, res: Response) {
  const query = listFeeInvoicesQuerySchema.parse(req.query)
  res.json(await feeService.listInvoices(query))
}

export async function listMyInvoices(req: Request, res: Response) {
  res.json(await feeService.listMyInvoices(req.auth!.userId))
}

export async function getInvoice(req: Request, res: Response) {
  res.json(await feeService.getInvoice(requireParam(req, 'id')))
}

export async function createInvoice(req: Request, res: Response) {
  const input = feeInvoiceInputSchema.parse(req.body)
  res.status(201).json(await feeService.createInvoice(req.auth!.tenantId, input))
}

export async function addAdjustment(req: Request, res: Response) {
  const input = feeAdjustmentInputSchema.parse(req.body)
  res.json(await feeService.addAdjustment(requireParam(req, 'id'), req.auth!.userId, input))
}

export async function waiveInvoice(req: Request, res: Response) {
  res.json(await feeService.waiveInvoice(requireParam(req, 'id')))
}

export async function recordPayment(req: Request, res: Response) {
  const input = paymentInputSchema.parse(req.body)
  res.status(201).json(await feeService.recordPayment(requireParam(req, 'id'), req.auth!.userId, input))
}

export async function refundPayment(req: Request, res: Response) {
  const input = refundInputSchema.parse(req.body)
  res.status(201).json(await feeService.refundPayment(requireParam(req, 'id'), req.auth!.userId, input))
}
