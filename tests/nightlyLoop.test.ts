import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openNightlyStore, nightlyKey, planNightlyRun, runNightlyCycle } from '../src/lib/nightlyLoop';

const dirs: string[] = [];
function freshFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-nightly-'));
  dirs.push(dir);
  return path.join(dir, 'nightly.json');
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const metricsAfter = (after: any) => {
  let n = 0;
  return vi.fn(async () => (n++ === 0 ? { registryTools: 1, benchmarkSolved: 1 } : after));
};

describe('nightly store', () => {
  it('keys by UTC day and persists/bounds runs', () => {
    expect(nightlyKey(Date.UTC(2026, 8, 16, 23, 59))).toBe('2026-09-16');
    const store = openNightlyStore(freshFile());
    expect(store.latest()).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      store.save({ key: `2026-09-1${i}`, startedAt: i, finishedAt: i, forced: false, skipped: false, steps: [] });
    }
    expect(store.list()).toHaveLength(3);
    expect(store.latest()!.key).toBe('2026-09-12');
    expect(store.status().runCount).toBe(3);
    expect(store.get('2026-09-10')!.key).toBe('2026-09-10');
  });

  it('idempotency plan runs once per night unless forced', () => {
    expect(planNightlyRun({ key: '2026-09-16' }).run).toBe(true);
    expect(planNightlyRun({ key: '2026-09-16', existingKey: '2026-09-16' }).run).toBe(false);
    expect(planNightlyRun({ key: '2026-09-16', existingKey: '2026-09-16', force: true }).run).toBe(true);
  });
});

describe('nightly cycle', () => {
  it('runs configured steps in order and records skipped ones', async () => {
    const store = openNightlyStore(freshFile());
    const dream = vi.fn(async () => ({ ok: true, detail: 'dream tick done' }));
    const run = await runNightlyCycle({
      store,
      metrics: metricsAfter({ registryTools: 2, benchmarkSolved: 3, benchmarkTotal: 5 }),
      steps: { dream },
      now: () => Date.UTC(2026, 8, 16, 3, 0),
    });
    expect(dream).toHaveBeenCalledTimes(1);
    expect(run.key).toBe('2026-09-16');
    expect(run.skipped).toBe(false);
    const ids = run.steps.map((s) => s.id);
    expect(ids[0]).toBe('snapshot');
    expect(ids).toContain('dream');
    expect(ids).toContain('forge');
    expect(run.steps.find((s) => s.id === 'forge')!.skipped).toBe(true);
    expect(run.reportMarkdown).toContain('Upgrade Report');
    expect(run.reportMarkdown).toContain('verified improvement');
  });

  it('runs the open-ended step between dream and forge', async () => {
    const store = openNightlyStore(freshFile());
    const order: string[] = [];
    const run = await runNightlyCycle({
      store,
      metrics: async () => ({ registryTools: 1 }),
      steps: {
        dream: async () => { order.push('dream'); return { ok: true, detail: 'd' }; },
        openended: async () => { order.push('openended'); return { ok: true, detail: 'oe' }; },
        forge: async () => { order.push('forge'); return { ok: true, detail: 'f' }; },
        benchmark: async () => { order.push('benchmark'); return { ok: true, detail: 'b' }; },
      },
      now: () => Date.UTC(2026, 8, 18),
    });
    expect(order).toEqual(['dream', 'openended', 'forge', 'benchmark']);
    expect(run.steps.map((s) => s.id)).toContain('openended');
  });

  it('is idempotent per night and re-runs when forced', async () => {
    const store = openNightlyStore(freshFile());
    const dream = vi.fn(async () => ({ ok: true, detail: 'x' }));
    const deps = { store, metrics: async () => ({ registryTools: 1 }), steps: { dream }, now: () => Date.UTC(2026, 8, 16) };
    await runNightlyCycle(deps);
    const again = await runNightlyCycle(deps);
    expect(again.skipped).toBe(true);
    expect(dream).toHaveBeenCalledTimes(1);

    await runNightlyCycle({ ...deps, force: true });
    expect(dream).toHaveBeenCalledTimes(2);
  });

  it('records a failing step honestly and still reports', async () => {
    const store = openNightlyStore(freshFile());
    const run = await runNightlyCycle({
      store,
      metrics: async () => ({ registryTools: 1 }),
      steps: { forge: async () => { throw new Error('forge blew up'); } },
      now: () => Date.UTC(2026, 8, 17),
    });
    const forge = run.steps.find((s) => s.id === 'forge')!;
    expect(forge.ok).toBe(false);
    expect(forge.detail).toMatch(/forge blew up/);
    expect(run.reportMarkdown).toContain('forge: FAILED');
  });
});
