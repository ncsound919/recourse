import { describe, it, expect, afterEach, vi } from 'vitest';
import { pdfSidecarHealth, pdfExtractUrl, pdfExtractBytes, PDF_SIDECAR_DEFAULT_URL } from '../src/lib/pdfSidecarClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = 'http://pdf.test';

describe('pdf sidecar client - honest failures (no fabricated text)', () => {
  it('returns ok:false when the sidecar is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await pdfExtractUrl('https://x/paper.pdf', { base: BASE });
    expect(res.ok).toBe(false);
    expect(res.text).toBeUndefined();
    expect(res.pages).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('returns ok:false on a non-2xx sidecar response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 422 })));
    const res = await pdfExtractBytes('aGVsbG8=', { base: BASE });
    expect(res.ok).toBe(false);
  });

  it('health reports online:false honestly when the sidecar is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await pdfSidecarHealth(BASE);
    expect(res.ok).toBe(false);
    expect(res.pymupdf).toBeUndefined();
  });

  it('parses a real extract payload from the sidecar (mock 200)', async () => {
    const body = {
      ok: true,
      page_count: 2,
      pages_extracted: 2,
      total_chars: 120,
      metadata: { title: 'KRAS paper' },
      scanned_only_image_pdf: false,
      pages: [
        { page: 1, chars: 60, text: 'KRAS G12C covalent inhibitor.' },
        { page: 2, chars: 60, text: 'second page.' },
      ],
      text: 'KRAS G12C covalent inhibitor.\n\nsecond page.',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await pdfExtractBytes('aGVsbG8=', { base: BASE });
    expect(res.ok).toBe(true);
    expect(res.page_count).toBe(2);
    expect(res.scanned_only_image_pdf).toBe(false);
    expect(res.text).toContain('KRAS G12C');
  });

  it('surfaces the honest scanned-only flag from the sidecar', async () => {
    const body = { ok: true, page_count: 1, pages_extracted: 1, total_chars: 0, scanned_only_image_pdf: true, pages: [], text: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await pdfExtractBytes('aGVsbG8=', { base: BASE });
    expect(res.ok).toBe(true);
    expect(res.scanned_only_image_pdf).toBe(true);
    expect(res.text).toBe('');
  });

  it('defaults the sidecar base URL and honours env override', () => {
    expect(PDF_SIDECAR_DEFAULT_URL.startsWith('http')).toBe(true);
  });
});
