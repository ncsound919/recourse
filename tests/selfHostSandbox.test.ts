import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildComponentFromTemplate, COMPONENT_TEMPLATES, registerComponentTemplatePlugin } from '../src/lib/componentTemplates';
import type { TemplatePlugin } from '../src/lib/templatePlugin';
import { writeSelfHostedTool, writeStatelessSelfHostedTool, executeSelfHostedTool } from '../src/lib/selfHosting';
import {
  executeSelfHostedSandboxed,
  verifySuiteInSandbox,
  isSandboxRuntimeAvailable,
  resetSandbox,
} from '../src/lib/selfHostSandbox';

const roots: string[] = [];
function freshRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-sb-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const r of roots.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

let available = false;
beforeAll(async () => {
  available = await isSandboxRuntimeAvailable();
});

/**
 * A probe template whose methods try to touch host capabilities through the
 * guest bridge. Used to prove default-deny is real and that Node globals are
 * invisible to generated code.
 */
const hostProbe: TemplatePlugin = {
  id: 'tpl_host_capability_probe',
  name: 'Host Capability Probe',
  domain: 'coding',
  category: 'algorithmic',
  description: 'probe',
  params: [],
  defaultScore: 1,
  benchmarkFlops: 1,
  complexity: 'O(1)',
  tags: ['test'],
  synthesizer: () => ({
    sourceCode: `export class HostCapabilityProbe {
  static envVisibility() { return { process: typeof process, require: typeof require }; }
  static readSecret() { return globalThis.__recourse_host.getSecret('RECOURSE_TEST_SECRET'); }
  static readPath(p) { return globalThis.__recourse_host.readFile(p); }
  static fetchUrl(u) { return globalThis.__recourse_host.fetch(u); }
  static spendCents(c) { globalThis.__recourse_host.spend(c, 'probe'); return 'spent'; }
}`,
    testSuiteCode: 'assert true;',
    entrypointName: 'HostCapabilityProbe',
    summary: 'probe',
    selfHealingGuards: [],
  }),
  selfHost: {
    stateful: false,
    methods: [
      { method: 'envVisibility', label: 'env' },
      { method: 'readSecret', label: 'secret' },
      { method: 'readPath', label: 'file' },
      { method: 'fetchUrl', label: 'fetch' },
      { method: 'spendCents', label: 'spend' },
    ],
  },
};

try { registerComponentTemplatePlugin(hostProbe); } catch { /* already registered */ }

function writeProbe(root: string, name: string, grants?: any) {
  const tpl = COMPONENT_TEMPLATES['tpl_host_capability_probe'];
  if (!tpl) throw new Error('probe template missing');
  const built = buildComponentFromTemplate('tpl_host_capability_probe', {}, { withSelfHealing: true, componentName: name });
  if (!built.success) throw new Error(built.error || 'build failed');
  const write = writeSelfHostedTool(
    {
      name,
      templateId: 'tpl_host_capability_probe',
      domain: 'coding',
      entrypointName: built.entrypointName,
      params: {},
      sourceCode: built.synthesizedCode,
      testSuiteCode: built.testSuiteCode,
      summary: 'probe',
      selfHost: tpl.selfHost!,
      grants,
    },
    root,
  );
  if ('error' in write) throw new Error(write.error);
  return write.entry;
}

describe('sandbox is wired into self-hosting', () => {
  it('executes a class tool in the sandbox (mode: sandbox)', async () => {
    if (!available) return;
    const root = freshRoot();
    const tpl = COMPONENT_TEMPLATES['tpl_lru_cache'];
    const built = buildComponentFromTemplate('tpl_lru_cache', { capacity: 2 }, { withSelfHealing: true, componentName: 'SbLru' });
    expect(built.success).toBe(true);
    const write = writeSelfHostedTool(
      {
        name: 'sb_lru', templateId: 'tpl_lru_cache', domain: 'coding',
        entrypointName: built.entrypointName, params: { capacity: 2 },
        sourceCode: built.synthesizedCode, testSuiteCode: built.testSuiteCode,
        summary: 'lru', selfHost: tpl.selfHost!,
      },
      root,
    );
    expect(write.success).toBe(true);
    if (!write.success) return;

    const set = await executeSelfHostedTool('sb_lru', { method: 'set', args: ['k', 7] }, root, { mode: 'sandbox' });
    expect(set.mode).toBe('sandbox');
    expect(set.success, set.success === false ? set.error : '').toBe(true);

    // State persists across separate sandbox calls (same guest context).
    const get = await executeSelfHostedTool('sb_lru', { method: 'get', args: ['k'] }, root, { mode: 'sandbox' });
    expect(get.success).toBe(true);
    if (get.success) expect(get.result).toBe(7);
  });

  it('executes a stateless function tool in the sandbox', async () => {
    if (!available) return;
    const root = freshRoot();
    const write = writeStatelessSelfHostedTool(
      {
        name: 'sb_dedupe', domain: 'coding', entrypointName: 'dedupeStable',
        sourceCode: 'export function dedupeStable(a){ const s=new Set(); const o=[]; for(const x of a){ if(!s.has(x)){s.add(x);o.push(x);} } return o; }',
        testSuiteCode: 'assert dedupeStable([1,2,1,3]).length === 3;',
        summary: 'dedupe',
      },
      root,
    );
    expect(write.success).toBe(true);
    if (!write.success) return;
    const call = await executeSelfHostedTool('sb_dedupe', { method: 'dedupeStable', args: [[3, 1, 3, 2]] }, root, { mode: 'sandbox' });
    expect(call.mode).toBe('sandbox');
    expect(call.success, call.success === false ? call.error : '').toBe(true);
    if (call.success) expect(call.result).toEqual([3, 1, 2]);
  });
});

