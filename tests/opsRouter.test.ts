import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { createOpsRouter } from '../src/routes/ops';
import { openPolicyEngine } from '../src/lib/policy';
import { openApprovalStore } from '../src/lib/approvals';

const servers: http.Server[] = [];
const dirs: string[] = [];
function freshFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-ops-'));
  dirs.push(dir);
  return path.join(dir, name);
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function setup(requireReadAuth?: (req: Request, res: Response) => boolean) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/recourse/ops',
    createOpsRouter({
      requireMutationAuth: () => true,
      policy: openPolicyEngine(freshFile('policy.json')),
      approvals: openApprovalStore(freshFile('approvals.json')),
      ...(requireReadAuth ? { requireReadAuth } : {}),
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as any).port}`;
}

describe('ops router read-auth guard', () => {
  it('is open by default (local-first)', async () => {
    const base = await setup();
    expect((await fetch(`${base}/api/recourse/ops/policy`)).status).toBe(200);
    expect((await fetch(`${base}/api/recourse/ops/approvals`)).status).toBe(200);
    expect((await fetch(`${base}/api/recourse/ops/traces`)).status).toBe(200);
    expect((await fetch(`${base}/api/recourse/ops/tracing/status`)).status).toBe(200);
  });

  it('blocks telemetry reads when the guard refuses', async () => {
    const guard = (_req: Request, res: Response) => {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return false;
    };
    const base = await setup(guard);
    for (const p of ['policy', 'approvals', 'traces', 'tracing/status']) {
      expect((await fetch(`${base}/api/recourse/ops/${p}`)).status).toBe(401);
    }
  });
});
