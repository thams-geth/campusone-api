import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import ms from 'ms'
import type { User } from '@prisma/client'
import { env } from '../../config/env'
import { ApiError } from '../../utils/ApiError'
import { findRefreshTokenByHash, findUserByEmailForLogin, prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import type { AccessTokenPayload } from './token.types'

const SALT_ROUNDS = 12
const MAX_FAILED_ATTEMPTS = 5
// Client-side of the coin is UX only, matching the frontend's demo
// lockout; the actual defense against credential stuffing is the
// stricter rate limiter on the login route (see auth.routes.ts) plus
// whatever sits in front of this API in production.
const LOCKOUT_MS = 30_000
const REFRESH_TOKEN_BYTES = 48

export interface AuthUserDto {
  id: string
  tenantId: string
  name: string
  email: string
  role: User['role']
  isActive: boolean
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: Date
}

export function toAuthUserDto(user: User): AuthUserDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  }
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

async function issueTokenPair(user: User): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role })
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

export async function login(email: string, password: string): Promise<{ user: AuthUserDto } & TokenPair> {
  const record = await findUserByEmailForLogin(email)

  if (!record || !record.isActive) {
    throw invalidCredentials()
  }

  return requestContext.run({ tenantId: record.tenantId, userId: record.id, role: record.role }, async () => {
    if (record.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
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
      throw invalidCredentials()
    }

    const [updatedUser, tokens] = await Promise.all([
      prisma.user.update({ where: { id: record.id }, data: { failedLoginAttempts: 0, lockedUntil: null } }),
      issueTokenPair(record),
    ])

    return { user: toAuthUserDto(updatedUser), ...tokens }
  })
}

export async function refresh(rawRefreshToken: string): Promise<TokenPair> {
  const invalid = () => ApiError.unauthorized('Session expired. Please sign in again.')

  const record = await findRefreshTokenByHash(hashRefreshToken(rawRefreshToken))
  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now() || !record.user.isActive) {
    throw invalid()
  }

  return requestContext.run(
    { tenantId: record.tenantId, userId: record.userId, role: record.user.role },
    async () => {
      // Rotate: revoke the presented token and issue a fresh pair. If a
      // stolen-then-already-used token is presented again after this,
      // it's already revoked — worth alerting on later, not handled yet.
      await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })
      return issueTokenPair(record.user)
    },
  )
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return

  const record = await findRefreshTokenByHash(hashRefreshToken(rawRefreshToken))
  if (!record || record.revokedAt) return

  await requestContext.run(
    { tenantId: record.tenantId, userId: record.userId, role: record.user.role },
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
  return toAuthUserDto(user)
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS)
}
