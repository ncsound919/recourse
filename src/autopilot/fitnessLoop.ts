/**
 * fitnessLoop.ts — compute how a merged upgrade moved the business scorecard
 * and fold that measurement back into gene fitness in the learner ledger.
 *
 * Contract: takes two ALREADY-BUILT BusinessScorecards (pre-merge and
 * post-merge) as arguments. It deliberately does NOT import ./scorecard; the
 * projection from AuditStatement -> BusinessScorecard happens upstream, so this
 * module stays pure math + durable ledger IO over shared loopTypes.
 *
 * Ledger: a plain JSON file at `<root>/recourse_learner.json`. The root is a
 * caller-supplied directory so callers can point at the repo root in
 * production and at an mkdtemp scratch dir in tests. Existing foreign keys on
 * the ledger object (e.g. the dream learner's `state`/`ledger`) are preserved
 * on write; this module only appends its own keys.
 *
 * Honest limit: the quarantine guard uses the COMPOSITE overallDelta. The
 * surrounding spec imagines a per-dimension regression guard; per-dimension
 * deltas are recorded in the ledger for future use but do not drive the
 * quarantine decision here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import {
  FitnessDelta,
  type BusinessScorecardT,
  type FitnessDeltaT,
} from './loopTypes';

export const LEDGER_FILENAME = 'recourse_learner.json';

export const DEFAULT_QUARANTINE_THRESHOLD_POINTS = 10;

/** Default ledger root: the process working directory at import time. The
 *  comment in the interface spec is right that this is "not a constant in
 *  practice" — callers should pass the explicit repo root. We snapshot cwd at
 *  load so the exported value is a stable, usable string. */
export const DEFAULT_LEDGER_ROOT: string = path.resolve(process.cwd());

export interface LearnerLedger {
  geneFitnessUpdates?: FitnessDeltaT[];
  quarantined?: string[];
}

function ledgerFilePath(root: string): string {
  return path.join(root, LEDGER_FILENAME);
}

/** {} on missing or corrupt ledger — never throws for IO/parse problems. */
export function loadLedger(root: string = DEFAULT_LEDGER_ROOT): LearnerLedger {
  const file = ledgerFilePath(root);
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const ledger = parsed as LearnerLedger;
    if (ledger.geneFitnessUpdates !== undefined && !Array.isArray(ledger.geneFitnessUpdates)) return {};
    if (ledger.quarantined !== undefined && !Array.isArray(ledger.quarantined)) return {};
    return ledger;
  } catch {
    return {};
  }
}

/** Writes atomically (`.tmp` + rename, matching the repo's durable-store
 *  convention) and creates the root directory (and parents) if missing. */
export function saveLedger(root: string = DEFAULT_LEDGER_ROOT, ledger: LearnerLedger): void {
  const file = ledgerFilePath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(ledger, null, 2), 'utf-8');
  renameSync(tmpFile, file);
}

/** Verdict on how a merged upgrade moved the business scorecard. */
export function computeFitnessDelta(
  pre: BusinessScorecardT,
  post: BusinessScorecardT,
  proposalId: string,
): FitnessDeltaT {
  const overallDelta = post.overallScore - pre.overallScore;
  const verdict = overallDelta > 0 ? 'improved' : overallDelta < 0 ? 'regressed' : 'neutral';
  return FitnessDelta.parse({
    proposalId,
    timestamp: new Date().toISOString(),
    overallDelta,
    dimensionDeltas: {
      security: post.securityPosture - pre.securityPosture,
      codeQuality: post.codeQuality - pre.codeQuality,
      docs: post.documentationCompleteness - pre.documentationCompleteness,
    },
    verdict,
  });
}

/** Quarantine when the composite score regressed by >= threshold (default 10). */
export function shouldQuarantine(
  delta: FitnessDeltaT,
  regressionThresholdPoints: number = DEFAULT_QUARANTINE_THRESHOLD_POINTS,
): boolean {
  return delta.verdict === 'regressed' && Math.abs(delta.overallDelta) >= regressionThresholdPoints;
}

export async function updateGeneFitness(opts: {
  proposalId: string;
  pre: BusinessScorecardT;
  post: BusinessScorecardT;
  ledgerRoot: string;
}): Promise<{ delta: FitnessDeltaT; quarantined: boolean }> {
  const delta = computeFitnessDelta(opts.pre, opts.post, opts.proposalId);
  const ledger = loadLedger(opts.ledgerRoot);
  ledger.geneFitnessUpdates ??= [];
  ledger.geneFitnessUpdates.push(delta);
  const quarantined = shouldQuarantine(delta);
  if (quarantined) {
    ledger.quarantined ??= [];
    if (!ledger.quarantined.includes(opts.proposalId)) ledger.quarantined.push(opts.proposalId);
  }
  saveLedger(opts.ledgerRoot, ledger);
  return { delta, quarantined };
}
