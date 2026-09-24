import { describe, it, expect, vi, afterEach } from 'vitest';

// Force the final self-host verification to fail while the build/self-host
// write "succeeds". The bridge must report failure, not a live tool.
vi.mock('../src/lib/selfHosting.js', () => ({
  writeStatelessSelfHostedTool: () => ({
    success: true,
    entry: { name: 't', file: 'tools/t.mjs', hash: 'h', sourceCode: '', testSuiteCode: '' },
  }),
  verifySelfHostedEntry: async () => ({ passed: false, detail: 'module import failed: boom' }),
}));

import { integrateAxiomTool } from '../src/lib/axiomBridge.js';

const AXIOM_CODE = 'export function add(a, b) { return a + b; }';
const SUITE = 'assert(add(2, 3) === 5);';

afterEach(() => vi.unstubAllGlobals());

describe('axiomBridge — the live verify verdict is not discarded', () => {
  it('returns ok:false when the written module fails its own re-verification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: true, sourceCode: AXIOM_CODE, engine: 'test' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const r = await integrateAxiomTool('axiom_add', 'coding', 'add two numbers', SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/self-hosted verification failed/);
    expect(r.selfHosted).toBeUndefined();
  });
});
