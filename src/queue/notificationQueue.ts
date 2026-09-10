import { Queue } from 'bullmq'
import { redisConnection } from './connection'

export const NOTIFICATION_QUEUE_NAME = 'notification-reminders'
export const ANNOUNCEMENT_REMINDER_JOB = 'announcement-expiry-scan'

// The roadmap's own reasoning for Notifications specifically: "Use
// background jobs instead of doing every notification synchronously."
// This is the first real queue/processor in the codebase — Redis was
// running via docker-compose but unused until now. Immediate fan-out
// (announcement publish, class group messages) still happens inline in
// the request (same as webhooks' single inline fetch); this queue only
// carries the recurring expiry-reminder scan, which is a genuinely
// scheduled/background concern.
export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, { connection: redisConnection })

const SCAN_INTERVAL_MS = 15 * 60 * 1000

/**
 * Registers the repeatable reminder-scan job scheduler. Safe to call
 * on every server start — upsertJobScheduler replaces any existing
 * scheduler with this id rather than piling up duplicates.
 */
export async function scheduleAnnouncementReminderScan(): Promise<void> {
  await notificationQueue.upsertJobScheduler(ANNOUNCEMENT_REMINDER_JOB, { every: SCAN_INTERVAL_MS }, { name: ANNOUNCEMENT_REMINDER_JOB })
}
