import { describe, it, expect } from 'vitest';
import { biotechClaimExtra, fuzzMatchReq, pdfExtractUrlReq } from '../src/lib/contracts';

describe('zod contracts - reject bad input at the boundary', () => {
  it('pdfExtractUrlReq accepts a valid URL and coerces max_pages', () => {
    const r = pdfExtractUrlReq.safeParse({ url: 'https://export.arxiv.org/pdf/2401.0001', max_pages: '12' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_pages).toBe(12);
  });

  it('pdfExtractUrlReq rejects a non-URL or a too-large page cap', () => {
    expect(pdfExtractUrlReq.safeParse({ url: 'not-a-url' }).success).toBe(false);
    expect(pdfExtractUrlReq.safeParse({ url: 'https://x/a.pdf', max_pages: 99999 }).success).toBe(false);
  });

  it('fuzzMatchReq rejects empty candidates', () => {
    expect(fuzzMatchReq.safeParse({ needle: 'x', candidates: [] }).success).toBe(false);
  });

  it('biotechClaimExtra is strict - rejects unknown keys (no silent injection)', () => {
    const good = biotechClaimExtra.safeParse({ asset_name: 'sotorasib', leg: 'debulking', evidence_tier: 5 });
    expect(good.success).toBe(true);
    const bad = biotechClaimExtra.safeParse({ asset_name: 'x', leg: 'debulking', __proto__: {}, code: 'EVIL()' });
    expect(bad.success).toBe(false);
  });

  it('biotechClaimExtra rejects out-of-range evidence_tier', () => {
    expect(biotechClaimExtra.safeParse({ evidence_tier: 9 }).success).toBe(false);
  });
});
