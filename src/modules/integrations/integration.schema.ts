import { z } from 'zod'
import { IntegrationProvider } from '@prisma/client'

export const upsertIntegrationConfigSchema = z.object({
  enabled: z.boolean(),
  // Plain JSON, not encrypted — a real limitation, not an oversight
  // (production would need a KMS-backed secret store). No live call
  // ever reads this; it's config-only until a real integration exists.
  settings: z.record(z.string(), z.unknown()).optional(),
})
export type UpsertIntegrationConfigInput = z.infer<typeof upsertIntegrationConfigSchema>

export const integrationProviderParamSchema = z.nativeEnum(IntegrationProvider)
