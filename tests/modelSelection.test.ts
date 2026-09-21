import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ModelSelection, rewardForOutcome } from '../src/lib/modelSelection';

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-sel-')), 'model-selection.json');
}

describe('rewardForOutcome', () => {
  it('scores failures and offline calls at zero', () => {
    expect(rewardForOutcome({ ok: false, status: 'offline', latencyMs: 5 })).toBe(0);
    expect(rewardForOutcome({ ok: false, status: 'error', latencyMs: 5 })).toBe(0);
    expect(rewardForOutcome({ ok: true, status: 'offline', latencyMs: 5 })).toBe(0);
  });

  it('rewards a fast success above a slow one, both within [0.5,1]', () => {
    const fast = rewardForOutcome({ ok: true, status: 'online', latencyMs: 0, budgetMs: 1000 });
    const half = rewardForOutcome({ ok: true, status: 'online', latencyMs: 500, budgetMs: 1000 });
    const slow = rewardForOutcome({ ok: true, status: 'online', latencyMs: 1000, budgetMs: 1000 });
    expect(fast).toBe(1);
    expect(half).toBe(0.75);
    expect(slow).toBe(0.5);
    expect(fast).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(slow);
  });

  it('floors the speed component for absurdly slow calls', () => {
    expect(rewardForOutcome({ ok: true, status: 'online', latencyMs: 10_000_000, budgetMs: 1000 })).toBe(0.5);
  });
});

describe('ModelSelection — learning gate', () => {
  it('returns null (heuristic) until warmed', () => {
    const sel = new ModelSelection({ file: null, warmup: 3 });
    expect(sel.warmed()).toBe(false);
    expect(sel.choose(['local', 'api'])).toBeNull();
    sel.record('local', 1);
    sel.record('local', 1);
    expect(sel.warmed()).toBe(false);
    expect(sel.choose(['local', 'api'])).toBeNull();
    sel.record('local', 1);
    expect(sel.warmed()).toBe(true);
    expect(sel.choose(['local', 'api'])).not.toBeNull();
  });

  it('exploits the arm with the higher observed reward once warmed', () => {
    const sel = new ModelSelection({ file: null, warmup: 2 });
    for (let i = 0; i < 6; i++) { sel.record('local', 0.1); sel.record('api', 0.9); }
    expect(sel.choose(['local', 'api'])).toBe('api');
    const arms = sel.snapshot();
    expect(arms.find((a) => a.id === 'api')!.mean).toBeGreaterThan(arms.find((a) => a.id === 'local')!.mean);
  });

  it('never returns an arm the caller did not offer', () => {
    const sel = new ModelSelection({ file: null, warmup: 2 });
    for (let i = 0; i < 6; i++) { sel.record('local', 0.0); sel.record('api', 1.0); }
    // Best arm overall is api; if only local is offered there is nothing to
    // return, so the caller keeps its heuristic rather than being surprised.
    expect(sel.choose(['local'])).toBeNull();
  });

  it('returns null for an empty available set', () => {
    const sel = new ModelSelection({ file: null, warmup: 1 });
    sel.record('api', 1);
    expect(sel.choose([])).toBeNull();
  });
});

describe('ModelSelection — durable persistence', () => {
  it('round-trips learned state through a file', () => {
    const file = tmpFile();
    const a = new ModelSelection({ file, warmup: 2 });
    for (let i = 0; i < 5; i++) a.record('api', 0.8);
    a.persist();
    expect(fs.existsSync(file)).toBe(true);

    const b = new ModelSelection({ file, warmup: 2 });
    expect(b.warmed()).toBe(true);
    expect(b.playCount).toBe(5);
    expect(b.snapshot().find((x) => x.id === 'api')!.plays).toBe(5);
  });

  it('degrades to an empty bandit on a corrupt file (never throws)', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ this is not json', 'utf-8');
    const sel = new ModelSelection({ file, warmup: 1 });
    expect(sel.warmed()).toBe(false);
    expect(sel.playCount).toBe(0);
  });
});
