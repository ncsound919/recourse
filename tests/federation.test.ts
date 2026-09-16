import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalize,
  sha256Hex,
  generateIdentity,
  fingerprintOf,
  instanceIdFromPublicKey,
  signMessage,
  verifyMessage,
  loadOrCreateIdentity,
  publicIdentity,
  createEnvelope,
  verifyEnvelope,
  NonceCache,
  openPeerStore,
  makeSyncItem,
  buildBundle,
  validateBundle,
  planSync,
  applyBundle,
  selectItems,
  contentHashOf,
} from '../src/lib/federation/index';
import { callPeer, pingPeer } from '../src/lib/federation/client';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-fed-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('canonical json', () => {
  it('is stable across key order and drops undefined', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalize([{ z: 1, a: 2 }])).toBe('[{"a":2,"z":1}]');
    expect(sha256Hex('abc')).toHaveLength(64);
  });
});

describe('instance identity', () => {
  it('derives the id from the key and signs/verifies messages', () => {
    const id = generateIdentity('node-a');
    expect(id.instanceId).toBe(instanceIdFromPublicKey(id.publicKey));
    expect(id.instanceId.startsWith('inst_')).toBe(true);
    expect(fingerprintOf(id.publicKey)).toHaveLength(32);

    const sig = signMessage(id, 'hello');
    expect(verifyMessage(id.publicKey, 'hello', sig)).toBe(true);
    expect(verifyMessage(id.publicKey, 'hello!', sig)).toBe(false);
    const other = generateIdentity('node-b');
    expect(verifyMessage(other.publicKey, 'hello', sig)).toBe(false);
    expect(verifyMessage('not-base64!!', 'hello', sig)).toBe(false);
  });

  it('exposes only public material and persists across loads', () => {
    const file = path.join(freshDir(), 'identity.json');
    const created = loadOrCreateIdentity(file, 'node');
    const loaded = loadOrCreateIdentity(file, 'other');
    expect(loaded.instanceId).toBe(created.instanceId);
    expect(loaded.privateKey).toBe(created.privateKey);
    expect(publicIdentity(created)).not.toHaveProperty('privateKey');
  });

  it('repairs a tampered id to match the key', () => {
    const file = path.join(freshDir(), 'identity.json');
    const id = generateIdentity('node');
    fs.writeFileSync(file, JSON.stringify({ ...id, instanceId: 'inst_forged' }), 'utf-8');
    expect(loadOrCreateIdentity(file).instanceId).toBe(id.instanceId);
  });
});

describe('signed envelopes', () => {
  const alice = generateIdentity('alice');
  const bob = generateIdentity('bob');

  it('verifies a well-formed envelope', () => {
    const env = createEnvelope(alice, 'ping', {}, { to: bob.instanceId });
    expect(verifyEnvelope(env, alice.publicKey, { expectedFrom: alice.instanceId, expectedTo: bob.instanceId }).ok).toBe(true);
  });

  it('rejects tampering, wrong key, wrong recipient and stale envelopes', () => {
    const env = createEnvelope(alice, 'ping', { x: 1 }, { to: bob.instanceId });
    const tampered = { ...env, payload: { x: 2 } };
    expect(verifyEnvelope(tampered, alice.publicKey).reason).toBe('bad_signature');
    expect(verifyEnvelope(env, bob.publicKey).reason).toBe('wrong_sender');
    expect(verifyEnvelope(env, alice.publicKey, { expectedTo: 'inst_other' }).reason).toBe('wrong_recipient');
    expect(verifyEnvelope(env, alice.publicKey, { now: Date.now() + 10 * 60 * 1000 }).reason).toBe('stale');
    expect(verifyEnvelope({ nope: true }, alice.publicKey).reason).toBe('malformed');
  });

  it('a nonce cache rejects replays', () => {
    const cache = new NonceCache(2, 1000);
    expect(cache.accept('n1', 1000)).toBe(true);
    expect(cache.accept('n1', 1001)).toBe(false);
    expect(cache.accept('n2', 1001)).toBe(true);
    expect(cache.accept('n3', 1001)).toBe(true); // evicts oldest
    expect(cache.size()).toBe(2);
    expect(cache.accept('n1', 5000)).toBe(true); // expired after ttl
  });
});

