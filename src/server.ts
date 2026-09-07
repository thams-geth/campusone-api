import { createApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`CampusOne API listening on port ${env.PORT} (${env.NODE_ENV})`)
})

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`)
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
