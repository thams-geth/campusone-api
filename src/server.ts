import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { scheduleAnnouncementReminderScan } from './queue/notificationQueue'
import { startNotificationWorker } from './queue/notificationWorker'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`CampusOne API listening on port ${env.PORT} (${env.NODE_ENV})`)
})

// In-process worker + repeatable job — see notificationWorker.ts for
// why this doesn't run as a separate deployment at this scale. Not
// started under test (vitest imports createApp() directly via
// supertest, never server.ts, so this never runs in the test suite).
const notificationWorker = startNotificationWorker()
void scheduleAnnouncementReminderScan()

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`)
  server.close(() => {
    logger.info('Server closed')
    void notificationWorker.close().finally(() => process.exit(0))
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
