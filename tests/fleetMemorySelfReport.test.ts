import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_KIND_TOPICS,
  FLEET_MEMORY_MAX_DATA_CHARS,
  buildFleetMemoryEntry,
} from '../src/lib/fleetMemory';

describe('fleet intake — OpenHub self-report preservation', () => {
  it('folds openhub-self-report onto a snapshot and preserves topic + data', () => {
    const entry = buildFleetMemoryEntry({
      source: 'openhub',
      kind: 'openhub-self-report',
      text: 'OpenHub self-report 2026-09-20T00:00:00Z · events=10 passRate=0.9',
      data: { at: '2026-09-20T00:00:00Z', activity: { passRate: 0.9 }, incidents: { recent: [] } },
    }, 1);
    expect(entry.ok).toBe(true);
    expect(entry.kind).toBe('snapshot');
    expect(entry.meta?.topic).toBe('openhub-self-report');
    const data = entry.meta?.data as { activity: { passRate: number } } | undefined;
    expect(data?.activity.passRate).toBe(0.9);
  });

  it('marks an oversized data payload as truncated instead of mangling it', () => {
    const entry = buildFleetMemoryEntry({
      source: 'openhub',
      kind: 'openhub-self-report',
      text: 't',
      data: { blob: 'x'.repeat(FLEET_MEMORY_MAX_DATA_CHARS + 10) },
    }, 1);
    expect(entry.ok).toBe(true);
    const data = entry.meta?.data as { truncated?: boolean } | undefined;
    expect(data?.truncated).toBe(true);
  });

  it('leaves unknown kinds on the previous path (lesson, no topic)', () => {
    const entry = buildFleetMemoryEntry({ source: 'x', kind: 'mystery', text: 't' }, 1);
    expect(entry.kind).toBe('lesson');
    expect(entry.meta?.topic).toBeUndefined();
  });

  it('keeps the normal kinds unchanged', () => {
    const entry = buildFleetMemoryEntry({ source: 'x', kind: 'signal', text: 't' }, 1);
    expect(entry.kind).toBe('signal');
    expect(entry.meta?.topic).toBeUndefined();
  });

  it('maps the self-report kind to a snapshot', () => {
    expect(EXTERNAL_KIND_TOPICS['openhub-self-report']).toBe('snapshot');
  });
});
