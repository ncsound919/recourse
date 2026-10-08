/**
 * runGradeLedger.ts — the hash-chained record of every graded progression run.
 *
 * Each entry is a `RunGrade` (theory grade + comparison to the random baseline
 * and the previous run) sealed with a SHA-256 over its reproducible content and
 * the previous entry's hash. Rewriting history breaks the chain, so "the runs
 * are getting better" is auditable rather than asserted.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withSyncFileLock } from './fileLock.js';
import type { RunGrade } from './theoryComparison.js';

export interface RunGradeRecord extends RunGrade {
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

export function runGradeLedgerFile(): string {
  return process.env.RUN_GRADE_LEDGER_FILE || path.join(process.cwd(), 'data', 'run-grades.jsonl');
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hashRecord(r: Omit<RunGradeRecord, 'hash'>): string {
  return sha256Hex(
    JSON.stringify({
      id: r.id,
      at: r.at,
      source: r.source,
      n: r.n,
      grade: r.grade,
      conformance: r.conformance,
      novelty: r.novelty,
      exploration: r.exploration,
      emergentStyles: r.emergentStyles,
      letter: r.letter,
      metrics: r.metrics,
      baselineMean: r.baselineMean,
      deltaVsBaseline: r.deltaVsBaseline,
      effectSize: r.effectSize,
      ciLow: r.ciLow,
      ciHigh: r.ciHigh,
      pValue: r.pValue,
      verdict: r.verdict,
      deltaVsPrev: r.deltaVsPrev,
      prevId: r.prevId,
      prevHash: r.prevHash,
    }),
  );
}

export function readRunGrades(file = runGradeLedgerFile()): RunGradeRecord[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as RunGradeRecord);
  } catch {
    return [];
  }
}

/** Append a graded run, chained to the previous record. */
export function appendRunGrade(grade: RunGrade, opts: { file?: string; at?: number } = {}): RunGradeRecord {
  const file = opts.file ?? runGradeLedgerFile();
  return withSyncFileLock(`${file}.lock`, () => {
    const ledger = readRunGrades(file);
    const prev = ledger[ledger.length - 1];
    const prevHash = prev ? prev.hash : GENESIS;
    const base: Omit<RunGradeRecord, 'hash'> = {
      ...grade,
      at: opts.at ?? grade.at,
      prevHash,
    };
    const record: RunGradeRecord = { ...base, hash: hashRecord(base) };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf-8');
    } catch (err) {
      console.warn('[runGradeLedger] append failed:', err instanceof Error ? err.message : String(err));
    }
    return record;
  });
}

/** Recompute the chain (pure). */
export function verifyRunGrades(records: RunGradeRecord[]): { valid: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    if (records[i].prevHash !== prev) return { valid: false, brokenAt: i };
    const { hash: _h, ...content } = records[i];
    if (hashRecord(content) !== records[i].hash) return { valid: false, brokenAt: i };
    prev = records[i].hash;
  }
  return { valid: true };
}

/** The most recent grade for a source (or any source when omitted). */
export function latestRunGrade(source?: string, file = runGradeLedgerFile()): RunGradeRecord | null {
  const ledger = readRunGrades(file);
  for (let i = ledger.length - 1; i >= 0; i--) {
    if (!source || ledger[i].source === source || ledger[i].source === 'mixed') return ledger[i];
  }
  return null;
}
