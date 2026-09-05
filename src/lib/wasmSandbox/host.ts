/**
 * SandboxHost — routes every host capability exposed to guest code through
 * default-deny grant checks, records all grant use, and enforces wall-clock
 * limits. Runtimes (QuickJS, Pyodide, test fakes) plug in via SandboxRuntime.
 */
import {
  checkPath,
  checkSecret,
  checkSpend,
  checkUrl,
  validateGrants,
} from './grants'
import { SandboxGrantError } from './types'
import type {
  CapabilityGrants,
  GrantCapability,
  GrantDecision,
  GrantUseRecord,
  HttpMethod,
  SandboxLimits,
  ToolExecutionRequest,
  ToolExecutionResult,
} from './types'

export type MaybePromise<T> = T | Promise<T>

/** The capability surface guest code can see. All calls are grant-checked. */
export interface HostBridge {
  log(message: string): void
  readFile(path: string): MaybePromise<string>
  writeFile(path: string, data: string): MaybePromise<void>
  fetch(url: string, init?: { method?: HttpMethod; body?: string }): MaybePromise<{ status: number; body: string }>
  getSecret(key: string): MaybePromise<string>
  spend(cents: number, description: string): MaybePromise<void>
}

export interface SandboxRuntime {
  name: string
  evalCode(
    code: string,
    input: unknown,
    bridge: HostBridge,
    limits: SandboxLimits,
  ): Promise<{ ok: boolean; value: unknown; error?: string }>
}

export interface SandboxHostOptions {
  runtime: SandboxRuntime
  clock?: () => number
  onGrantUse?: (record: GrantUseRecord) => void
  secretsSource?: (key: string) => string | undefined
  fsDriver?: {
    read?(path: string): MaybePromise<string>
    write?(path: string, data: string): MaybePromise<void>
  }
  netDriver?: (
    url: string,
    init?: { method?: HttpMethod; body?: string },
  ) => MaybePromise<{ status: number; body: string }>
  spendSink?: (cents: number, description: string, budgetToken: string) => MaybePromise<void>
}

export class SandboxHost {
  private readonly runtime: SandboxRuntime
  private readonly clock: () => number
  private readonly onGrantUse?: (record: GrantUseRecord) => void
  private readonly opts: SandboxHostOptions

  constructor(opts: SandboxHostOptions) {
    this.opts = opts
    this.runtime = opts.runtime
    this.clock = opts.clock ?? (() => Date.now())
    this.onGrantUse = opts.onGrantUse
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const validation = validateGrants(request.grants)
    if (!validation.ok) {
      const reason = 'errors' in validation ? validation.errors.join('; ') : 'unknown grant error'
      return failure(request.toolName, `invalid grants: ${reason}`, [], [], 0)
    }
    const grants: CapabilityGrants = request.grants
    const log: string[] = []
    const grantUse: GrantUseRecord[] = []
    let spentCents = 0

    const record = (entry: GrantUseRecord) => {
      grantUse.push(entry)
      this.onGrantUse?.(entry)
    }

    const requireDecision = (
      capability: GrantCapability,
      op: string,
      target: string,
      decision: GrantDecision,
    ) => {
      record({ capability, op, target, allowed: decision.allowed, reason: decision.reason })
      if (!decision.allowed) {
        throw new SandboxGrantError(`${capability}.${op} "${target}" denied: ${decision.reason}`)
      }
    }

    const bridge: HostBridge = {
      log: (message) => {
        log.push(String(message))
      },
      readFile: (path) => {
        requireDecision('fs', 'read', path, checkPath(grants, path, 'read'))
        const read = this.opts.fsDriver?.read
        if (!read) throw new SandboxGrantError('fs read driver not configured on host')
        return read(path)
      },
      writeFile: (path, data) => {
        requireDecision('fs', 'write', path, checkPath(grants, path, 'write'))
        const write = this.opts.fsDriver?.write
        if (!write) throw new SandboxGrantError('fs write driver not configured on host')
        return write(path, data)
      },
      fetch: (url, init) => {
        const method = init?.method ?? 'GET'
        requireDecision('net', method, url, checkUrl(grants, url, method))
        if (!this.opts.netDriver) throw new SandboxGrantError('net driver not configured on host')
        return this.opts.netDriver(url, init)
      },
      getSecret: (key) => {
        requireDecision('secrets', 'read', key, checkSecret(grants, key))
        if (!this.opts.secretsSource) throw new SandboxGrantError('secrets source not configured on host')
        const value = this.opts.secretsSource(key)
        if (value === undefined) throw new SandboxGrantError(`secret "${key}" not present in source`)
        return value
      },
      spend: (cents, description) => {
        requireDecision('spend', 'spend', description, checkSpend(grants, cents, spentCents))
        if (!this.opts.spendSink) throw new SandboxGrantError('spend sink not configured on host')
        spentCents += cents
        return this.opts.spendSink(cents, description, grants.spend!.budgetToken)
      },
    }

    const startedAt = this.clock()
    let inner: { ok: boolean; value: unknown; error?: string }
    try {
      inner = await this.runtime.evalCode(request.code, request.input, bridge, request.limits)
    } catch (err) {
      const elapsedMs = this.clock() - startedAt
      return failure(
        request.toolName,
        err instanceof Error ? err.message : String(err),
        log,
        grantUse,
        elapsedMs,
      )
    }
    const elapsedMs = this.clock() - startedAt
    if (elapsedMs > request.limits.wallClockMs) {
      return failure(
        request.toolName,
        `wall clock limit exceeded: ${elapsedMs}ms > ${request.limits.wallClockMs}ms`,
        log,
        grantUse,
        elapsedMs,
      )
    }
    return {
      ok: inner.ok,
      toolName: request.toolName,
      value: inner.value,
      error: inner.error,
      log,
      grantUse,
      elapsedMs,
    }
  }
}

function failure(
  toolName: string,
  error: string,
  log: string[],
  grantUse: GrantUseRecord[],
  elapsedMs: number,
): ToolExecutionResult {
  return { ok: false, toolName, value: undefined, error, log, grantUse, elapsedMs }
}
