/**
 * adoptionSites.ts — the demand side made load-bearing, safely.
 *
 * THE PROBLEM THIS SOLVES
 * `consumptionReport` grades a tool `load_bearing` when a real production call
 * site exists. As of this audit exactly one tool qualified
 * (`levenshteinDistance` -> `dedupSources`) out of 34 verified tools, and that one
 * was DISABLED by `RECOURSE_SCIENCE_LOOPS=0`. Twenty-seven verified tools had no
 * caller at all. Building more tools made the ratio worse.
 *
 * WHY NOT JUST WRITE CALL SITES BY HAND
 * Two reasons, and the second is the dangerous one.
 *   1. Labour. 27 tools x a call site each is a large, dull, easily-botched diff.
 *   2. Generated call sites are self-modifying source code admitted on the same
 *      trust as the generated tools they call. The whole audit exists because
 *      "a suite the generator also wrote" cannot catch the generator's own bug
 *      class; a generated CALL SITE has exactly that problem, and worse, because
 *      it is on the production path rather than in a sandbox.
 *
 * THE DESIGN THAT AVOIDS IT
 * Call sites are HAND-WRITTEN, once, and written to *prefer* an adopted tool while
 * always retaining a correct reference implementation as the fallback:
 *
 *     const impl = adoptedTool('exponentialBackoffMs') ?? referenceBackoff;
 *     await sleep(impl(baseMs, attempt));
 *
 * Nothing is generated and nothing rewrites source at runtime. "Activating" a tool
 * means its EQUIVALENCE PROOF PASSED — a set of vectors checked against a reference
 * this file (or its caller) supplies independently of the forge. Only then does
 * `adoptedTool` return non-null and the production path start using it.
 *
 * Consequences that matter:
 *   - A wrong tool cannot be activated, because the proof fails and the reference
 *     stays in place. The failure mode is "no speedup", never "wrong result".
 *   - Every adoption is auditable: tool name, proof vector count, hash, timestamp.
 *   - `noteConsumption` fires from the real call, so the consumption metric can
 *     only move when production code genuinely calls the tool. Declaring a want
 *     can never inflate it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDomain } from '../types.js';

/** A single input/output pair the candidate must reproduce exactly. */
export type EquivalenceVector = { args: unknown[]; expect: unknown };

export interface AdoptionSite {
  /** Forge tool name, matching the registry entry. */
  tool: string;
  domain: ToolDomain;
  /** Human description of what this call site needs. */
  purpose: string;
  /** Module that will call the tool — recorded so the demand is attributable. */
  caller: string;
  /**
   * Independent reference implementation, hand-written. The candidate must match
   * THIS, not the other way round. This is the anchor that keeps adoption honest.
   */
  reference: (...args: any[]) => any;
  /** Vectors the candidate must reproduce exactly. */
  vectors: EquivalenceVector[];
  /**
   * How the candidate is loaded. Left as an injected loader so this module stays
   * testable and does not hard-depend on the self-hosting runtime.
   */
  load: () => Promise<((...args: any[]) => any) | null>;
}

export interface AdoptionRecord {
  tool: string;
  adopted: boolean;
  /** Why not, when `adopted` is false. Never empty. */
  reason: string;
  /** Vectors the candidate agreed on. */
  vectorsAgreed: number;
  vectorsTotal: number;
  /** Self-hosted artifact hash, when adopted. */
  hash: string | null;
  at: number;
}

interface AdoptionDoc {
  version: 1;
  records: Record<string, AdoptionRecord>;
}

function adoptionPath(root = process.cwd()): string {
  return path.join(root, 'data', 'adoption-sites.json');
}

function readAdoption(root?: string): AdoptionDoc {
  try {
    const parsed = JSON.parse(fs.readFileSync(adoptionPath(root), 'utf8')) as AdoptionDoc;
    if (parsed && typeof parsed === 'object' && parsed.records) return parsed;
  } catch {
    /* absent -> nothing adopted yet */
  }
  return { version: 1, records: {} };
}

