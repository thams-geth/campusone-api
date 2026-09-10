import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as activityService from './activity.service'
import { activityInputSchema, listActivitiesQuerySchema } from './activity.schema'

export async function list(req: Request, res: Response) {
  const query = listActivitiesQuerySchema.parse(req.query)
  res.json(await activityService.listActivities(query))
}

export async function listMine(req: Request, res: Response) {
  res.json(await activityService.listMyActivities(req.auth!.userId))
}

export async function getById(req: Request, res: Response) {
  res.json(await activityService.getActivity(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = activityInputSchema.parse(req.body)
  res.status(201).json(await activityService.createActivity(req.auth!.tenantId, req.auth!.userId, input))
}

export async function update(req: Request, res: Response) {
  const input = activityInputSchema.parse(req.body)
  res.json(await activityService.updateActivity(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await activityService.deleteActivity(requireParam(req, 'id'))
  res.status(204).end()
}
