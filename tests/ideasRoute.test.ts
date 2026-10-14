/**
 * ideasRoute.test.ts — the fleet-partner intake endpoints, exercised over a
 * real ephemeral listener (recourse does not depend on supertest).
 *
 * Contract: fail-closed mutation auth on POST; validation refuses cards that
 * cannot be forged (>=2 asserts); status is a truthful readback with nextUp.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createIdeasRouter } from '../src/routes/ideas.js';
import type { ExternalStateIdea } from '../src/lib/externalIdeas.js';

const SECRET = 'ideas-route-secret';

const card = {
  id: 'sieve:idea:route-test',
  source: 'sieve',
  domain: 'systemic',
  toolName: 'routeCanary_test',
  title: 'Canary for a hot route',
  prompt: 'Telemetry saw 500s. Define and export exactly one function named "routeCanary_test" that satisfies the contract.',
  refSuite: 'assert routeCanary_test({status:200,ms:1,budgetMs:10}).ok === true;\nassert routeCanary_test({status:500,ms:1,budgetMs:10}).ok === false;',
  score: 0.9,
};

let server: http.Server;
let base = '';
let ideas: ExternalStateIdea[] = [];
let prevSecret: string | undefined;

const auth = { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });

beforeAll(async () => {
  prevSecret = process.env.RECOURSE_API_SECRET;
  process.env.RECOURSE_API_SECRET = SECRET;
  ideas = [];
  const app = express();
  app.use(express.json());
  app.use('/api/recourse', createIdeasRouter({
    ideasRef: () => ideas,
    builtNames: () => new Set<string>(),
    quarantine: () => new Map<string, number>(),
    saveState: () => {},
    requireMutationAuth: (req: any, res: any) => {
      const presented = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!presented || presented !== SECRET) { res.status(401).json({ success: false, error: 'unauthorized' }); return false; }
      return true;
    },
  }));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  if (prevSecret === undefined) delete process.env.RECOURSE_API_SECRET;
  else process.env.RECOURSE_API_SECRET = prevSecret;
});

describe('fleet ideas intake routes', () => {
  it('POST /fleet/ideas is fail-closed without the mutation secret', async () => {
    const res = await post('/api/recourse/fleet/ideas', { ideas: [card] }, { 'content-type': 'application/json' });
    expect(res.status).toBe(401);
    expect(ideas).toHaveLength(0);
  });

  it('accepts a valid card with the secret and refreshes (not duplicates) a pending id', async () => {
    const ok = await post('/api/recourse/fleet/ideas', { ideas: [card] });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.accepted).toBe(1);
    expect(ideas[0].status).toBe('pending');

    const dup = await post('/api/recourse/fleet/ideas', { ideas: [card] });
    const dupBody = await dup.json();
    expect(dupBody.accepted).toBe(1);
    expect(ideas).toHaveLength(1);
  });

  it('refuses a card without a testable contract (accepted 0, reason names refSuite)', async () => {
    const res = await post('/api/recourse/fleet/ideas', { ideas: [{ ...card, id: 'sieve:idea:no-contract', refSuite: 'assert 1 === 1;' }] });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.accepted).toBe(0);
    expect(body.rejected[0].reason).toMatch(/refSuite/);
    expect(ideas).toHaveLength(1);
  });

  it('status readback is truthful (summary + built + failed + nextUp)', async () => {
    const res = await fetch(base + '/api/recourse/fleet/ideas/status');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.summary).toMatchObject({ total: 1, pending: 1, built: 0, failed: 0 });
    expect(body.nextUp[0].toolName).toBe('routeCanary_test');
    expect(Array.isArray(body.built)).toBe(true);
    expect(Array.isArray(body.failed)).toBe(true);
  });

  it('outcome marking is guarded, rejects unknown ids, and records built with name+hash', async () => {
    const unauth = await post('/api/recourse/fleet/ideas/sieve:idea:route-test/outcome', { status: 'built' }, { 'content-type': 'application/json' });
    expect(unauth.status).toBe(401);
    const unknown = await post('/api/recourse/fleet/ideas/nope/outcome', { status: 'built' });
    expect(unknown.status).toBe(404);
    const ok = await post('/api/recourse/fleet/ideas/sieve:idea:route-test/outcome', { status: 'built', toolName: 'routeCanary_test', versionHash: 'h' });
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.summary.built).toBe(1);
  });
});
