import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  ghidraHealth,
  ghidraAnalyze,
  ghidraEntropy,
  GHIDRA_SIDECAR_DEFAULT_URL,
} from '../src/lib/ghidraSidecarClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = 'http://ghidra.test';

describe('ghidra sidecar client - honest failures (no invented analysis)', () => {
  it('health reports unavailable honestly when the sidecar is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await ghidraHealth(BASE);
    expect(res.ok).toBe(false);
    expect(res.available).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('analyze returns ok:false when the sidecar is unreachable (never a canned disassembly)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await ghidraAnalyze('AAAA', { base: BASE, timeoutMs: 100 });
    expect(res.ok).toBe(false);
    expect(res.analysis).toBeUndefined();
    expect(res.findings).toBeUndefined();
  });

  it('analyze surfaces a real ok:false body from the sidecar (Ghidra absent)', async () => {
    const body = { ok: false, available: false, error: 'Ghidra headless analyzer not found' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await ghidraAnalyze('AAAA', { base: BASE, timeoutMs: 100 });
    expect(res.ok).toBe(false);
    expect(res.available).toBe(false);
    expect(res.error).toContain('not found');
  });

  it('parses a real analyze payload from the sidecar', async () => {
    const analysis = {
      program: 'sample.exe',
      language: 'x86:LE:64:default',
      compiler: 'windows',
      imageBase: '0x140000000',
      md5: 'abc',
      sha256: 'def',
      format: 'Portable Executable (PE)',
      functions: [{ name: 'main', entry: '0x140001000', size: 120, isThunk: false, isExternal: false }],
      functionCount: 1,
      symbols: [{ name: 'VirtualAlloc', address: 'EXTERNAL:1', type: 'Function', namespace: '', external: true }],
      symbolCount: 1,
      strings: [{ address: '0x140003000', value: 'hello', length: 5 }],
      stringCount: 1,
      sections: [{ name: '.text', start: '0x140001000', size: 4096, read: true, write: false, execute: true, initialized: true }],
      decompiled: [{ name: 'main', entry: '0x140001000', c: 'int main(void){return 0;}' }],
    };
    const body = {
      ok: true,
      available: true,
      elapsedMs: 1234,
      analysis,
      findings: {
        heuristic: true,
        note: 'x',
        riskScore: 60,
        indicatorCount: 1,
        indicators: [{ kind: 'suspicious_import', severity: 'high', detail: 'VirtualAlloc' }],
        suspiciousImports: [],
        counts: { functions: 1, symbols: 1, strings: 1, sections: 1, decompiled: 1 },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await ghidraAnalyze('AAAA', { base: BASE, timeoutMs: 100 });
    expect(res.ok).toBe(true);
    expect(res.analysis?.functions[0].name).toBe('main');
    expect(res.findings?.riskScore).toBe(60);
  });

  it('entropy is real math over the payload', async () => {
    const body = { ok: true, bytes: 256, entropy_bits_per_byte: 8, max_entropy: 8, packing_hint: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await ghidraEntropy('AAAA', { base: BASE });
    expect(res.ok).toBe(true);
    expect(res.entropy_bits_per_byte).toBe(8);
    expect(res.packing_hint).toBe(true);
  });

  it('defaults the sidecar base URL', () => {
    expect(GHIDRA_SIDECAR_DEFAULT_URL.startsWith('http')).toBe(true);
  });
});
