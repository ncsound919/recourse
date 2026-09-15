import { describe, it, expect } from 'vitest';
import {
  listDomains,
  getDomain,
  unverifiedDomains,
  domainsForToolDomain,
} from '../../src/lib/synergy/domainRegistry.js';
import { DEFAULT_CORPUS_ROOTS } from '../../src/intake/corpus/index.js';

describe('domain registry', () => {
  it('includes the operator sectors and marks logistics verified', () => {
    const ids = listDomains().map((d) => d.id);
    for (const id of ['health_oncology', 'mathematics', 'cybersecurity', 'neuro_music', 'aging', 'sports', 'logistics', 'music']) {
      expect(ids).toContain(id);
    }
    expect(getDomain('logistics')?.verified).toBe(true);
    expect(getDomain('logistics')?.corpusProjects).toContain('truck-buddy');
    expect(getDomain('music')?.verified).toBe(true);
  });

  it('maps tool domains to sectors', () => {
    expect(domainsForToolDomain('math').map((d) => d.id)).toContain('mathematics');
    expect(domainsForToolDomain('cyber_defense').map((d) => d.id)).toContain('cybersecurity');
  });

  it('reports unverified sectors honestly', () => {
    expect(unverifiedDomains()).toEqual([]);
    expect(getDomain('does_not_exist')).toBeUndefined();
  });

  it('binds every verified sector to real evidence', () => {
    const rootIds = new Set(DEFAULT_CORPUS_ROOTS.map((r) => r.project));
    for (const d of listDomains()) {
      if (!d.verified) continue;
      const bound =
        d.toolDomains.length > 0 ||
        d.translationEngines.length > 0 ||
        (d.seriesTerms?.length ?? 0) > 0 ||
        d.corpusProjects.length > 0;
      expect(bound, `${d.id} claims verified with no evidence`).toBe(true);
      for (const p of d.corpusProjects) {
        expect(rootIds.has(p), `${d.id} cites unknown corpus project ${p}`).toBe(true);
      }
    }
  });
});
