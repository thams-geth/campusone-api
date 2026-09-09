import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { listRoomsQuerySchema, roomInputSchema } from './room.schema'
import * as roomService from './room.service'

export async function list(req: Request, res: Response) {
  const query = listRoomsQuerySchema.parse(req.query)
  res.json(await roomService.listRooms(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await roomService.getRoom(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = roomInputSchema.parse(req.body)
  res.status(201).json(await roomService.createRoom(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = roomInputSchema.parse(req.body)
  res.json(await roomService.updateRoom(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await roomService.deleteRoom(requireParam(req, 'id'))
  res.status(204).end()
}
