import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createReporterRouter, type ReporterRouterDeps } from '../src/routes/reporter';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function makeDeps(overrides: Partial<ReporterRouterDeps> = {}): ReporterRouterDeps {
  return {
    requireMutationAuth: () => true,
    cadenceMs: () => 7200_000,
    status: () => ({ fingerprint: 'abc', version: 1 }),
    voices: () => [{ id: 'v1' }],
    formats: () => [{ id: 'f1' }],
    protocolsCount: () => 3,
    soulLoaded: () => true,
    preview: vi.fn(async () => ({ fingerprint: 'preview' })),
    latest: () => ({ fingerprint: 'latest' }),
    articles: vi.fn(() => [{ fingerprint: 'a1' }]),
    article: (fp: string) => (fp === 'a1' ? { fingerprint: 'a1' } : undefined),
    generate: vi.fn(async () => ({ written: true, article: { fingerprint: 'new' } })),
    narrate: vi.fn(async () => ({ kind: 'ok' as const, article: { fingerprint: 'latest', narration: { prose: 'hi' } } })),
    ...overrides,
  };
}

async function setup(deps: ReporterRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/reporter', createReporterRouter(deps));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (p: string, body: unknown) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post };
}

describe('reporter router (extracted)', () => {
  it('serves status and voices', async () => {
    const { base } = await setup(makeDeps());
    const status: any = await (await fetch(`${base}/api/recourse/reporter/status`)).json();
    expect(status.success).toBe(true);
    expect(status.cadenceMs).toBe(7200_000);
    expect(status.soulLoaded).toBe(true);

    const voices: any = await (await fetch(`${base}/api/recourse/reporter/voices`)).json();
    expect(voices.protocols).toBe(3);
  });

  it('defaults the articles limit to 20 and honours an explicit limit', async () => {
    const deps = makeDeps();
    const { base } = await setup(deps);
    await fetch(`${base}/api/recourse/reporter/articles`);
    expect(deps.articles).toHaveBeenCalledWith(20);
    await fetch(`${base}/api/recourse/reporter/articles?limit=5`);
    expect(deps.articles).toHaveBeenCalledWith(5);
  });

  it('404s an unknown article fingerprint', async () => {
    const { base } = await setup(makeDeps());
    expect((await fetch(`${base}/api/recourse/reporter/article/a1`)).status).toBe(200);
    expect((await fetch(`${base}/api/recourse/reporter/article/nope`)).status).toBe(404);
  });

  it('previews an article', async () => {
    const { base } = await setup(makeDeps());
    const body: any = await (await fetch(`${base}/api/recourse/reporter/preview?voice=v1`)).json();
    expect(body).toMatchObject({ success: true, preview: true });
  });

  it('guards generate/narrate and maps narrate outcomes', async () => {
    const guarded = makeDeps({ requireMutationAuth: (_req, res) => { res.status(401).json({ success: false, error: 'unauthorized' }); return false; } });
    const g = await setup(guarded);
    expect((await g.post('/api/recourse/reporter/generate', {})).status).toBe(401);
    expect((await g.post('/api/recourse/reporter/narrate', {})).status).toBe(401);

    const notFound = makeDeps({ narrate: async () => ({ kind: 'not_found' as const }) });
    expect((await (await setup(notFound)).post('/api/recourse/reporter/narrate', {})).status).toBe(404);

    const unavailable = makeDeps({ narrate: async () => ({ kind: 'unavailable' as const, payload: { error: 'model offline' } }) });
    const u = await (await setup(unavailable)).post('/api/recourse/reporter/narrate', {});
    expect(u.status).toBe(503);
    expect(((await u.json()) as any).error).toBe('model offline');

    const ok = makeDeps();
    const okRes = await (await setup(ok)).post('/api/recourse/reporter/narrate', {});
    expect(okRes.status).toBe(200);
    expect(((await okRes.json()) as any).available).toBe(true);
  });
});
