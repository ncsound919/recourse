import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { createSelfImprovementRouter } from '../src/routes/selfImprovement';
import { openNightlyStore } from '../src/lib/nightlyLoop';
import { openApprovalStore } from '../src/lib/approvals';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-selfimp-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function setup() {
  const dir = freshDir();
  const nightly = openNightlyStore(path.join(dir, 'nightly.json'));
  const approvals = openApprovalStore(path.join(dir, 'approvals.json'));
  const guard = (req: Request, res: Response) => {
    if (req.headers['x-secret'] === 's') return true;
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  };
  const runCycle = async (force: boolean) => {
    nightly.save({ key: '2026-09-16', startedAt: 1, finishedAt: 2, forced: force, skipped: false, steps: [], reportMarkdown: '# Recourse Upgrade Report\nno change' });
    return nightly.get('2026-09-16')!;
  };
  const router = createSelfImprovementRouter({ nightly, approvals, requireMutationAuth: guard, runCycle });
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/self-improvement', router);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return { base: `http://127.0.0.1:${(server.address() as any).port}`, approvals };
}

const post = (url: string, body: unknown, secret = true) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-secret': 's' } : {}) }, body: JSON.stringify(body) });

describe('self-improvement router', () => {
  it('guards writes', async () => {
    const { base } = await setup();
    // Reads are config-gated (open when RECOURSE_API_SECRET is unset); writes are strict.
    const status = await fetch(`${base}/api/recourse/self-improvement/status`);
    expect(status.status).toBe(200);
    const body = await status.json();
    expect(body.policy.safety.length).toBeGreaterThan(0);

    const run = await fetch(`${base}/api/recourse/self-improvement/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(run.status).toBe(401);
  });

  it('runs a cycle and serves the report', async () => {
    const { base } = await setup();
    expect((await fetch(`${base}/api/recourse/self-improvement/report`, { headers: { 'x-secret': 's' } })).status).toBe(404);
    const run = await post(`${base}/api/recourse/self-improvement/run`, { force: true });
    expect(run.status).toBe(200);
    expect((await run.json()).run.key).toBe('2026-09-16');

    const md = await fetch(`${base}/api/recourse/self-improvement/report?format=md`, { headers: { 'x-secret': 's' } });
    expect(md.status).toBe(200);
    expect(await md.text()).toContain('Recourse Upgrade Report');
  });

  it('classifies a target path', async () => {
    const { base } = await setup();
    const safety = await (await post(`${base}/api/recourse/self-improvement/classify`, { file: 'src/lib/policy.ts' })).json();
    expect(safety.decision.allowed).toBe(false);
    const harness = await (await post(`${base}/api/recourse/self-improvement/classify`, { file: 'server.ts' })).json();
    expect(harness.decision.requiresApproval).toBe(true);
    expect(harness.targetClass).toBe('harness');
  });

  it('lists and decides self-modification approvals', async () => {
    const { base, approvals } = await setup();
    const req = approvals.request({ action: { kind: 'self.modify', target: 'server.ts', mutating: true }, reason: 'core change' });
    const list = await (await fetch(`${base}/api/recourse/self-improvement/approvals`, { headers: { 'x-secret': 's' } })).json();
    expect(list.approvals).toHaveLength(1);
    expect(list.approvals[0].id).toBe(req.id);

    const decided = await post(`${base}/api/recourse/self-improvement/approvals/${req.id}/decide`, { status: 'approved' });
    expect(decided.status).toBe(200);
    expect((await decided.json()).approval.status).toBe('approved');

    const again = await post(`${base}/api/recourse/self-improvement/approvals/${req.id}/decide`, { status: 'rejected' });
    expect(again.status).toBe(409);
  });
});
