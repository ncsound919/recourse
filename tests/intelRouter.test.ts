import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createIntelRouter, type IntelRouterDeps, type AdoptOutcome } from '../src/routes/intel';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function makeDeps(overrides: Partial<IntelRouterDeps> = {}): IntelRouterDeps {
  return {
    view: vi.fn(async () => ({ proposals: [{ id: 'p1' }], sources: ['bbtech'] })),
    pull: vi.fn(async () => ({ added: 2, detail: 'pulled' })),
    rank: vi.fn(async () => ({ ranked: 2, strategyUsed: true })),
    snapshot: vi.fn(() => ({ proposals: [{ id: 'p1' }] })),
    adopt: vi.fn((): AdoptOutcome => ({ ok: true, spec: { id: 'intel_p1' } })),
    ...overrides,
  };
}

async function setup(deps: IntelRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/intel', createIntelRouter(deps));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (p: string, body: unknown) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post };
}

describe('intel router (extracted)', () => {
  it('serves the intel view', async () => {
    const { base } = await setup(makeDeps());
    const body: any = await (await fetch(`${base}/api/recourse/intel`)).json();
    expect(body.success).toBe(true);
    expect(body.intel.proposals[0].id).toBe('p1');
  });

  it('merges pull/rank results with a fresh view', async () => {
    const deps = makeDeps();
    const { post } = await setup(deps);
    const pull: any = await (await post('/api/recourse/intel/pull', {})).json();
    expect(pull).toMatchObject({ success: true, added: 2, detail: 'pulled' });
    expect(pull.intel).toBeDefined();

    const rank: any = await (await post('/api/recourse/intel/rank', {})).json();
    expect(rank).toMatchObject({ success: true, ranked: 2, strategyUsed: true });
  });

  it('maps adopt failures to status codes and success to spec + snapshot', async () => {
    const denied = makeDeps({ adopt: () => ({ ok: false, status: 400, error: 'referenceSuite is required' }) });
    const { post } = await setup(denied);
    const bad = await post('/api/recourse/intel/adopt', { proposalId: 'p1' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error).toMatch(/referenceSuite/);

    const ok = makeDeps();
    const okBase = await setup(ok);
    const good = await okBase.post('/api/recourse/intel/adopt', { proposalId: 'p1', functionName: 'f', prompt: 'x'.repeat(20), referenceSuite: 'assert true;' });
    expect(good.status).toBe(200);
    const goodBody: any = await good.json();
    expect(goodBody.spec.id).toBe('intel_p1');
    expect(goodBody.intel).toBeDefined();
  });

  it('reports a throwing view as 500', async () => {
    const deps = makeDeps({ view: async () => { throw new Error('sources down'); } });
    const { base } = await setup(deps);
    const res = await fetch(`${base}/api/recourse/intel`);
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).error).toContain('sources down');
  });
});
