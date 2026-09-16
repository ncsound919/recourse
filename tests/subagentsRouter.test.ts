import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createSubagentsRouter, type SubagentsDeps } from '../src/routes/subagents';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function makeDeps(overrides: Partial<SubagentsDeps> = {}): SubagentsDeps {
  const state = {
    swarmStatus: { agents: [{ id: 'a1' }], isSwarmAutopilotActive: false, activeTaskQueue: [] as Array<{ status: string }> },
    intervalMs: 1000,
    model: 'test-model',
    busy: false,
  };
  return {
    status: () => state,
    toggleAutopilot: vi.fn(() => {
      state.swarmStatus.isSwarmAutopilotActive = !state.swarmStatus.isSwarmAutopilotActive;
      return state.swarmStatus.isSwarmAutopilotActive;
    }),
    dispatch: vi.fn(() => ({ swarmStatus: state.swarmStatus, newTask: { id: 't1' } })),
    process: vi.fn(async (limit: number) => limit),
    ...overrides,
  };
}

async function setup(deps: SubagentsDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/subagents', createSubagentsRouter(deps));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (p: string, body: unknown) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post };
}

describe('subagents router (extracted)', () => {
  it('reports status with an honest executor note', async () => {
    const deps = makeDeps();
    const { base } = await setup(deps);
    const body: any = await (await fetch(`${base}/api/recourse/subagents/status`)).json();
    expect(body.success).toBe(true);
    expect(body.model).toBe('test-model');
    expect(body.executorNote).toBe('idle');
  });

  it('notes queued tasks awaiting a provider', async () => {
    const deps = makeDeps();
    deps.status = () => ({
      swarmStatus: { agents: [{ id: 'a1' }], isSwarmAutopilotActive: true, activeTaskQueue: [{ status: 'queued' }] },
      intervalMs: 1000,
      model: 'm',
      busy: false,
    });
    const { base } = await setup(deps);
    const body: any = await (await fetch(`${base}/api/recourse/subagents/status`)).json();
    expect(body.executorNote).toMatch(/queued tasks/);
  });

  it('toggles autopilot through the injected op', async () => {
    const deps = makeDeps();
    const { post } = await setup(deps);
    const body: any = await (await post('/api/recourse/subagents/toggle-autopilot', {})).json();
    expect(body).toEqual({ success: true, isSwarmAutopilotActive: true });
    expect(deps.toggleAutopilot).toHaveBeenCalledTimes(1);
  });

  it('validates dispatch input and unknown agents', async () => {
    const { post } = await setup(makeDeps());
    expect((await post('/api/recourse/subagents/dispatch', {})).status).toBe(400);
    expect((await post('/api/recourse/subagents/dispatch', { agentType: 'nope', title: 't', domain: 'coding' })).status).toBe(400);
  });

  it('dispatches a valid task (queued, never claimed complete)', async () => {
    const deps = makeDeps();
    const { post } = await setup(deps);
    const res = await post('/api/recourse/subagents/dispatch', { agentType: 'a1', title: 't', domain: 'coding' });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.note).toMatch(/QUEUED/);
    expect(deps.dispatch).toHaveBeenCalledWith('a1', 't', 'coding');
  });

  it('clamps the process limit and returns the processed count', async () => {
    const deps = makeDeps();
    const { post } = await setup(deps);
    const body: any = await (await post('/api/recourse/subagents/process', { limit: 99 })).json();
    expect(body.processedCount).toBe(5);
    expect(deps.process).toHaveBeenCalledWith(5);
  });
});
