import { describe, it, expect } from 'vitest';
import { fetchMusicTherapyTrials } from '../src/lib/musicTherapyFeed';

describe('music therapy europe pmc feed', () => {
  it('fetches real trials from the live API', async (ctx) => {
    const feed = await fetchMusicTherapyTrials({ pageSize: 10 });
    // Live integration test: Europe PMC is an external service. When it is
    // unreachable/rate-limited here (feed.errors populated), report an honest
    // skip rather than a red suite. The deterministic injected-fetch tests below
    // cover parsing + the network-failure honesty contract without the network.
    if (feed.errors.length > 0) return ctx.skip();
    expect(feed.hitCount).toBeGreaterThan(100); // the field reports 1700+
    expect(feed.trials.length).toBeGreaterThan(0);
    // Every trial has real content.
    expect(feed.trials.every((t) => t.title.length > 5)).toBe(true);
  }, 30000);

  it('uses the injected fetch implementation for deterministic tests', async () => {
    const fakeJson = {
      hitCount: 1,
      resultList: {
        result: [
          {
            title: 'Music reduces anxiety in chemotherapy',
            abstractText: 'Music reduced anxiety (MD = -7.7, 95% CI -10.7 to -4.6) in chemotherapy patients.',
            pubYear: 2023,
            journalInfo: { journal: { title: 'J Cancer Care' } },
            pmid: '12345678',
          },
        ],
      },
    };
    const fakeFetch = async () => ({ ok: true, json: async () => fakeJson }) as any;
    const feed = await fetchMusicTherapyTrials({ fetchImpl: fakeFetch, pageSize: 1 });
    expect(feed.hitCount).toBe(1);
    expect(feed.poolable.length).toBeGreaterThan(0);
    expect(feed.poolable[0].effect).toBeCloseTo(-7.7);
    expect(feed.poolable[0].se).toBeCloseTo(1.556, 2);
    expect(feed.poolable[0].pmid).toBe('12345678');
  });

  it('published meta-analyses are never pooled as if they were primary studies', async () => {
    const fakeJson = {
      hitCount: 2,
      resultList: {
        result: [
          {
            title: 'Music therapy for anxiety in cancer: A systematic review and meta-analysis',
            abstractText: 'Music reduced anxiety (MD = -7.7, 95% CI -10.7 to -4.6).',
            pubYear: 2023,
            journalInfo: { journal: { title: 'J Pain Symptom' } },
            pmid: '11111111',
          },
          {
            title: 'Primary RCT of music during chemotherapy',
            abstractText: 'Anxiety was lower with music (MD = -4.0, 95% CI -6.0 to -2.0).',
            pubYear: 2024,
            journalInfo: { journal: { title: 'Trials' } },
            pmid: '22222222',
          },
        ],
      },
    };
    const fakeFetch = async () => ({ ok: true, json: async () => fakeJson }) as any;
    const feed = await fetchMusicTherapyTrials({ fetchImpl: fakeFetch as any, pageSize: 2 });
    // Only the primary RCT survives in the poolable set.
    expect(feed.poolable.length).toBe(1);
    expect(feed.poolable[0].pmid).toBe('22222222');
    expect(feed.poolable[0].effect).toBeCloseTo(-4.0);
    // The meta-analysis estimate is kept visible as qualitative, not silently dropped.
    const demoted = feed.qualitative.find((q) => q.pmid === '11111111');
    expect(demoted).toBeDefined();
    expect(demoted!.detail).toContain('double-count');
  });

  it('handles network failure honestly (returns error, no fabricated data)', async () => {
    const failingFetch = async () => { throw new Error('ECONNREFUSED'); };
    const feed = await fetchMusicTherapyTrials({ fetchImpl: failingFetch as any });
    expect(feed.errors.length).toBe(1);
    expect(feed.trials.length).toBe(0);
    expect(feed.poolable.length).toBe(0);
  });

  it('dedupes to one poolable effect per article per biomarker (no double-counting)', async () => {
    // Same article (pmid 12345678) appearing once as an abstract record and
    // once via a full-text group-mean extraction — must collapse to 1 record.
    const searchJson = {
      hitCount: 1,
      resultList: {
        result: [
          {
            title: 'Music reduces anxiety in chemotherapy',
            abstractText: 'Music reduced anxiety (MD = -7.7, 95% CI -10.7 to -4.6) in chemotherapy patients.',
            pubYear: 2023,
            journalInfo: { journal: { title: 'J Cancer Care' } },
            pmid: '12345678',
            pmcid: 'PMC9999999',
          },
        ],
      },
    };
    const fullXml = `<article><table-wrap><caption>Anxiety outcomes (STAI)</caption><table>
      <tr><th>Outcome</th><th>Control n=50</th><th>Music Therapy n=60</th><th>p</th></tr>
      <tr><td>State anxiety (STAI)</td><td>45.3 (9.1)</td><td>38.2 (8.4)</td><td>&lt;0.001</td></tr>
    </table></table-wrap></article>`;
    const fakeFetch = async (url: string) => {
      if (String(url).includes('fullTextXML')) return { ok: true, text: async () => fullXml } as any;
      return { ok: true, json: async () => searchJson } as any;
    };
    const feed = await fetchMusicTherapyTrials({ fetchImpl: fakeFetch as any, fullText: true, maxFullText: 5 });
    // Both passes produced records for pmid 12345678/anxietySai — deduped to 1.
    const anx = feed.poolable.filter((r) => r.biomarker === 'anxietySai' && r.pmid === '12345678');
    expect(anx.length).toBe(1);
    // The group-mean record is preferred (it carries n).
    expect(anx[0].n).toBe(110);
    expect(feed.fullTextFetched).toBe(1);
    expect(feed.fullTextExtracted).toBeGreaterThan(0);
  });
});