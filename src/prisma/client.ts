import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type ApiKey, type PasswordResetToken, type RefreshToken, type User } from '@prisma/client'
import { env } from '../config/env'
import { getRequestContext } from './tenantContext'

// APP_DATABASE_URL, not DATABASE_URL: the running API must connect as a
// plain, non-superuser role for RLS to mean anything (see
// docker/init-app-role.sql). DATABASE_URL's role is a superuser used
// only by the Prisma CLI for migrations.
const adapter = new PrismaPg(env.APP_DATABASE_URL)

/**
 * The raw, unextended client. Only used inside this module (for the
 * login bootstrap lookup below) and for the tenant-scoped extension's
 * own internals — application code should import `prisma`, not this.
 */
const basePrisma = new PrismaClient({ adapter })

/**
 * Tenant-scoped Prisma client. Every query runs `SET LOCAL
 * app.current_tenant = <tenantId>` in the same transaction as the query
 * itself, which the RLS policies on every tenant table check — see the
 * migration SQL for why FORCE ROW LEVEL SECURITY makes this the actual
 * enforcement boundary, not just a convenience filter.
 *
 * Throws if used outside `requestContext.run(...)` (see
 * middleware/tenantContext.ts) rather than silently querying
 * unscoped — a missing context should be a loud bug, not a leak.
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const ctx = getRequestContext()
        if (!ctx) {
          throw new Error(
            'Attempted a tenant-scoped Prisma query with no request context set. ' +
              'Use requestContext.run(...) (via the auth middleware) before querying, ' +
              'or use a documented bootstrap helper for the rare pre-auth case.',
          )
        }

        const [, result] = await basePrisma.$transaction([
          basePrisma.$executeRaw`SELECT set_config('app.current_tenant', ${ctx.tenantId}, TRUE)`,
          query(args),
        ])
        return result
      },
    },
  },
})

/**
 * The ONE deliberate, narrow exception to tenant scoping: login needs
 * to find a user by email before we know their tenant (email is
 * globally unique specifically so one login form can resolve it). This
 * sets a distinct `app.tenant_bootstrap` flag that only the User
 * table's RLS policy checks — it does not disable RLS generally, and a
 * missing app.current_tenant anywhere else still fails closed.
 *
 * Do not add new callers of this without updating the RLS policy
 * comment in the migration that documents this exception.
 */
export async function findUserByEmailForLogin(email: string): Promise<User | null> {
  const [, , user] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.tenant_bootstrap', 'true', TRUE)`,
    basePrisma.$executeRaw`SELECT set_config('app.current_tenant', '', TRUE)`,
    basePrisma.user.findUnique({ where: { email } }),
  ])
  return user
}

/**
 * The other deliberate bootstrap exception: refresh and logout receive
 * only an opaque refresh token (via cookie), not a tenant id, so the
 * token lookup by hash must run before the tenant is known too. See the
 * RLS policy comment on RefreshToken for the same fail-closed guarantee.
 */
export async function findRefreshTokenByHash(
  tokenHash: string,
): Promise<(RefreshToken & { user: User }) | null> {
  const [, , token] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.tenant_bootstrap', 'true', TRUE)`,
    basePrisma.$executeRaw`SELECT set_config('app.current_tenant', '', TRUE)`,
    basePrisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } }),
  ])
  return token
}

/**
 * A third bootstrap exception: authenticating via API key (see
 * requireAuth.ts) presents only an opaque key, not a tenant id, so the
 * lookup by hash must run before the tenant is known too — same
 * fail-closed guarantee as the two above.
 */
export async function findApiKeyByHash(keyHash: string): Promise<(ApiKey & { createdBy: User }) | null> {
  const [, , key] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.tenant_bootstrap', 'true', TRUE)`,
    basePrisma.$executeRaw`SELECT set_config('app.current_tenant', '', TRUE)`,
    basePrisma.apiKey.findUnique({ where: { keyHash }, include: { createdBy: true } }),
  ])
  return key
}

/**
 * A fourth bootstrap exception: reset-password receives only an opaque
 * token (emailed to the user), not a tenant id, so the lookup by hash
 * must run before the tenant is known too — same fail-closed guarantee
 * as the three above.
 */
export async function findPasswordResetTokenByHash(
  tokenHash: string,
): Promise<(PasswordResetToken & { user: User }) | null> {
  const [, , token] = await basePrisma.$transaction([
    basePrisma.$executeRaw`SELECT set_config('app.tenant_bootstrap', 'true', TRUE)`,
    basePrisma.$executeRaw`SELECT set_config('app.current_tenant', '', TRUE)`,
    basePrisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } }),
  ])
  return token
}
