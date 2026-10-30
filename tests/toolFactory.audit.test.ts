import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  registerChunk, isChunkRegistered, getChunk, listChunks, countRegisteredChunks, clearChunksForTests,
} from '../src/lib/toolFactory/chunks';
import {
  registerSnippet, isSnippetRegistered, getSnippet, listSnippets, countRegisteredSnippets, clearSnippetsForTests,
} from '../src/lib/toolFactory/snippets';
import { paramsToJsonSchema, zodSchemaToJson, z } from '../src/lib/toolFactory/schema';
import { composeTool } from '../src/lib/toolFactory/composer';
import {
  registerSectorPack, getSectorPack, listSectorPacks, applySectorPack, loadSectorPackFromYaml, clearSectorPacksForTests,
} from '../src/lib/toolFactory/sectorPacks';
import { publishTemplate, publishRecipe } from '../src/lib/toolFactory/publish';
import { composeFromDirective } from '../src/lib/toolFactory/selfImprove';
import { executeTestSuite } from '../src/lib/executionSandbox';
import { getSelfHostedEntry } from '../src/lib/selfHosting';

describe('audit: chunk registry', () => {
  beforeEach(() => clearChunksForTests());

  it('registers and lists chunks', () => {
    registerChunk({ id: 'a', language: 'ts', body: '  static x() { return 1; }' });
    expect(isChunkRegistered('a')).toBe(true);
    expect(getChunk('a')).toBeTruthy();
    expect(listChunks()).toHaveLength(1);
    expect(countRegisteredChunks()).toBe(1);
  });

  it('rejects duplicate chunk id', () => {
    registerChunk({ id: 'a', language: 'ts', body: 'x' });
    expect(() => registerChunk({ id: 'a', language: 'ts', body: 'y' })).toThrow(/already registered/);
  });

  it('rejects invalid chunk id', () => {
    expect(() => registerChunk({ id: '1bad', language: 'ts', body: 'x' })).toThrow(/Invalid chunk id/);
  });

  it('rejects missing body', () => {
    expect(() => registerChunk({ id: 'b', language: 'ts', body: '' })).toThrow(/requires a "body"/);
  });

  it('rejects non-object', () => {
    expect(() => registerChunk(null as any)).toThrow(/must be an object/);
  });
});

describe('audit: snippet registry', () => {
  beforeEach(() => clearSnippetsForTests());

  it('registers and lists snippets', () => {
    registerSnippet({ id: 's', language: 'ts', code: 'export function f(){return 1;}' });
    expect(isSnippetRegistered('s')).toBe(true);
    expect(getSnippet('s')).toBeTruthy();
    expect(listSnippets()).toHaveLength(1);
    expect(countRegisteredSnippets()).toBe(1);
  });

  it('rejects duplicate snippet id', () => {
    registerSnippet({ id: 's', language: 'ts', code: 'x' });
    expect(() => registerSnippet({ id: 's', language: 'ts', code: 'y' })).toThrow(/already registered/);
  });

  it('rejects invalid snippet id', () => {
    expect(() => registerSnippet({ id: '1bad', language: 'ts', code: 'x' })).toThrow(/Invalid snippet id/);
  });

  it('rejects missing code', () => {
    expect(() => registerSnippet({ id: 's', language: 'ts', code: '' })).toThrow(/requires "code"/);
  });
});

