import type { IntegrationProvider } from '@prisma/client'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { UpsertIntegrationConfigInput } from './integration.schema'

export async function listIntegrations(tenantId: string) {
  return prisma.integrationConfig.findMany({ where: { tenantId }, orderBy: { provider: 'asc' } })
}

/** Config-only: flips a flag and stores settings. No code path here ever calls out to the provider. */
export async function upsertIntegration(tenantId: string, provider: IntegrationProvider, input: UpsertIntegrationConfigInput) {
  const config = await prisma.integrationConfig.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    update: { enabled: input.enabled, settings: input.settings ?? {} },
    create: { tenantId, provider, enabled: input.enabled, settings: input.settings ?? {} },
  })
  await logActivity(`${input.enabled ? 'enabled' : 'disabled'} the ${provider} integration`, {
    entity: 'IntegrationConfig',
    entityId: config.id,
    action: 'UPSERT',
  })
  return config
}
