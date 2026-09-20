import { describe, it, expect, vi } from 'vitest';
import { buildOpenApiSpec, listOperations } from '../src/lib/openapi';
import { createRecourseSdk } from '../src/lib/recourseSdk';

describe('OpenAPI spec', () => {
  it('has a valid 3.1 shape and trimmed servers', () => {
    const spec = buildOpenApiSpec('http://localhost:3050/');
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe('http://localhost:3050');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(20);
  });

  it('indexes operations sorted with mutating flags', () => {
    const ops = listOperations(buildOpenApiSpec('http://x'));
    const paths = ops.map((o) => `${o.method} ${o.path}`);
    expect(paths).toContain('GET /api/recourse/status');
    expect(paths).toContain('POST /api/recourse/wallet/budget');
    expect(paths).toContain('POST /api/a2a');
    // Sorted by path.
    const sorted = [...ops].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    expect(ops.map((o) => `${o.method} ${o.path}`)).toEqual(sorted.map((o) => `${o.method} ${o.path}`));
    expect(ops.find((o) => o.path === '/api/recourse/wallet/budget')?.mutating).toBe(true);
    expect(ops.find((o) => o.path === '/api/recourse/status')?.mutating).toBe(false);
  });

  it('documents the voice-clone surface with correct verbs and mutating flags', () => {
    const ops = listOperations(buildOpenApiSpec('http://x'));
    const find = (method: string, path: string) => ops.find((o) => o.method === method && o.path === path);

    expect(find('GET', '/api/recourse/voice/status')?.mutating).toBe(false);
    expect(find('GET', '/api/recourse/voice/profiles')?.mutating).toBe(false);
    expect(find('POST', '/api/recourse/voice/profiles')?.mutating).toBe(true);
    expect(find('DELETE', '/api/recourse/voice/profiles/{id}')?.mutating).toBe(true);
    expect(find('POST', '/api/recourse/voice/speak')?.mutating).toBe(true);

    // The reference clip + synthesis contract is documented, not opaque.
    const spec = buildOpenApiSpec('http://x');
    const save = spec.paths['/api/recourse/voice/profiles'].post;
    expect(save.parameters?.map((p) => p.name)).toContain('referenceBase64');
    expect(spec.paths['/api/recourse/voice/speak'].post.responses?.['503']).toBeDefined();
  });

  it('documents the fleet voice brief as a read-only operation', () => {
    const ops = listOperations(buildOpenApiSpec('http://x'));
    const fleet = ops.find((o) => o.method === 'GET' && o.path === '/api/recourse/fleet/voice');
    expect(fleet).toBeDefined();
    expect(fleet?.mutating).toBe(false);
    expect(fleet?.tags).toContain('fleet');
  });
});

describe('typed SDK', () => {
  it('parses a successful JSON response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, status: { generation: 3 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const sdk = createRecourseSdk({ baseUrl: 'http://x', fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await sdk.status();
    expect(r.ok).toBe(true);
    expect(r.data.status.generation).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith('http://x/api/recourse/status', expect.objectContaining({ method: 'GET' }));
  });

  it('sends the secret on mutating calls only', async () => {
    const calls: Array<{ url: string; headers: any }> = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, headers: init.headers });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const sdk = createRecourseSdk({ baseUrl: 'http://x', secret: 's3cr3t', fetchImpl });
    await sdk.status();
    await sdk.setWalletBudget('merge', 500);
    expect(calls[0].headers['x-api-secret']).toBeUndefined();
    expect(calls[1].headers['x-api-secret']).toBe('s3cr3t');
  });

  it('reports an honest failure on network error without fabricating data', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const sdk = createRecourseSdk({ baseUrl: 'http://x', fetchImpl });
    const r = await sdk.wallet();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.data).toBeNull();
    expect(r.error).toContain('ECONNREFUSED');
  });

  it('calls the voice-clone surface with the right verbs and secret', async () => {
    const calls: Array<{ url: string; method: string; headers: any; body?: string }> = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, method: init.method, headers: init.headers, body: init.body });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const sdk = createRecourseSdk({ baseUrl: 'http://x', secret: 's3cr3t', fetchImpl });

    await sdk.voiceStatus();
    await sdk.voiceProfiles();
    await sdk.saveVoiceProfile({ name: 'Me', referenceBase64: 'QUJD' });
    await sdk.speakInVoice({ text: 'hi', profileId: 'p 1/2' });
    await sdk.deleteVoiceProfile('p 1/2');

    expect(calls[0]).toMatchObject({ url: 'http://x/api/recourse/voice/status', method: 'GET' });
    expect(calls[1]).toMatchObject({ url: 'http://x/api/recourse/voice/profiles', method: 'GET' });
    // Reads never carry the secret.
    expect(calls[0].headers['x-api-secret']).toBeUndefined();
    expect(calls[1].headers['x-api-secret']).toBeUndefined();

    expect(calls[2]).toMatchObject({ url: 'http://x/api/recourse/voice/profiles', method: 'POST' });
    expect(calls[2].headers['x-api-secret']).toBe('s3cr3t');
    expect(JSON.parse(calls[2].body!)).toMatchObject({ name: 'Me', referenceBase64: 'QUJD' });

    expect(calls[3]).toMatchObject({ url: 'http://x/api/recourse/voice/speak', method: 'POST' });
    expect(calls[3].headers['x-api-secret']).toBe('s3cr3t');

    // The profile id is path-encoded and DELETE carries the secret with no body.
    expect(calls[4]).toMatchObject({ url: 'http://x/api/recourse/voice/profiles/p%201%2F2', method: 'DELETE' });
    expect(calls[4].headers['x-api-secret']).toBe('s3cr3t');
    expect(calls[4].body).toBeUndefined();
  });

  it('surfaces the sidecar reason from a failed voice synthesis', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ success: false, error: 'no zero-shot TTS backend installed' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    const sdk = createRecourseSdk({ baseUrl: 'http://x', fetchImpl });
    const r = await sdk.speakInVoice({ text: 'hi', profileId: 'p1' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.error).toContain('no zero-shot TTS backend installed');
  });
});