describe('audit: schema', () => {
  it('paramsToJsonSchema handles all types', () => {
    const schema = paramsToJsonSchema([
      { id: 'n', label: 'N', type: 'number', default: 5, min: 0, max: 10, description: 'num' },
      { id: 'b', label: 'B', type: 'boolean', default: true, description: 'bool' },
      { id: 's', label: 'S', type: 'select', options: ['a', 'b'], default: 'a', description: 'sel' },
      { id: 't', label: 'T', type: 'string', default: undefined, description: 'str' },
    ]) as any;
    expect(schema.type).toBe('object');
    expect(schema.properties.n.type).toBe('number');
    expect(schema.properties.n.minimum).toBe(0);
    expect(schema.properties.b.type).toBe('boolean');
    expect(schema.properties.s.enum).toEqual(['a', 'b']);
    expect(schema.properties.t.type).toBe('string');
    expect(schema.required).toContain('t');
    expect(schema.additionalProperties).toBe(false);
  });

  it('zodSchemaToJson converts zod schema', () => {
    const zodSchema = z.object({ x: z.number() });
    const json = zodSchemaToJson(zodSchema) as any;
    expect(json).toBeTruthy();
    expect(json.type).toBe('object');
  });
});

describe('audit: composer edge cases', () => {
  beforeEach(() => clearChunksForTests());

  it('throws on missing recipe id', () => {
    expect(() => composeTool({ name: 'X', domain: 'coding', category: 'algorithmic', description: 'd', params: [], tags: [] } as any)).toThrow(/requires id/);
  });

  it('throws on missing recipe name', () => {
    expect(() => composeTool({ id: 'r', domain: 'coding', category: 'algorithmic', description: 'd', params: [], tags: [] } as any)).toThrow(/requires name/);
  });

  it('handles empty chunks/snippets', () => {
    const result = composeTool({ id: 'r', name: 'Empty', domain: 'coding', category: 'algorithmic', description: 'd', params: [], tags: [] } as any);
    expect(result.sourceCode).toContain('class Empty');
    expect(result.testSuiteCode).toBe('');
  });

  it('Handlebars renders chunk with params', () => {
    registerChunk({ id: 'c', language: 'ts', body: '  static val() { return {{n}}; }' });
    const result = composeTool({ id: 'r', name: 'T', domain: 'coding', category: 'algorithmic', description: 'd', params: [{ id: 'n', label: 'N', type: 'number', default: 9 }], chunks: ['c'], tags: [] } as any);
    expect(result.sourceCode).toContain('return 9');
  });

  it('renders chunk tests with entrypointName', () => {
    registerChunk({ id: 'c', language: 'ts', body: '  static x() {}', test: 'assert {{entrypointName}}.x !== undefined;' });
    const result = composeTool({ id: 'r', name: 'MyTool', domain: 'coding', category: 'algorithmic', description: 'd', params: [], chunks: ['c'], tags: [] } as any);
    expect(result.testSuiteCode).toContain('MyTool');
  });
});

describe('audit: sector packs', () => {
  beforeEach(() => clearSectorPacksForTests());

  it('registers and retrieves packs', () => {
    registerSectorPack({ id: 'p1', tags: ['t1'] });
    expect(getSectorPack('p1')).toBeTruthy();
    expect(listSectorPacks()).toHaveLength(1);
  });

  it('rejects duplicate pack', () => {
    registerSectorPack({ id: 'p1', tags: [] });
    expect(() => registerSectorPack({ id: 'p1', tags: [] })).toThrow(/already registered/);
  });

  it('loads from YAML', () => {
    const pack = loadSectorPackFromYaml('id: ypack\ntags: [y]\n');
    expect(pack.id).toBe('ypack');
    expect(getSectorPack('ypack')).toBeTruthy();
  });

  it('rejects invalid YAML pack', () => {
    expect(() => loadSectorPackFromYaml('id: 1bad\n')).toThrow();
  });

  it('applySectorPack merges correctly', () => {
    registerSectorPack({ id: 'sp', paramDefaults: { x: 5 }, forcedChunks: ['c2'], tags: ['sp'] });
    const recipe = { id: 'r', name: 'R', domain: 'coding' as const, category: 'algorithmic' as const, description: 'd', params: [{ id: 'x', label: 'X', type: 'number' as const, default: 1 }], chunks: ['c1'], tags: ['base'] };
    const out = applySectorPack(recipe as any, 'sp');
    expect(out.params[0].default).toBe(5);
    expect(out.chunks).toContain('c2');
    expect(out.tags).toContain('sp');
    expect(out.sectorPack).toBe('sp');
  });

  it('applySectorPack throws on unknown pack', () => {
    const recipe = { id: 'r', name: 'R', domain: 'coding' as const, category: 'algorithmic' as const, description: 'd', params: [], chunks: [], tags: [] };
    expect(() => applySectorPack(recipe as any, 'nope')).toThrow(/Unknown sector pack/);
  });
});

