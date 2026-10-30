import { describe, expect, it, beforeEach } from 'vitest';
import {
  registerChunk,
  registerSnippet,
  countRegisteredChunks,
  countRegisteredSnippets,
  clearChunksForTests,
  clearSnippetsForTests
} from '../src/lib/toolFactory';

import { composeTool } from '../src/lib/toolFactory/composer';

describe('tool factory composer', () => {
  beforeEach(() => {
    clearChunksForTests();
    clearSnippetsForTests();
  });

  it('registers chunks/snippets with loud failure on duplicates', () => {
    registerChunk({ id: 'c1', language: 'ts', body: '  static hello() { return 42; }' });
    registerSnippet({ id: 's1', language: 'ts', code: 'export function add(a,b){ return a+b; }' });
    expect(countRegisteredChunks()).toBe(1);
    expect(countRegisteredSnippets()).toBe(1);
    expect(() => registerChunk({ id: 'c1', language: 'ts', body: 'x' })).toThrow();
    expect(() => registerSnippet({ id: 's1', language: 'ts', code: 'x' })).toThrow();
  });

  it('composes a tool from chunks and is deterministic', async () => {
    registerChunk({ id: 'c1', language: 'ts', body: '  static hello() { return {{n}}; }', test: 'assert X.hello() === {{n}};' });
    registerSnippet({ id: 's1', language: 'ts', code: 'export function add(a,b){ return a+b; }' });
    const recipe = {
      id: 'tpl_test_tool',
      name: 'TestTool',
      domain: 'coding' as const,
      category: 'algorithmic' as const,
      description: 'a test tool',
      params: [{ id: 'n', label: 'N', type: 'number' as const, default: 7 }],
      chunks: ['c1'],
      snippets: ['s1'],
      tags: ['test']
    };
    const a = await composeTool(recipe as any);
    const b = await composeTool(recipe as any);
    expect(a.sourceCode).toBe(b.sourceCode);
    expect(a.sourceCode).toContain('class TestTool');
    expect(a.sourceCode).toContain('return 7');
    expect(a.sizeLines).toBeGreaterThan(0);
    expect(a.provenance.chunkIds).toEqual(['c1']);
  });

  it('rejects unknown chunks', async () => {
    const recipe = {
      id: 'tpl_bad',
      name: 'BadTool',
      domain: 'coding' as const,
      category: 'algorithmic' as const,
      description: 'bad',
      params: [],
      chunks: ['nope'],
      tags: []
    };
    expect(() => composeTool(recipe as any)).toThrow();
  });

  it('enforces size budget', async () => {
    registerChunk({ id: 'big', language: 'ts', body: Array(300).fill('  // line').join('\n') });
    const recipe = {
      id: 'tpl_big',
      name: 'BigTool',
      domain: 'coding' as const,
      category: 'algorithmic' as const,
      description: 'big',
      params: [],
      chunks: ['big'],
      tags: [],
      sizeBudget: 10
    };
    expect(() => composeTool(recipe as any)).toThrow(/size budget/);
  });
});
