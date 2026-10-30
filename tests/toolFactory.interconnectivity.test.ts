import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { registerChunk, clearChunksForTests } from '../src/lib/toolFactory/chunks';
import { registerSectorPack, applySectorPack, clearSectorPacksForTests } from '../src/lib/toolFactory/sectorPacks';
import { composeTool } from '../src/lib/toolFactory/composer';
import { composeFromDirective } from '../src/lib/toolFactory/selfImprove';
import { publishTemplate } from '../src/lib/toolFactory/publish';
import { isTemplateRegistered, buildComponentFromTemplate, listComponentTemplates } from '../src/lib/componentTemplates';
import { executeTestSuite } from '../src/lib/executionSandbox';
import { listSelfHostedEntries } from '../src/lib/selfHosting';

describe('interconnectivity: sector pack -> compose -> build -> suite', () => {
  beforeEach(() => {
    clearChunksForTests();
    clearSectorPacksForTests();
  });

  it('sector pack forces chunks and params flow into composed tool', () => {
    registerChunk({ id: 'base_chunk', language: 'ts', body: '  static base() { return {{n}}; }', test: 'assert {{entrypointName}}.base() === {{n}};' });
    registerChunk({ id: 'sector_chunk', language: 'ts', body: '  static sector() { return "sec"; }', test: 'assert {{entrypointName}}.sector() === "sec";' });
    registerSectorPack({ id: 'sec', paramDefaults: { n: 7 }, forcedChunks: ['sector_chunk'], tags: ['sector:sec'] });

    const recipe = {
      id: 'sec_tool',
      name: 'SecTool',
      domain: 'coding' as const,
      category: 'algorithmic' as const,
      description: 'sector tool',
      params: [{ id: 'n', label: 'N', type: 'number' as const, default: 1 }],
      chunks: ['base_chunk'],
      tags: ['base'],
      selfHost: { stateful: false, methods: [{ method: 'base', label: 'base' }, { method: 'sector', label: 'sector' }] },
    };
    const packed = applySectorPack(recipe as any, 'sec');
    expect(packed.params[0].default).toBe(7);
    expect(packed.chunks).toContain('sector_chunk');
    expect(packed.tags).toContain('sector:sec');

    const composed = composeTool(packed as any);
    expect(composed.sourceCode).toContain('return 7');
    expect(composed.sourceCode).toContain('sector()');
    const run = executeTestSuite(composed.sourceCode, composed.testSuiteCode);
    expect(run.passed).toBe(true);
  });
});

describe('interconnectivity: learner directive -> factory variant -> build', () => {
  it('composes a factory variant from a learner directive and builds it', () => {
    const id = composeFromDirective('amplify', 'coding');
    expect(id).toBeTruthy();
    if (!id) return;
    expect(isTemplateRegistered(id)).toBe(true);
    const res = buildComponentFromTemplate(id, {});
    expect(res.success).toBe(true);
    const run = executeTestSuite(res.synthesizedCode, res.testSuiteCode);
    expect(run.passed).toBe(true);
  });
});

describe('interconnectivity: publish -> manifest -> agent catalog', () => {
  it('published factory tool appears in self-hosted entries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-'));
    const res = publishTemplate('tpl_lru_cache_factory', { capacity: 4, ttlMs: 1000 }, root);
    expect(res.success).toBe(true);
    const entries = listSelfHostedEntries(root);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.templateId === 'tpl_lru_cache_factory')).toBe(true);
  });
});

describe('interconnectivity: published tool is callable', () => {
  it('executeSelfHostedTool calls a published factory tool', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'call-'));
    const res = publishTemplate('tpl_hmac_sanitizer_factory', {}, root);
    expect(res.success).toBe(true);
    const { executeSelfHostedTool } = await import('../src/lib/selfHosting');
    const out = await executeSelfHostedTool(res.entryName!, { method: 'sanitizeBuffer', args: [[10, 20, 30]] }, root);
    expect(out.success).toBe(true);
    if (out.success) expect(out.result).toEqual([10, 20, 30]);
  });
});

describe('interconnectivity: capabilities shape', () => {
  it('factory-composed templates carry factory-composed tag', () => {
    const all = listComponentTemplates();
    const factory = all.filter((t: any) => (t.tags ?? []).includes('factory-composed'));
    expect(factory.length).toBeGreaterThanOrEqual(3);
    for (const t of factory) {
      expect(t.selfHostable).toBe(true);
      expect(['function', 'cli', 'api', 'mcp', 'a2a', 'loop']).toContain(t.artifactKind);
    }
  });
});
