import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { trendHealth } from '../src/lib/trendSidecarClient';

/**
 * A health probe must identify WHICH service answered, not just that something
 * did.
 *
 * `trendHealth` returned `ok: true` for any HTTP 200. The default port is
 * contested, and in practice `GET /health` on 8800 answered
 * `{ "status": "ok", "service": "sympy", "sympy_version": "1.14.0" }` — a
 * different sidecar entirely, with neither statsmodels nor ruptures. So the
 * trend engine reported ONLINE while it was unreachable, which also defeated
 * the `if (!h.ok) return` fail-soft guard in tests/trendEngine.test.ts: the test
 * proceeded and failed deep inside trendDecompose instead of skipping, pointing
 * a debugger at a nonexistent statsmodels regression.
 */

interface Fake {
  url: string;
  chatCalls: () => number;
  close: () => Promise<void>;
}

/** Serve the given /health payload; /trend/* 404s like a foreign service would. */
async function serveHealth(payload: unknown): Promise<Fake> {
  const srv = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    chatCalls: () => 0,
    close: () => new Promise<void>((r) => srv.close(() => r())),
  };
}

describe('trendHealth service identity', () => {
  let fake: Fake | null = null;
  beforeEach(() => { fake = null; });
  afterEach(async () => { if (fake) await fake.close(); fake = null; });

  it('rejects a /health answered by a different service', async () => {
    fake = await serveHealth({ status: 'ok', service: 'sympy', sympy_version: '1.14.0' });
    const h = await trendHealth(fake.url, 2000);
    expect(h.ok).toBe(false);
    expect(String((h as any).error)).toMatch(/wrong service/i);
    // The message must name the service that actually answered, or it is not
    // diagnosable.
    expect(String((h as any).error)).toContain('sympy');
  });

  it('rejects a payload whose service name is not the trend service', async () => {
    fake = await serveHealth({ status: 'ok', service: 'pdf', pymupdf: '1.28.2' });
    const h = await trendHealth(fake.url, 2000);
    expect(h.ok).toBe(false);
    expect(String((h as any).error)).toMatch(/wrong service/i);
  });

  it('rejects a trend service that cannot serve the libraries the engine calls', async () => {
    fake = await serveHealth({ status: 'ok', service: 'trend', statsmodels: null, ruptures: null });
    const h = await trendHealth(fake.url, 2000);
    expect(h.ok).toBe(false);
    const err = String((h as any).error);
    expect(err).toContain('statsmodels');
    expect(err).toContain('ruptures');
  });

  it('reports ok only when the trend service AND both libraries are present', async () => {
    fake = await serveHealth({
      status: 'ok', service: 'trend-engine', statsmodels: '0.14.4', ruptures: '1.1.8',
    });
    const h = await trendHealth(fake.url, 2000);
    expect(h.ok).toBe(true);
    expect(h.status).toBe('ok');
    expect(h.statsmodels).toBe('0.14.4');
    expect(h.ruptures).toBe('1.1.8');
  });

  it('rejects a non-ok status from the right service', async () => {
    fake = await serveHealth({ status: 'degraded', service: 'trend', statsmodels: '0.14.4', ruptures: '1.1.8' });
    const h = await trendHealth(fake.url, 2000);
    expect(h.ok).toBe(false);
    expect(String((h as any).error)).toContain('degraded');
  });

  it('reports unreachable rather than healthy when nothing is listening', async () => {
    // Port 1 is reserved and never listening.
    const h = await trendHealth('http://127.0.0.1:1', 500);
    expect(h.ok).toBe(false);
    expect((h as any).error).toBeTruthy();
  });
});