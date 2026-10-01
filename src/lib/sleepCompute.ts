/**
 * sleepCompute.ts — offline ("sleep-time") precomputation for the dream engine
 * (P1).
 *
 * Research basis: Lin et al. 2025, "Sleep-time Compute: Beyond Inference
 * Scaling at Test-time" (arXiv:2504.13171). A model can "think" offline about a
 * context before a query arrives, pre-computing useful quantities and cutting
 * the test-time compute needed for the same accuracy by ~5x (and amortizing it
 * ~2.5x across related queries). Recourse's dream consolidation phase is the
 * natural "sleep" window: instead of only snapshotting signals, it also
 * pre-computes and sandbox-verifies candidate implementations for the forge
 * specs the learner is most likely to need next.
 *
 * Honesty contract:
 *  - A stored artifact is only ever marked `verified` when a real sandbox run
 *    passed its reference suite. Unverified drafts are kept separately and are
 *    never served as ready.
 *  - Consumption (`takeReady`) returns only verified artifacts; the forge still
 *    re-verifies before promotion (this is a cache, not a trust shortcut).
 *  - Bounded + atomic durable store; a corrupt file degrades to empty.
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson.js';

export interface SleepTask {
  name: string;
  domain: string;
  prompt: string;
  refSuite: string;
}

export interface SleepArtifact extends SleepTask {
  source: string;
  verified: boolean;
  createdAt: number;
}

export interface SleepStoreDoc {
  version: 1;
  artifacts: SleepArtifact[];
  updatedAt: number;
  runs: number;
  ready: number;
}

export function sleepComputePath(): string {
  return process.env.SLEEP_COMPUTE_FILE || path.join(process.cwd(), 'data', 'sleep-compute.json');
}

function emptyDoc(): SleepStoreDoc {
  return { version: 1, artifacts: [], updatedAt: 0, runs: 0, ready: 0 };
}

export function readSleepStore(): SleepStoreDoc {
  const doc = readJsonFile<SleepStoreDoc>(sleepComputePath(), emptyDoc());
  if (!doc || doc.version !== 1 || !Array.isArray(doc.artifacts)) return emptyDoc();
  return doc;
}

function writeSleepStore(doc: SleepStoreDoc): void {
  try {
    writeJsonFile(sleepComputePath(), doc);
  } catch (err) {
    console.warn('[sleep-compute] persist failed:', err instanceof Error ? err.message : String(err));
  }
}

/** Cap on retained artifacts (verified kept preferentially). */
const MAX_ARTIFACTS = 200;

/**
 * Choose which specs to pre-compute: those not already ready, strongest-domain
 * first is the caller's ordering. Pure — `have` is the set of names already
 * covered (registry or ledger). Bounded by `limit`.
 */
export function planSleepTasks(specs: SleepTask[], have: Iterable<string>, limit = 3): SleepTask[] {
  const seen = new Set(have);
  const out: SleepTask[] = [];
  for (const s of specs) {
    if (out.length >= Math.max(0, limit)) break;
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

/**
 * Run one bounded sleep-time-compute unit: generate + sandbox-verify a candidate
 * for each planned task and persist the artifact. `verify` is the real sandbox
 * (injected). Returns honest counts. Never throws.
 */
export async function runSleepComputeUnit(input: {
  specs: SleepTask[];
  generate: (spec: SleepTask) => Promise<{ ok: boolean; source?: string }>;
  verify: (source: string, suite: string) => { passed: boolean };
  limit?: number;
}): Promise<{ attempted: number; ready: number; note: string }> {
  const doc = readSleepStore();
  const have = new Set(doc.artifacts.filter((a) => a.verified).map((a) => a.name));
  const tasks = planSleepTasks(input.specs, have, Math.max(0, input.limit ?? 3));
  let attempted = 0;
  let ready = 0;
  const now = Date.now();
  for (const task of tasks) {
    attempted += 1;
    let source: string | undefined;
    try {
      const gen = await input.generate(task);
      if (gen.ok && gen.source) source = gen.source;
    } catch {
      source = undefined;
    }
    if (!source) continue;
    let verified = false;
    try {
      verified = input.verify(source, task.refSuite).passed;
    } catch {
      verified = false;
    }
    const artifact: SleepArtifact = { ...task, source, verified, createdAt: now };
    // Replace any prior (unverified) artifact for this name.
    doc.artifacts = doc.artifacts.filter((a) => a.name !== task.name);
    doc.artifacts.push(artifact);
    if (verified) ready += 1;
  }
  // Bound: keep verified artifacts first, newest first within each class.
  doc.artifacts = doc.artifacts
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.createdAt - a.createdAt)
    .slice(0, MAX_ARTIFACTS);
  doc.updatedAt = now;
  doc.runs += 1;
  doc.ready = doc.artifacts.filter((a) => a.verified).length;
  writeSleepStore(doc);
  return {
    attempted,
    ready,
    note: attempted ? `precomputed ${ready}/${attempted} verified artifact(s)` : 'nothing to precompute (all covered)',
  };
}

/**
 * Record artifacts that were generated OFFLINE elsewhere (e.g. a remote
 * compute-platform batch) but verified HERE against the reference suite. The
 * verification runs locally/in-sandbox so a remote worker can never mark its own
 * homework; an unverified draft is stored but is never served as ready.
 *
 * Honest: each entry is only `verified:true` when the injected real verifier
 * passes its reference suite.
 */
export function recordSleepArtifacts(
  entries: Array<SleepTask & { source: string }>,
  verify: (source: string, suite: string) => { passed: boolean },
): { recorded: number; ready: number } {
  const doc = readSleepStore();
  let ready = 0;
  let recorded = 0;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry?.name || typeof entry.source !== 'string' || !entry.source.trim()) continue;
    recorded += 1;
    let verified = false;
    try {
      verified = verify(entry.source, entry.refSuite).passed;
    } catch {
      verified = false;
    }
    const artifact: SleepArtifact = {
      name: entry.name,
      domain: entry.domain,
      prompt: entry.prompt,
      refSuite: entry.refSuite,
      source: entry.source,
      verified,
      createdAt: now,
    };
    doc.artifacts = doc.artifacts.filter((a) => a.name !== entry.name);
    doc.artifacts.push(artifact);
    if (verified) ready += 1;
  }
  doc.artifacts = doc.artifacts
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.createdAt - a.createdAt)
    .slice(0, MAX_ARTIFACTS);
  doc.updatedAt = now;
  doc.ready = doc.artifacts.filter((a) => a.verified).length;
  writeSleepStore(doc);
  return { recorded, ready };
}

/** A verified artifact ready to be consumed by the forge, or null. */
export function takeReadySleepArtifact(name: string, domain?: string): SleepArtifact | null {
  const doc = readSleepStore();
  const found = doc.artifacts.find((a) => a.name === name && a.verified && (!domain || a.domain === domain));
  return found ?? null;
}

export interface SleepSnapshot {
  artifacts: number;
  ready: number;
  runs: number;
  updatedAt: number;
  names: string[];
}

export function sleepComputeSnapshot(): SleepSnapshot {
  const doc = readSleepStore();
  return {
    artifacts: doc.artifacts.length,
    ready: doc.artifacts.filter((a) => a.verified).length,
    runs: doc.runs,
    updatedAt: doc.updatedAt,
    names: doc.artifacts.filter((a) => a.verified).map((a) => a.name).slice(0, 50),
  };
}
