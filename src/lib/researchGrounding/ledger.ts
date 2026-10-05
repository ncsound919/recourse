/**
 * ledger.ts — durable, re-verifiable record of what grounded each tool.
 *
 * ## Why a chain and not just a field on the manifest
 *
 * Two reasons, both about being able to check a claim later:
 *
 * 1. **A manifest field is mutable.** `SelfHostedManifestEntry.grounding` would be
 *    rewritten by the next scaffold that touched the tool, with nothing recording
 *    that it had been. An append-only ledger means the grounding a tool was
 *    *actually built from* is still on record after the entry is edited.
 * 2. **"Was this grounded?" is a question with a falsifiable answer.** With a
 *    chain, `verifyGroundingRecords` can re-derive every hash and detect an edit
 *    anywhere in the history — including one made to the file directly.
 *
 * ## Deliberately not the global provenance chain
 *
 * `server.ts`'s `provenanceEvents` is a 3000-entry ring buffer that evicts
 * history (`server.ts:2004`), so it is wrong as primary storage: old evidence
 * would lose its chain anchor and become unverifiable. This mirrors
 * `benchmarkLedger.ts` instead — append-only JSONL, whitelisted field hash, a pure
 * verifier, and `withSyncFileLock` around every append.
 */

import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { withSyncFileLock } from '../fileLock.js';
import { canonicalize } from '../federation/canonical.js';
import type { GroundingBundle } from './types';

