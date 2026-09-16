/**
 * Budgeted action wallet — the durable spend ledger and caps for autonomous
 * actions that cost real money (model calls, paid APIs, cloud runs).
 *
 * Every entry is hash-chained, so the balance is auditable and tampering breaks
 * the chain. A debit is refused when it would exceed the token's remaining
 * budget — the same default-deny discipline as the capability sandbox. This is
 * the enforcement layer behind the sandbox's `spend` grant (Plan 9): the grant
 * says *may* spend; the wallet says *how much is left*.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type WalletEntryKind = 'budget' | 'credit' | 'debit';

export interface WalletEntry {
  id: string;
  at: number;
  kind: WalletEntryKind;
  token: string;
  cents: number;
  description: string;
  prevHash: string;
  hash: string;
}

export interface TokenBalance {
  token: string;
  capCents: number;
  creditedCents: number;
  spentCents: number;
  remainingCents: number;
}

const GENESIS = '0'.repeat(64);

export function walletLedgerFile(): string {
  return process.env.WALLET_LEDGER_FILE || path.join(process.cwd(), 'data', 'wallet-ledger.jsonl');
}

function hashEntry(e: Omit<WalletEntry, 'hash'>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ id: e.id, at: e.at, kind: e.kind, token: e.token, cents: e.cents, description: e.description, prevHash: e.prevHash }))
    .digest('hex');
}

export function readWallet(file = walletLedgerFile()): WalletEntry[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as WalletEntry);
  } catch {
    return [];
  }
}

export function verifyWalletRecords(entries: WalletEntry[]): { valid: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].prevHash !== prev) return { valid: false, brokenAt: i };
    const { hash: _h, ...content } = entries[i];
    if (hashEntry(content) !== entries[i].hash) return { valid: false, brokenAt: i };
    prev = entries[i].hash;
  }
  return { valid: true };
}

/** Recompute per-token balances from the raw entries (pure). */
export function computeBalances(entries: WalletEntry[]): Map<string, TokenBalance> {
  const map = new Map<string, TokenBalance>();
  const get = (token: string): TokenBalance => {
    let b = map.get(token);
    if (!b) {
      b = { token, capCents: 0, creditedCents: 0, spentCents: 0, remainingCents: 0 };
      map.set(token, b);
    }
    return b;
  };
  for (const e of entries) {
    const b = get(e.token);
    if (e.kind === 'budget') b.capCents += Math.max(0, e.cents);
    else if (e.kind === 'credit') b.creditedCents += Math.max(0, e.cents);
    else b.spentCents += Math.max(0, e.cents);
    b.remainingCents = b.capCents + b.creditedCents - b.spentCents;
  }
  return map;
}

export interface Wallet {
  file(): string;
  entries(): WalletEntry[];
  balance(token: string): TokenBalance;
  balances(): TokenBalance[];
  /** Set/add to a token's cap. Returns the appended entry. */
  setBudget(token: string, capCents: number, description?: string, at?: number): WalletEntry;
  credit(token: string, cents: number, description?: string, at?: number): WalletEntry;
  /** Refused (throws) when it would exceed remaining budget or is non-positive. */
  debit(token: string, cents: number, description?: string, at?: number): WalletEntry;
  /** OK when the chain is intact; also returns recomputed balances. */
  reconcile(): { valid: boolean; brokenAt?: number; balances: TokenBalance[] };
}

export interface WalletError extends Error {
  code: 'insufficient' | 'invalid_amount';
}

function walletError(code: WalletError['code'], message: string): WalletError {
  const e = new Error(message) as WalletError;
  e.code = code;
  return e;
}

export function openWallet(file = walletLedgerFile()): Wallet {
  const append = (
    kind: WalletEntryKind,
    token: string,
    cents: number,
    description: string,
    at: number | undefined,
  ): WalletEntry => {
    const entries = readWallet(file);
    const prevHash = entries.length ? entries[entries.length - 1].hash : GENESIS;
    const base: Omit<WalletEntry, 'hash'> = {
      id: `w_${entries.length + 1}`,
      at: at ?? Date.now(),
      kind,
      token,
      cents,
      description,
      prevHash,
    };
    const entry: WalletEntry = { ...base, hash: hashEntry(base) };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
    return entry;
  };

  const balance = (token: string): TokenBalance => {
    return computeBalances(readWallet(file)).get(token) ?? { token, capCents: 0, creditedCents: 0, spentCents: 0, remainingCents: 0 };
  };

  return {
    file: () => file,
    entries: () => readWallet(file),
    balance,
    balances: () => Array.from(computeBalances(readWallet(file)).values()).sort((a, b) => a.token.localeCompare(b.token)),
    setBudget(token, capCents, description = 'set budget', at) {
      if (!Number.isInteger(capCents) || capCents < 0) throw walletError('invalid_amount', 'budget must be a non-negative integer of cents');
      if (!token) throw walletError('invalid_amount', 'token is required');
      return append('budget', token, capCents, description, at);
    },
    credit(token, cents, description = 'credit', at) {
      if (!Number.isInteger(cents) || cents <= 0) throw walletError('invalid_amount', 'credit must be a positive integer of cents');
      if (!token) throw walletError('invalid_amount', 'token is required');
      return append('credit', token, cents, description, at);
    },
    debit(token, cents, description = 'debit', at) {
      if (!Number.isInteger(cents) || cents <= 0) throw walletError('invalid_amount', 'debit must be a positive integer of cents');
      if (!token) throw walletError('invalid_amount', 'token is required');
      const b = balance(token);
      if (b.remainingCents < cents) {
        throw walletError('insufficient', `debit ${cents}c exceeds remaining ${b.remainingCents}c for budget "${token}"`);
      }
      return append('debit', token, cents, description, at);
    },
    reconcile() {
      const entries = readWallet(file);
      const v = verifyWalletRecords(entries);
      return { valid: v.valid, brokenAt: v.brokenAt, balances: Array.from(computeBalances(entries).values()) };
    },
  };
}

// ---------------------------------------------------------------------------
// Autopilot merge gating
// ---------------------------------------------------------------------------

export interface MergeGateDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Auto-merge is allowed only when the `merge` budget still has the required
 * reserve. A missing/exhausted budget blocks the merge — an autonomous action
 * that costs money must be funded first. Pure over a balance map.
 */
export function canAutoMerge(
  balances: Map<string, TokenBalance>,
  opts: { token?: string; requiredCents?: number } = {},
): MergeGateDecision {
  const token = opts.token ?? (process.env.RECOURSE_MERGE_BUDGET_TOKEN || 'merge');
  const required = opts.requiredCents ?? 0;
  const b = balances.get(token);
  if (!b || b.capCents === 0) {
    return { allowed: false, reason: `no "${token}" budget configured; auto-merge requires a funded budget` };
  }
  if (b.remainingCents < required) {
    return { allowed: false, reason: `"${token}" budget has ${b.remainingCents}c remaining; ${required}c required` };
  }
  return { allowed: true, reason: `"${token}" budget funded (${b.remainingCents}c remaining)` };
}
