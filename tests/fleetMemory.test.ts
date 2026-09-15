import { describe, it, expect } from 'vitest';
import { buildFleetMemoryEntry, FLEET_MEMORY_MAX_TEXT } from '../src/lib/fleetMemory.js';

describe('buildFleetMemoryEntry', () => {
  it('uses an explicit text and defaults to the lesson kind + fleet source', () => {
    const e = buildFleetMemoryEntry({ text: 'learned something', goal: 'build x' });
    expect(e.ok).toBe(true);
    expect(e.kind).toBe('lesson');
    expect(e.text).toBe('learned something');
    expect(e.meta?.source).toBe('fleet');
    expect(e.meta?.goal).toBe('build x');
  });

  it('composes text from goal/status/summary when text is absent', () => {
    const e = buildFleetMemoryEntry({ source: 'axiom-loop', goal: 'build x', status: 'done', iteration: 3 });
    expect(e.ok).toBe(true);
    expect(e.text).toContain('goal: build x');
    expect(e.text).toContain('status: done');
    expect(e.text).toContain('iteration: 3');
    expect(e.meta?.source).toBe('axiom-loop');
  });

  it('honors a valid kind and falls back to lesson for an unknown one', () => {
    expect(buildFleetMemoryEntry({ text: 'x', kind: 'gene' }).kind).toBe('gene');
    expect(buildFleetMemoryEntry({ text: 'x', kind: 'nonsense' }).kind).toBe('lesson');
  });

  it('rejects an empty payload (never invents text)', () => {
    const e = buildFleetMemoryEntry({ source: 'axiom-loop' });
    expect(e.ok).toBe(false);
    expect(e.error).toContain('required');
  });

  it('rejects text over the cap', () => {
    const e = buildFleetMemoryEntry({ text: 'x'.repeat(FLEET_MEMORY_MAX_TEXT + 1) });
    expect(e.ok).toBe(false);
    expect(e.error).toContain('exceeds');
  });

  it('derives a stable-ish id when none is supplied', () => {
    const e = buildFleetMemoryEntry({ text: 'x', source: 'axiom' }, 1234);
    expect(e.id).toMatch(/^fleet:axiom:/);
    expect(buildFleetMemoryEntry({ text: 'x', id: 'custom-id' }).id).toBe('custom-id');
  });

  it('truncates goals in meta but keeps the full text', () => {
    const longGoal = 'g'.repeat(500);
    const e = buildFleetMemoryEntry({ text: 'body', goal: longGoal });
    expect(String(e.meta?.goal).length).toBe(300);
    expect(e.text).toBe('body');
  });
});
