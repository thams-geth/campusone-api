import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as notificationService from './notification.service'
import { listNotificationsQuerySchema, notificationChannelParamSchema, setPreferenceSchema } from './notification.schema'

export async function list(req: Request, res: Response) {
  const query = listNotificationsQuerySchema.parse(req.query)
  res.json(await notificationService.listMyNotifications(req.auth!.userId, query))
}

export async function unreadCount(req: Request, res: Response) {
  res.json({ count: await notificationService.getUnreadCount(req.auth!.userId) })
}

export async function markRead(req: Request, res: Response) {
  await notificationService.markRead(req.auth!.userId, requireParam(req, 'id'))
  res.status(204).end()
}

export async function markAllRead(req: Request, res: Response) {
  await notificationService.markAllRead(req.auth!.userId)
  res.status(204).end()
}

export async function listPreferences(req: Request, res: Response) {
  res.json(await notificationService.listPreferences(req.auth!.userId))
}

export async function setPreference(req: Request, res: Response) {
  const channel = notificationChannelParamSchema.parse(requireParam(req, 'channel'))
  const input = setPreferenceSchema.parse(req.body)
  res.json(await notificationService.setPreference(req.auth!.tenantId, req.auth!.userId, channel, input.enabled))
}
