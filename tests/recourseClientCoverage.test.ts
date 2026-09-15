import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setRecourseApiSecret, recourseApiSecret, recourseJson } from '../src/lib/recourseClient';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setRecourseApiSecret('');
});

describe('recourseClient — shared authenticated fetch', () => {
  it('trims and stores the runtime secret, clearing it when blank', () => {
    setRecourseApiSecret('  s3cret-value  ');
    expect(recourseApiSecret()).toBe('s3cret-value');
    setRecourseApiSecret('   ');
    // Blank clears the runtime override; the env fallback is an empty string in
    // this repo (.env has no VITE_RECOURSE_API_SECRET).
    expect(recourseApiSecret()).toBe('');
  });

  it('adds Content-Type for JSON bodies and the secret header when configured', async () => {
    setRecourseApiSecret('abc123');
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response('{"ok":true}', { status: 200 });
    }));

    const out = await recourseJson('/api/recourse/status', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    expect(out).toEqual({ ok: true });
    const headers = capturedInit?.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('x-api-secret')).toBe('abc123');
    expect(capturedInit?.method).toBe('POST');
  });

  it('does not overwrite an explicit Content-Type header', async () => {
    setRecourseApiSecret('abc123');
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response('{}', { status: 200 });
    }));

    await recourseJson('/api/recourse/status', {
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      body: 'raw',
    });
    const headers = capturedInit?.headers as Headers;
    expect(headers.get('Content-Type')).toBe('text/plain');
    expect(headers.get('x-api-secret')).toBe('abc123');
  });

  it('adds no Content-Type without a body and no secret header when unconfigured', async () => {
    // runtime secret cleared in afterEach-style state; env fallback empty here.
    expect(recourseApiSecret()).toBe('');
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response('{"n":0}', { status: 200 });
    }));

    const out = await recourseJson('/api/recourse/status');
    expect(out).toEqual({ n: 0 });
    const headers = capturedInit?.headers as Headers;
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('x-api-secret')).toBe(false);
  });

  it('returns an honest failure object when the route replies with non-JSON', async () => {
    setRecourseApiSecret('abc123');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>gateway error</html>', { status: 502 })));

    const out = await recourseJson('/api/recourse/status');
    expect(out).toEqual({ success: false, error: 'non-JSON response (HTTP 502)' });
  });
});