/** One tool's grounding, recorded once at materialization time. */
export interface GroundingRecord {
  /** The forge spec or tool name this evidence was gathered for. */
  id: string;
  at: number;
  /** The query actually sent, so the search is reproducible. */
  query: string;
  /** Bundle content hash. Detects drift when the same spec is forged again. */
  bundleHash: string;
  /** Ids + trust levels only. The spans stay out of the ledger on purpose:
   *  they are third-party text and would make this file grow without bound. */
  sources: Array<{ id: string; provider: string; trust: string; url: string }>;
  /** True when some configured source did not answer. */
  degraded: boolean;
  /** Why, in one line per reason. */
  degradedReasons: string[];
  /** Promoted tool name, when this record is about a materialized tool. */
  tool?: string;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

export function groundingLedgerFile(): string {
  return process.env.GROUNDING_LEDGER_FILE || path.join(process.cwd(), 'data', 'grounding-ledger.jsonl');
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * Whitelisted fields, deliberately.
 *
 * Hashing the whole object would mean any future field addition invalidates every
 * historical record. Naming the covered fields means the chain verifies across
 * refactors and says exactly what it attests to.
 */
function hashRecord(r: Omit<GroundingRecord, 'hash'>): string {
  return sha256Hex(
    canonicalize({
      id: r.id,
      at: r.at,
      query: r.query,
      bundleHash: r.bundleHash,
      sources: r.sources,
      degraded: r.degraded,
      degradedReasons: r.degradedReasons,
      tool: r.tool ?? null,
      prevHash: r.prevHash,
    }),
  );
}

/**
 * Read the ledger, tolerating a torn final line.
 *
 * An interrupted `appendFileSync` can leave a partial line. Dropping the whole
 * file was the previous behaviour, and it was the dangerous one: an empty ledger
 * verifies as `{valid: true}`, the next append roots a fresh chain at GENESIS,
 * and every record written before the tear becomes unreachable — while the
 * status route still reported the record as intact and verifiable.
 *
 * So an unparseable FINAL line is skipped and reported by `truncatedTail`;
 * an unparseable line anywhere earlier means corruption, and the whole read
 * fails loudly rather than silently forking.
 */
export interface LedgerRead {
  readonly records: GroundingRecord[];
  /** A final line that did not parse, dropped because it is torn. */
  readonly truncatedTail: boolean;
}

export function readGroundingLedgerWithTail(file = groundingLedgerFile()): LedgerRead {
  let raw: string;
  try {
    if (!fs.existsSync(file)) return { records: [], truncatedTail: false };
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return { records: [], truncatedTail: false };
  }
  const lines = raw.split('\n');
  // A trailing newline yields a final empty element; drop only that.
  if (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return { records: [], truncatedTail: false };

  const records: GroundingRecord[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as GroundingRecord);
    } catch (error) {
      if (i === lines.length - 1) {
        // Torn tail: the append never completed. Everything before it is intact.
        return { records, truncatedTail: true };
      }
      // Corruption in the middle. Do not silently continue from a wrong tail.
      throw new Error(
        `grounding ledger ${file} is corrupt at line ${i + 1} of ${lines.length}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { records, truncatedTail: false };
}

export function readGroundingLedger(file = groundingLedgerFile()): GroundingRecord[] {
  try {
    return readGroundingLedgerWithTail(file).records;
  } catch {
    return [];
  }
}

/**
 * Append one record, hash-chained to the previous.
 *
 * An empty bundle still gets a record: "we looked and found nothing" is a fact
 * worth keeping, and it is what distinguishes a searched spec from an unsearched
 * one months later.
 */
export function appendGroundingRecord(
  bundle: GroundingBundle,
  opts: { tool?: string; file?: string; at?: number } = {},
): GroundingRecord {
  const file = opts.file ?? groundingLedgerFile();
  // Generous: the critical section reads the whole ledger and canonicalizes it,
  // and the default 10s stale-reclaim would let a second process unlink a lock
  // that is merely slow, producing two records with the same prevHash. This call
  // blocks the event loop, so it happens once per forge cycle, not per request.
  return withSyncFileLock(`${file}.lock`, () => {
    const { records: ledger, truncatedTail } = readGroundingLedgerWithTail(file);
    if (truncatedTail) {
      // Forking here would silently re-root the chain. Surface it instead.
      throw new Error(
        `refusing to append to ${file}: its last record is torn. Repair or remove the partial line first.`,
      );
    }
    const prevHash = ledger.length > 0 ? ledger[ledger.length - 1].hash : GENESIS;
    const base: Omit<GroundingRecord, 'hash'> = {
      id: bundle.specId,
      at: opts.at ?? bundle.gatheredAt ?? Date.now(),
      query: bundle.query,
      bundleHash: bundle.hash,
      sources: bundle.sources.map((s) => ({ id: s.id, provider: `${s.service}/${s.provider}`, trust: s.trust, url: s.url })),
      degraded: bundle.degraded,
      degradedReasons: [...bundle.degradedReasons],
      ...(opts.tool ? { tool: opts.tool } : {}),
      prevHash,
    };
    const record: GroundingRecord = { ...base, hash: hashRecord(base) };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(record) + '\n', null, 'utf-8');
      // The ledger is described as durable, and it is the only thing that
      // distinguishes a searched spec from an unsearched one. Without the fsync
      // an OS-level crash loses the record with no trace.
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return record;
  }, { timeoutMs: 30_000, staleMs: 120_000 });
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  lastHash: string;
  /** Index of the first record that failed, or null. */
  brokenAt?: number;
  reason?: string;
}

/**
 * Re-derive every hash. Pure — no filesystem — so it is safe to call from a
 * status route.
 *
 * Checks three things, because each has been got wrong in a way that reported
 * `valid: true`:
 *
 * - **Linkage** (`prevHash`) — a record edited in place can leave its
 *   predecessor link intact.
 * - **Content** — the hash is recomputed, not trusted from the row.
 * - **Canonical coverage** — the hash covers a WHITELIST of fields, so an added
 *   or edited key outside it would otherwise be undetectable while the record
 *   read back as verified. `unattested` reports any such key.
 */
export function verifyGroundingRecords(records: readonly GroundingRecord[]): ChainVerification {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i += 1) {
    if (records[i].prevHash !== prev) {
      return { valid: false, length: records.length, lastHash: records[records.length - 1]?.hash ?? GENESIS, brokenAt: i, reason: 'linkage' };
    }
    const { hash, ...content } = records[i];
    if (hashRecord(content as Omit<GroundingRecord, 'hash'>) !== hash) {
      return { valid: false, length: records.length, lastHash: records[records.length - 1]?.hash ?? GENESIS, brokenAt: i, reason: 'content' };
    }
    const extra = Object.keys(content).filter((k) => !ATTESTED_FIELDS.has(k));
    if (extra.length > 0) {
      return { valid: false, length: records.length, lastHash: records[records.length - 1]?.hash ?? GENESIS, brokenAt: i, reason: `unattested field(s): ${extra.join(', ')}` };
    }
    prev = hash;
  }
  return { valid: true, length: records.length, lastHash: prev };
}

/** The fields {@link hashRecord} actually attests to. */
const ATTESTED_FIELDS = new Set([
  'id', 'at', 'query', 'bundleHash', 'sources', 'degraded', 'degradedReasons', 'tool', 'prevHash',
]);

/** The most recent record for one spec id, or null. */
export function latestGroundingFor(id: string, file = groundingLedgerFile()): GroundingRecord | null {
  const ledger = readGroundingLedger(file);
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    if (ledger[i].id === id) return ledger[i];
  }
  return null;
}