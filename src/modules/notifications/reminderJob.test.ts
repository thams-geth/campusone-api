import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import { createTestStudentUser, createTestDepartment, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'
import { rawPrisma, runAnnouncementReminderScan } from './reminderJob'

const app = createApp()

describe('announcement reminder scan', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let authorUserId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    authorUserId = setup.user.id

    const department = await createTestDepartment(tenant.id)
    await createTestStudentUser(tenant.id, department.id)
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
    await rawPrisma.$disconnect()
  })

  // Prisma promises are lazy — the await must happen INSIDE the run()
  // callback or AsyncLocalStorage loses the context by the time it
  // actually executes (see src/prisma/client.ts).
  async function createAnnouncement(overrides: { expiryAt: Date | null; reminderSentAt?: Date | null }) {
    return requestContext.run({ tenantId: tenant.id, userId: authorUserId, role: 'SUPER_ADMIN' }, async () =>
      await prisma.announcement.create({
        data: {
          tenantId: tenant.id,
          title: 'Exam Hall Ticket Download',
          content: 'Download your hall ticket before the deadline.',
          authorUserId,
          audience: 'COLLEGE',
          publishAt: new Date(Date.now() - 60_000),
          expiryAt: overrides.expiryAt,
          reminderSentAt: overrides.reminderSentAt ?? null,
        },
      }),
    )
  }

  async function getAnnouncement(id: string) {
    return requestContext.run({ tenantId: tenant.id, userId: authorUserId, role: 'SUPER_ADMIN' }, async () =>
      await prisma.announcement.findUniqueOrThrow({ where: { id } }),
    )
  }

  async function findReminderNotifications(entityId: string) {
    return requestContext.run({ tenantId: tenant.id, userId: authorUserId, role: 'SUPER_ADMIN' }, async () =>
      await prisma.notification.findMany({ where: { type: 'ANNOUNCEMENT_REMINDER', entityId } }),
    )
  }

  it('sends a reminder for an announcement expiring within the window, and marks it reminded', async () => {
    const announcement = await createAnnouncement({ expiryAt: new Date(Date.now() + 2 * 60 * 60 * 1000) })

    await runAnnouncementReminderScan()

    const updated = await getAnnouncement(announcement.id)
    expect(updated.reminderSentAt).not.toBeNull()

    const notifications = await findReminderNotifications(announcement.id)
    expect(notifications.length).toBeGreaterThanOrEqual(1)
  })

  it('does not re-notify an announcement that already had its reminder sent', async () => {
    const announcement = await createAnnouncement({
      expiryAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      reminderSentAt: new Date(),
    })

    await runAnnouncementReminderScan()

    const notifications = await findReminderNotifications(announcement.id)
    expect(notifications).toHaveLength(0)
  })

  it('ignores an announcement expiring outside the reminder window', async () => {
    const announcement = await createAnnouncement({ expiryAt: new Date(Date.now() + 48 * 60 * 60 * 1000) })

    await runAnnouncementReminderScan()

    const updated = await getAnnouncement(announcement.id)
    expect(updated.reminderSentAt).toBeNull()
  })
})
