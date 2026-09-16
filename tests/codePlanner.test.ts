import { describe, it, expect, vi } from 'vitest';
import { parsePlannedCode, createCodePlanner, MAX_PLANNER_BYTES } from '../src/autopilot/codePlanner';
import type { GapT } from '../src/autopilot/loopTypes';
import type { BusinessProfileT } from '../src/autopilot/businessProfile';

const gap = { id: 'g1', description: 'Implement input sanitization', tier: 'A' } as unknown as GapT;
const profile = { business: { name: 'Acme' } } as unknown as BusinessProfileT;

const good = JSON.stringify({
  file: 'src/sanitize.js',
  content: 'export function sanitize(s) { return String(s).replace(/[<>]/g, ""); }',
  acceptanceTest: 'assert sanitize("<x>") === "x";',
  functionName: 'sanitize',
});

describe('parsePlannedCode', () => {
  it('accepts a valid fenced json block', () => {
    const parsed = parsePlannedCode('sure:\n```json\n' + good + '\n```');
    expect(parsed?.file).toBe('src/sanitize.js');
    expect(parsed?.functionName).toBe('sanitize');
  });

  it('rejects traversal, absolute paths, missing tests and oversize content', () => {
    expect(parsePlannedCode(JSON.stringify({ file: '../etc.js', content: 'x', acceptanceTest: 'assert true;' }))).toBeNull();
    expect(parsePlannedCode(JSON.stringify({ file: '/abs.js', content: 'x', acceptanceTest: 'assert true;' }))).toBeNull();
    expect(parsePlannedCode(JSON.stringify({ file: 'a.js', content: 'x', acceptanceTest: '' }))).toBeNull();
    const huge = 'a'.repeat(MAX_PLANNER_BYTES + 1);
    expect(parsePlannedCode(JSON.stringify({ file: 'a.js', content: huge, acceptanceTest: 'assert true;' }))).toBeNull();
    expect(parsePlannedCode('not json')).toBeNull();
    expect(parsePlannedCode(null)).toBeNull();
  });
});

describe('createCodePlanner', () => {
  it('returns PlannedCode from a real model response', async () => {
    const chat = vi.fn(async () => ({ ok: true, content: '```json\n' + good + '\n```' }));
    const planner = createCodePlanner(chat as any);
    const planned = await planner(gap, profile);
    expect(planned?.file).toBe('src/sanitize.js');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('returns null honestly when the model is offline or output is unusable', async () => {
    const offline = createCodePlanner((async () => ({ ok: false, content: null, error: 'offline' })) as any);
    expect(await offline(gap, profile)).toBeNull();

    const junk = createCodePlanner((async () => ({ ok: true, content: 'no json here' })) as any);
    expect(await junk(gap, profile)).toBeNull();

    const throws = createCodePlanner((async () => { throw new Error('boom'); }) as any);
    expect(await throws(gap, profile)).toBeNull();
  });
});
