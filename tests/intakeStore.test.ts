import { describe, it, expect, vi, afterEach } from 'vitest';
import { SignalStore, contentTag } from '../src/intake/store';
import { signalId, makeSignal } from '../src/intake/util';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SignalStore dedupe + persistence', () => {
  it('ingests new signals and reports dupes for repeats', () => {
    const store = new SignalStore();
    const a = makeSignal('arxiv', 'https://arxiv.org/abs/2401.00001', 'A paper', 'An abstract', ['math']);
    const first = store.ingest([a, a, makeSignal('github', 'https://github.com/x/y', 'A repo', 'desc', ['coding'])]);
    expect(first.added).toBe(2);
    expect(first.dupes).toBe(1);

    const second = store.ingest([a]);
    expect(second.added).toBe(0);
    expect(second.dupes).toBe(1);
    expect(store.all()).toHaveLength(2);
  });

  it('marks signals consumed and exposes nextUnconsumed FIFO', () => {
    const store = new SignalStore();
    const older = makeSignal('arxiv', 'https://arxiv.org/abs/1', 'older', 's1', []);
    older.fetchedAt = 1000;
    const newer = makeSignal('arxiv', 'https://arxiv.org/abs/2', 'newer', 's2', []);
    newer.fetchedAt = 2000;
    store.ingest([newer, older]);

    expect(store.nextUnconsumed()?.id).toBe(older.id);
    store.markConsumed(older.id, 'ground_tool');
    expect(store.nextUnconsumed()?.id).toBe(newer.id);
    const s = store.get(older.id);
    expect(s?.consumed).toBe(true);
    expect(s?.groundedTool).toBe('ground_tool');
  });

  it('calls onSave callback with the latest signal set', () => {
    const saved: any[] = [];
    const store = new SignalStore((signals) => saved.push(signals));
    store.ingest([makeSignal('rss', 'https://feed.example/1', 'T', 'S', [])]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toHaveLength(1);
  });

  it('signalId is stable for the same url+title', () => {
    expect(signalId('https://a.com/1', 'Title')).toBe(signalId('https://a.com/1', 'Title'));
    expect(signalId('https://a.com/1', 'Title')).not.toBe(signalId('https://a.com/1', 'Other'));
  });

  it('contentTag produces a short stable hash', () => {
    expect(contentTag({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
    expect(contentTag({ a: 1 })).toBe(contentTag({ a: 1 }));
  });
});
