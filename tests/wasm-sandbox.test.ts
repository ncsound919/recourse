import { describe, expect, it } from 'vitest'
import { checkPath, checkSecret, checkSpend, checkUrl, validateGrants } from '../src/lib/wasmSandbox/grants'
import { SandboxHost } from '../src/lib/wasmSandbox/host'
import type { SandboxRuntime } from '../src/lib/wasmSandbox/host'
import type { CapabilityGrants, SandboxLimits, ToolExecutionRequest } from '../src/lib/wasmSandbox/types'

const limits: SandboxLimits = { wallClockMs: 1000 }

function request(overrides: Partial<ToolExecutionRequest> = {}): ToolExecutionRequest {
  return {
    toolName: 'test-tool',
    code: 'return 1',
    input: { a: 1 },
    grants: {},
    limits,
    ...overrides,
  }
}

describe('validateGrants', () => {
  it('accepts a well-formed grant set', () => {
    const grants: CapabilityGrants = {
      fs: { paths: ['data/corpus'], mode: 'read' },
      net: { domains: ['example.com'], methods: ['GET'] },
      secrets: { keys: ['API_KEY'] },
      spend: { budgetToken: 'wallet-1', capCents: 500, perActionCeilingCents: 100 },
    }
    expect(validateGrants(grants)).toEqual({ ok: true, grants })
  })

  it('rejects unknown keys, wildcards, traversal, and bad spend config', () => {
    expect(validateGrants({ console: {} as never }).ok).toBe(false)
    expect(validateGrants({ net: { domains: ['*'], methods: ['GET'] } as never }).ok).toBe(false)
    expect(validateGrants({ fs: { paths: ['../etc'], mode: 'read' } as never }).ok).toBe(false)
    expect(
      validateGrants({ spend: { budgetToken: 'w', capCents: 100, perActionCeilingCents: 200 } as never }).ok,
    ).toBe(false)
  })
})

describe('grant checks', () => {
  const grants: CapabilityGrants = {
    fs: { paths: ['data/corpus'], mode: 'read' },
    net: { domains: ['example.com'], methods: ['GET'] },
    secrets: { keys: ['API_KEY'] },
    spend: { budgetToken: 'w', capCents: 200, perActionCeilingCents: 100 },
  }

  it('checkPath allows under-prefix reads and denies everything else', () => {
    expect(checkPath(grants, 'data/corpus/notes.txt', 'read').allowed).toBe(true)
    expect(checkPath(grants, '/etc/passwd', 'read').allowed).toBe(false)
    expect(checkPath(grants, 'data/corpus/../secrets.env', 'read').allowed).toBe(false)
    expect(checkPath(grants, 'data/corpus/out.txt', 'write').allowed).toBe(false)
  })

  it('checkUrl allows granted domains, subdomains, and methods only', () => {
    expect(checkUrl(grants, 'https://example.com/x').allowed).toBe(true)
    expect(checkUrl(grants, 'https://api.example.com/x').allowed).toBe(true)
    expect(checkUrl(grants, 'https://evil.com/x').allowed).toBe(false)
    expect(checkUrl(grants, 'https://example.com/x', 'POST').allowed).toBe(false)
    expect(checkUrl(grants, 'file:///etc/passwd').allowed).toBe(false)
  })

  it('checkSecret and checkSpend enforce allowlists and caps', () => {
    expect(checkSecret(grants, 'API_KEY').allowed).toBe(true)
    expect(checkSecret(grants, 'OTHER_KEY').allowed).toBe(false)
    expect(checkSpend(grants, 50, 0).allowed).toBe(true)
    expect(checkSpend(grants, 150, 0).allowed).toBe(false)
    expect(checkSpend(grants, 100, 150).allowed).toBe(false)
  })
})

describe('SandboxHost', () => {
  it('denies ungranted capabilities and records the denial', async () => {
    const runtime: SandboxRuntime = {
      name: 'probe',
      async evalCode(_code, _input, bridge) {
        try {
          await bridge.readFile('/etc/passwd')
          return { ok: true, value: 'read' }
        } catch (e) {
          return { ok: false, value: undefined, error: e instanceof Error ? e.message : String(e) }
        }
      },
    }
    const host = new SandboxHost({ runtime, clock: () => 0 })
    const result = await host.execute(request())
    expect(result.ok).toBe(false)
    expect(result.error).toContain('denied')
    expect(result.grantUse).toHaveLength(1)
    expect(result.grantUse[0]).toMatchObject({ capability: 'fs', allowed: false })
  })

  it('allows granted reads, routes through the driver, and records use', async () => {
    const runtime: SandboxRuntime = {
      name: 'reader',
      async evalCode(_code, _input, bridge) {
        return { ok: true, value: await bridge.readFile('data/corpus/notes.txt') }
      },
    }
    const host = new SandboxHost({
      runtime,
      clock: () => 0,
      fsDriver: { read: async (p) => `content of ${p}` },
    })
    const result = await host.execute(
      request({ grants: { fs: { paths: ['data/corpus'], mode: 'read' } } }),
    )
    expect(result.ok).toBe(true)
    expect(result.value).toBe('content of data/corpus/notes.txt')
    expect(result.grantUse).toEqual([
      { capability: 'fs', op: 'read', target: 'data/corpus/notes.txt', allowed: true },
    ])
  })

  it('enforces spend ceilings and the total cap across a single execution', async () => {
    const runtime: SandboxRuntime = {
      name: 'spender',
      async evalCode(_code, _input, bridge) {
        const calls: string[] = []
        const attempt = async (label: string, cents: number) => {
          try {
            await bridge.spend(cents, label)
            calls.push(`${label}:ok`)
          } catch {
            calls.push(`${label}:denied`)
          }
        }
        await attempt('first', 50)
        await attempt('second', 150)
        await attempt('third', 100)
        await attempt('fourth', 50)
        return { ok: true, value: calls }
      },
    }
    const host = new SandboxHost({ runtime, clock: () => 0, spendSink: async () => undefined })
    const result = await host.execute(
      request({
        grants: { spend: { budgetToken: 'w', capCents: 200, perActionCeilingCents: 100 } },
      }),
    )
    expect(result.value).toEqual(['first:ok', 'second:denied', 'third:ok', 'fourth:denied'])
  })

  it('fails executions that exceed the wall-clock limit', async () => {
    let now = 0
    const host = new SandboxHost({
      runtime: { name: 'slow', async evalCode() { return { ok: true, value: 1 } } },
      clock: () => (now += 100),
    })
    const result = await host.execute(request({ limits: { wallClockMs: 50 } }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('wall clock limit exceeded')
  })

  it('is deterministic for identical requests with a stubbed clock', async () => {
    const runtime: SandboxRuntime = {
      name: 'echo',
      async evalCode(code, input) {
        return { ok: true, value: { code, input } }
      },
    }
    const host = new SandboxHost({ runtime, clock: () => 42 })
    const req = request({ grants: { fs: { paths: ['data'], mode: 'read' } } })
    const a = await host.execute(req)
    const b = await host.execute(req)
    expect(a).toEqual(b)
  })
})
