import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { axiomReachable, integrateAxiomTool } from '../src/lib/axiomBridge.js';

const AXIOM = 'http://127.0.0.1:3198';
const ADD_CODE = 'export function add(a, b) { return a + b; }';
const PASSING_SUITE = 'assert(add(2, 3) === 5);';
const FAILING_SUITE = 'assert(add(2, 3) === 999);';

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let selfHostRoot: string;
let prevSelfHostDir: string | undefined;

beforeAll(() => {
  prevSelfHostDir = process.env.SELFHOST_DIR;
  selfHostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-selfhost-'));
  process.env.SELFHOST_DIR = selfHostRoot;
});

afterAll(() => {
  if (prevSelfHostDir === undefined) delete process.env.SELFHOST_DIR;
  else process.env.SELFHOST_DIR = prevSelfHostDir;
  fs.rmSync(selfHostRoot, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('axiomBridge — axiomReachable', () => {
  it('returns true when the health endpoint answers 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ status: 'ok' })));
    expect(await axiomReachable()).toBe(true);
  });

  it('returns false when the health endpoint answers non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect(await axiomReachable()).toBe(false);
  });

  it('returns false when the health endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await axiomReachable()).toBe(false);
  });

  it('returns false when the health endpoint never answers (abort timer fires)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      })),
    );
    expect(await axiomReachable()).toBe(false);
  });
});

describe('axiomBridge — integrateAxiomTool honest failures', () => {
  it('reports the HTTP status when the axiom build endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const r = await integrateAxiomTool('tool', 'coding', 'do math', PASSING_SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Axiom build failed: 500');
  });

  it('joins the build errors when the build itself failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: false, errors: ['syntax error', 'missing dep'] })));
    const r = await integrateAxiomTool('tool', 'coding', 'do math', PASSING_SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('syntax error | missing dep');
  });

  it('reports an internal build error when no errors list is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: false })));
    const r = await integrateAxiomTool('tool', 'coding', 'do math', PASSING_SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Axiom internal build error');
  });

  it('fails verification when the generated code does not pass the reference suite', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: true, sourceCode: ADD_CODE, engine: 'test' })));
    const r = await integrateAxiomTool('add', 'coding', 'add two numbers', FAILING_SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Verification failed:');
    expect(r.error).toContain('[FAIL]');
  });

  it('refuses to self-host when the entrypoint name is not a valid identifier', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: true, sourceCode: ADD_CODE, engine: 'test' })));
    const r = await integrateAxiomTool('bad name!', 'coding', 'add two numbers', PASSING_SUITE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not a valid identifier/);
  });
});

describe('axiomBridge — integrateAxiomTool success path (real sandbox + self-host)', () => {
  it('verifies, self-hosts, and returns the entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe(`${AXIOM}/api/axiom/build`);
        return okJson({ ok: true, sourceCode: ADD_CODE, engine: 'axiom-test-engine' });
      }),
    );
    const r = await integrateAxiomTool('axiom_add', 'coding', 'add two numbers', PASSING_SUITE);
    expect(r.ok).toBe(true);
    expect(r.selfHosted).toBeDefined();
    expect(r.selfHosted.name).toBe('axiom_add');
    expect(r.selfHosted.entrypointName).toBe('axiom_add');
    expect(r.selfHosted.summary).toContain('axiom-test-engine');
    // The module is genuinely importable from disk.
    const file = path.join(selfHostRoot, 'tools', 'axiom_add.mjs');
    expect(fs.existsSync(file)).toBe(true);
    const mod = await import(`${pathToFileUrl(file)}?t=${Date.now()}`);
    expect(typeof mod.execute).toBe('function');
  });
});

function pathToFileUrl(file: string): string {
  return `file:///${file.replace(/\\/g, '/')}`;
}