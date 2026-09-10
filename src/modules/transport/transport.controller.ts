import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as transportService from './transport.service'
import {
  listTransportAllocationsQuerySchema,
  routeInputSchema,
  stopInputSchema,
  transportAllocationInputSchema,
  vehicleInputSchema,
} from './transport.schema'

export async function listVehicles(_req: Request, res: Response) {
  res.json(await transportService.listVehicles())
}

export async function createVehicle(req: Request, res: Response) {
  const input = vehicleInputSchema.parse(req.body)
  res.status(201).json(await transportService.createVehicle(req.auth!.tenantId, input))
}

export async function removeVehicle(req: Request, res: Response) {
  await transportService.deleteVehicle(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listRoutes(_req: Request, res: Response) {
  res.json(await transportService.listRoutes())
}

export async function createRoute(req: Request, res: Response) {
  const input = routeInputSchema.parse(req.body)
  res.status(201).json(await transportService.createRoute(req.auth!.tenantId, input))
}

export async function removeRoute(req: Request, res: Response) {
  await transportService.deleteRoute(requireParam(req, 'id'))
  res.status(204).end()
}

export async function addStop(req: Request, res: Response) {
  const input = stopInputSchema.parse(req.body)
  res.status(201).json(await transportService.addStop(req.auth!.tenantId, requireParam(req, 'id'), input))
}

export async function removeStop(req: Request, res: Response) {
  await transportService.deleteStop(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listAllocations(req: Request, res: Response) {
  const query = listTransportAllocationsQuerySchema.parse(req.query)
  res.json(await transportService.listAllocations(query))
}

export async function listMyAllocations(req: Request, res: Response) {
  res.json(await transportService.listMyAllocations(req.auth!.userId))
}

export async function createAllocation(req: Request, res: Response) {
  const input = transportAllocationInputSchema.parse(req.body)
  res.status(201).json(await transportService.createAllocation(req.auth!.tenantId, input))
}

export async function removeAllocation(req: Request, res: Response) {
  res.json(await transportService.removeAllocation(requireParam(req, 'id')))
}
