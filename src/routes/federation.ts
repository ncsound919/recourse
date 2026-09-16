/**
 * federation.ts — the peer-to-peer router. It exposes this instance's identity,
 * manages the peer registry, answers signed inbound envelopes, and drives
 * outbound ping/handshake/pull/push against trusted peers.
 *
 * Auth model (two layers):
 *   - Operator writes (add/trust/remove/ping/pull/push) go behind the shared
 *     mutation secret like every other operator route.
 *   - Peer-to-peer `/inbox` is authenticated by the envelope SIGNATURE plus the
 *     peer registry: an unknown or blocked sender is refused, and only a
 *     trusted peer may push or request non-public data. `ping`/`handshake` are
 *     permitted from a pending peer so trust can be established.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  NonceCache,
  createEnvelope,
  verifyEnvelope,
  type EnvelopeType,
  type FederationEnvelope,
  type InstanceIdentity,
  type PeerStore,
  type SyncBundle,
  type SyncItem,
  type SyncKind,
  buildBundle,
  makeSyncItem,
  selectItems,
  validateBundle,
  type FetchLike,
} from '../lib/federation/index.js';
import { callPeer, pingPeer, handshakePeer, requestPull } from '../lib/federation/client.js';
import { publicIdentity } from '../lib/federation/identity.js';

export interface FederationDeps {
  identity: InstanceIdentity;
  peers: PeerStore;
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Local items for a sync kind (default: none). */
  exportItems?: (kind: SyncKind) => SyncItem[];
  /** Merge received items; returns the number applied (default: no-op 0). */
  importItems?: (kind: SyncKind, items: SyncItem[]) => number;
  fetchImpl?: FetchLike;
  /** Inject a nonce cache (tests). */
  nonceCache?: NonceCache;
}

function reply(
  identity: InstanceIdentity,
  type: EnvelopeType,
  to: string,
  payload: Record<string, unknown>,
): FederationEnvelope {
  return createEnvelope(identity, type, payload, { to });
}

