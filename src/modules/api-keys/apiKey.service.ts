import crypto from 'node:crypto'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { CreateApiKeyInput } from './apiKey.schema'

const KEY_PREFIX = 'cok'
const KEY_BYTES = 32
// Shown alongside the key's name in list views so an admin can tell
// keys apart without ever seeing the secret again after creation.
const DISPLAY_PREFIX_LENGTH = 12

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}

function generateRawKey(): string {
  return `${KEY_PREFIX}_${crypto.randomBytes(KEY_BYTES).toString('hex')}`
}

export async function listApiKeys(tenantId: string) {
  return prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  })
}

/** Returns the raw key exactly once — only its hash is ever stored, matching refresh tokens. */
export async function createApiKey(tenantId: string, createdByUserId: string, input: CreateApiKeyInput) {
  const rawKey = generateRawKey()

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId,
      name: input.name,
      keyHash: hashApiKey(rawKey),
      keyPrefix: rawKey.slice(0, DISPLAY_PREFIX_LENGTH),
      createdByUserId,
    },
  })
  await logActivity(`created API key "${input.name}"`, { entity: 'ApiKey', entityId: apiKey.id, action: 'CREATE' })

  return { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, createdAt: apiKey.createdAt, key: rawKey }
}

export async function revokeApiKey(tenantId: string, id: string) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id } })
  if (!apiKey || apiKey.tenantId !== tenantId) {
    throw ApiError.notFound('API key not found')
  }
  if (apiKey.revokedAt) return apiKey

  const revoked = await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
  await logActivity(`revoked API key "${apiKey.name}"`, { entity: 'ApiKey', entityId: id, action: 'REVOKE' })
  return revoked
}
