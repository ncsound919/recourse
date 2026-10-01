/**
 * Real host drivers for the capability sandbox.
 *
 * The SandboxHost enforces the grant allowlist *before* a driver is ever
 * reached; these drivers add the second, physical containment layer (e.g. the
 * fs driver refuses to leave its on-disk root even if a grant were miswritten).
 *
 * Nothing here decides policy — policy lives in grants.ts / host.ts.
 */
import fs from 'fs'
import path from 'path'
import { normalizePath } from './grants'
import type { SandboxHostOptions } from './host'
import type { HttpMethod } from './types'

export interface NodeDriverOptions {
  /** On-disk root that fs grants are confined to. Defaults to <cwd>/.selfhosted/sandbox-fs. */
  fsRoot?: string
  /** Sink for recorded spend; defaults to an in-memory ledger. */
  spendSink?: (cents: number, description: string, budgetToken: string) => void
  /** Secret source; defaults to process.env. */
  secretsSource?: (key: string) => string | undefined
}

export interface SpendRecord {
  cents: number
  description: string
  budgetToken: string
  at: number
}

export interface NodeDrivers {
  fsRoot: string
  fsDriver: NonNullable<SandboxHostOptions['fsDriver']>
  netDriver: NonNullable<SandboxHostOptions['netDriver']>
  secretsSource: NonNullable<SandboxHostOptions['secretsSource']>
  spendSink: NonNullable<SandboxHostOptions['spendSink']>
  spendLedger: SpendRecord[]
}

export function defaultSandboxFsRoot(): string {
  if (process.env.SELFHOST_SANDBOX_FS_ROOT) return path.resolve(process.env.SELFHOST_SANDBOX_FS_ROOT)
  return path.join(process.cwd(), '.selfhosted', 'sandbox-fs')
}

/** Resolve a grant-relative path inside `root`, refusing any escape. */
export function resolveInsideRoot(root: string, requested: string): string {
  const normalized = normalizePath(requested)
  if (normalized === null) throw new Error(`invalid sandbox path "${requested}"`)
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, '.' + normalized)
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
    throw new Error(`sandbox path "${requested}" escapes the fs root`)
  }
  return abs
}

const NET_TIMEOUT_MS = 15_000
const NET_MAX_BODY_BYTES = 2 * 1024 * 1024

/** Read at most `max` bytes of a response body (the rest is cancelled). */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (total + value.byteLength > max) {
        chunks.push(value.subarray(0, max - total))
        total = max
        await reader.cancel().catch(() => {})
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total).toString('utf-8')
}

export function createNodeDrivers(opts: NodeDriverOptions = {}): NodeDrivers {
  const fsRoot = path.resolve(opts.fsRoot ?? defaultSandboxFsRoot())
  fs.mkdirSync(fsRoot, { recursive: true })
  const spendLedger: SpendRecord[] = []

  const fsDriver = {
    read(p: string): string {
      return fs.readFileSync(resolveInsideRoot(fsRoot, p), 'utf-8')
    },
    write(p: string, data: string): void {
      const abs = resolveInsideRoot(fsRoot, p)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, data, 'utf-8')
    },
  }

  // Physical containment for granted network calls:
  //  - redirect:'manual' — the grant allowlist is checked against the REQUESTED
  //    URL only; following redirects let an allowlisted host bounce the call to
  //    any other host (cloud metadata, this server's own /api, the LAN).
  //    A 3xx is returned to the sandboxed code as-is, never followed.
  //  - a hard timeout, and a cap on the response body read into the host heap.
  const netDriver = async (
    url: string,
    init?: { method?: HttpMethod; body?: string },
  ): Promise<{ status: number; body: string }> => {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      body: init?.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
    })
    return { status: res.status, body: await readCapped(res, NET_MAX_BODY_BYTES) }
  }

  const secretsSource =
    opts.secretsSource ?? ((key: string): string | undefined => process.env[key])

  const spendSink =
    opts.spendSink ??
    ((cents: number, description: string, budgetToken: string): void => {
      spendLedger.push({ cents, description, budgetToken, at: Date.now() })
    })

  return { fsRoot, fsDriver, netDriver, secretsSource, spendSink, spendLedger }
}
