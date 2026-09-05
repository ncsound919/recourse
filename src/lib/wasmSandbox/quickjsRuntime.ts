/**
 * QuickJS-in-WASM runtime adapter (experimental).
 *
 * Requires the `quickjs-emscripten` package (`npm i quickjs-emscripten`).
 * The specifier is resolved at runtime so builds stay green when the package
 * is absent — SandboxHost simply reports a load error until it is installed.
 *
 * Guest code convention: `code` is the body of a function invoked as
 * `function (input, host) { <code> }` where `input` is the JSON-decoded
 * request input and `host` exposes the grant-checked bridge.
 *
 * Sync-only bridge: async capabilities (promise-returning drivers) are
 * rejected at call time. Wire worker-backed drivers before enabling them.
 */
import type { HostBridge, SandboxRuntime } from './host'
import type { SandboxLimits } from './types'

const QUICKJS_SPECIFIER = 'quickjs-emscripten'

function sync<T>(value: T): T {
  if (value instanceof Promise) {
    throw new Error('async host capability used in QuickJS runtime (sync drivers required)')
  }
  return value
}

export class QuickJsRuntime implements SandboxRuntime {
  readonly name = 'quickjs-wasm'

  async evalCode(
    code: string,
    input: unknown,
    bridge: HostBridge,
    limits: SandboxLimits,
  ): Promise<{ ok: boolean; value: unknown; error?: string }> {
    const mod: any = await import(/* @vite-ignore */ QUICKJS_SPECIFIER)
    const getQuickJS = mod.getQuickJS ?? mod.default?.getQuickJS
    if (typeof getQuickJS !== 'function') {
      throw new Error('quickjs-emscripten is not installed or does not expose getQuickJS()')
    }
    const QuickJS = await getQuickJS()
    const vm: any = QuickJS.newContext()
    const startedAt = Date.now()
    const handles: Array<{ dispose?: () => void }> = []

    try {
      if (limits.memoryBytes) vm.runtime?.setMemoryLimit?.(limits.memoryBytes)
      const interrupt = () => Date.now() - startedAt > limits.wallClockMs
      vm.setInterruptHandler?.(interrupt)
      vm.runtime?.setInterruptHandler?.(interrupt)

      const host = vm.newObject()
      const expose = (name: string, fn: (...args: unknown[]) => unknown) => {
        const handle = vm.newFunction(name, (...argHandles: any[]) => {
          const args = argHandles.map((h: any) => vm.dump(h))
          const out = sync(fn(...args))
          if (out === undefined || out === null) return vm.undefined
          if (typeof out === 'number') return vm.newNumber(out)
          if (typeof out === 'object') return vm.newString(JSON.stringify(out))
          return vm.newString(String(out))
        })
        vm.setProp(host, name, handle)
        handles.push(handle)
      }

      expose('log', (message) => {
        bridge.log(String(message))
        return undefined
      })
      expose('readFile', (path) => bridge.readFile(String(path)))
      expose('writeFile', (path, data) => {
        sync(bridge.writeFile(String(path), String(data)))
        return undefined
      })
      expose('fetch', (url, method) =>
        bridge.fetch(String(url), method ? { method: String(method).toUpperCase() as never } : undefined),
      )
      expose('getSecret', (key) => bridge.getSecret(String(key)))
      expose('spend', (cents, description) => {
        sync(bridge.spend(Number(cents), String(description)))
        return undefined
      })

      const inputHandle = vm.newString(JSON.stringify(input ?? null))
      vm.setProp(vm.global, '__recourse_input', inputHandle)
      vm.setProp(vm.global, '__recourse_host', host)

      const wrapped = `(function (input, host) {\n${code}\n})(JSON.parse(globalThis.__recourse_input), globalThis.__recourse_host)`
      const result = vm.evalCode(wrapped)
      if (result.error) {
        const err = vm.dump(result.error)
        return {
          ok: false,
          value: undefined,
          error: `quickjs eval error: ${typeof err === 'string' ? err : JSON.stringify(err)}`,
        }
      }
      return { ok: true, value: vm.dump(vm.unwrapResult(result)) }
    } finally {
      for (const h of handles) {
        try {
          h.dispose?.()
        } catch {
          /* best effort */
        }
      }
      try {
        vm.dispose()
      } catch {
        /* best effort */
      }
    }
  }
}