export function createFederationRouter(deps: FederationDeps): Router {
  const router = Router();
  const nonces = deps.nonceCache ?? new NonceCache();
  const exportItems = deps.exportItems ?? (() => []);
  const importItems = deps.importItems ?? (() => 0);

  router.get('/status', (_req, res) => {
    const peers = deps.peers.list();
    res.json({
      success: true,
      identity: publicIdentity(deps.identity),
      peers: {
        total: peers.length,
        trusted: peers.filter((p) => p.trust === 'trusted').length,
        pending: peers.filter((p) => p.trust === 'pending').length,
        blocked: peers.filter((p) => p.trust === 'blocked').length,
      },
    });
  });

  router.get('/identity', (_req, res) => {
    res.json({ success: true, identity: publicIdentity(deps.identity) });
  });

  router.get('/peers', (_req, res) => {
    res.json({ success: true, peers: deps.peers.list() });
  });

  router.post('/peers', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const body = req.body ?? {};
      const peer = deps.peers.add({
        url: String(body.url ?? ''),
        publicKey: String(body.publicKey ?? ''),
        name: body.name ? String(body.name) : undefined,
        trust: body.trust === 'trusted' || body.trust === 'blocked' ? body.trust : undefined,
      });
      res.status(201).json({ success: true, peer });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.delete('/peers/:id', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({ success: true, removed: deps.peers.remove(req.params.id) });
  });

  router.post('/peers/:id/trust', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const trust = req.body?.trust;
    if (trust !== 'trusted' && trust !== 'pending' && trust !== 'blocked') {
      res.status(400).json({ success: false, error: 'trust must be trusted|pending|blocked' });
      return;
    }
    const peer = deps.peers.setTrust(req.params.id, trust);
    if (!peer) {
      res.status(404).json({ success: false, error: 'peer not found' });
      return;
    }
    res.json({ success: true, peer });
  });

  router.post('/peers/:id/ping', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const peer = deps.peers.get(req.params.id);
    if (!peer) {
      res.status(404).json({ success: false, error: 'peer not found' });
      return;
    }
    const result = await pingPeer(peer, deps.identity, { fetchImpl: deps.fetchImpl });
    if (result.ok) deps.peers.touch(peer.instanceId);
    else deps.peers.setStatus(peer.instanceId, 'offline', result.error);
    res.json({ success: result.ok, verified: result.verified, error: result.error, peer: deps.peers.get(peer.instanceId) });
  });

  router.post('/peers/:id/handshake', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const peer = deps.peers.get(req.params.id);
    if (!peer) {
      res.status(404).json({ success: false, error: 'peer not found' });
      return;
    }
    const result = await handshakePeer(peer, deps.identity, { fetchImpl: deps.fetchImpl });
    if (result.ok) deps.peers.touch(peer.instanceId);
    else deps.peers.setStatus(peer.instanceId, 'offline', result.error);
    res.json({ success: result.ok, verified: result.verified, error: result.error, remote: result.payload });
  });

  router.post('/peers/:id/pull', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const peer = deps.peers.get(req.params.id);
    if (!peer) {
      res.status(404).json({ success: false, error: 'peer not found' });
      return;
    }
    if (peer.trust !== 'trusted') {
      res.status(403).json({ success: false, error: 'peer must be trusted to pull' });
      return;
    }
    const kind = req.body?.kind as SyncKind;
    if (!['registry', 'memory', 'skill'].includes(kind)) {
      res.status(400).json({ success: false, error: 'kind must be registry|memory|skill' });
      return;
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const result = await requestPull(peer, deps.identity, kind, ids, { fetchImpl: deps.fetchImpl });
    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error, verified: result.verified });
      return;
    }
    const bundle = (result.payload as any)?.bundle;
    const validation = validateBundle(bundle);
    if (!validation.ok) {
      res.status(400).json({ success: false, error: `peer bundle rejected: ${validation.reason}` });
      return;
    }
    const items = ids.length ? selectItems(bundle, ids) : bundle.items;
    const applied = importItems(kind, items);
    deps.peers.touch(peer.instanceId);
    res.json({ success: true, verified: result.verified, received: items.length, applied });
  });

  router.post('/peers/:id/push', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const peer = deps.peers.get(req.params.id);
    if (!peer) {
      res.status(404).json({ success: false, error: 'peer not found' });
      return;
    }
    if (peer.trust !== 'trusted') {
      res.status(403).json({ success: false, error: 'peer must be trusted to push' });
      return;
    }
    const kind = req.body?.kind as SyncKind;
    if (!['registry', 'memory', 'skill'].includes(kind)) {
      res.status(400).json({ success: false, error: 'kind must be registry|memory|skill' });
      return;
    }
    const items = exportItems(kind);
    const bundle = buildBundle(kind, items, deps.identity.instanceId);
    const result = await callPeer(peer, deps.identity, 'push', { bundle }, { fetchImpl: deps.fetchImpl });
    if (result.ok) deps.peers.touch(peer.instanceId);
    else deps.peers.setStatus(peer.instanceId, 'offline', result.error);
    res.json({ success: result.ok, verified: result.verified, sent: items.length, error: result.error });
  });

  // --- Peer-to-peer inbox (signature-authenticated) ------------------------
  router.post('/inbox', (req, res) => {
    const envelope = req.body?.envelope as FederationEnvelope | undefined;
    if (!envelope || typeof envelope !== 'object' || typeof (envelope as any).from !== 'string') {
      res.status(400).json({ success: false, error: 'missing envelope' });
      return;
    }
    const peer = deps.peers.get(envelope.from);
    if (!peer) {
      res.status(403).json({ success: false, error: 'unknown peer' });
      return;
    }
    const verification = verifyEnvelope(envelope, peer.publicKey, {
      expectedFrom: peer.instanceId,
      expectedTo: deps.identity.instanceId,
    });
    if (!verification.ok) {
      res.status(401).json({ success: false, error: `envelope rejected: ${verification.reason}` });
      return;
    }
    if (!nonces.accept(envelope.nonce)) {
      res.status(409).json({ success: false, error: 'replayed envelope' });
      return;
    }
    if (peer.trust === 'blocked') {
      res.status(403).json({ success: false, error: 'peer blocked' });
      return;
    }
    deps.peers.touch(peer.instanceId);

    const respond = (type: EnvelopeType, payload: Record<string, unknown>) => {
      res.json({ success: true, envelope: reply(deps.identity, type, peer.instanceId, payload) });
    };

    try {
      switch (envelope.type) {
        case 'ping':
          respond('ack', { pong: true });
          return;
        case 'handshake': {
          respond('ack', { identity: publicIdentity(deps.identity), capabilities: ['registry', 'memory', 'skill'] });
          return;
        }
        case 'pull_request': {
          if (peer.trust !== 'trusted') {
            respond('error', { error: 'peer not trusted' });
            return;
          }
          const kind = envelope.payload.kind as SyncKind;
          if (!['registry', 'memory', 'skill'].includes(kind)) {
            respond('error', { error: 'invalid kind' });
            return;
          }
          const ids = Array.isArray(envelope.payload.ids) ? (envelope.payload.ids as unknown[]).map(String) : [];
          const all = exportItems(kind);
          const items = ids.length ? all.filter((i) => ids.includes(i.id)) : all;
          respond('pull_response', { bundle: buildBundle(kind, items, deps.identity.instanceId) });
          return;
        }
        case 'push': {
          if (peer.trust !== 'trusted') {
            respond('error', { error: 'peer not trusted' });
            return;
          }
          const bundle = envelope.payload.bundle;
          const validation = validateBundle(bundle);
          if (!validation.ok) {
            respond('error', { error: `bundle rejected: ${validation.reason}` });
            return;
          }
          const safeBundle = bundle as SyncBundle;
          const applied = importItems(safeBundle.kind, safeBundle.items);
          respond('ack', { applied });
          return;
        }
        default:
          respond('error', { error: `unsupported envelope type: ${envelope.type}` });
      }
    } catch (e: any) {
      respond('error', { error: e?.message || 'inbox handler failed' });
    }
  });

  return router;
}

/** Convenience: build a sync item from a payload (re-exported for callers). */
export { makeSyncItem };
