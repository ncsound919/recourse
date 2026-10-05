import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { encodeEntailment, encodePropertyForProof } from '../src/lib/v5/proofLadder';

const CANDIDATES = [
  process.env.V5_CVC5_PATH,
  'C:\\Users\\User\\Downloads\\BUSINESS\\INFRASTRUCTURE\\v5-tools\\cvc5\\bin\\cvc5.exe',
  'cvc5',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

function findCvc5(): string | null {
  for (const c of CANDIDATES) {
    try {
      execFileSync(c, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 });
      return c;
    } catch {
      /* not this one */
    }
  }
  return null;
}

const CVC5 = findCvc5();

function run(program: string): 'sat' | 'unsat' | 'unknown' | 'error' {
  if (!CVC5) return 'error';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-ladder-test-'));
  try {
    const file = path.join(dir, 'q.smt2');
    fs.writeFileSync(file, program, 'utf8');
    const out = execFileSync(CVC5, ['--lang', 'smt2', file], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (out.includes('unsat')) return 'unsat';
    if (out.includes('sat')) return 'sat';
    return 'unknown';
  } catch {
    return 'error';
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}

const itWithSolver = CVC5 ? it : it.skip;

describe('proofLadder encodings against the real solver', () => {
  itWithSolver.each([
    ['sorted', 'unsat'],
    ['no duplicates', 'unsat'],
    ['no_duplicates', 'unsat'],
    ['reversed', 'unsat'],
    ['length_preserved', 'unsat'],
    ['contains_all_input', 'unsat'],
    ['permutation', 'unsat'],
  ])('property %s encodes to a program the solver answers %s', (property, expected) => {
    const program = encodePropertyForProof(property);
    expect(program).not.toContain('(assert false)');
    expect(run(program)).toBe(expected);
  });

  itWithSolver('an unknown property encodes to a satisfiable program (downgrade, never pass)', () => {
    const program = encodePropertyForProof('frobnicate_the_whatsit');
    expect(program).not.toContain('(assert false)');
    expect(run(program)).toBe('sat');
  });

  itWithSolver.each([
    ['sorted', 'list of comparable elements', 'unsat'],
    ['no duplicates', 'list', 'unsat'],
    ['reversed', 'list', 'unsat'],
  ])('entailment %s -> %s is proved, not assumed', (post, pre, expected) => {
    const program = encodeEntailment(post, pre);
    expect(program).not.toContain('(assert false)');
    expect(run(program)).toBe(expected);
  });

  itWithSolver('an unencodable pair yields sat (entails:false), never a vacuous unsat', () => {
    const program = encodeEntailment('frobnicate', 'whatsit');
    expect(program).not.toContain('(assert false)');
    expect(run(program)).toBe('sat');
  });

  it('says plainly when the solver is absent instead of faking the suite', () => {
    // This assertion holds in both worlds: with a solver the cases above ran,
    // without one they were skipped and THIS is what ran.
    expect(CVC5 === null ? 'skipped' : 'ran').toMatch(/^(skipped|ran)$/);
    if (CVC5 === null) {
      console.warn('[proofLadder.test] cvc5 not found — solver cases skipped (set V5_CVC5_PATH to run them)');
    }
  });
});
