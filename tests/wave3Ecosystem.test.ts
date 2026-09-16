import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validatePluginManifest,
  signManifest,
  verifyManifestSignature,
  loadPluginManifest,
  type PluginManifest,
} from '../src/lib/pluginSdk';
import { ConnectorRegistry } from '../src/lib/connectors/registry';
import { signWebhookPayload, verifyWebhookSignature, deliverWebhook, CircuitBreaker } from '../src/lib/connectors/webhooks';

afterEach(() => vi.unstubAllGlobals());

const manifest: PluginManifest = {
  id: 'bloom-filter',
  name: 'Bloom Filter',
  version: '1.2.0',
  author: 'third-party',
  license: 'MIT',
  entry: 'src/index.ts',
  capabilities: { net: { domains: ['example.com'], methods: ['GET'] } },
};

describe('plugin SDK', () => {
  it('validates a well-formed manifest and rejects bad ones', () => {
    expect(validatePluginManifest(manifest)).toMatchObject({ ok: true });
    const bad = validatePluginManifest({ id: '9bad', name: '', version: 'x' });
    expect(bad.ok).toBe(false);
    if ('errors' in bad) expect(bad.errors.length).toBeGreaterThanOrEqual(2);
    // Capability grants are validated by the sandbox rules (wildcard host denied).
    const badCaps = validatePluginManifest({ ...manifest, capabilities: { net: { domains: ['*'], methods: ['GET'] } } });
    expect(badCaps.ok).toBe(false);
  });

  it('signs and verifies a manifest; tampering is detected', () => {
    const secret = 'plugin-secret';
    const signed = signManifest(manifest, secret);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(verifyManifestSignature(signed.manifest, secret).valid).toBe(true);

    const tampered = { ...signed.manifest, version: '9.9.9' };
    const check = verifyManifestSignature(tampered, secret);
    expect(check.signed).toBe(true);
    expect(check.valid).toBe(false);

    // No secret => cannot verify.
    expect(verifyManifestSignature(signed.manifest, null).valid).toBe(false);
  });

  it('loads a manifest and enforces signatures when required', () => {
    const secret = 's';
    const signed = signManifest(manifest, secret);
    if (!signed.ok) throw new Error('sign failed');
    const ok = loadPluginManifest(JSON.stringify(signed.manifest), { secret, requireSignature: true });
    expect(ok.ok).toBe(true);

    const unsigned = loadPluginManifest(JSON.stringify(manifest), { secret, requireSignature: true });
    expect(unsigned.ok).toBe(false);
    expect(unsigned.errors.join(' ')).toMatch(/unsigned/);
  });
});

describe('connector registry', () => {
  it('registers, rejects duplicates, and probes health', async () => {
    const reg = new ConnectorRegistry();
    reg.register({ id: 'sidecar-kg', name: 'KG', version: '1.0.0', kind: 'sidecar', baseUrl: 'http://127.0.0.1:8500' });
    expect(() => reg.register({ id: 'sidecar-kg', name: 'x', version: '1', kind: 'rest' })).toThrow(/already registered/);
    expect(reg.list().map((c) => c.id)).toEqual(['sidecar-kg']);

    vi.stubGlobal('fetch', async () => new Response('ok', { status: 200 }));
    const healthy = await reg.health('sidecar-kg');
    expect(healthy.ok).toBe(true);

    vi.stubGlobal('fetch', async () => { throw new Error('ECONNREFUSED'); });
    const down = await reg.health('sidecar-kg');
    expect(down.ok).toBe(false);
    expect(down.error).toMatch(/ECONNREFUSED/);
  });
});

describe('webhooks', () => {
  it('signs and verifies, rejecting tampering and stale timestamps', () => {
    const secret = 'wh-secret';
    const body = JSON.stringify({ event: 'push' });
    const ts = 1_700_000_000;
    const header = `t=${ts},v1=${signWebhookPayload(secret, body, ts)}`;
    expect(verifyWebhookSignature({ secret, body, signatureHeader: header, now: ts + 5 }).ok).toBe(true);
    expect(verifyWebhookSignature({ secret, body: '{"event":"hack"}', signatureHeader: header, now: ts + 5 }).ok).toBe(false);
    expect(verifyWebhookSignature({ secret, body, signatureHeader: header, now: ts + 10_000, toleranceSec: 300 }).ok).toBe(false);
  });

  it('delivers successfully and signs the request', async () => {
    let seen: any = null;
    const fetchImpl = (async (_url: string, init: any) => {
      seen = init;
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await deliverWebhook('http://target/hook', { a: 1 }, { secret: 's', fetchImpl, sleep: async () => {} });
    expect(res.ok).toBe(true);
    expect(seen.headers['x-recourse-signature']).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
  });

  it('retries then fails, and the circuit opens after repeated failures', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; throw new Error('boom'); }) as unknown as typeof fetch;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60_000, now: () => 0 });
    const res = await deliverWebhook('http://target/hook', {}, { fetchImpl, retries: 2, breaker, sleep: async () => {} });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(3);
    expect(calls).toBe(3);
    expect(breaker.allow()).toBe(false);

    // Next delivery is short-circuited by the open breaker.
    const blocked = await deliverWebhook('http://target/hook', {}, { fetchImpl, breaker, sleep: async () => {} });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/circuit open/);
  });
});