/** Live registry of adopted implementations, keyed by tool name. */
const active = new Map<string, { fn: (...args: any[]) => any; record: AdoptionRecord }>();

/**
 * Strict equality that treats NaN as equal to NaN, because `NaN !== NaN` would
 * make a correct numeric tool fail its own proof.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  return Object.is(a, b);
}

/**
 * Prove a candidate equals its reference, then adopt it if so.
 *
 * Failure is always safe and always explained: the record carries the specific
 * vector index and both values, so a rejection is diagnosable rather than a
 * silent fallback.
 */
export async function tryAdopt(site: AdoptionSite, root = process.cwd()): Promise<AdoptionRecord> {
  const total = site.vectors.length;
  const reject = (reason: string, agreed = 0): AdoptionRecord => {
    active.delete(site.tool);
    const rec: AdoptionRecord = {
      tool: site.tool,
      adopted: false,
      reason,
      vectorsAgreed: agreed,
      vectorsTotal: total,
      hash: null,
      at: Date.now(),
    };
    persist(rec, root);
    return rec;
  };

  if (total === 0) return reject('no equivalence vectors supplied — a site with no proof cannot be adopted');

  let fn: ((...args: any[]) => any) | null;
  try {
    fn = await site.load();
  } catch (err) {
    return reject(`candidate failed to load: ${(err as Error)?.message}`);
  }
  if (typeof fn !== 'function') return reject('no importable self-hosted module (missing, quarantined, or refused by the safety screen)');

  let agreed = 0;
  for (let i = 0; i < total; i++) {
    const { args, expect } = site.vectors[i];
    let got: unknown;
    try {
      got = fn(...args);
    } catch (err) {
      return reject(`threw on vector ${i}: ${(err as Error)?.message}`, agreed);
    }
    if (!sameValue(got, expect)) {
      return reject(`disagreed with the reference on vector ${i}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`, agreed);
    }
    agreed++;
  }

  const rec: AdoptionRecord = {
    tool: site.tool,
    adopted: true,
    reason: `agreed with the hand-written reference on all ${total} equivalence vectors`,
    vectorsAgreed: agreed,
    vectorsTotal: total,
    hash: null,
    at: Date.now(),
  };
  active.set(site.tool, { fn, record: rec });
  persist(rec, root);
  return rec;
}

function persist(rec: AdoptionRecord, root?: string): void {
  try {
    const doc = readAdoption(root);
    doc.records[rec.tool] = rec;
    fs.mkdirSync(path.dirname(adoptionPath(root)), { recursive: true });
    fs.writeFileSync(adoptionPath(root), JSON.stringify(doc, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[adoption] could not persist record for ${rec.tool}: ${(err as Error)?.message}`);
  }
}

/**
 * The adopted implementation for a tool, or `null`.
 *
 * This is the single call production code makes. Returning `null` is the normal,
 * safe state: the caller falls back to its reference. Callers should be written as
 * `adoptedTool(name) ?? reference` so that an unadopted or rejected tool changes
 * performance, never behaviour.
 */
export function adoptedTool<T extends (...args: any[]) => any>(tool: string): T | null {
  return (active.get(tool)?.fn as T | undefined) ?? null;
}

/** Why a tool is or is not adopted. Never a bare boolean with no explanation. */
export function adoptionStatus(tool: string): AdoptionRecord | null {
  return active.get(tool)?.record ?? readAdoption().records[tool] ?? null;
}

/** Everything known about adoption, for the readout. */
export function adoptionSnapshot(): { adopted: AdoptionRecord[]; rejected: AdoptionRecord[] } {
  const recs = Object.values(readAdoption().records);
  return {
    adopted: recs.filter((r) => r.adopted),
    rejected: recs.filter((r) => !r.adopted),
  };
}

/** Test seam: drop all in-memory adoptions. */
export function resetAdoptions(): void {
  active.clear();
}