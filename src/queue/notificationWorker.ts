import { Worker } from 'bullmq'
import { logger } from '../config/logger'
import { runAnnouncementReminderScan } from '../modules/notifications/reminderJob'
import { redisConnection } from './connection'
import { ANNOUNCEMENT_REMINDER_JOB, NOTIFICATION_QUEUE_NAME } from './notificationQueue'

/** Runs in-process alongside the API server (see server.ts) — one process, one worker, no separate deployment. Fine at this scale; a real horizontal-scale deployment would run this as its own process. */
export function startNotificationWorker(): Worker {
  const worker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      if (job.name === ANNOUNCEMENT_REMINDER_JOB) {
        await runAnnouncementReminderScan()
      }
    },
    { connection: redisConnection },
  )

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name }, 'Notification worker job failed')
  })

  return worker
}
