/**
 * Discovery Ledger — append-only, hash-chained insight records (Phase 9).
 *
 * Every insight links back to a provenance chain (series ids + manifest hash
 * of the scan that produced it) and to the previous record via its hash.
 * Tamper-evidence: rewriting any prior record breaks the chain.
 *
 * File-backed JSONL under data/trend-ledger.jsonl. Deterministic: the hash
 * chain is a pure function of record content, not wall-clock time.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface LedgerInsight {
  id: string;
  createdRun: string;
  hypothesisId: string;
  templateId: string;
  statement: string;
  confidence: number;
  provenanceRoot: string; // scan manifest hash
  prevInsightHash: string; // hash of the previous record (or genesis marker)
  hash: string; // sha256 over content, chained
  payload: Record<string, unknown>;
}

const LEDGER_FILE_DEFAULT = path.join(process.cwd(), 'data', 'trend-ledger.jsonl');
const GENESIS = '0'.repeat(64);

/** Path override for tests/isolated deployments (env TREND_LEDGER_FILE). */
export function ledgerFilePath(): string {
  return process.env.TREND_LEDGER_FILE || LEDGER_FILE_DEFAULT;
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(ledgerFilePath()), { recursive: true });
}

function hashRecord(r: Omit<LedgerInsight, 'hash'>): string {
  const canonical = JSON.stringify({
    id: r.id,
    createdRun: r.createdRun,
    hypothesisId: r.hypothesisId,
    templateId: r.templateId,
    statement: r.statement,
    confidence: r.confidence,
    provenanceRoot: r.provenanceRoot,
    prevInsightHash: r.prevInsightHash,
    payload: r.payload,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function readLedger(): LedgerInsight[] {
  const file = ledgerFilePath();
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as LedgerInsight);
  } catch {
    return [];
  }
}

/**
 * Append an insight, chaining to the previous record's hash. Returns the
 * persisted record. Rejects (returns null) if `prevHash` doesn't match the
 * actual tail — detects concurrent writers / tampering.
 */
export function appendInsight(input: {
  createdRun: string;
  hypothesisId: string;
  templateId: string;
  statement: string;
  confidence: number;
  provenanceRoot: string;
  payload: Record<string, unknown>;
}): LedgerInsight | null {
  const ledger = readLedger();
  const prevInsightHash = ledger.length ? ledger[ledger.length - 1].hash : GENESIS;
  const id = `ins_${crypto.randomBytes(8).toString('hex')}`;
  const rec: Omit<LedgerInsight, 'hash'> = { ...input, id, prevInsightHash };
  const hash = hashRecord(rec);
  const full: LedgerInsight = { ...rec, hash };
  ensureDir();
  fs.appendFileSync(ledgerFilePath(), JSON.stringify(full) + '\n', 'utf-8');
  return full;
}

/** Verify the whole chain is intact. Returns { valid, brokenAt? }. */
export function verifyLedgerChain(): { valid: boolean; length: number; brokenAt?: number } {
  const ledger = readLedger();
  if (ledger.length === 0) return { valid: true, length: 0 };
  let prev = GENESIS;
  for (let i = 0; i < ledger.length; i++) {
    const rec = ledger[i];
    if (rec.prevInsightHash !== prev) return { valid: false, length: ledger.length, brokenAt: i };
    const { hash: _h, ...content } = rec;
    const recomputed = hashRecord(content);
    if (recomputed !== rec.hash) return { valid: false, length: ledger.length, brokenAt: i };
    prev = rec.hash;
  }
  return { valid: true, length: ledger.length };
}

/** Read recent insights (newest last). */
export function recentInsights(limit = 50): LedgerInsight[] {
  return readLedger().slice(-limit);
}