import { describe, expect, it, beforeEach } from 'vitest';

import { clearIndex, indexTool, searchTools } from '../src/lib/toolFactory/toolDiscovery';
import { clearToolHealth, recordToolCall, successRate, avgLatency, listToolHealth } from '../src/lib/toolFactory/toolHealth';
import { autoCompose } from '../src/lib/toolFactory/autoCompose';
import { runPipeline } from '../src/lib/toolFactory/toolPipeline';

describe('tool health', () => {
  beforeEach(() => clearToolHealth());

  it('records calls and computes success rate', () => {
    recordToolCall('t', true, 10);
    recordToolCall('t', false, 20);
    expect(successRate('t')).toBe(0.5);
    expect(avgLatency('t')).toBe(15);
    expect(listToolHealth()).toHaveLength(1);
  });

  it('returns null for unknown tool', () => {
    expect(successRate('nope')).toBeNull();
    expect(avgLatency('nope')).toBeNull();
  });
});

describe('auto-compose', () => {
  beforeEach(() => clearIndex());

  it('returns null when no tools match', async () => {
    const res = await autoCompose('quantum entanglement teleportation');
    expect(res).toBeNull();
  });

  it('composes from indexed tools', async () => {
    indexTool({ name: 'lru_cache', description: 'Bounded LRU cache with eviction', tags: ['cache'] });
    indexTool({ name: 'hmac_sanitizer', description: 'Constant-time memory sanitizer', tags: ['security'] });
    const res = await autoCompose('cache', { limit: 2 });
    expect(res).toBeTruthy();
    if (!res) return;
    expect(res.selected.length).toBeGreaterThan(0);
    expect(res.pipeline.length).toBe(res.selected.length);
    expect(res.indexed).toBe(true);
    // composite should now be discoverable
    const found = searchTools('cache', 10).some((t) => t.name === res.compositeName);
    expect(found).toBe(true);
  });

  it('executes pipeline when runner provided', async () => {
    indexTool({ name: 'a', description: 'returns five', tags: [] });
    const runner = async (name: string) => ({ value: 5 });
    const res = await autoCompose('five', { limit: 1, runner });
    expect(res).toBeTruthy();
    // health recorded for composite
    const { successRate: sr } = await import('../src/lib/toolFactory/toolHealth');
    expect(sr(res!.compositeName)).toBe(1);
  });

  it('respects index=false', async () => {
    indexTool({ name: 'x', description: 'x tool', tags: [] });
    const res = await autoCompose('x', { limit: 1, index: false });
    expect(res).toBeTruthy();
    if (!res) return;
    expect(res.indexed).toBe(false);
  });
});
