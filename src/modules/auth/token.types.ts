import type { Role } from '@prisma/client'

export interface AccessTokenPayload {
  sub: string
  tenantId: string
  role: Role
}
