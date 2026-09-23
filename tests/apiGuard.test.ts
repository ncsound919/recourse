import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  apiGuardDecision,
  createApiGuard,
  isLocalHostname,
  isLocalOrigin,
  isLoopbackAddress,
  resolveListenHost,
} from '../src/lib/apiGuard';

function req(over: Partial<{ method: string; path: string; headers: Record<string, string>; ip: string }> = {}) {
  return {
    method: over.method ?? 'POST',
    path: over.path ?? '/api/recourse/execute',
    headers: { host: 'localhost:3000', ...over.headers } as any,
    socket: { remoteAddress: over.ip ?? '127.0.0.1' },
  };
}
const base = { secretValid: false, secretConfigured: true };

describe('apiGuard helpers', () => {
  it('classifies loopback peers, local hosts and origins', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.5')).toBe(false);
    expect(isLocalHostname('localhost:3000')).toBe(true);
    expect(isLocalHostname('[::1]:3000')).toBe(true);
    expect(isLocalHostname('evil.example:3000')).toBe(false);
    expect(isLocalHostname('recourse.lan', ['recourse.lan'])).toBe(true);
    expect(isLocalOrigin(undefined)).toBe(true);
    expect(isLocalOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalOrigin('https://evil.example')).toBe(false);
    expect(isLocalOrigin('null')).toBe(false);
  });

  it('binds to loopback unless RECOURSE_HOST says otherwise', () => {
    expect(resolveListenHost({} as any)).toBe('127.0.0.1');
    expect(resolveListenHost({ RECOURSE_HOST: '0.0.0.0' } as any)).toBe('0.0.0.0');
  });
});

describe('apiGuardDecision', () => {
  it('lets the local UI mutate without the secret', () => {
    expect(apiGuardDecision(req({ headers: { origin: 'http://localhost:3000' } }), base)).toMatchObject({ allow: true, reason: 'local' });
  });

  it('refuses LAN callers without the secret (401 when configured, 403 when not)', () => {
    expect(apiGuardDecision(req({ ip: '192.168.1.20' }), base)).toMatchObject({ allow: false, status: 401 });
    expect(apiGuardDecision(req({ ip: '192.168.1.20' }), { ...base, secretConfigured: false })).toMatchObject({ allow: false, status: 403 });
  });

  it('accepts any caller presenting the secret', () => {
    expect(apiGuardDecision(req({ ip: '10.0.0.9' }), { ...base, secretValid: true })).toMatchObject({ allow: true, reason: 'secret' });
  });

  it('blocks cross-site browser requests from a local peer (CSRF)', () => {
    expect(apiGuardDecision(req({ headers: { origin: 'https://evil.example' } }), base).allow).toBe(false);
    expect(apiGuardDecision(req({ headers: { 'sec-fetch-site': 'cross-site' } }), base).allow).toBe(false);
  });

  it('blocks DNS rebinding (loopback peer, foreign Host) even for reads', () => {
    expect(apiGuardDecision(req({ method: 'GET', headers: { host: 'rebind.evil:3000' } }), base).allow).toBe(false);
    expect(apiGuardDecision(req({ headers: { host: 'rebind.evil:3000' } }), base).allow).toBe(false);
  });

  it('leaves reads, non-/api paths and self-authenticating routes alone', () => {
    expect(apiGuardDecision(req({ method: 'GET', ip: '192.168.1.20' }), base).allow).toBe(true);
    expect(apiGuardDecision(req({ path: '/v1/chat/completions', ip: '192.168.1.20' }), base).allow).toBe(true);
    expect(apiGuardDecision(req({ path: '/api/mcp', ip: '192.168.1.20' }), base).allow).toBe(true);
    expect(apiGuardDecision(req({ path: '/api/recourse/federation/inbox', ip: '192.168.1.20' }), base).allow).toBe(true);
  });

  it('treats explicitly trusted peers (e.g. the Docker bridge) like loopback', () => {
    const r = req({ ip: '172.17.0.1', headers: { host: 'localhost:3050' } });
    expect(apiGuardDecision(r, base).allow).toBe(false);
    expect(apiGuardDecision(r, { ...base, trustedPeers: ['172.17.0.1'] }).allow).toBe(true);
  });
});

describe('createApiGuard (live express)', () => {
  const ORIG = process.env.RECOURSE_API_SECRET;
  let server: any;
  afterEach(() => {
    server?.close();
    if (ORIG === undefined) delete process.env.RECOURSE_API_SECRET; else process.env.RECOURSE_API_SECRET = ORIG;
  });

  it('rejects a cross-origin POST and accepts a same-origin one', async () => {
    process.env.RECOURSE_API_SECRET = 'test-secret';
    const app = express();
    app.use(createApiGuard());
    app.post('/api/recourse/danger', (_req, res) => res.json({ ok: true }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/api/recourse/danger`;

    const evil = await fetch(url, { method: 'POST', headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(401);
    const local = await fetch(url, { method: 'POST', headers: { origin: `http://localhost:${port}` } });
    expect(local.status).toBe(200);
    const withSecret = await fetch(url, { method: 'POST', headers: { origin: 'https://evil.example', authorization: 'Bearer test-secret' } });
    expect(withSecret.status).toBe(200);
  });
});
