/**
 * QuickJS-in-WASM runtime adapter.
 *
 * Requires the `quickjs-emscripten` package (`npm i quickjs-emscripten`). The
 * specifier is resolved at runtime so builds stay green when the package is
 * absent — SandboxHost simply reports a load error until it is installed.
 *
 * Guest program convention: `code` is a **self-contained script** (no imports)
 * that defines `globalThis.__recourse_dispatch = function (input) { ... }` and
 * `globalThis.__recourse_host` is provided by the host. The script runs once
 * per tool; every later call to `evalCode` with the same tool identity invokes
 * the already-defined dispatcher in the *same* context, so stateful tools keep
 * their state (the previous design — a fresh context per call — could not).
 *
 * Sync-only bridge: async capabilities (promise-returning drivers) are
 * rejected at call time. Wire worker-backed drivers before enabling them.
 */
import crypto from 'crypto'
import type { HostBridge, SandboxExecutionContext, SandboxRuntime } from './host'
import type { SandboxLimits } from './types'

const QUICKJS_SPECIFIER = 'quickjs-emscripten'
const DEFAULT_MEMORY_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_CONTEXTS = 32

interface ContextEntry {
  key: string
  runtime: any
  vm: any
  hostHandle: any
  ready: boolean
  bridge: HostBridge | null
  deadline: number
}

export interface QuickJsRuntimeOptions {
  /** Max live guest contexts kept before LRU eviction. */
  maxContexts?: number
  /** Default per-context memory cap when a request does not set one. */
  memoryBytes?: number
  clock?: () => number
}

function syncHost<T>(value: T): T {
  if (value instanceof Promise) {
    throw new Error('async host capability used in QuickJS runtime (sync drivers required)')
  }
  return value
}

function dumpError(vm: any, result: any): string | null {
  if (!result || !result.error) return null
  let dumped: unknown
  try {
    dumped = vm.dump(result.error)
  } catch {
    dumped = 'unknown error'
  }
  try {
    result.error.dispose?.()
  } catch {
    /* best effort */
  }
  if (typeof dumped === 'string') return dumped
  try {
    return JSON.stringify(dumped)
  } catch {
    return String(dumped)
  }
}

export class QuickJsRuntime implements SandboxRuntime {
  readonly name = 'quickjs-wasm'
  private modulePromise: Promise<any> | null = null
  private readonly contexts = new Map<string, ContextEntry>()
  private readonly maxContexts: number
  private readonly memoryBytes: number
  private readonly clock: () => number

  constructor(opts: QuickJsRuntimeOptions = {}) {
    this.maxContexts = Math.max(1, opts.maxContexts ?? DEFAULT_MAX_CONTEXTS)
    this.memoryBytes = opts.memoryBytes ?? DEFAULT_MEMORY_BYTES
    this.clock = opts.clock ?? (() => Date.now())
  }

  /** Number of live cached guest contexts (diagnostics/tests). */
  get liveContexts(): number {
    return this.contexts.size
  }

  /** True when the runtime is live for a given tool+program (diagnostics). */
  hasContext(toolName: string, code: string): boolean {
    return this.contexts.has(this.keyFor(code, { toolName }))
  }

