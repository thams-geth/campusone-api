import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import { dispatchNotification, resolveAudienceUserIds } from './notification.service'

// Remind for announcements expiring within the next 24h. A dedicated
// raw client (like prisma/seed.ts's own) since enumerating tenants has
// to happen before any single tenant's request context exists — Tenant
// has no RLS, so this is safe (see the RLS deferral note on Tenant's
// own model comment).
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000

export const rawPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })

async function remindForTenant(tenantId: string): Promise<number> {
  return requestContext.run({ tenantId, userId: 'system', role: 'SUPER_ADMIN' }, async () => {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS)

    const announcements = await prisma.announcement.findMany({
      where: { expiryAt: { gt: now, lte: windowEnd }, reminderSentAt: null },
    })

    for (const announcement of announcements) {
      const recipients = await resolveAudienceUserIds({
        audience: announcement.audience,
        departmentId: announcement.departmentId,
        programId: announcement.programId,
        batchId: announcement.batchId,
        sectionId: announcement.sectionId,
      })
      await dispatchNotification({
        tenantId,
        userIds: recipients,
        type: 'ANNOUNCEMENT_REMINDER',
        title: `Reminder: "${announcement.title}" expires soon`,
        body: announcement.content.length > 200 ? `${announcement.content.slice(0, 197)}...` : announcement.content,
        entity: 'Announcement',
        entityId: announcement.id,
      })
      await prisma.announcement.update({ where: { id: announcement.id }, data: { reminderSentAt: now } })
    }

    return announcements.length
  })
}

/**
 * Scans every tenant for announcements nearing expiry that haven't
 * been reminded about yet. Invoked by the BullMQ worker on its
 * repeatable schedule (src/queue/notificationWorker.ts) — also plain
 * callable directly, so tests exercise this logic without needing a
 * live queue/worker.
 */
export async function runAnnouncementReminderScan(): Promise<void> {
  const tenants = await rawPrisma.tenant.findMany({ select: { id: true } })

  for (const tenant of tenants) {
    try {
      const count = await remindForTenant(tenant.id)
      if (count > 0) {
        logger.info({ tenantId: tenant.id, count }, 'Sent announcement expiry reminders')
      }
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, 'Announcement reminder scan failed for tenant')
    }
  }
}
