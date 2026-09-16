import { describe, expect, it } from 'vitest';
import {
  agentCard,
  handleA2aRpc,
  A2A_SKILLS,
  clearA2aTaskStore,
  type A2aOperation,
} from '../src/lib/a2a';

function ops(): Record<string, A2aOperation> {
  const read = A2A_SKILLS.find((s) => s.id === 'recourse.status')!;
  const write = A2A_SKILLS.find((s) => s.id === 'recourse.run_forge')!;
  return {
    'recourse.status': { skill: read, run: () => ({ ready: true, gen: 7 }) },
    'recourse.run_forge': { skill: write, run: (args) => ({ forged: args.count ?? 1 }) },
  };
}

describe('A2A agent card', () => {
  it('advertises the skills and a JSONRPC endpoint', () => {
    const card = agentCard('https://recourse.example.com');
    expect(card.url).toBe('https://recourse.example.com/api/a2a');
    expect(card.preferredTransport).toBe('JSONRPC');
    const skills = card.skills as any[];
    expect(skills.map((s) => s.id)).toContain('recourse.status');
    expect(skills.map((s) => s.id)).toContain('recourse.run_forge');
  });
});

describe('handleA2aRpc', () => {
  it('runs a read skill from a text part and returns a completed task artifact', async () => {
    const r = await handleA2aRpc(
      { jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', parts: [{ type: 'text', text: 'recourse.status' }] } } },
      { authorized: false, operations: ops(), tasks: new Map(), now: () => 0, idFactory: () => 'task-1' },
    );
    const body = r.body as any;
    expect(r.httpStatus).toBe(200);
    expect(body.result.kind).toBe('task');
    expect(body.result.id).toBe('task-1');
    expect(body.result.status.state).toBe('completed');
    expect(JSON.parse(body.result.artifacts[0].parts[0].text)).toEqual({ ready: true, gen: 7 });
  });

  it('rejects a mutating skill without authorization (HTTP 401) and does not run it', async () => {
    let ran = false;
    const operations = ops();
    operations['recourse.run_forge'] = { skill: operations['recourse.run_forge'].skill, run: () => { ran = true; return {}; } };
    const r = await handleA2aRpc(
      { jsonrpc: '2.0', id: 2, method: 'message/send', params: { skill: 'recourse.run_forge' } },
      { authorized: false, operations, tasks: new Map() },
    );
    expect(r.httpStatus).toBe(401);
    expect((r.body as any).error.code).toBe(-32001);
    expect(ran).toBe(false);
  });

  it('runs a mutating skill when authorized', async () => {
    const r = await handleA2aRpc(
      { jsonrpc: '2.0', id: 3, method: 'message/send', params: { skill: 'recourse.run_forge', arguments: { count: 2 } } },
      { authorized: true, operations: ops(), tasks: new Map(), now: () => 0, idFactory: () => 'task-3' },
    );
    const body = r.body as any;
    expect(JSON.parse(body.result.artifacts[0].parts[0].text)).toEqual({ forged: 2 });
  });

  it('reports an unknown skill as an invalid-params error', async () => {
    const r = await handleA2aRpc(
      { jsonrpc: '2.0', id: 4, method: 'message/send', params: { message: { parts: [{ type: 'text', text: 'do-a-backflip' }] } } },
      { authorized: true, operations: ops(), tasks: new Map() },
    );
    expect((r.body as any).error.code).toBe(-32602);
  });

  it('records tasks so tasks/get retrieves them, and 404s unknown ids', async () => {
    const tasks = new Map();
    await handleA2aRpc(
      { jsonrpc: '2.0', id: 5, method: 'message/send', params: { skill: 'recourse.status' } },
      { authorized: true, operations: ops(), tasks, now: () => 0, idFactory: () => 'task-5' },
    );
    const get = await handleA2aRpc({ jsonrpc: '2.0', id: 6, method: 'tasks/get', params: { id: 'task-5' } }, { authorized: true, operations: ops(), tasks });
    expect(get.httpStatus).toBe(200);
    expect((get.body as any).result.id).toBe('task-5');

    const missing = await handleA2aRpc({ jsonrpc: '2.0', id: 7, method: 'tasks/get', params: { id: 'nope' } }, { authorized: true, operations: ops(), tasks });
    expect(missing.httpStatus).toBe(404);
  });

  it('rejects malformed JSON-RPC and unknown methods without throwing', async () => {
    const bad = await handleA2aRpc({ id: 9, method: 'message/send' }, { authorized: true, operations: ops(), tasks: new Map() });
    expect((bad.body as any).error.code).toBe(-32600);
    const unknown = await handleA2aRpc({ jsonrpc: '2.0', id: 10, method: 'nonsense' }, { authorized: true, operations: ops(), tasks: new Map() });
    expect((unknown.body as any).error.code).toBe(-32601);
  });

  it('surfaces a thrown operation as a failed task, never a fake success', async () => {
    const operations = ops();
    operations['recourse.status'] = { skill: operations['recourse.status'].skill, run: () => { throw new Error('model offline'); } };
    const r = await handleA2aRpc(
      { jsonrpc: '2.0', id: 11, method: 'message/send', params: { skill: 'recourse.status' } },
      { authorized: true, operations, tasks: new Map(), now: () => 0, idFactory: () => 'task-11' },
    );
    const body = r.body as any;
    expect(body.result.status.state).toBe('failed');
    expect(body.result.status.message.parts[0].text).toContain('model offline');
  });
});

describe('default task store', () => {
  it('clears without error', () => {
    clearA2aTaskStore();
    expect(true).toBe(true);
  });
});
