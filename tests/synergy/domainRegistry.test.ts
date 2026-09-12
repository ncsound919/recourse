import { describe, it, expect } from 'vitest';
import {
  listDomains,
  getDomain,
  unverifiedDomains,
  domainsForToolDomain,
} from '../../src/lib/synergy/domainRegistry.js';

describe('domain registry', () => {
  it('includes the seven operator sectors and marks logistics verified', () => {
    const ids = listDomains().map((d) => d.id);
    for (const id of ['health_oncology', 'mathematics', 'cybersecurity', 'neuro_music', 'aging', 'sports', 'logistics']) {
      expect(ids).toContain(id);
    }
    expect(getDomain('logistics')?.verified).toBe(true);
    expect(getDomain('logistics')?.corpusProjects).toContain('truck-buddy');
  });

  it('maps tool domains to sectors', () => {
    expect(domainsForToolDomain('math').map((d) => d.id)).toContain('mathematics');
    expect(domainsForToolDomain('cyber_defense').map((d) => d.id)).toContain('cybersecurity');
  });

  it('reports unverified sectors honestly', () => {
    expect(unverifiedDomains()).toEqual([]);
    expect(getDomain('does_not_exist')).toBeUndefined();
  });
});
