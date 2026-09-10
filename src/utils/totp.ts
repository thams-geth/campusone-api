import crypto from 'node:crypto'

/**
 * A self-contained TOTP implementation (RFC 6238, HMAC-SHA1, 6 digits,
 * 30s step) — no new dependency; Node's built-in crypto is enough.
 * Base32 (RFC 4648) is what authenticator apps expect for the secret.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8)
  // Counter fits in 32 bits for centuries at a 30s step — the high
  // 4 bytes are always zero, but HOTP's spec is an 8-byte counter.
  counterBuffer.writeUInt32BE(0, 0)
  counterBuffer.writeUInt32BE(counter, 4)

  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (binCode % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

export function generateTotp(base32Secret: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / STEP_SECONDS)
  return hotp(base32Decode(base32Secret), counter)
}

/** Allows one step of drift either side (±30s) to tolerate clock skew between client and server. */
export function verifyTotp(base32Secret: string, code: string, timestampMs = Date.now()): boolean {
  const counter = Math.floor(timestampMs / 1000 / STEP_SECONDS)
  const secretBuffer = base32Decode(base32Secret)
  for (let drift = -1; drift <= 1; drift++) {
    if (hotp(secretBuffer, counter + drift) === code) return true
  }
  return false
}

export function buildOtpauthUri(base32Secret: string, accountEmail: string, issuer = 'CampusOne'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`)
  return `otpauth://totp/${label}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}
