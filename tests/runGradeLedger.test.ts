import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRunGrades, appendRunGrade, verifyRunGrades, latestRunGrade } from '../src/lib/runGradeLedger';
import { gradeRun, type TheoryProgression, type RunGrade } from '../src/lib/theoryComparison';

let dir = '';
let file = '';

const prog = (r: number): TheoryProgression => ({
  id: `p${r}`,
  source: 'composer',
  keyPc: 0,
  bars: 3,
  chords: [r, (r + 5) % 12, 0].map((pc) => ({ rootPc: pc, quality: 'min7', notes: [48, 55, 59, 62] })),
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rungrade-'));
  file = path.join(dir, 'run-grades.jsonl');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const grade = (source: string, seed: number): RunGrade => gradeRun([prog(2)], { source: source as RunGrade['source'], seed });

describe('runGradeLedger', () => {
  it('appends records and verifies the chain', () => {
    const a = appendRunGrade(grade('composer', 1), { file });
    const b = appendRunGrade(grade('chordstudio', 2), { file });
    expect(a.prevHash).toBe('0'.repeat(64));
    expect(b.prevHash).toBe(a.hash);
    const ledger = readRunGrades(file);
    expect(ledger).toHaveLength(2);
    expect(verifyRunGrades(ledger).valid).toBe(true);
  });

  it('detects tampering (a rewritten grade breaks the hash)', () => {
    appendRunGrade(grade('composer', 1), { file });
    appendRunGrade(grade('composer', 2), { file });
    const ledger = readRunGrades(file);
    ledger[0].grade = 0.999; // tamper
    expect(verifyRunGrades(ledger).valid).toBe(false);
  });

  it('returns the latest grade for a source', () => {
    appendRunGrade(grade('composer', 1), { file });
    const cs = appendRunGrade(grade('chordstudio', 2), { file });
    expect(latestRunGrade('chordstudio', file)!.id).toBe(cs.id);
    expect(latestRunGrade('composer', file)!.source).toBe('composer');
  });

  it('reads an absent/empty ledger as an empty list', () => {
    expect(readRunGrades(path.join(dir, 'nope.jsonl'))).toEqual([]);
  });
});
