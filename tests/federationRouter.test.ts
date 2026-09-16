import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Request, Response } from 'express';
import {
  createEnvelope,
  generateIdentity,
  makeSyncItem,
  buildBundle,
  verifyEnvelope,
  openPeerStore,
  type SyncItem,
} from '../src/lib/federation/index';
import { createFederationRouter } from '../src/routes/federation';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-fedrouter-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function setup() {
  const me = generateIdentity('me');
  const remote = generateIdentity('remote');
  const peers = openPeerStore(path.join(freshDir(), 'peers.json'));
  const exportItems = vi.fn((kind: string): SyncItem[] => (kind === 'registry' ? [makeSyncItem('registry', 'r1', { v: 1 }, 1)] : []));
  const importItems = vi.fn(() => 1);
  const guard = (req: Request, res: Response) => {
    if (req.headers['x-secret'] === 's') return true;
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  };
  const router = createFederationRouter({ identity: me, peers, requireMutationAuth: guard, exportItems, importItems });
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/federation', router);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base, me, remote, peers, exportItems, importItems };
}

const postInbox = (base: string, envelope: unknown) =>
  fetch(`${base}/api/recourse/federation/inbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envelope }),
  });

describe('federation router', () => {
  it('serves identity and guards peer writes', async () => {
    const { base, me } = await setup();
    const identity = await (await fetch(`${base}/api/recourse/federation/identity`)).json();
    expect(identity.identity.instanceId).toBe(me.instanceId);
    expect(identity.identity).not.toHaveProperty('privateKey');

    expect((await fetch(`${base}/api/recourse/federation/peers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
  });

  it('adds a peer and pings it', async () => {
    const { base, remote, peers } = await setup();
    const added = await fetch(`${base}/api/recourse/federation/peers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': 's' },
      body: JSON.stringify({ url: 'http://remote.test', publicKey: remote.publicKey, name: 'Remote', trust: 'trusted' }),
    });
    expect(added.status).toBe(201);
    expect(peers.trusted()).toHaveLength(1);
    const ping = await fetch(`${base}/api/recourse/federation/peers/${remote.instanceId}/ping`, { method: 'POST', headers: { 'x-secret': 's' } });
    // No network at remote.test -> honest failure (not a claimed success).
    expect(ping.status).toBe(200);
    expect((await ping.json()).success).toBe(false);
  });

  it('rejects an unknown sender on the inbox', async () => {
    const { base, remote } = await setup();
    const env = createEnvelope(remote, 'ping', {});
    expect((await postInbox(base, env)).status).toBe(403);
  });

  it('answers a signed ping with a signed ack', async () => {
    const { base, me, remote, peers } = await setup();
    peers.add({ url: 'http://remote.test', publicKey: remote.publicKey, trust: 'pending' });
    const env = createEnvelope(remote, 'ping', {}, { to: me.instanceId });
    const res = await postInbox(base, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(verifyEnvelope(body.envelope, me.publicKey, { expectedTo: remote.instanceId }).ok).toBe(true);
    expect(body.envelope.payload.pong).toBe(true);
  });

  it('serves a pull bundle to a trusted peer and applies a pushed bundle', async () => {
    const { base, me, remote, peers, exportItems, importItems } = await setup();
    peers.add({ url: 'http://remote.test', publicKey: remote.publicKey, trust: 'trusted' });

    const pull = createEnvelope(remote, 'pull_request', { kind: 'registry', ids: [] }, { to: me.instanceId });
    const pullRes = await postInbox(base, pull);
    const pullBody = await pullRes.json();
    expect(pullBody.envelope.payload.bundle.items[0].id).toBe('r1');
    expect(exportItems).toHaveBeenCalledWith('registry');

    const bundle = buildBundle('registry', [makeSyncItem('registry', 'remote-1', { v: 2 }, 5)], remote.instanceId);
    const push = createEnvelope(remote, 'push', { bundle }, { to: me.instanceId });
    const pushRes = await postInbox(base, push);
    expect(pushRes.status).toBe(200);
    expect(importItems).toHaveBeenCalledWith('registry', expect.any(Array));
  });
});
