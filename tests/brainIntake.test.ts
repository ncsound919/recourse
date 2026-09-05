import { describe, expect, it } from 'vitest';

import {
  mapKaggleItems,
  mapNewsItems,
  pollBrainKaggle,
  pollBrainNews,
  toKaggleSignal,
  toNewsSignal,
} from '../src/intake/brain.js';

describe('kaggle dataset mapping', () => {
  it('builds a canonical url + signal from a ref', () => {
    const s = toKaggleSignal(
      { ref: 'owner/cancer-cell-lines', title: 'Cancer Cell Lines', subtitle: 'Expression + viability', tags: ['biotech', 'oncology'], last_updated: '2026-01-02' },
      'cancer drug resistance',
    );
    expect(s).not.toBeNull();
    expect(s!.url).toBe('https://www.kaggle.com/datasets/owner/cancer-cell-lines');
    expect(s!.title).toBe('Cancer Cell Lines');
    expect(s!.summary).toBe('Expression + viability');
    expect(s!.source).toBe('kaggle');
    expect(s!.topics).toContain('cancer drug resistance');
    expect(s!.topics).toContain('biotech');
    expect(s!.publishedAt).toBe('2026-01-02');
  });

  it('skips items with neither a url-able ref nor a title', () => {
    expect(toKaggleSignal({ subtitle: 'only a description' }, 'q')).toBeNull();
  });

  it('prefers an explicit url over constructing one', () => {
    const s = toKaggleSignal({ url: 'https://example.com/x', title: 'T' }, 'q');
    expect(s!.url).toBe('https://example.com/x');
  });
});

describe('news mapping', () => {
  it('maps a news item to a signal with topics from category/source/tags', () => {
    const s = toNewsSignal({
      title: 'New CAR-T results',
      url: 'https://news.example.com/a',
      summary: 'Phase 2 data',
      category: 'science',
      source: 'Example',
      tags: ['oncology', 'car-t'],
      published: '2026-03-01T10:00:00Z',
    });
    expect(s).not.toBeNull();
    expect(s!.source).toBe('news');
    expect(s!.summary).toBe('Phase 2 data');
    expect(s!.topics).toEqual(expect.arrayContaining(['science', 'Example', 'oncology', 'car-t']));
    expect(s!.publishedAt).toContain('2026-03-01');
  });

  it('skips items with no url and no title', () => {
    expect(toNewsSignal({ summary: 'nothing to anchor' })).toBeNull();
  });
});

describe('honest offline providers', () => {
  // url:'' forces the not-configured path independent of any BRAIN_URL env.
  it('kaggle reports not-configured without a url', async () => {
    const { signals, result } = await pollBrainKaggle({ url: '', queries: ['x'] });
    expect(signals).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/BRAIN_URL not configured/);
  });

  it('news reports not-configured without a url', async () => {
    const { signals, result } = await pollBrainNews({ url: '' });
    expect(signals).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/BRAIN_URL not configured/);
  });
});
