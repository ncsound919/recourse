/**
 * client.ts — outbound HTTP transport to federation peers.
 *
 * Every call is an Ed25519-signed envelope POSTed to the peer's inbox, and the
 * peer's reply envelope is signature-verified against the public key on file
 * for that peer. Fail-soft: an unreachable peer returns `ok:false` with the
 * real transport error and `verified:false` — this layer never fabricates a
 * peer response.
 */
import { createEnvelope, verifyEnvelope, type FederationEnvelope, type EnvelopeType } from './envelope.js';
import { publicIdentity, type InstanceIdentity } from './identity.js';
import type { Peer } from './peers.js';

export type FetchLike = typeof fetch;

export function inboxPath(): string {
  return process.env.RECOURSE_FEDERATION_INBOX_PATH || '/api/recourse/federation/inbox';
}

export interface PeerCallOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  path?: string;
}

export interface PeerCallResult {
  ok: boolean;
  status: number;
  envelope?: FederationEnvelope;
  payload?: Record<string, unknown>;
  error?: string;
  /** True when the peer's reply envelope verified against its registered key. */
  verified: boolean;
}

export async function callPeer(
  peer: Peer,
  identity: InstanceIdentity,
  type: EnvelopeType,
  payload: Record<string, unknown> = {},
  opts: PeerCallOptions = {},
): Promise<PeerCallResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? Number(process.env.RECOURSE_FEDERATION_TIMEOUT_MS || 8000);
  const url = `${peer.url}${opts.path ?? inboxPath()}`;
  const envelope = createEnvelope(identity, type, payload, { to: peer.instanceId });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelope }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: body?.error || `peer HTTP ${res.status}`, verified: false };
    }
    const reply = body?.envelope as FederationEnvelope | undefined;
    if (!reply) return { ok: true, status: res.status, payload: body?.payload ?? {}, verified: false };
    const verification = verifyEnvelope(reply, peer.publicKey, { expectedFrom: peer.instanceId, expectedTo: identity.instanceId });
    if (!verification.ok) {
      return { ok: false, status: res.status, error: `peer reply failed verification: ${verification.reason}`, verified: false };
    }
    return { ok: true, status: res.status, envelope: reply, payload: reply.payload, verified: true };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      error: aborted ? `peer timed out after ${timeoutMs}ms` : err?.message || 'peer request failed',
      verified: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function pingPeer(peer: Peer, identity: InstanceIdentity, opts: PeerCallOptions = {}): Promise<PeerCallResult> {
  return callPeer(peer, identity, 'ping', {}, opts);
}

export function handshakePeer(peer: Peer, identity: InstanceIdentity, opts: PeerCallOptions = {}): Promise<PeerCallResult> {
  return callPeer(peer, identity, 'handshake', {
    identity: publicIdentity(identity),
    capabilities: ['registry', 'memory', 'skill'],
  }, opts);
}

export function requestPull(
  peer: Peer,
  identity: InstanceIdentity,
  kind: 'registry' | 'memory' | 'skill',
  ids: string[] = [],
  opts: PeerCallOptions = {},
): Promise<PeerCallResult> {
  return callPeer(peer, identity, 'pull_request', { kind, ids }, opts);
}
