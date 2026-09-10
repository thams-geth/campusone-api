import dns from 'node:dns/promises'
import net from 'node:net'
import { ApiError } from './ApiError'

// Rough but effective — deliberately not exhaustive (e.g. doesn't
// unwrap IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1). Good
// enough to stop the obvious cases; note as a further-hardening item
// if webhooks ever become a serious attack surface.
const PRIVATE_IPV4_RANGES: [string, number][] = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
]

function ipv4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
}

function isPrivateIPv4(ip: string): boolean {
  const target = ipv4ToLong(ip)
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (ipv4ToLong(base) & mask) === (target & mask)
  })
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
}

function isPrivateAddress(address: string): boolean {
  return net.isIP(address) === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address)
}

/**
 * Rejects a webhook URL that could target internal infrastructure
 * (SSRF) — tenant-supplied URLs get POSTed to by this server, so this
 * is a real attack surface, not a hypothetical one. Call this at
 * registration AND immediately before every delivery attempt: DNS can
 * change between the two (rebinding), so a check only at registration
 * time isn't a real guarantee.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw ApiError.badRequest('Invalid URL.', { url: ['Must be a valid URL'] })
  }

  if (url.protocol !== 'https:') {
    throw ApiError.badRequest('Webhook URLs must use https.', { url: ['Must be https'] })
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw ApiError.badRequest('Webhook URLs cannot point to localhost.', { url: ['Not allowed'] })
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw ApiError.badRequest('Webhook URLs cannot point to a private IP address.', { url: ['Not allowed'] })
    }
    return
  }

  let resolved: { address: string }[]
  try {
    resolved = await dns.lookup(hostname, { all: true })
  } catch {
    throw ApiError.badRequest('Could not resolve the webhook URL host.', { url: ['DNS resolution failed'] })
  }
  if (resolved.some((r) => isPrivateAddress(r.address))) {
    throw ApiError.badRequest('Webhook URLs cannot resolve to a private IP address.', { url: ['Not allowed'] })
  }
}
