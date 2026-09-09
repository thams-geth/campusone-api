import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as announcementService from './announcement.service'
import { announcementInputSchema, listAnnouncementsQuerySchema } from './announcement.schema'

export async function list(req: Request, res: Response) {
  const query = listAnnouncementsQuerySchema.parse(req.query)
  res.json(await announcementService.listAnnouncements(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await announcementService.getAnnouncement(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = announcementInputSchema.parse(req.body)
  res.status(201).json(await announcementService.createAnnouncement(req.auth!.tenantId, req.auth!.userId, input))
}

export async function update(req: Request, res: Response) {
  const input = announcementInputSchema.parse(req.body)
  res.json(await announcementService.updateAnnouncement(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await announcementService.deleteAnnouncement(requireParam(req, 'id'))
  res.status(204).end()
}

export async function feed(req: Request, res: Response) {
  res.json(await announcementService.getFeed(req.auth!.userId))
}
