// Tests for the citation resolver.
//
// The behaviour that matters is REFUSAL. Measured against the real Skoulidis
// NEJM 2021 citation, Europe PMC returns ~25 different papers about sotorasib
// whose titles overlap the citation by 0.14-0.36. An earlier 0.3 floor accepted
// one and would have reported a claim as "cross-validated" against literature
// that does not contain the cited finding. So these tests pin the floor, the
// author-stripping, and the refusal path.

import { describe, it, expect } from 'vitest';

import {
  resolveCitation,
  resolveAndExtract,
  titleMatchScore,
  MATCH_FLOOR,
} from '../src/lib/citationResolver.js';

/** Build a fetch stub returning one Europe PMC search result. */
const searchStub = (results: unknown[], ok = true) =>
  (async () =>
    new Response(JSON.stringify({ hitCount: results.length, resultList: { result: results } }), {
      status: ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

const OA_HIT = {
  pmid: '42190605',
  pmcid: 'PMC13223805',
  title: 'Sotorasib combined with 3-methyladenine for the treatment of KRAS G12C-mutant pancreatic cancer and its underlying mechanisms.',
  journalTitle: 'Transl Oncol',
  pubYear: '2026',
  isOpenAccess: 'Y',
};

const PAYWALLED_HIT = {
  pmid: '34096690',
  pmcid: 'PMC9116274',
  title: 'Sotorasib for Lung Cancers with <i>KRAS</i> p.G12C Mutation.',
  journalTitle: 'N Engl J Med',
  pubYear: '2021',
  isOpenAccess: 'N',
};

describe('titleMatchScore', () => {
  it('scores an exact title match at 1', () => {
    expect(titleMatchScore('Sotorasib for Lung Cancers with KRAS p.G12C Mutation.', 'Sotorasib for Lung Cancers with KRAS p.G12C Mutation.')).toBe(1);
  });

  it('scores a wholly different paper near zero', () => {
    expect(titleMatchScore('Sotorasib for Lung Cancers', 'The ECG as a Discovery Instrument for Sudden Cardiac Death')).toBeLessThan(0.2);
  });

  it('is 0 when either side has no usable tokens', () => {
    expect(titleMatchScore('', 'anything')).toBe(0);
    expect(titleMatchScore('anything', '')).toBe(0);
  });
});

describe('MATCH_FLOOR is calibrated, not optimistic', () => {
  it('sits above the score band that decoys occupy', () => {
    // Measured decoy band for a real citation: 0.14 - 0.36.
    expect(MATCH_FLOOR).toBeGreaterThan(0.36);
    expect(MATCH_FLOOR).toBeLessThanOrEqual(1);
  });
});

describe('resolveCitation — honesty at the edges', () => {
  it('refuses an empty citation without calling the network', async () => {
    let called = false;
    const r = await resolveCitation('', { fetchImpl: (async () => { called = true; return new Response('{}'); }) as any });
    expect(r.resolved).toBe(false);
    expect(called).toBe(false);
  });

  it('reports an HTTP failure rather than inventing a match', async () => {
    const r = await resolveCitation('Some Author. A real title about things. Journal 2020.', { fetchImpl: searchStub([], false) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toContain('HTTP 500');
  });

  it('reports no results rather than inventing a match', async () => {
    const r = await resolveCitation('Some Author. A real title about things. Journal 2020.', { fetchImpl: searchStub([]) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toContain('no Europe PMC result');
  });

  it('REFUSES a low-scoring decoy instead of substituting another paper', async () => {
    // The exact failure that motivated the floor: a different paper about the
    // same drug must not be accepted as the citation.
    const decoy = {
      pmid: '41786688', pmcid: 'PMC13039536', isOpenAccess: 'Y',
      title: 'Cetuximab co-treatment with KRAS G12C inhibitors fulzerasib and sotorasib in human KRAS G12C non-small cell lung cancer cells.',
    };
    const r = await resolveCitation(
      'Skoulidis F, et al. Sotorasib for Lung Cancers with KRAS p.G12C Mutation. N Engl J Med 2021; 384:2371-2381.',
      { fetchImpl: searchStub([decoy]) },
    );
    expect(r.resolved).toBe(false);
    expect(r.reason).toContain('refusing to substitute');
  });

  it('reports a paywalled match honestly, with its identifier', async () => {
    // The correct paper IS found (score 1) but has no retrievable full text.
    // That is a real limitation of the source, not a failure of the claim.
    const r = await resolveCitation(
      'Skoulidis F, et al. Sotorasib for Lung Cancers with KRAS p.G12C Mutation. N Engl J Med 2021; 384:2371-2381.',
      { fetchImpl: searchStub([PAYWALLED_HIT]) },
    );
    expect(r.resolved).toBe(false);
    expect(r.pmcid).toBe('PMC9116274');
    expect(r.reason).toContain('NOT open-access');
  });

  it('resolves an open-access exact match', async () => {
    const r = await resolveCitation(
      'Sotorasib combined with 3-methyladenine for the treatment of KRAS G12C-mutant pancreatic cancer and its underlying mechanisms. Transl Oncol 2026.',
      { fetchImpl: searchStub([OA_HIT]) },
    );
    expect(r.resolved).toBe(true);
    expect(r.pmcid).toBe('PMC13223805');
    expect(r.matchScore).toBe(1);
    expect(r.url).toContain('PMC13223805');
  });

  it('does not strip author names out of the search in a way that finds nothing', async () => {
    // Guards the author-segment logic: "Skoulidis" must not enter the query,
    // because TITLE:Skoulidis returns zero hits in Europe PMC.
    const seen: string[] = [];
    const spy = (async (url: any) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ hitCount: 0, resultList: { result: [] } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    await resolveCitation('Skoulidis F, et al. Sotorasib for Lung Cancers with KRAS p.G12C Mutation. N Engl J Med 2021.', { fetchImpl: spy });
    const broad = seen.find((u) => u.includes('search?query')) ?? '';
    expect(decodeURIComponent(broad)).not.toContain('TITLE:Skoulidis');
  });
});

describe('resolveAndExtract', () => {
  it('reports the unresolved reason instead of empty text', async () => {
    const r = await resolveAndExtract('Nobody A. Nothing here at all really. Journal 1999.', {
      fetchImpl: searchStub([]),
    });
    expect(r.ok).toBe(false);
    expect(r.text).toBe('');
    expect(r.chars).toBe(0);
    expect(r.reason).toBeTruthy();
  });
});