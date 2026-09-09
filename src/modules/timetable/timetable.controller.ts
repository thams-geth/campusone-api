import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { listTimetableQuerySchema, timetableEntryInputSchema } from './timetable.schema'
import * as timetableService from './timetable.service'

export async function list(req: Request, res: Response) {
  const query = listTimetableQuerySchema.parse(req.query)
  res.json(await timetableService.listTimetableEntries(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await timetableService.getTimetableEntry(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = timetableEntryInputSchema.parse(req.body)
  res.status(201).json(await timetableService.createTimetableEntry(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = timetableEntryInputSchema.parse(req.body)
  res.json(await timetableService.updateTimetableEntry(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await timetableService.deleteTimetableEntry(requireParam(req, 'id'))
  res.status(204).end()
}
