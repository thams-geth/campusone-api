import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { periodSlotInputSchema } from './periodSlot.schema'
import * as periodSlotService from './periodSlot.service'

export async function list(_req: Request, res: Response) {
  res.json(await periodSlotService.listPeriodSlots())
}

export async function create(req: Request, res: Response) {
  const input = periodSlotInputSchema.parse(req.body)
  res.status(201).json(await periodSlotService.createPeriodSlot(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = periodSlotInputSchema.parse(req.body)
  res.json(await periodSlotService.updatePeriodSlot(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await periodSlotService.deletePeriodSlot(requireParam(req, 'id'))
  res.status(204).end()
}
