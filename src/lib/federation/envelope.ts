/**
 * envelope.ts — the signed message envelope every federation exchange rides in.
 *
 * A peer can only trust a message if it proves possession of the private key
 * behind the claimed instance id. `createEnvelope` signs the canonical form of
 * the envelope (minus `sig`); `verifyEnvelope` re-derives the signer's id from
 * the presented public key, checks the signature constant-time, and enforces a
 * timestamp freshness window (replay defense). A bounded nonce cache rejects a
 * replayed envelope even inside the window.
 *
 * Honesty: an unverifiable envelope is rejected explicitly, never "trusted
 * anyway". There is no unsigned mode.
 */
import crypto from 'node:crypto';
import { canonicalize } from './canonical.js';
import { instanceIdFromPublicKey, signMessage, verifyMessage, type InstanceIdentity } from './identity.js';

export const ENVELOPE_VERSION = 1 as const;
export const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

export type EnvelopeType =
  | 'ping'
  | 'handshake'
  | 'push'
  | 'pull_request'
  | 'pull_response'
  | 'ack'
  | 'error';

export interface FederationEnvelope {
  v: typeof ENVELOPE_VERSION;
  from: string;
  to?: string;
  type: EnvelopeType;
  sentAt: number;
  nonce: string;
  payload: Record<string, unknown>;
  sig: string;
}

export type UnsignedEnvelope = Omit<FederationEnvelope, 'sig'>;

const TYPES = new Set<EnvelopeType>(['ping', 'handshake', 'push', 'pull_request', 'pull_response', 'ack', 'error']);

export function signingPayload(envelope: UnsignedEnvelope): string {
  return canonicalize(envelope);
}

export interface CreateEnvelopeOptions {
  to?: string;
  nonce?: string;
  sentAt?: number;
}

export function createEnvelope(
  identity: Pick<InstanceIdentity, 'instanceId' | 'privateKey'>,
  type: EnvelopeType,
  payload: Record<string, unknown> = {},
  opts: CreateEnvelopeOptions = {},
): FederationEnvelope {
  const unsigned: UnsignedEnvelope = {
    v: ENVELOPE_VERSION,
    from: identity.instanceId,
    to: opts.to,
    type,
    sentAt: opts.sentAt ?? Date.now(),
    nonce: opts.nonce ?? crypto.randomBytes(12).toString('hex'),
    payload,
  };
  return { ...unsigned, sig: signMessage(identity, signingPayload(unsigned)) };
}

export interface VerifyOptions {
  now?: number;
  maxSkewMs?: number;
  /** When set, an envelope addressed to a different instance is rejected. */
  expectedTo?: string;
  /** Reject when this instance id is not the envelope's `from`. */
  expectedFrom?: string;
}

export type VerifyFailure =
  | 'malformed'
  | 'wrong_sender'
  | 'wrong_recipient'
  | 'bad_signature'
  | 'stale';

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyFailure;
}

function isEnvelopeShape(x: unknown): x is FederationEnvelope {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    e.v === ENVELOPE_VERSION &&
    typeof e.from === 'string' &&
    typeof e.type === 'string' &&
    TYPES.has(e.type as EnvelopeType) &&
    typeof e.sentAt === 'number' &&
    typeof e.nonce === 'string' &&
    typeof e.sig === 'string' &&
    typeof e.payload === 'object' &&
    e.payload !== null
  );
}

/** Verify structure, sender-key binding, signature and freshness. */
export function verifyEnvelope(
  envelope: unknown,
  publicKeyB64: string,
  opts: VerifyOptions = {},
): VerifyResult {
  if (!isEnvelopeShape(envelope)) return { ok: false, reason: 'malformed' };
  const keyId = instanceIdFromPublicKey(publicKeyB64);
  if (envelope.from !== keyId) return { ok: false, reason: 'wrong_sender' };
  if (opts.expectedFrom && envelope.from !== opts.expectedFrom) return { ok: false, reason: 'wrong_sender' };
  if (opts.expectedTo && envelope.to && envelope.to !== opts.expectedTo) return { ok: false, reason: 'wrong_recipient' };

  const { sig, ...unsigned } = envelope;
  if (!verifyMessage(publicKeyB64, signingPayload(unsigned), sig)) {
    return { ok: false, reason: 'bad_signature' };
  }

  const now = opts.now ?? Date.now();
  const maxSkew = opts.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  if (Math.abs(now - envelope.sentAt) > maxSkew) return { ok: false, reason: 'stale' };

  return { ok: true };
}

/**
 * Bounded in-memory nonce cache. Rejects a nonce seen within the freshness
 * window; evicts the oldest entries once full. Not durable by design — a
 * restart forgets nonces, but the freshness window still bounds replay.
 */
export class NonceCache {
  private seen = new Map<string, number>();
  constructor(
    private capacity = 10_000,
    private ttlMs = DEFAULT_MAX_SKEW_MS,
  ) {}

  /** Returns true when the nonce is new (and records it); false on replay. */
  accept(nonce: string, now = Date.now()): boolean {
    for (const [k, at] of this.seen) {
      if (now - at > this.ttlMs) this.seen.delete(k);
      else break;
    }
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    while (this.seen.size > this.capacity) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return true;
  }

  size(): number {
    return this.seen.size;
  }
}
