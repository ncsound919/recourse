/**
 * Grant validation and default-deny capability checks.
 * Every host capability the sandbox exposes routes through these checks.
 */
import type {
  CapabilityGrants,
  FsGrant,
  FsMode,
  GrantDecision,
  HttpMethod,
  NetGrant,
  SecretsGrant,
  SpendGrant,
} from './types'

const FS_MODES: readonly FsMode[] = ['read', 'write']
const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
const SECRET_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const GRANT_KEYS = ['fs', 'net', 'secrets', 'spend'] as const

export type GrantValidation =
  | { ok: true; grants: CapabilityGrants }
  | { ok: false; errors: string[] }

export function validateGrants(raw: unknown): GrantValidation {
  const errors: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['grants must be an object'] }
  }
  const g = raw as Record<string, unknown>

  for (const key of Object.keys(g)) {
    if (!(GRANT_KEYS as readonly string[]).includes(key)) {
      errors.push(`unknown grant key "${key}"`)
    }
  }

  if (g.fs !== undefined) {
    const fs = g.fs as Partial<FsGrant>
    if (typeof fs !== 'object' || fs === null) {
      errors.push('fs grant must be an object')
    } else {
      if (!Array.isArray(fs.paths) || fs.paths.length === 0) {
        errors.push('fs.paths must be a non-empty array')
      } else {
        for (const p of fs.paths) {
          if (typeof p !== 'string' || p.length === 0) {
            errors.push('fs.paths entries must be non-empty strings')
            break
          }
          if (p === '*' || p.includes('..')) {
            errors.push(`fs.paths entry "${p}" must not contain wildcards or traversal`)
            break
          }
        }
      }
      if (!FS_MODES.includes(fs.mode as FsMode)) {
        errors.push('fs.mode must be "read" or "write"')
      }
    }
  }

  if (g.net !== undefined) {
    const net = g.net as Partial<NetGrant>
    if (typeof net !== 'object' || net === null) {
      errors.push('net grant must be an object')
    } else {
      if (!Array.isArray(net.domains) || net.domains.length === 0) {
        errors.push('net.domains must be a non-empty array')
      } else {
        for (const d of net.domains) {
          if (typeof d !== 'string' || !HOSTNAME_PATTERN.test(d)) {
            errors.push(`net.domains entry "${String(d)}" is not a valid hostname`)
            break
          }
        }
      }
      if (
        !Array.isArray(net.methods) ||
        net.methods.length === 0 ||
        net.methods.some((m) => !HTTP_METHODS.includes(m as HttpMethod))
      ) {
        errors.push(`net.methods must be a non-empty subset of ${HTTP_METHODS.join(', ')}`)
      }
    }
  }

  if (g.secrets !== undefined) {
    const secrets = g.secrets as Partial<SecretsGrant>
    if (typeof secrets !== 'object' || secrets === null) {
      errors.push('secrets grant must be an object')
    } else if (
      !Array.isArray(secrets.keys) ||
      secrets.keys.length === 0 ||
      secrets.keys.some((k) => typeof k !== 'string' || !SECRET_KEY_PATTERN.test(k))
    ) {
      errors.push('secrets.keys must be a non-empty array of environment-variable-style names')
    }
  }

  if (g.spend !== undefined) {
    const spend = g.spend as Partial<SpendGrant>
    if (typeof spend !== 'object' || spend === null) {
      errors.push('spend grant must be an object')
    } else {
      if (typeof spend.budgetToken !== 'string' || spend.budgetToken.length === 0) {
        errors.push('spend.budgetToken must be a non-empty string')
      }
      if (!Number.isInteger(spend.capCents) || (spend.capCents as number) <= 0) {
        errors.push('spend.capCents must be a positive integer')
      }
      if (!Number.isInteger(spend.perActionCeilingCents) || (spend.perActionCeilingCents as number) <= 0) {
        errors.push('spend.perActionCeilingCents must be a positive integer')
      }
      if (
        typeof spend.capCents === 'number' &&
        typeof spend.perActionCeilingCents === 'number' &&
        spend.perActionCeilingCents > spend.capCents
      ) {
        errors.push('spend.perActionCeilingCents must not exceed spend.capCents')
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, grants: raw as CapabilityGrants }
}

/** Canonicalize a path; returns null for invalid or root-escaping paths. */
export function normalizePath(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0) return null
  const parts = path.split('/').filter((s) => s.length > 0)
  const out: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(part)
  }
  return '/' + out.join('/')
}

export function checkPath(grants: CapabilityGrants, path: string, op: FsMode): GrantDecision {
  const fs = grants.fs
  if (!fs) return { allowed: false, reason: 'no fs grant' }
  const target = normalizePath(path)
  if (target === null) return { allowed: false, reason: 'invalid path' }
  const underAllowed = fs.paths.some((allowed) => {
    const prefix = normalizePath(allowed)
    if (prefix === null) return false
    if (target === prefix) return true
    return target.startsWith(prefix === '/' ? '/' : prefix + '/')
  })
  if (!underAllowed) return { allowed: false, reason: `path "${target}" is outside fs grant allowlist` }
  if (op === 'write' && fs.mode === 'read') return { allowed: false, reason: 'fs grant is read-only' }
  return { allowed: true }
}

export function checkUrl(grants: CapabilityGrants, rawUrl: string, method: HttpMethod = 'GET'): GrantDecision {
  const net = grants.net
  if (!net) return { allowed: false, reason: 'no net grant' }
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { allowed: false, reason: 'invalid url' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { allowed: false, reason: `protocol "${url.protocol}" not allowed` }
  }
  const host = url.hostname.toLowerCase()
  const domainOk = net.domains.some((d) => {
    const domain = d.toLowerCase()
    return host === domain || host.endsWith('.' + domain)
  })
  if (!domainOk) return { allowed: false, reason: `host "${host}" is outside net grant allowlist` }
  if (!net.methods.includes(method)) return { allowed: false, reason: `method ${method} not granted` }
  return { allowed: true }
}

export function checkSecret(grants: CapabilityGrants, key: string): GrantDecision {
  if (!grants.secrets) return { allowed: false, reason: 'no secrets grant' }
  if (!grants.secrets.keys.includes(key)) return { allowed: false, reason: `secret "${key}" not granted` }
  return { allowed: true }
}

export function checkSpend(grants: CapabilityGrants, cents: number, spentSoFarCents = 0): GrantDecision {
  const spend = grants.spend
  if (!spend) return { allowed: false, reason: 'no spend grant' }
  if (!Number.isInteger(cents) || cents <= 0) {
    return { allowed: false, reason: 'spend amount must be a positive integer of cents' }
  }
  if (cents > spend.perActionCeilingCents) {
    return { allowed: false, reason: `amount ${cents}c exceeds per-action ceiling ${spend.perActionCeilingCents}c` }
  }
  if (spentSoFarCents + cents > spend.capCents) {
    return { allowed: false, reason: `spend would exceed cap ${spend.capCents}c` }
  }
  return { allowed: true }
}