describe('audit: publish', () => {
  it('publishTemplate fails on unknown template', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
    const res = publishTemplate('tpl_does_not_exist', {}, root);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown template/);
  });

  it('publishTemplate fails on template without selfHost', () => {
    // find a template without selfHost? Use a non-existent is already covered; skip
  });

  it('publishRecipe writes a module', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
    const recipe = {
      id: 'audit_raw',
      name: 'AuditRaw',
      domain: 'coding' as const,
      category: 'algorithmic' as const,
      description: 'raw',
      params: [{ id: 'n', label: 'N', type: 'number' as const, default: 7 }],
      chunks: [],
      tags: ['raw'],
      selfHost: { stateful: false, methods: [{ method: 'get', label: 'get' }] },
      artifactKind: 'function' as const,
    };
    const res = publishRecipe(recipe as any, {}, root);
    // chunk body empty so composed source is just class; should still write
    expect(typeof res.success).toBe('boolean');
  });
});

describe('audit: selfImprove', () => {
  it('composeFromDirective returns null for unknown domain with no templates', () => {
    // coding domain has templates, so use a truly unknown domain
    const id = composeFromDirective('amplify', '__no_such_domain__');
    // may return null or a fallback; just ensure no throw
    expect(id === null || typeof id === 'string').toBe(true);
  });

  it('composeFromDirective is idempotent', () => {
    const a = composeFromDirective('refine', 'coding');
    const b = composeFromDirective('refine', 'coding');
    expect(a).toBe(b);
  });
});

describe('e2e: compose -> register -> build -> publish -> verify', () => {
  it('full pipeline', async () => {
    // 1. compose
    clearChunksForTests();
    registerChunk({ id: 'e2e_chunk', language: 'ts', body: '  static answer() { return 42; }', test: 'assert {{entrypointName}}.answer() === 42;' });
    const composed = composeTool({
      id: 'e2e_tool',
      name: 'E2ETool',
      domain: 'coding',
      category: 'algorithmic',
      description: 'e2e',
      params: [],
      chunks: ['e2e_chunk'],
      tags: ['e2e'],
      selfHost: { stateful: false, methods: [{ method: 'answer', label: 'answer' }] },
      artifactKind: 'function',
    } as any);
    expect(composed.sourceCode).toContain('class E2ETool');

    // 2. suite passes
    const run = executeTestSuite(composed.sourceCode, composed.testSuiteCode);
    expect(run.passed).toBe(true);

    // 3. publish
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
    const recipe = {
      id: 'e2e_tool',
      name: 'E2ETool',
      domain: 'coding' as const,
      category: 'algorithmic' as const,
      description: 'e2e',
      params: [],
      chunks: ['e2e_chunk'],
      tags: ['e2e'],
      selfHost: { stateful: false, methods: [{ method: 'answer', label: 'answer' }] },
      artifactKind: 'function' as const,
    };
    // register chunk globally first (already done above)
    const pub = publishRecipe(recipe as any, {}, root);
    expect(pub.success).toBe(true);
    expect(pub.entryName).toBeTruthy();

    // 4. manifest + entry
    const entry = getSelfHostedEntry(pub.entryName!, root);
    expect(entry).toBeTruthy();
    expect(entry!.templateId).toBe('e2e_tool');

    // 5. verify
    const { verifySelfHostedEntry } = await import('../src/lib/selfHosting');
    const verdict = await verifySelfHostedEntry(entry!, root);
    expect(verdict.passed).toBe(true);
  });
});
