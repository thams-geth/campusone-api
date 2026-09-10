import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as hostelService from './hostel.service'
import {
  hostelAllocationInputSchema,
  hostelInputSchema,
  hostelRoomInputSchema,
  listHostelAllocationsQuerySchema,
  listHostelRoomsQuerySchema,
} from './hostel.schema'

export async function listHostels(_req: Request, res: Response) {
  res.json(await hostelService.listHostels())
}

export async function createHostel(req: Request, res: Response) {
  const input = hostelInputSchema.parse(req.body)
  res.status(201).json(await hostelService.createHostel(req.auth!.tenantId, input))
}

export async function removeHostel(req: Request, res: Response) {
  await hostelService.deleteHostel(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listRooms(req: Request, res: Response) {
  const query = listHostelRoomsQuerySchema.parse(req.query)
  res.json(await hostelService.listHostelRooms(query))
}

export async function createRoom(req: Request, res: Response) {
  const input = hostelRoomInputSchema.parse(req.body)
  res.status(201).json(await hostelService.createHostelRoom(req.auth!.tenantId, input))
}

export async function removeRoom(req: Request, res: Response) {
  await hostelService.deleteHostelRoom(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listAllocations(req: Request, res: Response) {
  const query = listHostelAllocationsQuerySchema.parse(req.query)
  res.json(await hostelService.listAllocations(query))
}

export async function listMyAllocations(req: Request, res: Response) {
  res.json(await hostelService.listMyAllocations(req.auth!.userId))
}

export async function createAllocation(req: Request, res: Response) {
  const input = hostelAllocationInputSchema.parse(req.body)
  res.status(201).json(await hostelService.createAllocation(req.auth!.tenantId, input))
}

export async function vacateAllocation(req: Request, res: Response) {
  res.json(await hostelService.vacateAllocation(requireParam(req, 'id')))
}
