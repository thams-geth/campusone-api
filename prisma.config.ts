import 'dotenv/config'
import { defineConfig } from '@prisma/config'

// Used only by the Prisma CLI (migrate/studio/introspect). The running
// API never reads this — it builds its own PrismaClient with a driver
// adapter (see src/prisma/client.ts) per Prisma 7's config model.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
