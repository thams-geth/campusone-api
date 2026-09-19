import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import ms from 'ms'
import type { User } from '@prisma/client'
import { env } from '../../config/env'
import { ApiError } from '../../utils/ApiError'
import { findPasswordResetTokenByHash, findRefreshTokenByHash, findUserByEmailForLogin, prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '../../utils/totp'
import { logActivity } from '../shared/activityLog'
import { dispatchNotification } from '../notifications/notification.service'
import type { AccessTokenPayload } from './token.types'

const SALT_ROUNDS = 12
const MAX_FAILED_ATTEMPTS = 5
// Client-side of the coin is UX only, matching the frontend's demo
// lockout; the actual defense against credential stuffing is the
// stricter rate limiter on the login route (see auth.routes.ts) plus
// whatever sits in front of this API in production.
const LOCKOUT_MS = 30_000
const REFRESH_TOKEN_BYTES = 48
const RECOVERY_CODE_COUNT = 10
const RESET_TOKEN_BYTES = 32
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

export interface AuthUserDto {
  id: string
  tenantId: string
  name: string
  email: string
  role: string
  isActive: boolean
  mfaEnabled: boolean
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: Date
}

export interface LoginOptions {
  mfaCode?: string
  ipAddress?: string
  userAgent?: string
}

export function toAuthUserDto(user: User, role: string): AuthUserDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role,
    isActive: user.isActive,
    mfaEnabled: user.mfaEnabled,
  }
}

/**
 * A user can hold more than one role (see the UserRole join model), but
 * nothing assigns more than one today — this resolves the first as the
 * "primary" role for JWTs/display. Must run inside a request context
 * scoped to the user's own tenant (RLS on Role/UserRole requires it).
 */
export async function getPrimaryRoleName(userId: string): Promise<string> {
  const userRole = await prisma.userRole.findFirst({ where: { userId }, include: { role: true } })
  if (!userRole) {
    throw ApiError.internal('User has no role assigned.')
  }
  return userRole.role.name
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function hashRecoveryCode(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function hashResetToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

async function issueTokenPair(user: User, role: string): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenantId, role })
  const rawRefreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
  const refreshTokenExpiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN))

  await prisma.refreshToken.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: hashRefreshToken(rawRefreshToken),
      expiresAt: refreshTokenExpiresAt,
    },
  })

  return { accessToken, refreshToken: rawRefreshToken, refreshTokenExpiresAt }
}

function invalidCredentials(): ApiError {
  // Same generic error whether the email doesn't exist, the password
  // is wrong, or the account is inactive — never reveal which.
  return ApiError.unauthorized('Invalid email or password.')
}

async function recordLoginHistory(tenantId: string, userId: string, success: boolean, options: LoginOptions) {
  await prisma.loginHistory.create({
    data: { tenantId, userId, success, ipAddress: options.ipAddress, userAgent: options.userAgent },
  })
}

/** Checks a TOTP code first, then falls back to a one-time recovery code — same field on the wire, either works. */
async function verifyMfaCode(userId: string, secret: string, code: string): Promise<boolean> {
  if (verifyTotp(secret, code)) return true

  const recoveryCode = await prisma.mfaRecoveryCode.findFirst({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
  })
  if (!recoveryCode) return false

  await prisma.mfaRecoveryCode.update({ where: { id: recoveryCode.id }, data: { usedAt: new Date() } })
  return true
}

export async function login(email: string, password: string, options: LoginOptions = {}): Promise<{ user: AuthUserDto } & TokenPair> {
  const record = await findUserByEmailForLogin(email)
  if (!record) {
    throw invalidCredentials()
  }

  // Placeholder role for this scope only: nothing inside it reads
  // req context's role (the Prisma extension only cares about
  // tenantId) — the real role is resolved below, once we're inside the
  // correct tenant context and can query UserRole under RLS.
  return requestContext.run({ tenantId: record.tenantId, userId: record.id, role: 'UNRESOLVED' }, async () => {
    const recordFailure = () => recordLoginHistory(record.tenantId, record.id, false, options)

    if (!record.isActive) {
      await recordFailure()
      throw invalidCredentials()
    }

    if (record.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
      await recordFailure()
      const secondsLeft = Math.ceil((record.lockedUntil.getTime() - Date.now()) / 1000)
      throw ApiError.tooManyRequests(`Too many failed attempts. Try again in ${secondsLeft}s.`)
    }

    const passwordValid = await bcrypt.compare(password, record.passwordHash)
    if (!passwordValid) {
      const nextAttempts = record.failedLoginAttempts + 1
      const lockingNow = nextAttempts >= MAX_FAILED_ATTEMPTS
      await prisma.user.update({
        where: { id: record.id },
        data: {
          failedLoginAttempts: lockingNow ? 0 : nextAttempts,
          lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      })
      await recordFailure()
      throw invalidCredentials()
    }

    if (record.mfaEnabled) {
      const mfaValid = options.mfaCode ? await verifyMfaCode(record.id, record.mfaSecret!, options.mfaCode) : false
      if (!mfaValid) {
        await recordFailure()
        throw options.mfaCode
          ? new ApiError('Invalid MFA code.', 401, 'MFA_INVALID')
          : new ApiError('MFA code required.', 401, 'MFA_REQUIRED')
      }
    }

    const roleName = await getPrimaryRoleName(record.id)

    const [updatedUser, tokens] = await Promise.all([
      prisma.user.update({ where: { id: record.id }, data: { failedLoginAttempts: 0, lockedUntil: null } }),
      issueTokenPair(record, roleName),
    ])
    await recordLoginHistory(record.tenantId, record.id, true, options)

    return { user: toAuthUserDto(updatedUser, roleName), ...tokens }
  })
}

export async function refresh(rawRefreshToken: string): Promise<TokenPair> {
  const invalid = () => ApiError.unauthorized('Session expired. Please sign in again.')

  const record = await findRefreshTokenByHash(hashRefreshToken(rawRefreshToken))
  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now() || !record.user.isActive) {
    throw invalid()
  }

  return requestContext.run({ tenantId: record.tenantId, userId: record.userId, role: 'UNRESOLVED' }, async () => {
    const roleName = await getPrimaryRoleName(record.userId)
    // Rotate: revoke the presented token and issue a fresh pair. If a
    // stolen-then-already-used token is presented again after this,
    // it's already revoked — worth alerting on later, not handled yet.
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })
    return issueTokenPair(record.user, roleName)
  })
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return

  const record = await findRefreshTokenByHash(hashRefreshToken(rawRefreshToken))
  if (!record || record.revokedAt) return

  await requestContext.run(
    { tenantId: record.tenantId, userId: record.userId, role: 'UNRESOLVED' },
    async () => {
      await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })
    },
  )
}

