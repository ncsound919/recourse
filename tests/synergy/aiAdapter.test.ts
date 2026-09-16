import { describe, it, expect } from 'vitest';
import {
  draftAdaptation,
  attemptTransfer,
  createModelDrafter,
  stripCodeFence,
  normalizeDraftSource,
  MAX_DRAFT_BYTES,
  type Drafter,
  type ChatFn,
} from '../../src/lib/synergy/aiAdapter.js';
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

describe('fence stripping + size guard', () => {
  it('strips a fenced code block, preferring a ts-tagged one', () => {
    const text = 'Here you go:\n```ts\nexport class Mod { static f(){ return 1; } }\n```\n';
    expect(stripCodeFence(text)).toBe('export class Mod { static f(){ return 1; } }');
    expect(stripCodeFence('export const x = 1;')).toBe('export const x = 1;');
  });

  it('rejects empty and oversized drafts honestly', () => {
    expect(normalizeDraftSource('   ')).toMatchObject({ error: expect.stringContaining('empty') });
    const huge = 'x'.repeat(MAX_DRAFT_BYTES + 1);
    expect(normalizeDraftSource(huge)).toMatchObject({ error: expect.stringContaining('too large') });
  });
});

describe('createModelDrafter with an injected chat', () => {
  it('strips fences from injected model output and passes it to the resolver', async () => {
    const chat: ChatFn = async () => ({
      ok: true,
      content: '```js\nexport class Mod { static f(xs){ return xs.reduce(function(s,x){return s+x;},0); } }\n```',
    });
    const drafter = createModelDrafter(chat);
    const r = await attemptTransfer({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, drafter);
    expect(r.draft.ok).toBe(true);
    expect(r.draft.sourceCode).not.toContain('```');
    expect(r.result?.outcome).toBe('passed');
  });

  it('reports offline when the provider is unavailable', async () => {
    const chat: ChatFn = async () => ({ ok: false, content: null, error: 'connection refused' });
    const drafter = createModelDrafter(chat);
    const r = await draftAdaptation({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, drafter);
    expect(r.ok).toBe(false);
    expect(r.offline).toBe(true);
    expect(r.error).toContain('connection refused');
  });
});

describe('model output is only trusted after sandbox execution', () => {
  it('a drafted infinite loop fails inside the sandbox instead of hanging', async () => {
    const drafter: Drafter = async () => ({ sourceCode: 'export class Mod { static f(){ while (true) {} } }' });
    const r = await attemptTransfer({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, drafter);
    expect(r.result?.outcome).not.toBe('passed');
    expect(r.decision?.admitted).toBe(false);
  }, 30000);
});
