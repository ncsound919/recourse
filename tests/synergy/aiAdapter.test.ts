import { describe, it, expect } from 'vitest';
import { draftAdaptation, attemptTransfer, type Drafter } from '../../src/lib/synergy/aiAdapter.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

const candidate: TransferCandidate = {
  id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
  bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
};
const acceptanceTest = `const a = Mod.f([1,2,3]); assert a === 6;`;

describe('ai adapter (injected drafter, no network)', () => {
  it('returns offline honestly when the drafter errors', async () => {
    const drafter: Drafter = async () => ({ error: 'model offline' });
    const r = await draftAdaptation({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, drafter);
    expect(r.ok).toBe(false);
    expect(r.offline).toBe(true);
  });

  it('attemptTransfer only marks passed when execution passes', async () => {
    const good: Drafter = async () => ({ sourceCode: 'export class Mod { static f(xs){ return xs.reduce(function(s,x){return s+x;},0); } }' });
    const bad: Drafter = async () => ({ sourceCode: 'export class Mod { static f(){ return 0; } }' });
    const a = await attemptTransfer({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, good);
    const b = await attemptTransfer({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, bad);
    expect(a.result?.outcome).toBe('passed');
    expect(a.decision?.status).toBe('reproduced');
    expect(b.result?.outcome).toBe('failed');
    expect(b.decision?.status).toBe('refuted');
  });
});
