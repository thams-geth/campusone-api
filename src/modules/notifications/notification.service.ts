import type { AnnouncementAudience, IntegrationProvider, NotificationChannel } from '@prisma/client'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import type { ListNotificationsQuery } from './notification.schema'

// The only non-IN_APP channels that can ever have anything to send —
// mirrors Milestone 4's Integrations list, which covers exactly these
// three providers for outbound notification delivery.
const CHANNEL_PROVIDER: Record<'EMAIL' | 'SMS' | 'PUSH', IntegrationProvider> = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'FIREBASE',
}

export interface DispatchNotificationInput {
  tenantId: string
  userIds: string[]
  type: string
  title: string
  body: string
  entity?: string
  entityId?: string
}

/**
 * Fans a notification out to every listed user. IN_APP is always real —
 * creating the Notification row IS the delivery. EMAIL/SMS/PUSH only
 * get attempted (and recorded FAILED, with a reason) if the tenant has
 * the mapped IntegrationConfig enabled AND the user hasn't opted out —
 * no live provider call exists anywhere in this codebase, matching the
 * Integrations module's own "config exists, sending is future work."
 */
export async function dispatchNotification(input: DispatchNotificationInput): Promise<void> {
  const recipientIds = Array.from(new Set(input.userIds))
  if (recipientIds.length === 0) return

  const [enabledIntegrations, preferences] = await Promise.all([
    prisma.integrationConfig.findMany({
      where: { tenantId: input.tenantId, provider: { in: Object.values(CHANNEL_PROVIDER) }, enabled: true },
    }),
    prisma.notificationPreference.findMany({
      where: { userId: { in: recipientIds }, channel: { in: ['EMAIL', 'SMS', 'PUSH'] } },
    }),
  ])
  const enabledProviders = new Set(enabledIntegrations.map((integration) => integration.provider))
  const optedOut = new Set(preferences.filter((pref) => !pref.enabled).map((pref) => `${pref.userId}:${pref.channel}`))

  for (const userId of recipientIds) {
    const notification = await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entity: input.entity,
        entityId: input.entityId,
      },
    })

    const deliveries: { channel: NotificationChannel; status: 'SENT' | 'FAILED'; failureReason?: string }[] = [
      { channel: 'IN_APP', status: 'SENT' },
    ]
    for (const [channel, provider] of Object.entries(CHANNEL_PROVIDER) as [NotificationChannel, IntegrationProvider][]) {
      if (!enabledProviders.has(provider)) continue
      if (optedOut.has(`${userId}:${channel}`)) continue
      deliveries.push({
        channel,
        status: 'FAILED',
        failureReason: `${provider} integration is config-only — no live send implemented yet.`,
      })
    }

    await prisma.notificationDelivery.createMany({
      data: deliveries.map((delivery) => ({ tenantId: input.tenantId, notificationId: notification.id, ...delivery })),
    })
  }
}

interface AudienceScope {
  audience: AnnouncementAudience
  departmentId?: string | null
  programId?: string | null
  batchId?: string | null
  sectionId?: string | null
}

/**
 * Resolves an Announcement's audience scope to concrete recipient user
 * ids — the inverse of getFeed's per-caller filter in
 * announcement.service.ts. Faculty are only ever scoped by department
 * (Faculty has no program/batch/section relation), so PROGRAM/BATCH/
 * SECTION audiences notify students only.
 */
export async function resolveAudienceUserIds(scope: AudienceScope): Promise<string[]> {
  const baseStudentWhere = { status: 'ACTIVE' as const, userId: { not: null } }
  const baseFacultyWhere = { status: 'ACTIVE' as const }

  const studentExtra =
    scope.audience === 'DEPARTMENT'
      ? { departmentId: scope.departmentId ?? undefined }
      : scope.audience === 'PROGRAM'
        ? { section: { batch: { programId: scope.programId ?? undefined } } }
        : scope.audience === 'BATCH'
          ? { section: { batchId: scope.batchId ?? undefined } }
          : scope.audience === 'SECTION'
            ? { sectionId: scope.sectionId ?? undefined }
            : {}

  // Faculty aren't tied to a program/batch/section — only department —
  // so PROGRAM/BATCH/SECTION audiences notify students only.
  const includeFaculty = scope.audience === 'COLLEGE' || scope.audience === 'DEPARTMENT'

  const [students, faculty] = await Promise.all([
    prisma.student.findMany({ where: { ...baseStudentWhere, ...studentExtra }, select: { userId: true } }),
    includeFaculty
      ? prisma.faculty.findMany({
          where: { ...baseFacultyWhere, ...(scope.audience === 'DEPARTMENT' ? { departmentId: scope.departmentId ?? undefined } : {}) },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ])

  return Array.from(new Set([...students.map((s) => s.userId!), ...faculty.map((f) => f.userId)]))
}

export async function listMyNotifications(userId: string, params: ListNotificationsQuery) {
  const { page, pageSize, unreadOnly } = params
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) }

  const [data, total] = await Promise.all([
    prisma.notification.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } })
}

export async function markRead(userId: string, id: string): Promise<void> {
  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== userId) {
    throw ApiError.notFound('Notification not found')
  }
  if (notification.readAt) return
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
}

const SETTABLE_CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'PUSH']

export async function listPreferences(userId: string) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } })
  const byChannel = new Map(rows.map((row) => [row.channel, row.enabled]))
  return SETTABLE_CHANNELS.map((channel) => ({ channel, enabled: byChannel.get(channel) ?? true }))
}

export async function setPreference(tenantId: string, userId: string, channel: NotificationChannel, enabled: boolean) {
  if (channel === 'IN_APP') {
    throw ApiError.badRequest('IN_APP notifications cannot be disabled.', { channel: ['Not settable'] })
  }
  const preference = await prisma.notificationPreference.upsert({
    where: { userId_channel: { userId, channel } },
    update: { enabled },
    create: { tenantId, userId, channel, enabled },
  })
  return { channel: preference.channel, enabled: preference.enabled }
}