describe('peer store', () => {
  it('adds a peer as pending and derives its id from the key', () => {
    const store = openPeerStore(path.join(freshDir(), 'peers.json'));
    const remote = generateIdentity('remote');
    const peer = store.add({ url: 'http://127.0.0.1:9999/', publicKey: remote.publicKey, name: 'Remote' });
    expect(peer.instanceId).toBe(remote.instanceId);
    expect(peer.url).toBe('http://127.0.0.1:9999');
    expect(peer.trust).toBe('pending');
    expect(store.trusted()).toHaveLength(0);

    store.setTrust(peer.instanceId, 'trusted');
    expect(store.trusted()).toHaveLength(1);
    store.touch(peer.instanceId, 123);
    expect(store.get(peer.instanceId)!.lastSeenAt).toBe(123);
    store.setStatus(peer.instanceId, 'offline', 'boom');
    expect(store.get(peer.instanceId)!.lastError).toBe('boom');
    expect(store.remove(peer.instanceId)).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it('rejects a bad url or key', () => {
    const store = openPeerStore(path.join(freshDir(), 'peers.json'));
    expect(() => store.add({ url: 'ftp://x', publicKey: 'a' })).toThrow(/http/);
    expect(() => store.add({ url: 'http://x', publicKey: '' })).toThrow(/publicKey/);
  });
});

describe('sync planning', () => {
  const item = (id: string, payload: unknown, updatedAt: number) => ({ ...makeSyncItem('registry', id, payload, updatedAt) });

  it('validates bundles and content hashes', () => {
    const a = makeSyncItem('registry', 'a', { v: 1 }, 1);
    expect(a.contentHash).toBe(contentHashOf({ v: 1 }));
    const bundle = buildBundle('registry', [a], 'inst_x', 10);
    expect(validateBundle(bundle).ok).toBe(true);

    expect(validateBundle(null).ok).toBe(false);
    expect(validateBundle({ source: 's', kind: 'nope', items: [] }).ok).toBe(false);
    expect(validateBundle({ source: 's', kind: 'registry', items: [{ id: 'a', kind: 'registry', contentHash: 'bad', updatedAt: 1, payload: {} }] }).reason).toMatch(/hash mismatch/);
    const mismatched = buildBundle('registry', [{ ...a, kind: 'memory' }], 's', 1);
    expect(validateBundle(mismatched).reason).toMatch(/kind mismatch/);
  });

  it('plans pulls/pushes and merges newer-wins', () => {
    const local = [item('same', { v: 1 }, 1), item('local-newer', { v: 2 }, 5), item('tie', { v: 1 }, 3)];
    const remote = [item('same', { v: 1 }, 1), item('remote-newer', { v: 9 }, 9), item('tie', { v: 2 }, 3)];
    const plan = planSync(local, remote);
    expect(plan.unchanged).toContain('same');
    expect(plan.toPull).toEqual(['remote-newer']);
    expect(plan.toPush).toEqual(['local-newer']);
    expect(plan.conflicts).toEqual(['tie']);

    const merged = applyBundle(local, buildBundle('registry', remote, 'inst_r', 10));
    const byId = Object.fromEntries(merged.merged.map((i) => [i.id, i]));
    expect(byId['remote-newer'].updatedAt).toBe(9);
    expect(byId['tie'].payload).toEqual({ v: 1 }); // a true tie keeps the local copy
    expect(selectItems(buildBundle('registry', remote, 's', 1), ['remote-newer'])).toHaveLength(1);
  });
});

describe('federation client', () => {
  it('verifies a signed peer reply', async () => {
    const me = generateIdentity('me');
    const peerId = generateIdentity('peer');
    const fakeFetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        envelope: createEnvelope(peerId, 'ack', { pong: true }, { to: me.instanceId }),
      }),
    })) as unknown as typeof fetch;
    const peer = { instanceId: peerId.instanceId, name: 'peer', url: 'http://peer', publicKey: peerId.publicKey, trust: 'trusted' as const, status: 'unknown' as const, addedAt: 0 };
    const result = await pingPeer(peer, me, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.payload).toEqual({ pong: true });
  });

  it('rejects an unsigned/tampered reply and reports transport failure', async () => {
    const me = generateIdentity('me');
    const peerId = generateIdentity('peer');
    const peer = { instanceId: peerId.instanceId, name: 'peer', url: 'http://peer', publicKey: peerId.publicKey, trust: 'trusted' as const, status: 'unknown' as const, addedAt: 0 };
    const badReply = (async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ envelope: { from: peerId.instanceId, type: 'ack', v: 1 } }) })) as unknown as typeof fetch;
    expect((await pingPeer(peer, me, { fetchImpl: badReply })).verified).toBe(false);

    const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const r = await callPeer(peer, me, 'ping', {}, { fetchImpl: down });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });
});
