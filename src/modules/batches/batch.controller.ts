import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { batchInputSchema, listBatchesQuerySchema } from './batch.schema'
import * as batchService from './batch.service'

export async function list(req: Request, res: Response) {
  const query = listBatchesQuerySchema.parse(req.query)
  res.json(await batchService.listBatches(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await batchService.getBatch(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = batchInputSchema.parse(req.body)
  res.status(201).json(await batchService.createBatch(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = batchInputSchema.parse(req.body)
  res.json(await batchService.updateBatch(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await batchService.deleteBatch(requireParam(req, 'id'))
  res.status(204).end()
}
