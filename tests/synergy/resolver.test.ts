import { describe, it, expect } from 'vitest';
import { resolveTransfer, admit, applyTransferResult } from '../../src/lib/synergy/resolver.js';
import { buildSynergyMap } from '../../src/lib/synergy/synergyMap.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

const acceptanceTest = `const a = Mod.f([1,2,3]); assert a === 6;`;
const passing = `export class Mod { static f(xs) { return xs.reduce(function (s, x) { return s + x; }, 0); } }`;
const failing = `export class Mod { static f() { return 0; } }`;

const candidate: TransferCandidate = {
  id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
  bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
};

describe('resolver + admission gate', () => {
  it('resolves a passing adaptation as reproduced via executable_test', () => {
    const r = resolveTransfer(candidate, acceptanceTest, passing);
    expect(r.outcome).toBe('passed');
    expect(r.proofType).toBe('executable_test');
    expect(r.sandboxReportHash).toHaveLength(64);
    const d = admit(r);
    expect(d.admitted).toBe(true);
    expect(d.status).toBe('reproduced');
  });

  it('resolves a failing adaptation as refuted', () => {
    const r = resolveTransfer(candidate, acceptanceTest, failing);
    expect(r.outcome).toBe('failed');
    const d = admit(r);
    expect(d.status).toBe('refuted');
    expect(d.admitted).toBe(false);
  });

  it('applies a result to a map as a resolved edge', () => {
    const map = buildSynergyMap([candidate], { generatedAtRun: 'run:1' });
    const r = resolveTransfer(candidate, acceptanceTest, passing);
    const next = applyTransferResult(map, r);
    const edge = next.edges.find((e) => e.from === 'mathematics' && e.to === 'logistics' && e.kind === 'resolved');
    expect(edge?.passes).toBe(1);
    expect(edge?.attempts).toBe(1);
  });
});
