import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { createEcosystemRouter } from '../src/routes/ecosystem';
import { openSkillRegistry } from '../src/lib/skillRegistry';
import { federationSkillProviders } from '../src/lib/ecosystem/skillFederation';
import { ConnectorRegistry } from '../src/lib/connectors/registry';
import { makeSyncItem } from '../src/lib/federation/sync';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-eco-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  vi.unstubAllGlobals();
});

const prevSecret = process.env.RECOURSE_SKILL_SECRET;
beforeAll(() => { process.env.RECOURSE_SKILL_SECRET = 'skill-secret'; });
afterAll(() => { if (prevSecret === undefined) delete process.env.RECOURSE_SKILL_SECRET; else process.env.RECOURSE_SKILL_SECRET = prevSecret; });

describe('skill <-> federation bridge', () => {
  it('exports registry skills as sync items and imports foreign ones (newer-wins)', () => {
    const reg = openSkillRegistry(path.join(freshDir(), 'skills.json'));
    reg.publish({ id: 'dedupe', name: 'Dedupe', version: '1.0.0', description: 'd', license: 'MIT' });
    const providers = federationSkillProviders(reg);

    const exported = providers.exportItems('skill');
    expect(exported).toHaveLength(1);
    expect(exported[0].id).toBe('dedupe');
    expect(exported[0].kind).toBe('skill');
    // Other kinds are not ours to provide here.
    expect(providers.exportItems('registry')).toHaveLength(0);

    // A foreign, newer version arrives from a peer; its signature is preserved.
    const foreign = {
      id: 'dedupe', name: 'Dedupe', version: '2.0.0', description: 'd2',
      publishedAt: Date.now() + 1000, signature: 'foreign-signature',
    };
    const applied = providers.importItems('skill', [makeSyncItem('skill', 'dedupe', foreign, foreign.publishedAt)]);
    expect(applied).toBe(1);
    const stored = reg.get('dedupe');
    expect(stored?.version).toBe('2.0.0');
    expect(stored?.signature).toBe('foreign-signature');

    // An older payload is ignored.
    const older = { ...foreign, version: '0.5.0', publishedAt: foreign.publishedAt - 5000 };
    expect(providers.importItems('skill', [makeSyncItem('skill', 'dedupe', older, older.publishedAt)])).toBe(0);
    expect(reg.get('dedupe')?.version).toBe('2.0.0');
  });
});

describe('ecosystem router', () => {
  async function setup() {
    const dir = freshDir();
    const skills = openSkillRegistry(path.join(dir, 'skills.json'));
    const connectors = new ConnectorRegistry();
    const guard = (req: Request, res: Response) => {
      if (req.headers['x-secret'] === 's') return true;
      res.status(401).json({ success: false, error: 'unauthorized' });
      return false;
    };
    const app = express();
    app.use(express.json());
    app.use('/api/recourse/ecosystem', createEcosystemRouter({ requireMutationAuth: guard, skillRegistry: skills, connectors, webhookSecret: 'wh' }));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const post = (p: string, body: unknown, authed = true) =>
      fetch(`${base}${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authed ? { 'x-secret': 's' } : {}) },
        body: JSON.stringify(body),
      });
    return { base, post, skills, connectors };
  }

  it('publishes, lists, verifies, and revokes a signed skill', async () => {
    const { base, post } = await setup();
    const pub = await post('/api/recourse/ecosystem/skills/publish', { id: 'x', name: 'X', version: '1.0.0', description: 'd' });
    expect(pub.status).toBe(200);
    const pubBody: any = await pub.json();
    expect(pubBody.signed).toBe(true);

    const list = (await (await fetch(`${base}/api/recourse/ecosystem/skills`)).json()) as any;
    expect(list.count).toBe(1);
    expect(list.skills[0].id).toBe('x');

    const verify = (await (await fetch(`${base}/api/recourse/ecosystem/skills/x/verify`)).json()) as any;
    expect(verify.valid).toBe(true);

    const revoke = await post('/api/recourse/ecosystem/skills/x/revoke', {});
    expect(revoke.status).toBe(200);
    const after = (await (await fetch(`${base}/api/recourse/ecosystem/skills`)).json()) as any;
    expect(after.count).toBe(0);
  });

  it('rejects an unauthenticated publish and validates a plugin manifest', async () => {
    const { post } = await setup();
    const denied = await post('/api/recourse/ecosystem/skills/publish', { id: 'y', name: 'Y', version: '1.0.0' }, false);
    expect(denied.status).toBe(401);

    const good = await post('/api/recourse/ecosystem/plugins/validate', {
      manifest: { id: 'bloom', name: 'Bloom', version: '1.0.0', capabilities: { net: { domains: ['example.com'], methods: ['GET'] } } },
    });
    const goodBody: any = await good.json();
    expect(goodBody.valid).toBe(true);
    expect(goodBody.signature.signed).toBe(false);

    const bad = await post('/api/recourse/ecosystem/plugins/validate', {
      manifest: { id: '9bad', name: '', version: 'x' },
    });
    const badBody: any = await bad.json();
    expect(badBody.valid).toBe(false);
    expect(badBody.errors.length).toBeGreaterThan(0);
  });

  it('registers a connector and probes health honestly', async () => {
    const { base, post, connectors } = await setup();
    const reg = await post('/api/recourse/ecosystem/connectors', { id: 'kg', name: 'KG', version: '1.0.0', kind: 'sidecar', baseUrl: 'http://127.0.0.1:8500' });
    expect(reg.status).toBe(200);

    // Healthy probe via the injected fetch (no global stub, so the test's own
    // HTTP calls to the router keep working).
    const up = await connectors.health('kg', { fetchImpl: (async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch });
    expect(up.ok).toBe(true);

    // The router list probes the real (unreachable) URL: honest ok:false.
    const list = (await (await fetch(`${base}/api/recourse/ecosystem/connectors`)).json()) as any;
    expect(list.count).toBe(1);
    expect(list.health[0].ok).toBe(false);
    expect(typeof list.health[0].error).toBe('string');
  });
});
