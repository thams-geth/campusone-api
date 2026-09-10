import IORedis from 'ioredis'
import { env } from '../config/env'

// maxRetriesPerRequest: null is required by BullMQ — it manages its
// own retry/backoff semantics on top of ioredis and needs commands to
// never give up on their own.
export const redisConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
