import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSelfhostedRouter, type SelfhostedDeps } from '../src/routes/selfhosted';

const servers: http.Server[] = [];
const prevSelfHostDir = process.env.SELFHOST_DIR;
let tmpDir = '';
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-selfhost-'));
  process.env.SELFHOST_DIR = tmpDir;
});
afterAll(() => {
  if (prevSelfHostDir === undefined) delete process.env.SELFHOST_DIR;
  else process.env.SELFHOST_DIR = prevSelfHostDir;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function makeDeps(): SelfhostedDeps {
  return {
    appendProvenanceEvent: vi.fn(),
    generation: () => 1,
    onRemoved: vi.fn(() => ({ registryToolRemoved: false })),
  };
}

async function setup(deps: SelfhostedDeps) {
  const { router } = createSelfhostedRouter(deps);
  const app = express();
  app.use(express.json());
  app.use('/api/recourse', router);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base };
}

describe('self-hosted router (extracted)', () => {
  it('lists (empty) tools and reports sandbox status', async () => {
    const { base } = await setup(makeDeps());
    const list: any = await (await fetch(`${base}/api/recourse/selfhosted`)).json();
    expect(list.success).toBe(true);
    expect(list.count).toBe(0);

    const sandbox: any = await (await fetch(`${base}/api/recourse/selfhosted/sandbox`)).json();
    expect(sandbox.runtime).toBe('quickjs-wasm');
    expect(sandbox.grantsDefault).toBe('deny-all');
    expect(['sandbox', 'direct']).toContain(sandbox.defaultMode);
  });

  it('404s execute / card / web artifact for unknown tools', async () => {
    const { base } = await setup(makeDeps());
    const headers = { 'Content-Type': 'application/json' };
    expect((await fetch(`${base}/api/recourse/selfhosted/nope/execute`, { method: 'POST', headers, body: '{}' })).status).toBe(404);
    expect((await fetch(`${base}/api/recourse/selfhosted/nope/card`)).status).toBe(404);
    expect((await fetch(`${base}/api/recourse/web/artifact/nope`)).status).toBe(404);
  });

  it('lists loops (none) and refuses to supervise a non-loop', async () => {
    const { base } = await setup(makeDeps());
    const loops: any = await (await fetch(`${base}/api/recourse/selfhosted/loops`)).json();
    expect(loops.success).toBe(true);
    expect(loops.running).toEqual([]);

    const start = await fetch(`${base}/api/recourse/selfhosted/loops/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'nope' }),
    });
    const body: any = await start.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a supervised loop/);
  });

  it('404s delete of an unknown tool without invoking onRemoved', async () => {
    const deps = makeDeps();
    const { base } = await setup(deps);
    const res = await fetch(`${base}/api/recourse/selfhosted/nope`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(deps.onRemoved).not.toHaveBeenCalled();
  });
});
