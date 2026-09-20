import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRatingRouter } from '../src/routes/rating';
import { RatingStore } from '../src/lib/rating/store';

const servers: http.Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function setup(denyWrites = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-rating-http-'));
  dirs.push(dir);
  const store = new RatingStore(path.join(dir, 'ledger.jsonl'));
  const guard = (_req: express.Request, res: express.Response) => {
    if (!denyWrites) return true;
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  };
  const app = express();
  app.use(express.json());
  app.use('/api/recourse', createRatingRouter({ store, requireMutationAuth: guard }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base };
}

describe('rating router', () => {
  it('registers variations, records a pair, and returns standings', async () => {
    const { base } = await setup();
    const a = await (await fetch(`${base}/api/recourse/rating/variation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chordstudio', params: { v: 1 }, label: 'one' }),
    })).json() as any;
    expect(a.success).toBe(true);

    const pair = await (await fetch(`${base}/api/recourse/rating/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'chordstudio',
        a: { params: { v: 1 } },
        b: { params: { v: 2 } },
        winner: 'B',
      }),
    })).json() as any;
    expect(pair.success).toBe(true);
    expect(pair.a.paramHash).not.toBe(pair.b.paramHash);
    expect(pair.b.wins).toBe(1);
    expect(pair.b.elo).toBeGreaterThan(1500);
    expect(pair.a.elo).toBeLessThan(1500);

    const standings = await (await fetch(`${base}/api/recourse/rating/standings?source=chordstudio`)).json() as any;
    expect(standings.success).toBe(true);
    expect(standings.standings[0].paramHash).toBe(pair.b.paramHash);

    const next = await (await fetch(`${base}/api/recourse/rating/pair/next?source=chordstudio`)).json() as any;
    expect(next.success).toBe(true);
    expect(next.a.paramHash).not.toBe(next.b.paramHash);
  });

  it('reports a valid hash-chained ledger', async () => {
    const { base } = await setup();
    await fetch(`${base}/api/recourse/rating/variation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chordstudio', params: { v: 1 } }),
    });
    const ledger = await (await fetch(`${base}/api/recourse/rating/ledger`)).json() as any;
    expect(ledger.valid).toBe(true);
    expect(ledger.records).toBe(1);
    expect(ledger.head).toHaveLength(64);
  });

  it('rejects an unauthenticated write when guarded', async () => {
    const { base } = await setup(true);
    const res = await fetch(`${base}/api/recourse/rating/variation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chordstudio', params: { v: 1 } }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid winner with a 400', async () => {
    const { base } = await setup();
    const res = await fetch(`${base}/api/recourse/rating/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chordstudio', a: { params: { v: 1 } }, b: { params: { v: 2 } }, winner: 'X' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns ranked parents with params for the next generation', async () => {
    const { base } = await setup();
    await fetch(`${base}/api/recourse/rating/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chordstudio', a: { params: { v: 1 } }, b: { params: { v: 2 } }, winner: 'A' }),
    });
    const suggest = await (await fetch(`${base}/api/recourse/rating/suggest?source=chordstudio&count=5`)).json() as any;
    expect(suggest.success).toBe(true);
    expect(suggest.count).toBe(2);
    expect(suggest.suggestions[0].params).toEqual({ v: 1 });
    expect(suggest.suggestions[0].elo).toBeGreaterThan(suggest.suggestions[1].elo);

    const cold = await (await fetch(`${base}/api/recourse/rating/suggest?source=chordstudio&minMatches=99`)).json() as any;
    expect(cold.count).toBe(0);
    expect(cold.coldStart).toBe(true);
  });
});
