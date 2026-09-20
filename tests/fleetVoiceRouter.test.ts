import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createFleetVoiceRouter, asAxiomLoop, type FleetVoiceRouterDeps } from '../src/routes/fleetVoice';
import type { ReporterAuditFact } from '../src/lib/selfReporter';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  vi.restoreAllMocks();
});

const audit: ReporterAuditFact = {
  grade: 'B',
  score: 82,
  deterministicScore: 74,
  coveragePercent: 80,
  scope: 'full',
  dimensions: [{ dimension: 'tests', label: 'Tests', status: 'covered', score: 90 }],
  findings: { total: 10, new: 2, fixed: 3, persisted: 5 },
  reasons: [],
};

function makeDeps(overrides: Partial<FleetVoiceRouterDeps> = {}): FleetVoiceRouterDeps {
  return {
    axiomStatus: vi.fn(async () => ({ online: true, url: 'http://127.0.0.1:3198', auth: 'keywire' as const })),
    axiomLatest: vi.fn(async () => ({
      ok: true,
      state: { id: 'loop-3', status: 'running', iteration: 2, goal: 'repair the parser' },
    })),
    audit: vi.fn(() => audit),
    ...overrides,
  };
}

async function setup(deps: FleetVoiceRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/recourse', createFleetVoiceRouter(deps));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const get = (p: string) => fetch(`${base}${p}`);
  return { base, get };
}

describe('asAxiomLoop', () => {
  it('shapes only the fields it is willing to speak', () => {
    expect(asAxiomLoop({ id: 'l1', status: 'done', iteration: 3, goal: 'g', extra: 'ignored' })).toEqual({
      id: 'l1',
      status: 'done',
      iteration: 3,
      goal: 'g',
    });
  });

  it('returns null for absent or id-less state rather than inventing a loop', () => {
    expect(asAxiomLoop(undefined)).toBeNull();
    expect(asAxiomLoop({})).toBeNull();
    expect(asAxiomLoop({ status: 'running' })).toBeNull();
  });

  it('nulls non-string/non-number fields instead of coercing them', () => {
    expect(asAxiomLoop({ id: 'l1', status: 7, iteration: 'x', goal: {} })).toEqual({
      id: 'l1',
      status: null,
      iteration: null,
      goal: null,
    });
  });
});

describe('fleet voice router', () => {
  it('returns Axiom + OpenHub state and both briefs', async () => {
    const deps = makeDeps();
    const { get } = await setup(deps);
    const body: any = await (await get('/api/recourse/fleet/voice')).json();

    expect(body.success).toBe(true);
    expect(body.axiom).toMatchObject({ online: true, auth: 'keywire', url: 'http://127.0.0.1:3198' });
    expect(body.axiom.loop).toMatchObject({ id: 'loop-3', status: 'running', iteration: 2 });
    expect(body.openhub.recorded).toBe(true);
    expect(body.openhub.audit.grade).toBe('B');
    expect(body.briefs.axiom).toContain('loop-3');
    expect(body.briefs.openhub).toContain('graded the work B');
    expect(deps.axiomLatest).toHaveBeenCalledTimes(1);
  });

  it('skips the loop probe entirely when the bridge is offline', async () => {
    const deps = makeDeps({ axiomStatus: async () => ({ online: false, url: 'http://x', auth: 'none' }) });
    const { get } = await setup(deps);
    const body: any = await (await get('/api/recourse/fleet/voice')).json();

    expect(body.axiom.online).toBe(false);
    expect(body.axiom.loop).toBeNull();
    expect(body.briefs.axiom).toContain('offline');
    expect(deps.axiomLatest).not.toHaveBeenCalled();
  });

  it('reports a loop-read failure honestly', async () => {
    const deps = makeDeps({ axiomLatest: async () => ({ ok: false, error: 'Axiom HTTP 401' }) });
    const body: any = await (await setup(deps)).get('/api/recourse/fleet/voice').then((r) => r.json());
    expect(body.axiom.loop).toBeNull();
    expect(body.axiom.loopError).toBe('Axiom HTTP 401');
    expect(body.briefs.axiom).toContain('Axiom HTTP 401');
  });

  it('says no loop exists when the bridge is up but Axiom has run none', async () => {
    const deps = makeDeps({ axiomLatest: async () => ({ ok: true, state: {} }) });
    const body: any = await (await setup(deps)).get('/api/recourse/fleet/voice').then((r) => r.json());
    expect(body.axiom.loop).toBeNull();
    expect(body.axiom.noLoopYet).toBe(true);
    expect(body.axiom.loopError).toBeNull();
    expect(body.briefs.axiom).toContain('No project loop has been recorded yet');
  });

  it('degrades to an honest offline state when a probe throws', async () => {
    const deps = makeDeps({
      axiomStatus: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const res = await (await setup(deps)).get('/api/recourse/fleet/voice');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.axiom.online).toBe(false);
    expect(body.axiom.loopError).toContain('ECONNREFUSED');
  });

  it('reports no audit rather than a fabricated grade', async () => {
    const deps = makeDeps({ audit: () => null });
    const body: any = await (await setup(deps)).get('/api/recourse/fleet/voice').then((r) => r.json());
    expect(body.openhub.recorded).toBe(false);
    expect(body.openhub.audit).toBeNull();
    expect(body.briefs.openhub).toContain('has not recorded an audit snapshot');
  });

  it('treats a throwing audit reader as no audit', async () => {
    const deps = makeDeps({
      audit: () => {
        throw new Error('malformed snapshot');
      },
    });
    const body: any = await (await setup(deps)).get('/api/recourse/fleet/voice').then((r) => r.json());
    expect(body.openhub.recorded).toBe(false);
    expect(body.openhub.audit).toBeNull();
  });
});
