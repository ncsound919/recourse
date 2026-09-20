import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import {
  cloneSpeech,
  ttsSidecarHealth,
  validateReferenceVoice,
} from '../src/lib/ttsSidecarClient';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

interface Route {
  status?: number;
  body?: unknown;
  /** When set, never respond — used to exercise the client timeout. */
  hang?: boolean;
  onRequest?: (body: any) => void;
}

async function startServer(handler: (path: string, body: any) => Route) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const route = handler(req.url ?? '', body);
      if (route.hang) return; // deliberately leave the socket open
      const status = route.status ?? 200;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(route.body ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as any).port}`;
}

describe('ttsSidecarClient', () => {
  it('maps the health response fields', async () => {
    const base = await startServer(() => ({
      body: {
        ok: true,
        service: 'tts',
        engines: ['xtts', 'f5tts'],
        tts_available: true,
        default_engine: 'xtts',
        device: 'cuda',
      },
    }));
    const h = await ttsSidecarHealth(base);
    expect(h.ok).toBe(true);
    expect(h.engines).toEqual(['xtts', 'f5tts']);
    expect(h.ttsAvailable).toBe(true);
    expect(h.defaultEngine).toBe('xtts');
    expect(h.device).toBe('cuda');
  });

  it('reports an unreachable sidecar honestly instead of fabricating health', async () => {
    const h = await ttsSidecarHealth('http://127.0.0.1:9', 400);
    expect(h.ok).toBe(false);
    expect(h.ttsAvailable).toBeUndefined();
    expect(h.error).toBeTruthy();
  });

  it('times out rather than hanging forever', async () => {
    const base = await startServer(() => ({ hang: true }));
    const h = await ttsSidecarHealth(base, 300);
    expect(h.ok).toBe(false);
    expect(h.error).toContain('timed out');
  });

  it('returns audio on a successful clone and forwards the options', async () => {
    let received: any;
    const base = await startServer((_p, body) => {
      received = body;
      return {
        body: {
          ok: true,
          engine: 'xtts',
          mime: 'audio/wav',
          sample_rate: 24000,
          duration_sec: 1.25,
          chars: 5,
          audio_base64: 'QUJD',
        },
      };
    });
    const r = await cloneSpeech('hello', 'REF', {
      base,
      language: 'es',
      speed: 1.5,
      referenceText: 'transcript',
      referenceFilename: 'ref.wav',
    });
    expect(r.ok).toBe(true);
    expect(r.audioBase64).toBe('QUJD');
    expect(r.sampleRate).toBe(24000);
    expect(r.durationSec).toBe(1.25);
    expect(received).toMatchObject({
      text: 'hello',
      reference_base64: 'REF',
      language: 'es',
      speed: 1.5,
      reference_text: 'transcript',
      reference_filename: 'ref.wav',
    });
  });

  it('surfaces the sidecar reason when synthesis is refused', async () => {
    const base = await startServer(() => ({
      body: { ok: false, reason: 'no zero-shot TTS backend installed' },
    }));
    const r = await cloneSpeech('hi', 'REF', { base });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no zero-shot TTS backend installed');
  });

  it('treats a 200 without audio as a failure, never a silent success', async () => {
    const base = await startServer(() => ({ body: { ok: true, engine: 'xtts' } }));
    const r = await cloneSpeech('hi', 'REF', { base });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/without audio/i);
  });

  it('reports a non-2xx response with its status', async () => {
    const base = await startServer(() => ({ status: 413, body: { detail: 'text too long' } }));
    const r = await cloneSpeech('hi', 'REF', { base });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('413');
  });

  it('returns the reference verdict from the validate endpoint', async () => {
    const base = await startServer(() => ({
      body: { ok: true, suitable: false, reason: 'reference clip is 1.0s', duration_sec: 1.0 },
    }));
    const r = await validateReferenceVoice('REF', { base });
    expect(r.ok).toBe(true);
    expect(r.suitable).toBe(false);
    expect(r.reason).toContain('1.0s');
  });
});
