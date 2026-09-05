/**
 * WASM Capability Sandbox — shared types.
 * Spec: docs/superpowers/specs/2026-09-04-wasm-capability-sandbox.md
 */

export type FsMode = 'read' | 'write'

export interface FsGrant {
  /** Allowlisted path prefixes. No wildcards, no '..' traversal. */
  paths: string[]
  mode: FsMode
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

export interface NetGrant {
  /** Allowlisted hostnames; subdomains are included. */
  domains: string[]
  methods: HttpMethod[]
}

export interface SecretsGrant {
  /** Named environment-variable-style keys. Never the whole environment. */
  keys: string[]
}

export interface SpendGrant {
  budgetToken: string
  capCents: number
  perActionCeilingCents: number
}

/** Default-deny grant set attached to a tool at promotion time. */
export interface CapabilityGrants {
  fs?: FsGrant
  net?: NetGrant
  secrets?: SecretsGrant
  spend?: SpendGrant
}

export interface SandboxLimits {
  wallClockMs: number
  memoryBytes?: number
  /** Runtime-specific fuel/instruction budget, if the runtime supports it. */
  fuel?: number
}

export type GrantCapability = 'fs' | 'net' | 'secrets' | 'spend'

export interface GrantUseRecord {
  capability: GrantCapability
  op: string
  target: string
  allowed: boolean
  reason?: string
}

export interface GrantDecision {
  allowed: boolean
  reason?: string
}

export interface ToolExecutionRequest {
  toolName: string
  code: string
  input: unknown
  grants: CapabilityGrants
  limits: SandboxLimits
}

export interface ToolExecutionResult {
  ok: boolean
  toolName: string
  value: unknown
  error?: string
  log: string[]
  grantUse: GrantUseRecord[]
  elapsedMs: number
}

export class SandboxGrantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SandboxGrantError'
  }
}