export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account is no longer active.')
  }
  const roleName = await getPrimaryRoleName(userId)
  return toAuthUserDto(user, roleName)
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS)
}

// ---- Password change / reset ----

/** The caller changing their own password — always runs inside an already-authenticated request context. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    throw new ApiError('Current password is incorrect.', 401, 'INVALID_CURRENT_PASSWORD')
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  // Changing a password logs the account out everywhere, the caller's
  // own current session included — a real "did this really happen"
  // moment should force a fresh login, not just the browser tab that
  // triggered it.
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  await logActivity('changed their password', { entity: 'User', entityId: userId, action: 'PASSWORD_CHANGE' })
}

/**
 * Starts a password reset. Never reveals whether the email exists —
 * always resolves the same way regardless. No live email delivery
 * exists anywhere in this codebase yet (see notification.service.ts's
 * own doc comment) — outside production, the raw token is handed back
 * directly in the response so the flow is actually completable end to
 * end; in production this must not leak, same reasoning as
 * errorHandler.ts never leaking a stack trace outside dev. A real
 * deployment needs a live EMAIL/SMS integration wired up before this
 * endpoint is genuinely usable by a locked-out user.
 */
export async function requestPasswordReset(email: string): Promise<{ resetToken?: string }> {
  const record = await findUserByEmailForLogin(email)
  if (!record || !record.isActive) {
    return {}
  }

  return requestContext.run({ tenantId: record.tenantId, userId: record.id, role: 'UNRESOLVED' }, async () => {
    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex')
    await prisma.passwordResetToken.create({
      data: {
        tenantId: record.tenantId,
        userId: record.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    })

    await dispatchNotification({
      tenantId: record.tenantId,
      userIds: [record.id],
      type: 'PASSWORD_RESET_REQUESTED',
      title: 'Password reset requested',
      body: "A password reset was requested for your account. If this wasn't you, no action is needed.",
    })

    return env.isProduction ? {} : { resetToken: rawToken }
  })
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const invalid = () => new ApiError('Invalid or expired reset token.', 400, 'INVALID_RESET_TOKEN')

  const record = await findPasswordResetTokenByHash(hashResetToken(rawToken))
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now() || !record.user.isActive) {
    throw invalid()
  }

  await requestContext.run({ tenantId: record.tenantId, userId: record.userId, role: 'UNRESOLVED' }, async () => {
    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    })
    await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
    // Same "log out everywhere" reasoning as changePassword — a reset
    // token being used at all means the previous password shouldn't be
    // trusted anywhere it's still logged in.
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await logActivity('reset their password', { entity: 'User', entityId: record.userId, action: 'PASSWORD_RESET' })
  })
}

// ---- MFA ----

/** Generates a new secret + recovery codes, but doesn't enable MFA yet — enableMfa verifies a code first, standard "scan then confirm" flow. Re-running setup replaces any previous secret/codes. */
export async function setupMfa(userId: string): Promise<{ secret: string; otpauthUri: string; recoveryCodes: string[] }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const secret = generateTotpSecret()

  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } })
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId } })

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => crypto.randomBytes(5).toString('hex'))
  await prisma.mfaRecoveryCode.createMany({
    data: recoveryCodes.map((code) => ({ tenantId: user.tenantId, userId, codeHash: hashRecoveryCode(code) })),
  })

  return { secret, otpauthUri: buildOtpauthUri(secret, user.email), recoveryCodes }
}

export async function enableMfa(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!user.mfaSecret) {
    throw ApiError.badRequest('Run MFA setup first.', { code: ['No pending setup'] })
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    throw ApiError.badRequest('Invalid code.', { code: ['Invalid'] })
  }
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } })
}

export async function disableMfa(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw ApiError.conflict('MFA is not enabled.', 'MFA_NOT_ENABLED')
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    throw ApiError.badRequest('Invalid code.', { code: ['Invalid'] })
  }
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } })
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId } })
}

// ---- Sessions & login history ----

export async function listSessions(userId: string) {
  return prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expiresAt: true },
  })
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } })
  if (!session || session.userId !== userId) {
    throw ApiError.notFound('Session not found')
  }
  if (session.revokedAt) return
  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
}

export async function listLoginHistory(userId: string) {
  return prisma.loginHistory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })
}