describe('default-deny grants are enforced (adversarial)', () => {
  it('hides Node globals from generated code', async () => {
    if (!available) return;
    const root = freshRoot();
    writeProbe(root, 'probe_env');
    const res = await executeSelfHostedTool('probe_env', { method: 'envVisibility' }, root, { mode: 'sandbox' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.result).toEqual({ process: 'undefined', require: 'undefined' });
  });

  it('denies secret/fs/net/spend with no grants and never escalates to direct import', async () => {
    if (!available) return;
    const root = freshRoot();
    writeProbe(root, 'probe_deny');

    for (const method of ['readSecret', 'readPath', 'fetchUrl', 'spendCents']) {
      const res = await executeSelfHostedTool(
        'probe_deny',
        method === 'readPath' ? { method, args: ['/etc/passwd'] } : { method, args: method === 'spendCents' ? [10] : [] },
        root,
        { mode: 'auto' },
      );
      expect(res.success, `${method} should be denied`).toBe(false);
      // A denial must not silently fall back to the privileged direct path.
      expect(res.mode).toBe('sandbox');
      if (res.success === false) expect(res.error).toMatch(/denied/);
    }
  });

  it('allows a granted fs read confined to the sandbox root, and rejects escapes', async () => {
    if (!available) return;
    const root = freshRoot();
    const fsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-sbfs-'));
    roots.push(fsRoot);
    fs.mkdirSync(path.join(fsRoot, 'allowed'), { recursive: true });
    fs.writeFileSync(path.join(fsRoot, 'allowed', 'note.txt'), 'hello-grant', 'utf-8');

    writeProbe(root, 'probe_fs', { fs: { paths: ['allowed'], mode: 'read' } });

    const ok = await executeSelfHostedTool('probe_fs', { method: 'readPath', args: ['allowed/note.txt'] }, root, {
      mode: 'sandbox',
      fsRoot,
    });
    expect(ok.success, ok.success === false ? ok.error : '').toBe(true);
    if (ok.success) expect(ok.result).toBe('hello-grant');

    // Path outside the grant allowlist is denied even though the driver could read it.
    const denied = await executeSelfHostedTool('probe_fs', { method: 'readPath', args: ['../escape.txt'] }, root, {
      mode: 'sandbox',
      fsRoot,
    });
    expect(denied.success).toBe(false);
    if (denied.success === false) expect(denied.error).toMatch(/denied|invalid path|outside/);
  });

  it('enforces spend ceilings when a spend grant exists', async () => {
    if (!available) return;
    const root = freshRoot();
    writeProbe(root, 'probe_spend', { spend: { budgetToken: 'w', capCents: 100, perActionCeilingCents: 50 } });
    const ok = await executeSelfHostedTool('probe_spend', { method: 'spendCents', args: [40] }, root, { mode: 'sandbox' });
    expect(ok.success).toBe(true);
    const tooBig = await executeSelfHostedTool('probe_spend', { method: 'spendCents', args: [80] }, root, { mode: 'sandbox' });
    expect(tooBig.success).toBe(false);
    if (tooBig.success === false) expect(tooBig.error).toMatch(/ceiling|denied/);
  });

  it('interrupts a runaway loop at the wall-clock limit', async () => {
    if (!available) return;
    const root = freshRoot();
    writeProbe(root, 'probe_spin');
    const entry = (await import('../src/lib/selfHosting')).getSelfHostedEntry('probe_spin', root)!;
    // Replace the stored source with a runaway loop via a raw sandbox call.
    const runaway = `${entry.sourceCode}\nexport class Spin { static go(){ while (true) {} } }`;
    const res = await executeSelfHostedSandboxed(
      { ...entry, sourceCode: runaway, methods: [{ method: 'go', label: 'go' }], entrypointName: 'Spin', stateful: false, entrypointKind: 'class' },
      { method: 'go' },
      { timeoutMs: 300 },
    );
    expect(res.success).toBe(false);
    expect(res.error || '').toMatch(/interrupt|wall clock/i);
  });
});

describe('stored suites run inside the sandbox', () => {
  it('verifies a passing suite and fails a broken one', async () => {
    if (!available) return;
    const pass = await verifySuiteInSandbox(
      'export function inc(x){ return x + 1; }',
      'assert inc(1) === 2; assert inc(41) === 42;',
    );
    expect(pass?.ranInSandbox).toBe(true);
    expect(pass?.passed).toBe(true);
    expect(pass?.score).toBe(1);

    const fail = await verifySuiteInSandbox('export function inc(x){ return x + 1; }', 'assert inc(1) === 3;');
    expect(fail?.ranInSandbox).toBe(true);
    expect(fail?.passed).toBe(false);
  });

  it('every built-in self-hostable template suite passes in the WASM sandbox', async () => {
    if (!available) return;
    const selfHostable = Object.values(COMPONENT_TEMPLATES).filter((t) => t.selfHost);
    const failures: string[] = [];
    let idx = 0;
    for (const tpl of selfHostable) {
      idx++;
      const defaults: Record<string, any> = {};
      for (const p of tpl.params) defaults[p.id] = p.default;
      const built = buildComponentFromTemplate(tpl.id, defaults, { withSelfHealing: true, componentName: `sb_${idx}` });
      if (!built.success) continue;
      const run = await verifySuiteInSandbox(built.synthesizedCode, built.testSuiteCode);
      if (!run?.ranInSandbox || !run.passed) {
        failures.push(`${tpl.id}: ${run?.stderr.join('; ') || 'did not run'}`);
      }
    }
    resetSandbox();
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
