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

export function readGroundingLedger(file = groundingLedgerFile()): GroundingRecord[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as GroundingRecord);
  } catch {
    // A truncated last line from an interrupted append must not make the whole
    // history unreadable; the verifier reports the break explicitly instead.
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
  return withSyncFileLock(`${file}.lock`, () => {
    const ledger = readGroundingLedger(file);
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
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf-8');
    return record;
  });
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
 * Checks both linkage (`prevHash`) and content, because a record can be edited in
 * place while leaving its predecessor link intact.
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
    prev = hash;
  }
  return { valid: true, length: records.length, lastHash: prev };
}

/** The most recent record for one spec id, or null. */
export function latestGroundingFor(id: string, file = groundingLedgerFile()): GroundingRecord | null {
  const ledger = readGroundingLedger(file);
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    if (ledger[i].id === id) return ledger[i];
  }
  return null;
}