import { describe, expect, it, beforeEach } from 'vitest';

import {
  embedText, indexTool, clearIndex, searchTools, getIndexedTool, indexedCount, META_TOOLS,
} from '../src/lib/toolFactory/toolDiscovery';
import { runPipeline, describePipeline } from '../src/lib/toolFactory/toolPipeline';

describe('tool discovery', () => {
  beforeEach(() => clearIndex());

  it('embedText is deterministic and normalized', () => {
    const a = embedText('lru cache eviction');
    const b = embedText('lru cache eviction');
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('indexes and searches tools', () => {
    indexTool({ name: 'lru_cache', description: 'Bounded LRU cache with eviction', tags: ['cache'] });
    indexTool({ name: 'hmac_sanitizer', description: 'Constant-time memory sanitizer', tags: ['security'] });
    expect(indexedCount()).toBe(2);
    const results = searchTools('cache eviction', 1);
    expect(results[0].name).toBe('lru_cache');
  });

  it('getIndexedTool returns entry', () => {
    indexTool({ name: 'x', description: 'x tool' });
    expect(getIndexedTool('x')).toBeTruthy();
    expect(getIndexedTool('nope')).toBeUndefined();
  });

  it('search returns up to limit', () => {
    for (let i = 0; i < 10; i++) indexTool({ name: `t${i}`, description: `tool number ${i}` });
    expect(searchTools('tool', 3)).toHaveLength(3);
  });

  it('META_TOOLS has search_tools and execute_tool', () => {
    expect(META_TOOLS.search_tools.name).toBe('factory.search_tools');
    expect(META_TOOLS.execute_tool.name).toBe('factory.execute_tool');
  });
});

describe('tool pipeline', () => {
  it('runs a successful pipeline', async () => {
    const runner = async (name: string, args: any) => {
      if (name === 'a') return { value: 5 };
      if (name === 'b') return { doubled: (args as any).value * 2 };
      throw new Error('unknown');
    };
    const res = await runPipeline([
      { tool: 'a' },
      { tool: 'b', transform: (prev: any) => ({ value: prev.value }) },
    ], runner);
    expect(res.ok).toBe(true);
    expect(res.final).toEqual({ doubled: 10 });
    expect(res.steps).toHaveLength(2);
  });

  it('stops on failure', async () => {
    const runner = async (name: string) => { throw new Error('boom'); };
    const res = await runPipeline([{ tool: 'a' }, { tool: 'b' }], runner);
    expect(res.ok).toBe(false);
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0].error).toBe('boom');
  });

  it('describePipeline produces tags', () => {
    const d = describePipeline('p', 'desc', [{ tool: 'a' }, { tool: 'b' }]);
    expect(d.tags).toContain('pipeline');
    expect(d.description).toContain('a -> b');
  });
});