  private keyFor(code: string, ctx?: SandboxExecutionContext): string {
    const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16)
    return `${ctx?.toolName ?? 'anonymous'}@${hash}`
  }

  private async loadModule(): Promise<any> {
    if (!this.modulePromise) {
      this.modulePromise = (async () => {
        const mod: any = await import(/* @vite-ignore */ QUICKJS_SPECIFIER)
        const getQuickJS = mod.getQuickJS ?? mod.default?.getQuickJS
        if (typeof getQuickJS !== 'function') {
          throw new Error('quickjs-emscripten is not installed or does not expose getQuickJS()')
        }
        return getQuickJS()
      })()
      // A failed load should not poison every future attempt.
      this.modulePromise.catch(() => {
        this.modulePromise = null
      })
    }
    return this.modulePromise
  }

  reset(): void {
    for (const key of Array.from(this.contexts.keys())) this.dropContext(key)
  }

  private evictIfNeeded(): void {
    while (this.contexts.size >= this.maxContexts) {
      const oldest = this.contexts.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.dropContext(oldest)
    }
  }

  private dropContext(key: string): void {
    const entry = this.contexts.get(key)
    if (!entry) return
    this.contexts.delete(key)
    try {
      entry.hostHandle?.dispose?.()
    } catch {
      /* best effort */
    }
    try {
      entry.vm?.dispose?.()
    } catch {
      /* best effort */
    }
    try {
      entry.runtime?.dispose?.()
    } catch {
      /* best effort */
    }
  }

  private installHost(entry: ContextEntry): void {
    const vm = entry.vm
    const expose = (name: string, impl: (...args: unknown[]) => unknown) => {
      const handle = vm.newFunction(name, (...argHandles: any[]) => {
        const args = argHandles.map((h: any) => vm.dump(h))
        const out = syncHost(impl(...args))
        if (out === undefined || out === null) return vm.undefined
        if (typeof out === 'number') return vm.newNumber(out)
        if (typeof out === 'boolean') return vm.newNumber(out ? 1 : 0)
        if (typeof out === 'object') return vm.newString(JSON.stringify(out))
        return vm.newString(String(out))
      })
      vm.setProp(entry.hostHandle, name, handle)
      try {
        handle.dispose?.()
      } catch {
        /* best effort */
      }
    }

    expose('log', (message) => {
      entry.bridge?.log(String(message))
      return undefined
    })
    expose('readFile', (path) => syncHost(entry.bridge!.readFile(String(path))))
    expose('writeFile', (path, data) => {
      syncHost(entry.bridge!.writeFile(String(path), String(data)))
      return undefined
    })
    expose('fetch', (url, method) =>
      syncHost(entry.bridge!.fetch(String(url), method ? { method: String(method).toUpperCase() as never } : undefined)),
    )
    expose('getSecret', (key) => syncHost(entry.bridge!.getSecret(String(key))))
    expose('spend', (cents, description) => {
      syncHost(entry.bridge!.spend(Number(cents), String(description)))
      return undefined
    })
  }

  private createContext(module: any, limits: SandboxLimits): ContextEntry {
    const runtime = module.newRuntime()
    runtime.setMemoryLimit(limits.memoryBytes ?? this.memoryBytes)
    const entry: ContextEntry = {
      key: '',
      runtime,
      vm: null,
      hostHandle: null,
      ready: false,
      bridge: null,
      deadline: 0,
    }
    runtime.setInterruptHandler(() => entry.deadline > 0 && this.clock() > entry.deadline)
    const vm = runtime.newContext()
    entry.vm = vm
    entry.hostHandle = vm.newObject()
    this.installHost(entry)
    vm.setProp(vm.global, '__recourse_host', entry.hostHandle)
    return entry
  }

  async evalCode(
    code: string,
    input: unknown,
    bridge: HostBridge,
    limits: SandboxLimits,
    ctx?: SandboxExecutionContext,
  ): Promise<{ ok: boolean; value: unknown; error?: string }> {
    const module: any = await this.loadModule()
    const key = this.keyFor(code, ctx)
    let entry = this.contexts.get(key)
    if (!entry) {
      this.evictIfNeeded()
      entry = this.createContext(module, limits)
      entry.key = key
      this.contexts.set(key, entry)
    } else {
      entry.runtime.setMemoryLimit(limits.memoryBytes ?? this.memoryBytes)
    }

    entry.bridge = bridge
    entry.deadline = this.clock() + Math.max(1, limits.wallClockMs)
    const vm = entry.vm

    try {
      if (!entry.ready) {
        const setup = vm.evalCode(code, 'recourse_guest.js')
        const setupError = dumpError(vm, setup)
        if (setupError) {
          this.dropContext(key)
          return { ok: false, value: undefined, error: `guest setup error: ${setupError}` }
        }
        setup.value?.dispose?.()
        entry.ready = true
      }

      const inputHandle = vm.newString(JSON.stringify(input ?? null))
      vm.setProp(vm.global, '__recourse_input', inputHandle)
      inputHandle.dispose()

      const call = vm.evalCode(
        'globalThis.__recourse_dispatch(JSON.parse(globalThis.__recourse_input))',
      )
      const callError = dumpError(vm, call)
      if (callError) {
        const timedOut = /interrupt/i.test(callError)
        // An interrupted context may be left in an inconsistent state — drop it.
        if (timedOut) this.dropContext(key)
        return {
          ok: false,
          value: undefined,
          error: timedOut ? `interrupted: ${callError}` : `guest runtime error: ${callError}`,
        }
      }
      const valueHandle = vm.unwrapResult(call)
      const value = vm.dump(valueHandle)
      valueHandle.dispose?.()
      return { ok: true, value }
    } catch (err) {
      this.dropContext(key)
      throw err
    } finally {
      if (entry) {
        entry.bridge = null
        entry.deadline = 0
      }
    }
  }
}
