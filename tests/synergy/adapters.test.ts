import { describe, it, expect } from 'vitest';
import {
  ladderCandidates,
  targetSymbolFromTest,
  renameDeclaration,
} from '../../src/lib/synergy/adapters';
import {
  resolveWithLadder,
  resolveOracle,
  recordHumanSignoff,
  admit,
} from '../../src/lib/synergy/resolver';
import type { TransferCandidate } from '../../src/lib/synergy/types';

const candidate: TransferCandidate = {
  id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
  bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
};

const acceptanceTest = `const a = Mod.f([1, 2, 3]); assert a === 6;`;
const sumBody = `static f(xs) { return xs.reduce(function (s, x) { return s + x; }, 0); }`;

describe('operator ladder selection', () => {
  it('extracts the target symbol from a member call', () => {
    expect(targetSymbolFromTest(acceptanceTest)).toBe('Mod');
    expect(targetSymbolFromTest('assert gcd(4,2) === 2;')).toBe('gcd');
  });

  it('renames a mismatched declaration to the target', () => {
    const r = renameDeclaration(`export class Wrong { ${sumBody} }`, 'Mod');
    expect(r.renamedFrom).toBe('Wrong');
    expect(r.code).toContain('class Mod');
    expect(r.code).not.toContain('Wrong');
  });

  it('builds a null then reinstantiate ladder, de-duplicated', () => {
    const same = ladderCandidates({ sourceCode: `export class Mod { ${sumBody} }`, acceptanceTest });
    expect(same.map((c) => c.operator)).toEqual(['null']);
    const renamed = ladderCandidates({ sourceCode: `export class Wrong { ${sumBody} }`, acceptanceTest });
    expect(renamed.map((c) => c.operator)).toEqual(['null', 'reinstantiate']);
  });
});

describe('resolveWithLadder', () => {
  it('falls through to the reinstantiate operator and passes there', async () => {
    const sourceCode = `export class Wrong { ${sumBody} }`;
    const r = await resolveWithLadder(candidate, acceptanceTest, { sourceCode });
    expect(r.operator).toBe('reinstantiate');
    expect(r.result?.outcome).toBe('passed');
    expect(admit(r.result!).admitted).toBe(true);
    expect(r.attempts.map((a) => a.operator)).toEqual(['null', 'reinstantiate']);
  });

  it('falls through to an injected model drafter when the ladder fails', async () => {
    const sourceCode = `export class Mod { static f() { return 0; } }`;
    const r = await resolveWithLadder(candidate, acceptanceTest, { sourceCode }, async () => ({
      ok: true,
      sourceCode: `export class Mod { ${sumBody} }`,
    }));
    expect(r.operator).toBe('model');
    expect(r.result?.outcome).toBe('passed');
    expect(r.attempts.map((a) => a.operator)).toContain('model');
  });

  it('reports an honest all-fail when nothing passes and no drafter exists', async () => {
    const sourceCode = `export class Mod { static f() { return 0; } }`;
    const r = await resolveWithLadder(candidate, acceptanceTest, { sourceCode });
    expect(r.result?.outcome).toBe('failed');
    expect(r.operator).toBe('null');
  });
});

describe('oracle + human proofs are admissible', () => {
  it('admits an oracle metric that clears the threshold', () => {
    const pass = resolveOracle(candidate, 0.92, 0.9, 'retrieval_precision');
    expect(pass.proofType).toBe('oracle_metric');
    expect(admit(pass).admitted).toBe(true);
    const fail = resolveOracle(candidate, 0.5, 0.9);
    expect(admit(fail).admitted).toBe(false);
    expect(admit(fail).status).toBe('refuted');
  });

  it('records and admits an accountable human signoff with a deterministic timestamp', () => {
    const signoff = recordHumanSignoff(candidate, { operatorId: 'dr.smith', accepted: true, timestamp: 1_700_000_000_000, note: 'reviewed' });
    expect(signoff.proofType).toBe('human_signoff');
    expect(signoff.detail).toContain('dr.smith');
    expect(signoff.sandboxReportHash).toHaveLength(64);
    expect(admit(signoff).admitted).toBe(true);
    const rejected = recordHumanSignoff(candidate, { operatorId: 'dr.smith', accepted: false, timestamp: 1 });
    expect(admit(rejected).status).toBe('refuted');
  });
});
