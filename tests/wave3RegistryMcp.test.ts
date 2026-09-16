import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSkillRegistry } from '../src/lib/skillRegistry';
import { handleMcpHttp } from '../src/lib/mcpHttp';
import type { A2aOperation, A2aSkill } from '../src/lib/a2a';

const dirs: string[] = [];
function freshFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-w3-'));
  dirs.push(dir);
  return path.join(dir, name);
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const readSkill: A2aSkill = { id: 'recourse.status', name: 'status', description: 'read status', tags: ['read'] };
const writeSkill: A2aSkill = { id: 'recourse.run_forge', name: 'forge', description: 'run forge', tags: ['write'], mutating: true };
const operations: Record<string, A2aOperation> = {
  'recourse.status': { skill: readSkill, run: () => ({ ready: true }) },
  'recourse.run_forge': { skill: writeSkill, run: (args) => ({ forged: args.count ?? 1 }) },
};
const deps = { operations, authorize: (ctx: { scopes: string[] }, required: string) => ctx.scopes.includes(required) };

describe('MCP HTTP transport', () => {
  it('handles initialize, tools/list and ping', async () => {
    const init = await handleMcpHttp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, deps);
    expect((init.body as any).result.serverInfo.name).toBe('recourse');

    const list = await handleMcpHttp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, deps);
    const names = (list.body as any).result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(['recourse.run_forge', 'recourse.status']);

    const ping = await handleMcpHttp({ jsonrpc: '2.0', id: 3, method: 'ping' }, deps);
    expect(ping.status).toBe(200);
  });

  it('enforces per-tool scopes', async () => {
    const read = await handleMcpHttp(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'recourse.status' } },
      deps,
      ['read'],
    );
    expect((read.body as any).result.isError).toBe(false);

    const denied = await handleMcpHttp(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'recourse.run_forge' } },
      deps,
      ['read'],
    );
    expect(denied.status).toBe(401);
    expect((denied.body as any).error.code).toBe(-32001);

    const allowed = await handleMcpHttp(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'recourse.run_forge', arguments: { count: 2 } } },
      deps,
      ['read', 'write'],
    );
    expect((allowed.body as any).result.content[0].text).toContain('"forged":2');
  });

  it('reports unknown tools and methods without throwing', async () => {
    const unknownTool = await handleMcpHttp(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope' } },
      deps,
      ['write'],
    );
    expect((unknownTool.body as any).error.code).toBe(-32602);
    const unknownMethod = await handleMcpHttp({ jsonrpc: '2.0', id: 8, method: 'nonsense' }, deps);
    expect((unknownMethod.body as any).error.code).toBe(-32601);
  });
});

describe('signed skill registry', () => {
  const prev = process.env.RECOURSE_SKILL_SECRET;
  beforeAll(() => { process.env.RECOURSE_SKILL_SECRET = 'skill-secret'; });
  afterAll(() => { if (prev === undefined) delete process.env.RECOURSE_SKILL_SECRET; else process.env.RECOURSE_SKILL_SECRET = prev; });

  it('publishes a signed entry and verifies it', () => {
    const file = freshFile('skills.json');
    const reg = openSkillRegistry(file);
    const pub = reg.publish({ id: 'dedupe', name: 'Dedupe', version: '1.0.0', description: 'dedupe util', license: 'MIT', source: 'export function dedupe(){}' });
    expect(pub.ok).toBe(true);
    expect(pub.signed).toBe(true);
    expect(reg.verify('dedupe').valid).toBe(true);
    expect(reg.list().map((e) => e.id)).toEqual(['dedupe']);
  });

  it('detects a tampered entry and supports revoke', () => {
    const file = freshFile('skills.json');
    const reg = openSkillRegistry(file);
    reg.publish({ id: 'x', name: 'X', version: '1.0.0', description: 'd' });
    // Rewrite the stored doc with a tampered version to simulate corruption.
    const doc = JSON.parse(fs.readFileSync(file, 'utf-8'));
    doc.entries[0].version = '9.9.9';
    fs.writeFileSync(file, JSON.stringify(doc), 'utf-8');
    expect(openSkillRegistry(file).verify('x').valid).toBe(false);

    const reg2 = openSkillRegistry(file);
    expect(reg2.revoke('x').ok).toBe(true);
    expect(reg2.list()).toHaveLength(0);
    expect(reg2.verify('x').found).toBe(false);
  });
});
