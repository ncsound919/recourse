/**
 * Regression tests for the 2026-09-24 audit fixes.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createStateStore } from '../src/lib/stateStore';
import { runJsonLine } from '../src/lib/jsonLineRunner';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'audit-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('stateStore hardening', () => {
  it('one corrupt row no longer discards the whole persisted state', () => {
    const file = join(tmp(), 'state.json');
    const s1 = createStateStore({ stateFile: file, getPayload: () => ({ a: [1, 2], b: { x: 1 } }), debounceMs: 10_000 });
    s1.save();
    s1.flush();
    s1.close();
    const raw = new Database(file);
    raw.prepare('INSERT INTO kv_state(key, value) VALUES(?, ?)').run('broken', '{not json');
    raw.close();
    const s2 = createStateStore({ stateFile: file, getPayload: () => ({}), debounceMs: 10_000 });
    const loaded = s2.load<Record<string, unknown>>();
    s2.close();
    expect(loaded).toEqual({ a: [1, 2], b: { x: 1 } });
  });

  it('close() persists a pending debounced save instead of dropping it', () => {
    const file = join(tmp(), 'state.json');
    let value = 1;
    const s = createStateStore({ stateFile: file, getPayload: () => ({ v: value }), debounceMs: 60_000 });
    value = 42;
    s.save(); // still debouncing
    s.close();
    const raw = new Database(file, { readonly: true });
    const row = raw.prepare('SELECT value FROM kv_state WHERE key = ?').get('v') as { value: string } | undefined;
    raw.close();
    expect(row?.value).toBe('42');
  });

  it('only rewrites keys whose content changed', () => {
    const file = join(tmp(), 'state.json');
    const payload: Record<string, unknown> = { a: 1, b: 2 };
    const s = createStateStore({ stateFile: file, getPayload: () => payload, debounceMs: 10_000 });
    s.save(); s.flush();
    const raw = new Database(file);
    // Tamper with `a` behind the store's back; an unchanged payload must not rewrite it.
    raw.prepare('UPDATE kv_state SET value = ? WHERE key = ?').run('999', 'a');
    payload.b = 3;
    s.save(); s.flush();
    const rows = Object.fromEntries((raw.prepare('SELECT key, value FROM kv_state').all() as Array<{ key: string; value: string }>).map((r) => [r.key, r.value]));
    raw.close();
    s.close();
    expect(rows).toEqual({ a: '999', b: '3' });
  });
});

describe('runJsonLine (shared Python runner bridge)', () => {
  const node = process.execPath;

  it('parses the last JSON line of a well-behaved runner', async () => {
    const d = tmp();
    const runner = join(d, 'ok.cjs');
    writeFileSync(runner, "let b='';process.stdin.on('data',c=>b+=c).on('end',()=>{const m=JSON.parse(b);console.log('noise');console.log(JSON.stringify({ok:true,echo:m.x}))})");
    const r = await runJsonLine({ python: node, runner, payload: { x: 'é✓' }, timeoutMs: 10_000, label: 't' });
    expect(r).toEqual({ ok: true, data: { ok: true, echo: 'é✓' } });
  });

  it('a runner that exits without reading stdin does not crash the host (EPIPE)', async () => {
    const d = tmp();
    const runner = join(d, 'die.cjs');
    writeFileSync(runner, 'process.exit(3)');
    const r = await runJsonLine({ python: node, runner, payload: { big: 'x'.repeat(1 << 20) }, timeoutMs: 10_000, label: 't' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exit 3/);
  });

  it('reports a missing interpreter as ok:false', async () => {
    const r = await runJsonLine({ python: '/definitely/not/a/python', runner: 'x.py', payload: {}, timeoutMs: 5_000, label: 't' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/t (error|spawn failed)/);
  });

  it('times out a hung runner', async () => {
    const d = tmp();
    const runner = join(d, 'hang.cjs');
    writeFileSync(runner, 'setInterval(()=>{},1000)');
    const r = await runJsonLine({ python: node, runner, payload: {}, timeoutMs: 300, label: 't' });
    expect(r).toEqual({ ok: false, error: 't timed out after 300ms' });
  });
});

describe('suite interpretation (shared by in-process + isolate runners)', async () => {
  const { buildSuiteStatements, executeTestSuite } = await import('../src/lib/executionSandbox');

  it('does not split inside a string containing an escaped quote', () => {
    const { statements } = buildSuiteStatements('function f(s){return s}', "assert f('it\\'s; fine') === 'it\\'s; fine'; assert f('a') === 'a'");
    expect(statements).toHaveLength(2);
  });

  it('supports deepStrictEqual and compares objects independent of key order', () => {
    const src = 'function g(){ return { b: 2, a: [1, { y: 1, x: 0 }] }; }';
    const r = executeTestSuite(src, "assert.deepStrictEqual(g(), { a: [1, { x: 0, y: 1 }], b: 2 }); assert.deepEqual(g(), { a: [1, { x: 0, y: 1 }], b: 2 })");
    expect(r.passed).toBe(true);
    const bad = executeTestSuite(src, "assert.deepStrictEqual(g(), { a: [1, { x: 0, y: '1' }], b: 2 })");
    expect(bad.passed).toBe(false);
  });
});

describe('sandbox net driver containment', async () => {
  const http = await import('node:http');
  const { createNodeDrivers } = await import('../src/lib/wasmSandbox/drivers');

  it('does not follow redirects out of the granted host, and caps the body', async () => {
    let hitTarget = false;
    const srv = http.createServer((req, res) => {
      if (req.url === '/redirect') { res.writeHead(302, { Location: '/secret' }); res.end(); return; }
      if (req.url === '/secret') { hitTarget = true; res.end('secret'); return; }
      res.end('x'.repeat(3 * 1024 * 1024));
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as import('node:net').AddressInfo).port;
    try {
      const d = createNodeDrivers({ fsRoot: tmp() });
      const r = await d.netDriver(`http://127.0.0.1:${port}/redirect`);
      expect(r.status).toBe(302);
      expect(hitTarget).toBe(false);
      const big = await d.netDriver(`http://127.0.0.1:${port}/big`);
      expect(big.body.length).toBe(2 * 1024 * 1024);
    } finally {
      srv.close();
    }
  });
});

describe('self-hosted modules never run host-capable code in the server realm', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const sh = await import('../src/lib/selfHosting');

  it('refuses a direct in-process import of a source that references host globals', async () => {
    const root = tmp();
    const marker = path.join(root, 'pwned.txt');
    const src = `if (typeof process !== 'undefined') { globalThis.__pwned = ${JSON.stringify(marker)}; }\nexport function probe(x){ return x; }`;
    const w = sh.writeStatelessSelfHostedTool({ name: 'probe_host', domain: 'coding', entrypointName: 'probe', sourceCode: src, testSuiteCode: 'assert probe(1) === 1;', summary: 'probe' }, root);
    expect(w.success).toBe(true);
    const r = await sh.executeSelfHostedTool('probe_host', { method: 'probe', args: [1] }, root, { mode: 'direct' });
    expect(r.success).toBe(false);
    expect((r as { error?: string }).error).toMatch(/in-process import refused/);
    expect((globalThis as any).__pwned).toBeUndefined();
    // Boot re-verify must not import it either, but still verifies it statically + in the isolate.
    const entry = sh.getSelfHostedEntry('probe_host', root)!;
    const v = await sh.verifySelfHostedEntry(entry, root);
    expect((globalThis as any).__pwned).toBeUndefined();
    expect(v.passed).toBe(true);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('refuses to import a module whose file changed after it was verified', async () => {
    const root = tmp();
    const w = sh.writeStatelessSelfHostedTool({ name: 'tamper', domain: 'coding', entrypointName: 'id', sourceCode: 'export function id(x){ return x; }', testSuiteCode: 'assert id(2) === 2;', summary: 'id' }, root);
    expect(w.success).toBe(true);
    if (!w.success) return;
    const file = path.join(root, w.entry.file);
    fs.appendFileSync(file, '\nglobalThis.__tampered = true;\n');
    const r = await sh.executeSelfHostedTool('tamper', { method: 'id', args: [1] }, root, { mode: 'direct' });
    expect(r.success).toBe(false);
    expect((globalThis as any).__tampered).toBeUndefined();
  });
});

describe('readJsonlTail', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { readJsonlTail } = await import('../src/lib/jsonlTail');

  it('returns the last N records across chunk boundaries and skips torn lines', () => {
    const file = path.join(tmp(), 'x.jsonl');
    const rows = Array.from({ length: 5000 }, (_, i) => JSON.stringify({ i, pad: 'y'.repeat(50) }));
    rows.splice(4990, 0, '{"torn":');
    fs.writeFileSync(file, rows.join('\n') + '\n');
    const tail = readJsonlTail<{ i: number }>(file, 20);
    expect(tail).toHaveLength(20);
    expect(tail[tail.length - 1].i).toBe(4999);
    expect(readJsonlTail(file, 1e9)).toHaveLength(5000);
    expect(readJsonlTail(path.join(tmp(), 'missing.jsonl'), 5)).toEqual([]);
  });
});

describe('problem minting rejects suites a trivial stub can pass', async () => {
  const { mintProblems, trivialStubPassing } = await import('../src/lib/openEnded/problemMint');
  const { executeTestSuite } = await import('../src/lib/executionSandbox');
  const verify = (src: string, suite: string) => executeTestSuite(src, suite);

  it('flags degenerate suites and admits discriminating ones', async () => {
    expect(trivialStubPassing('fidelity', 'assert Math.abs(fidelity(1,0,0,0,0.5) - 1) < 1e-9;', verify)).toBe('return 1;');
    expect(trivialStubPassing('addOne', 'assert addOne(1) === 2; assert addOne(5) === 6;', verify)).toBeNull();
    const draft = JSON.stringify({
      problems: [
        { title: 'Weak', domain: 'math', statement: 's', functionName: 'fidelity', acceptanceTest: 'assert Math.abs(fidelity(1,0,0,0,0.5) - 1) < 1e-9;', referenceSource: 'function fidelity(a){ return 1; }' },
        { title: 'Strong', domain: 'coding', statement: 's', functionName: 'addOne', acceptanceTest: 'assert addOne(1) === 2; assert addOne(5) === 6;', referenceSource: 'function addOne(n){ return n + 1; }' },
      ],
    });
    const res = await mintProblems({ context: 'c', count: 2, draft: async () => draft, verify });
    expect(res.minted.map((m) => m.functionName)).toEqual(['addOne']);
    expect(res.rejected[0]).toMatchObject({ reason: 'acceptance_too_weak', title: 'Weak' });
  });
});

describe('sqlite memory drivers count without materializing rows', async () => {
  const path = await import('node:path');
  const { createSqliteMemoryDrivers } = await import('../src/lib/memory/sqliteDrivers');

  it('count() matches list().length', () => {
    const d = createSqliteMemoryDrivers(path.join(tmp(), 'm.sqlite'));
    try {
      for (let i = 1; i <= 3; i++) {
        d.episodeDriver.append({ id: `ep-${i}`, timestamp: i, problemFingerprint: 'p', outcome: 'win', score: 1, geneIds: [], summary: '' } as any);
      }
      expect(d.episodeDriver.count?.()).toBe(3);
      expect(d.episodeDriver.list()).toHaveLength(3);
      expect(d.semanticDriver.count?.()).toBe(0);
    } finally {
      d.close();
    }
  });
});
