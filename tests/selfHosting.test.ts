import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildComponentFromTemplate,
  COMPONENT_TEMPLATES,
  registerComponentTemplatePlugin,
  listComponentTemplates,
  getComponentTemplate
} from '../src/lib/componentTemplates';
import type { TemplatePlugin } from '../src/lib/templatePlugin';
import {
  writeSelfHostedTool,
  writeStatelessSelfHostedTool,
  compileStatelessSelfHostedModuleFor,
  verifySelfHostedEntry,
  verifyAllSelfHosted,
  executeSelfHostedTool,
  removeSelfHostedTool,
  listSelfHostedEntries,
  getSelfHostedEntry,
  readManifest,
  generateSelfHostedModuleSource,
  transpileSelfHostedModule,
  toSafeModuleName
} from '../src/lib/selfHosting';

const roots: string[] = [];
function freshRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'selfhost-test-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const r of roots.splice(0)) {
    try {
      fs.rmSync(r, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function buildTool(templateId: string, name: string, params: Record<string, any> = {}) {
  const tpl = getComponentTemplate(templateId);
  if (!tpl) throw new Error(`template ${templateId} missing`);
  const result = buildComponentFromTemplate(templateId, params, {
    withSelfHealing: true,
    componentName: name
  });
  if (!result.success) throw new Error(result.error || 'build failed');
  if (!tpl.selfHost) throw new Error(`template ${templateId} has no selfHost descriptor`);
  return { tpl, result };
}

describe('template plugin API', () => {
  it('exposes every built-in plus the bloom plugin add-on', () => {
    const all = listComponentTemplates();
    const ids = all.map((t) => t.id);
    expect(ids).toContain('tpl_bloom_filter');
    expect(all.length).toBeGreaterThanOrEqual(11);
    // All code templates now advertise self-hostability in metadata.
    const selfHostable = all.filter((t) => t.selfHostable);
    expect(selfHostable.map((t) => t.id)).toEqual(
      expect.arrayContaining(['tpl_lru_cache', 'tpl_bloom_filter', 'tpl_fast_fourier'])
    );
  });

  it('rejects duplicate registrations loudly', () => {
    const tpl = getComponentTemplate('tpl_bloom_filter')!;
    expect(() => registerComponentTemplatePlugin(tpl)).toThrow(/already registered/);
  });

  it('rejects malformed plugins', () => {
    expect(() => registerComponentTemplatePlugin({} as TemplatePlugin)).toThrow(/id/);
    expect(() =>
      registerComponentTemplatePlugin({
        id: 'tpl_bad_no_synth',
        name: 'x',
        domain: 'coding',
        params: []
      } as TemplatePlugin)
    ).toThrow(/synthesizer/);
  });
});

describe('module generation & JSON safety', () => {
  it('generates a module whose exports include execute/describe', () => {
    const { tpl, result } = buildTool('tpl_lru_cache', 'LruGenProbe');
    const src = generateSelfHostedModuleSource({
      sourceCode: result.synthesizedCode,
      entrypointName: result.entrypointName,
      params: { capacity: 4 },
      selfHost: tpl.selfHost!
    });
    const js = transpileSelfHostedModule(src);
    expect(js).toContain('function execute(');
    expect(js).toContain('function describe(');
    expect(js).toMatch(/export \{[^}]*execute/);
  });

  it('coerces byte arrays, maps undefined to null, and rejects non-serializable results', async () => {
    const root = freshRoot();

    // A probe plugin that returns JSON-safe data, a function, and takes a byte array.
    const probe: TemplatePlugin = {
      id: 'tpl_test_json_probe',
      name: 'JSON Safety Probe',
      domain: 'coding',
      category: 'algorithmic',
      description: 'probe',
      params: [],
      defaultScore: 1,
      benchmarkFlops: 1,
      complexity: 'O(1)',
      tags: ['test'],
      synthesizer: (p, o) => {
        const n = o?.componentName || 'JsonSafetyProbe';
        return {
          sourceCode: `export class ${n} {
  static good() { return { a: 1, b: undefined, arr: [1, 2, { x: 3 }], raw: new Uint8Array([7, 8]) }; }
  static bad() { return () => 42; }
  static prom() { return Promise.resolve(1); }
  static inf() { return Infinity; }
  static eat(buf) { return { length: buf.length, first: buf[0] }; }
}`,
          testSuiteCode: `const ok = ${n}.good();
assert ok.a === 1;
assert ok.arr.length === 3;
const e = ${n}.eat(new Uint8Array([5, 6, 7]));
assert e.length === 3;`,
          entrypointName: n,
          summary: 'probe',
          selfHealingGuards: []
        };
      },
      selfHost: {
        stateful: false,
        methods: [
          { method: 'good', label: 'good' },
          { method: 'bad', label: 'bad' },
          { method: 'prom', label: 'prom' },
          { method: 'inf', label: 'inf' },
          { method: 'eat', label: 'eat', argCoercions: ['uint8'] }
        ]
      }
    };
    registerComponentTemplatePlugin(probe);
    const built = buildTool('tpl_test_json_probe', 'JsonProbe');

    const write = writeSelfHostedTool(
      {
        name: 'json_probe',
        templateId: 'tpl_test_json_probe',
        domain: 'coding',
        entrypointName: built.result.entrypointName,
        params: {},
        sourceCode: built.result.synthesizedCode,
        testSuiteCode: built.result.testSuiteCode,
        summary: 'probe',
        selfHost: probe.selfHost!
      },
      root
    );
    expect(write.success).toBe(true);
    if (!write.success) return;

    const good = await executeSelfHostedTool('json_probe', { method: 'good' }, root);
    expect(good.success).toBe(true);
    if (good.success) {
      expect(good.result).toEqual({ a: 1, b: null, arr: [1, 2, { x: 3 }], raw: [7, 8] });
    }

    const bad = await executeSelfHostedTool('json_probe', { method: 'bad' }, root);
    expect(bad.success).toBe(false);
    if (bad.success === false) expect(bad.error).toMatch(/non-serializable/);

    // Async results and non-finite numbers are rejected honestly, never mangled.
    const prom = await executeSelfHostedTool('json_probe', { method: 'prom' }, root);
    expect(prom.success).toBe(false);
    if (prom.success === false) expect(prom.error).toMatch(/Promise/);

    const inf = await executeSelfHostedTool('json_probe', { method: 'inf' }, root);
    expect(inf.success).toBe(false);
    if (inf.success === false) expect(inf.error).toMatch(/non-finite/);

    const eat = await executeSelfHostedTool('json_probe', { method: 'eat', args: [[5, 6, 7]] }, root);
    expect(eat.success).toBe(true);
    if (eat.success) expect(eat.result).toEqual({ length: 3, first: 5 });
  });
});

describe('self-hosting lifecycle (LRU)', () => {
  it('writes, verifies, calls and removes a real module', async () => {
    const root = freshRoot();
    const { tpl, result } = buildTool('tpl_lru_cache', 'DogfoodLru', { capacity: 3 });

    const write = writeSelfHostedTool(
      {
        name: 'dogfood_lru',
        templateId: 'tpl_lru_cache',
        domain: 'coding',
        entrypointName: result.entrypointName,
        params: { capacity: 3 },
        sourceCode: result.synthesizedCode,
        testSuiteCode: result.testSuiteCode,
        summary: 'lru',
        selfHost: tpl.selfHost!
      },
      root
    );
    expect(write.success).toBe(true);
    if (!write.success) return;

    // Manifest + module file both exist.
    const manifest = readManifest(root);
    expect(manifest.entries.length).toBe(1);
    expect(fs.existsSync(path.join(root, write.entry.file))).toBe(true);

    // Real calls through the live module.
    const setRes = await executeSelfHostedTool('dogfood_lru', { method: 'set', args: ['alpha', 42] }, root);
    expect(setRes.success).toBe(true);
    const getRes = await executeSelfHostedTool('dogfood_lru', { method: 'get', args: ['alpha'] }, root);
    expect(getRes.success).toBe(true);
    if (getRes.success) expect(getRes.result).toBe(42);

    // Missing key -> undefined serialized honestly to null (not a crash).
    const missRes = await executeSelfHostedTool('dogfood_lru', { method: 'get', args: ['missing'] }, root);
    expect(missRes.success).toBe(true);
    if (missRes.success) expect(missRes.result).toBeNull();

    // Whitelist enforcement.
    const evil = await executeSelfHostedTool('dogfood_lru', { method: 'constructor' }, root);
    expect(evil.success).toBe(false);
    if (evil.success === false) expect(evil.error).toMatch(/Unknown method/);

    const unknown = await executeSelfHostedTool('nope', { method: 'get' }, root);
    expect(unknown.success).toBe(false);

    // Honest three-layer verification.
    const verdict = await verifySelfHostedEntry(write.entry, root);
    expect(verdict.passed).toBe(true);

    const entries = await verifyAllSelfHosted(root);
    expect(entries[0].lastVerified?.passed).toBe(true);
    expect(entries[0].lastVerifiedAt).toBeTypeOf('number');

    // Removal cleans manifest + file.
    const removed = removeSelfHostedTool('dogfood_lru', root);
    expect(removed.success).toBe(true);
    expect(fs.existsSync(path.join(root, 'tools/dogfood_lru.mjs'))).toBe(false);
    expect(listSelfHostedEntries(root).length).toBe(0);
  });

  it('fails verification honestly when the module file is tampered/deleted', async () => {
    const root = freshRoot();
    const { tpl, result } = buildTool('tpl_hmac_sanitizer', 'HmacVerify');
    const write = writeSelfHostedTool(
      {
        name: 'hmac_verify',
        templateId: 'tpl_hmac_sanitizer',
        domain: 'cyber_defense',
        entrypointName: result.entrypointName,
        params: {},
        sourceCode: result.synthesizedCode,
        testSuiteCode: result.testSuiteCode,
        summary: 'hmac',
        selfHost: tpl.selfHost!
      },
      root
    );
    expect(write.success).toBe(true);
    if (!write.success) return;

    const before = await verifySelfHostedEntry(write.entry, root);
    expect(before.passed).toBe(true);

    fs.unlinkSync(path.join(root, write.entry.file));
    const after = await verifySelfHostedEntry(write.entry, root);
    expect(after.passed).toBe(false);
    expect(after.detail).toMatch(/missing/);
  });
});

describe('byte-array methods via uint8 coercion (HMAC)', () => {
  it('sanitizes and compares real buffers end to end', async () => {
    const root = freshRoot();
    const { tpl, result } = buildTool('tpl_hmac_sanitizer', 'HmacLive');
    const write = writeSelfHostedTool(
      {
        name: 'hmac_live',
        templateId: 'tpl_hmac_sanitizer',
        domain: 'cyber_defense',
        entrypointName: result.entrypointName,
        params: {},
        sourceCode: result.synthesizedCode,
        testSuiteCode: result.testSuiteCode,
        summary: 'hmac',
        selfHost: tpl.selfHost!
      },
      root
    );
    expect(write.success).toBe(true);
    if (!write.success) return;

    const clean = await executeSelfHostedTool('hmac_live', { method: 'sanitizeBuffer', args: [[1, 256, 300]] }, root);
    expect(clean.success).toBe(true);
    if (clean.success) expect(clean.result).toEqual([1, 0, 44]);

    const eq = await executeSelfHostedTool(
      'hmac_live',
      { method: 'constantTimeCompare', args: [[1, 2, 3], [1, 2, 3]] },
      root
    );
    expect(eq.success).toBe(true);
    if (eq.success) expect(eq.result).toBe(true);
  });
});

describe('every built-in self-hostable template dogfoods cleanly', () => {
  it('writes + verifies a real module for every template that declares selfHost', async () => {
    const root = freshRoot();
    const selfHostable = Object.values(COMPONENT_TEMPLATES).filter((t) => t.selfHost);
    expect(selfHostable.length).toBeGreaterThanOrEqual(11);

    const results: Array<{ id: string; passed: boolean; detail: string }> = [];
    let idx = 0;
    for (const tpl of selfHostable) {
      const name = toSafeModuleName(`bulk_${idx}_${tpl.id}`);
      idx++;
      // Use the plugin's declared defaults so live module state (constructor
      // args) matches the verified source, not a null fallback.
      const defaults: Record<string, any> = {};
      for (const p of tpl.params) defaults[p.id] = p.default;
      const built = buildComponentFromTemplate(tpl.id, defaults, { withSelfHealing: true, componentName: name });
      expect(built.success, `build ${tpl.id}`).toBe(true);
      if (!built.success) continue;

      const write = writeSelfHostedTool(
        {
          name,
          templateId: tpl.id,
          domain: tpl.domain,
          entrypointName: built.entrypointName,
          params: defaults,
          sourceCode: built.synthesizedCode,
          testSuiteCode: built.testSuiteCode,
          summary: tpl.name,
          selfHost: tpl.selfHost!
        },
        root
      );
      expect(write.success, `write ${tpl.id}`).toBe(true);
      if (!write.success) continue;

      const verdict = await verifySelfHostedEntry(write.entry, root);
      results.push({ id: tpl.id, passed: verdict.passed, detail: verdict.detail });

      // Whitelist enforcement: an undeclared method must fail on the live module.
      const evil = await executeSelfHostedTool(name, { method: '$$noop' }, root);
      expect(evil.success).toBe(false);
      if (evil.success === false) expect(evil.error).toMatch(/Unknown method/);
    }

    for (const r of results) {
      expect(r.passed, `${r.id} module verify: ${r.detail}`).toBe(true);
    }
  });
});

describe('name sanitization', () => {
  it('keeps identifiers safe', () => {
    expect(toSafeModuleName('My Tool')).toBe('My_Tool');
    expect(toSafeModuleName('9lives')).toMatch(/^m_/);
    expect(getSelfHostedEntry('My Tool')).toBeUndefined();
  });
});

describe('stateless function self-hosting (Capability Forge path)', () => {
  it('writes, verifies live, calls by function name, and enforces the whitelist', async () => {
    const root = freshRoot();
    const fnName = 'dedupeStable';
    const source =
      `export function ${fnName}(arr) {\n` +
      `  const seen = new Set();\n` +
      `  const out = [];\n` +
      `  for (const x of arr) { if (!seen.has(x)) { seen.add(x); out.push(x); } }\n` +
      `  return out;\n` +
      `}`;
    const suite =
      `assert JSON.stringify(${fnName}([1,2,1,3,2,4])) === JSON.stringify([1,2,3,4]);\n` +
      `assert ${fnName}([]).length === 0;`;

    const write = writeStatelessSelfHostedTool(
      {
        name: 'dedupe_stable',
        domain: 'coding',
        entrypointName: fnName,
        sourceCode: source,
        testSuiteCode: suite,
        summary: 'Capability Forge stateless tool',
      },
      root
    );
    expect(write.success).toBe(true);
    if (!write.success) return;

    // Honest three-layer verification (file exists, imports, suite passes).
    const verdict = await verifySelfHostedEntry(write.entry, root);
    expect(verdict.passed).toBe(true);
    expect(fs.existsSync(path.join(root, write.entry.file))).toBe(true);

    // Real call through the live module, dispatched to the bare function.
    const call = await executeSelfHostedTool('dedupe_stable', { method: fnName, args: [[1, 2, 1, 3]] }, root);
    expect(call.success).toBe(true);
    if (call.success) expect(call.result).toEqual([1, 2, 3]);

    // Method whitelist = exactly the function name; anything else is rejected.
    const evil = await executeSelfHostedTool('dedupe_stable', { method: 'constructor' }, root);
    expect(evil.success).toBe(false);
    if (evil.success === false) expect(evil.error).toMatch(/Unknown method/);
  });

  it('compiles a stateless module that exports execute/describe', () => {
    const compiled = compileStatelessSelfHostedModuleFor({
      name: 'gcd_pair',
      domain: 'math',
      entrypointName: 'gcdPair',
      sourceCode: 'export function gcdPair(a, b) { while (b) { const t = b; b = a % b; a = t; } return a; }',
      testSuiteCode: 'assert gcdPair(48, 18) === 6;',
      summary: 'gcd',
    });
    expect(compiled.jsCode).toContain('function execute(');
    expect(compiled.jsCode).toContain('function describe(');
    expect(compiled.jsCode).toMatch(/export \{[\s\S]*execute/);
  });
});

describe('external-repo integration plugins (Premier-Connection + ocr-it)', () => {
  // Each external port is registered as a real self-hostable template. Build,
  // write to a fresh root, honestly re-verify the stored suite, then call a
  // live method end-to-end — the same dogfood contract the built-ins satisfy.
  const cases: Array<{ templateId: string; toolName: string; call: { method: string; args: any[] } }> = [
    {
      templateId: 'tpl_premier_trend',
      toolName: 'premier_trend',
      call: {
        method: 'analyzeTrend',
        args: [[{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }]]
      }
    },
    {
      templateId: 'tpl_premier_validators',
      toolName: 'premier_validators',
      call: { method: 'validateISRC', args: ['US-PR3-20-00125'] }
    },
    {
      templateId: 'tpl_ocr_preprocess',
      toolName: 'ocr_preprocess',
      call: { method: 'enhanceFactor', args: [1] }
    }
  ];

  it('registers all three external-repo plugins as self-hostable', () => {
    const ids = listComponentTemplates().map((t) => t.id);
    for (const c of cases) expect(ids).toContain(c.templateId);
  });

  it('writes, verifies, and live-calls every external-repo plugin honestly', async () => {
    const root = freshRoot();
    for (const c of cases) {
      const tpl = getComponentTemplate(c.templateId);
      expect(tpl).toBeDefined();
      if (!tpl || !tpl.selfHost) continue;

      const name = toSafeModuleName(c.toolName);
      const built = buildComponentFromTemplate(c.templateId, {}, { withSelfHealing: true, componentName: name });
      expect(built.success, `build ${c.templateId}`).toBe(true);
      if (!built.success) continue;

      const write = writeSelfHostedTool(
        {
          name: c.toolName,
          templateId: c.templateId,
          domain: tpl.domain,
          entrypointName: built.entrypointName,
          params: {},
          sourceCode: built.synthesizedCode,
          testSuiteCode: built.testSuiteCode,
          summary: tpl.name,
          selfHost: tpl.selfHost
        },
        root
      );
      expect(write.success, `write ${c.templateId}`).toBe(true);
      if (!write.success) continue;

      const verdict = await verifySelfHostedEntry(write.entry, root);
      expect(verdict.passed, `${c.templateId} stored suite: ${verdict.detail}`).toBe(true);

      const live = await executeSelfHostedTool(c.toolName, c.call, root);
      expect(live.success, `${c.templateId} live call: ${live.success === false ? live.error : ''}`).toBe(true);
      if (!live.success) continue;

      // Method-whitelist enforcement holds for external ports too.
      const evil = await executeSelfHostedTool(c.toolName, { method: 'constructor' }, root);
      expect(evil.success).toBe(false);
    }
  });

  it('returns correct real values from the live integrated tools', async () => {
    const root = freshRoot();
    const { tpl: trendTpl } = { tpl: getComponentTemplate('tpl_premier_trend')! };
    const trend = buildComponentFromTemplate('tpl_premier_trend', {}, {
      withSelfHealing: true,
      componentName: 'TrendProbe'
    });
    expect(trend.success).toBe(true);
    const wTrend = writeSelfHostedTool(
      {
        name: 'trend_probe', templateId: 'tpl_premier_trend', domain: trendTpl.domain,
        entrypointName: trend.entrypointName, params: {}, sourceCode: trend.synthesizedCode,
        testSuiteCode: trend.testSuiteCode, summary: 't', selfHost: trendTpl.selfHost!
      },
      root
    );
    expect(wTrend.success).toBe(true);
    if (!wTrend.success) return;
    const r1 = await executeSelfHostedTool('trend_probe', {
      method: 'analyzeTrend', args: [[{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }]]
    }, root);
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.result.trend).toBe('increasing');

    const valTpl = getComponentTemplate('tpl_premier_validators')!;
    const val = buildComponentFromTemplate('tpl_premier_validators', {}, {
      withSelfHealing: true, componentName: 'ValProbe'
    });
    expect(val.success).toBe(true);
    const wVal = writeSelfHostedTool(
      {
        name: 'val_probe', templateId: 'tpl_premier_validators', domain: valTpl.domain,
        entrypointName: val.entrypointName, params: {}, sourceCode: val.synthesizedCode,
        testSuiteCode: val.testSuiteCode, summary: 'v', selfHost: valTpl.selfHost!
      },
      root
    );
    expect(wVal.success).toBe(true);
    if (!wVal.success) return;
    const r2 = await executeSelfHostedTool('val_probe', { method: 'validateISRC', args: ['US-PR3-20-00125'] }, root);
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.result).toBe(true);
    const r2b = await executeSelfHostedTool('val_probe', { method: 'validateISRC', args: ['nope'] }, root);
    expect(r2b.success).toBe(true);
    if (r2b.success) expect(r2b.result).toBe(false);
  });
});
