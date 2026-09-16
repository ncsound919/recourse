import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createSchedulerRouter } from '../src/routes/scheduler';
import { registerScheduledJob } from '../src/lib/jobScheduler';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function setup(guard?: (req: express.Request, res: express.Response) => boolean) {
  const onJobToggled = vi.fn();
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/scheduler', createSchedulerRouter({ onJobToggled, ...(guard ? { requireMutationAuth: guard } : {}) }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (p: string, body: unknown) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post, onJobToggled };
}

describe('scheduler router (extracted)', () => {
  it('lists scheduler status', async () => {
    const { base } = await setup();
    const body: any = await (await fetch(`${base}/api/recourse/scheduler`)).json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  it('validates toggle input and rejects unknown jobs', async () => {
    const { post, onJobToggled } = await setup();
    expect((await post('/api/recourse/scheduler/toggle', {})).status).toBe(400);
    const unknown = await post('/api/recourse/scheduler/toggle', { id: 'does_not_exist', enabled: true });
    expect(unknown.status).toBe(404);
    expect(onJobToggled).not.toHaveBeenCalled();
  });

  it('rejects triggering an unknown job with 409', async () => {
    const { post } = await setup();
    expect((await post('/api/recourse/scheduler/trigger', { id: 'does_not_exist' })).status).toBe(409);
    expect((await post('/api/recourse/scheduler/trigger', {})).status).toBe(400);
  });

  it('enforces the mutation guard on toggle/trigger when provided', async () => {
    const guard = (_req: express.Request, res: express.Response) => {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return false;
    };
    const { base, post } = await setup(guard);
    expect((await post('/api/recourse/scheduler/toggle', { id: 'x', enabled: true })).status).toBe(401);
    expect((await post('/api/recourse/scheduler/trigger', { id: 'x' })).status).toBe(401);
    // Reads stay open.
    expect((await fetch(`${base}/api/recourse/scheduler`)).status).toBe(200);
  });

  it('toggles a real job and fires the onJobToggled hook', async () => {
    const { post, onJobToggled } = await setup();
    const id = `test_job_${Date.now().toString(36)}`;
    const reg = registerScheduledJob({ id, name: 'Test Job', group: 'system', cadenceMs: 60_000, enabledByDefault: false, run: async () => ({ ok: true }) });
    expect(reg.ok).toBe(true);

    const res = await post('/api/recourse/scheduler/toggle', { id, enabled: true });
    expect(res.status).toBe(200);
    expect(onJobToggled).toHaveBeenCalledWith(id, true);
  });
});
