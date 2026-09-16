/**
 * connectors/webhooks.ts — signed inbound/outbound webhooks with retry and a
 * circuit breaker. Before this, `grep webhook` across the repo returned nothing.
 *
 * Outbound delivery signs the payload (`t=<unix>,v1=<hmac>`) over
 * `${timestamp}.${body}` — the same scheme inbound verification checks. Retries
 * use exponential backoff; a per-target circuit breaker stops hammering a dead
 * endpoint.
 */
import crypto from 'node:crypto';
import type { WebhookDeliveryResult } from './types';

/** Sign `timestamp.body` with HMAC-SHA256. */
export function signWebhookPayload(secret: string, body: string, timestamp: number): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export interface VerifyInput {
  secret: string;
  body: string;
  /** Header value, `t=<unix>,v1=<hex>` (or a bare hex signature). */
  signatureHeader: string;
  /** Max allowed age in seconds (replay protection). Default 300. */
  toleranceSec?: number;
  now?: number;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyWebhookSignature(input: VerifyInput): { ok: boolean; reason?: string } {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSec ?? 300;
  const header = String(input.signatureHeader ?? '');
  let ts: number | null = null;
  let sig = header;
  const m = /t=(\d+)\s*,\s*v1=([0-9a-fA-F]+)/.exec(header);
  if (m) {
    ts = Number(m[1]);
    sig = m[2];
  }
  if (ts !== null && Math.abs(now - ts) > tolerance) {
    return { ok: false, reason: `signature timestamp outside ${tolerance}s tolerance` };
  }
  const expected = crypto.createHmac('sha256', input.secret).update(`${ts ?? now}.${input.body}`).digest('hex');
  if (!timingSafeEqualHex(expected, sig)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = Math.max(1, opts.failureThreshold ?? 5);
    this.cooldownMs = Math.max(0, opts.cooldownMs ?? 30_000);
    this.now = opts.now ?? (() => Date.now());
  }

  allow(): boolean {
    if (this.failures < this.threshold) return true;
    return this.now() - this.openedAt >= this.cooldownMs;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  state(): { open: boolean; failures: number } {
    return { open: this.failures >= this.threshold && this.now() - this.openedAt < this.cooldownMs, failures: this.failures };
  }
}

export interface DeliverOptions {
  secret?: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
  breaker?: CircuitBreaker;
  now?: () => number;
  /** Injectable sleep so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Deliver a JSON webhook with signing, retry, and (optional) circuit breaking.
 * Returns the outcome honestly — a non-2xx after all retries is `ok:false`.
 */
export async function deliverWebhook(
  url: string,
  payload: unknown,
  opts: DeliverOptions = {},
): Promise<WebhookDeliveryResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const retries = Math.max(0, opts.retries ?? 3);
  const backoffMs = Math.max(0, opts.backoffMs ?? 250);
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const body = JSON.stringify(payload ?? {});

  if (opts.breaker && !opts.breaker.allow()) {
    return { ok: false, status: 0, attempts: 0, error: 'circuit open (target recently failing)' };
  }

  let lastError: string | undefined;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.secret) {
        const ts = Math.floor(now() / 1000);
        headers['x-recourse-signature'] = `t=${ts},v1=${signWebhookPayload(opts.secret, body, ts)}`;
      }
      const res = await doFetch(url, { method: 'POST', headers, body, signal: controller.signal });
      lastStatus = res.status;
      const text = await res.text().catch(() => '');
      if (res.ok) {
        opts.breaker?.recordSuccess();
        return { ok: true, status: res.status, attempts: attempt, body: text.slice(0, 200) };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error && err.name === 'AbortError' ? 'timed out' : err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
    if (attempt <= retries) await sleep(backoffMs * Math.pow(2, attempt - 1));
  }

  opts.breaker?.recordFailure();
  return { ok: false, status: lastStatus, attempts: retries + 1, error: lastError };
}
