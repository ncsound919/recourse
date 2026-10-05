import { describe, expect, it, vi, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createInteropRouter } from '../src/routes/interop';
import { createIntakeRouter } from '../src/routes/intake';

/**
 * Vacuous-truth gates: a PASSING verdict derived from an EMPTY input.
 *
 * `[].every(...)` is `true`, so each of these reported success for a check that
 * never ran.
 *
 * The most damaging was the forge differential (covered in
 * tests/forgeQualityDifferential.test.ts). This file covers the two route-level
 * cases plus the brain-news opt-out, which is the same shape reached through a
 * boolean instead of an array:
 *
 *  - deterministic replay reported `matches: true` for zero self-hosted modules,
 *    on a route whose own header promises "a mismatch is reported, never hidden";
 *  - `deps.brainNews() || true` collapsed the operator's opt-out to a constant
 *    `true`, because `false || true === true`, so `RECOURSE_INTAKE_BRAIN_NEWS`
 *    being unset still paid for /news traffic on every poll.
 */

import { verifyAllSelfHosted } from '../src/lib/selfHosting';

vi.mock('../src/lib/selfHosting', () => ({
  verifyAllSelfHosted: vi.fn(async () => [] as any[]),
}));

async function withInterop(fn: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(createInteropRouter({
    a2aBaseUrl: () => 'http://127.0.0.1:1',
    buildA2aOperations: () => ({}),
    a2aTaskStore: { get: () => undefined, put: () => {}, list: () => [] } as any,
  }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise<void>((r) => server.close(() => r())); }
}

describe('self-hosted deterministic replay', () => {
  beforeEach(() => { vi.mocked(verifyAllSelfHosted).mockReset(); });

  it('does NOT claim a match when there is nothing to replay', async () => {
    vi.mocked(verifyAllSelfHosted).mockResolvedValue([] as any);
    await withInterop(async (base) => {
      const res = await fetch(`${base}/api/recourse/replay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stream: 'selfhosted' }),
      });
      expect(res.ok).toBe(true);
      const body = await res.json() as any;
      // The regression: `[].every(...)` is true, so an empty manifest produced
      // a green replay verdict for a comparison that never happened.
      expect(body.report.matches).toBe(false);
      expect(body.report.records).toBe(0);
      expect(String(body.report.details[0])).toMatch(/nothing was re-verified/i);
    });
  }, 60_000);

  it('reports a match when every module re-verified green', async () => {
    vi.mocked(verifyAllSelfHosted).mockResolvedValue([
      { name: 'm1', hash: 'h1', lastVerified: { passed: true }, lastSandboxVerified: { passed: true } },
      { name: 'm2', hash: 'h2', lastVerified: { passed: true }, lastSandboxVerified: { passed: true } },
    ] as any);
    await withInterop(async (base) => {
      const res = await fetch(`${base}/api/recourse/replay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stream: 'selfhosted' }),
      });
      const body = await res.json() as any;
      expect(body.report.matches).toBe(true);
      expect(body.report.records).toBe(2);
    });
  }, 60_000);

  it('reports a mismatch when any module failed', async () => {
    vi.mocked(verifyAllSelfHosted).mockResolvedValue([
      { name: 'ok', hash: 'h1', lastVerified: { passed: true }, lastSandboxVerified: { passed: true } },
      { name: 'bad', hash: 'h2', lastVerified: { passed: false }, lastSandboxVerified: { passed: false } },
    ] as any);
    await withInterop(async (base) => {
      const res = await fetch(`${base}/api/recourse/replay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stream: 'selfhosted' }),
      });
      const body = await res.json() as any;
      expect(body.report.matches).toBe(false);
    });
  }, 60_000);
});

describe('intake brain-news opt-out', () => {
  // A real local "brain" is more robust than mocking `pollAllSources` (which the
  // router imports as a module, not an injected dep). `pollBrainNews` fetches
  // `${base}/news`, so whether /news is requested at all is a direct, honest
  // observation of the gate — and it is exactly the traffic the operator was
  // trying to avoid paying for.
  async function withBrain(brainNews: boolean, fn: (base: string, paths: () => string[]) => Promise<void>): Promise<void> {
    const paths: string[] = [];
    const brain = http.createServer((req, res) => {
      paths.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [], count: 0 }));
    });
    await new Promise<void>((r) => brain.listen(0, '127.0.0.1', r));
    const brainPort = (brain.address() as AddressInfo).port;

    const app = express();
    app.use(express.json());
    app.use('/api/recourse', createIntakeRouter({
      brainUrl: () => `http://127.0.0.1:${brainPort}`,
      brainKaggleQueries: () => [],
      brainNews: () => brainNews,
      brainNewsLimit: () => 5,
      maxPoll: () => 2,
      setLastPollResults: () => {},
      ingest: () => ({ added: 0, dupes: 0 }),
      appendProvenance: () => {},
      saveState: () => {},
      snapshot: () => ({ total: 0 }),
    } as any));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try { await fn(`http://127.0.0.1:${port}`, () => [...paths]); }
    finally {
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise<void>((r) => brain.close(() => r()));
    }
  }

  it('honours the operator opt-out instead of forcing news on', async () => {
    // Regression: `deps.brainNews() || true` is a constant `true`, so an unset
    // RECOURSE_INTAKE_BRAIN_NEWS still paid for /news on every poll.
    await withBrain(false, async (base, paths) => {
      const res = await fetch(`${base}/api/recourse/intake/brain`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      expect(res.ok).toBe(true);
      expect(paths().some((p) => p.startsWith('/news'))).toBe(false);
    });
  }, 60_000);

  it('polls /news when the operator opted in', async () => {
    await withBrain(true, async (base, paths) => {
      const res = await fetch(`${base}/api/recourse/intake/brain`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      expect(res.ok).toBe(true);
      expect(paths().some((p) => p.startsWith('/news'))).toBe(true);
    });
  }, 60_000);

  it('lets an explicit request override a configured opt-out', async () => {
    await withBrain(false, async (base, paths) => {
      const res = await fetch(`${base}/api/recourse/intake/brain`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ news: true }),
      });
      expect(res.ok).toBe(true);
      expect(paths().some((p) => p.startsWith('/news'))).toBe(true);
    });
  }, 60_000);
});