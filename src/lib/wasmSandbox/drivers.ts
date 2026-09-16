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

  const netDriver = async (
    url: string,
    init?: { method?: HttpMethod; body?: string },
  ): Promise<{ status: number; body: string }> => {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      body: init?.body,
    })
    return { status: res.status, body: await res.text() }
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
