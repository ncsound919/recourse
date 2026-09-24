import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { integrateAxiomTool } from '../src/lib/axiomBridge.js';

const SUITE = 'assert add(2, 3) === 5;';
const CLEAN = 'export function add(a, b) { return a + b; }';
// Passes the suite but uses a nondeterministic API — the quality gate must
// refuse to materialize it as a self-hosted module.
const NONDET = 'export function add(a, b) { if (Math.random() < 2) return a + b; return a + b; }';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

let root: string;
let prev: string | undefined;

beforeAll(() => {
  prev = process.env.SELFHOST_DIR;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-qgate-'));
  process.env.SELFHOST_DIR = root;
});
afterAll(() => {
  if (prev === undefined) delete process.env.SELFHOST_DIR; else process.env.SELFHOST_DIR = prev;
  fs.rmSync(root, { recursive: true, force: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('axiomBridge — self-hosting is quality-gated', () => {
  it('rejects a nondeterministic source before writing a module', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: true, sourceCode: NONDET, engine: 'test' })));
    const r = await integrateAxiomTool('axiom_nondet', 'coding', 'add', SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Quality gate/);
    expect(fs.existsSync(path.join(root, 'tools', 'axiom_nondet.mjs'))).toBe(false);
  });

  it('still self-hosts a clean source', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: true, sourceCode: CLEAN, engine: 'test' })));
    const r = await integrateAxiomTool('axiom_clean', 'coding', 'add', SUITE);
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    expect(fs.existsSync(path.join(root, 'tools', 'axiom_clean.mjs'))).toBe(true);
  });
});
