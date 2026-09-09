import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { listProgramsQuerySchema, programInputSchema } from './program.schema'
import * as programService from './program.service'

export async function list(req: Request, res: Response) {
  const query = listProgramsQuerySchema.parse(req.query)
  res.json(await programService.listPrograms(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await programService.getProgram(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = programInputSchema.parse(req.body)
  res.status(201).json(await programService.createProgram(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = programInputSchema.parse(req.body)
  res.json(await programService.updateProgram(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await programService.deleteProgram(requireParam(req, 'id'))
  res.status(204).end()
}
