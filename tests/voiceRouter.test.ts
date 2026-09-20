import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createVoiceRouter, type VoiceRouterDeps } from '../src/routes/voice';

const servers: http.Server[] = [];
let dataDir = '';

beforeEach(() => {
  dataDir = path.join(os.tmpdir(), `recourse-voice-${randomUUID()}`);
  process.env.VOICE_PROFILE_DIR = dataDir;
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  delete process.env.VOICE_PROFILE_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const REFERENCE_B64 = (() => {
  const frames = 500;
  const dataSize = frames * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf.toString('base64');
})();

function makeDeps(overrides: Partial<VoiceRouterDeps> = {}): VoiceRouterDeps {
  return {
    requireMutationAuth: () => true,
    health: vi.fn(async () => ({
      ok: true,
      service: 'tts',
      engines: ['xtts'],
      ttsAvailable: true,
      defaultEngine: 'xtts',
      device: 'cpu',
      latencyMs: 3,
    })),
    validateReference: vi.fn(async () => ({ ok: true, suitable: true, reason: null, duration_sec: 15 })),
    synthesize: vi.fn(async () => ({
      ok: true,
      engine: 'xtts',
      mime: 'audio/wav',
      sampleRate: 24000,
      durationSec: 1.5,
      chars: 10,
      audioBase64: 'QUJD',
      latencyMs: 42,
    })),
    ...overrides,
  };
}

async function setup(deps: VoiceRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/recourse', createVoiceRouter(deps));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const get = (p: string) => fetch(`${base}${p}`);
  const post = (p: string, body: unknown) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const del = (p: string) => fetch(`${base}${p}`, { method: 'DELETE' });
  return { base, get, post, del };
}

async function createProfile(deps: VoiceRouterDeps) {
  const { post } = await setup(deps);
  const res = await post('/api/recourse/voice/profiles', { name: 'Test Voice', referenceBase64: REFERENCE_B64 });
  const json: any = await res.json();
  return json.profile;
}

describe('voice router', () => {
  it('reports sidecar health and an empty profile list', async () => {
    const { get } = await setup(makeDeps());
    const body: any = await (await get('/api/recourse/voice/status')).json();
    expect(body.success).toBe(true);
    expect(body.sidecar.online).toBe(true);
    expect(body.sidecar.ttsAvailable).toBe(true);
    expect(body.sidecar.engines).toEqual(['xtts']);
    expect(body.profileCount).toBe(0);
  });

  it('reports the sidecar offline without fabricating engine support', async () => {
    const offline = makeDeps({
      health: async () => ({ ok: false, error: 'tts sidecar unreachable', latencyMs: 1 }),
    });
    const { get } = await setup(offline);
    const body: any = await (await get('/api/recourse/voice/status')).json();
    expect(body.sidecar.online).toBe(false);
    expect(body.sidecar.ttsAvailable).toBe(false);
    expect(body.sidecar.error).toBe('tts sidecar unreachable');
  });

  it('saves a profile and surfaces the reference validation verdict', async () => {
    const deps = makeDeps();
    const { post, get } = await setup(deps);
    const res = await post('/api/recourse/voice/profiles', {
      name: 'My Voice',
      referenceBase64: REFERENCE_B64,
      durationSec: 15,
      sampleRate: 16000,
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.profile.name).toBe('My Voice');
    expect(body.validated).toBe(true);
    expect(body.suitable).toBe(true);

    // The clip is durable and readable by id.
    expect(fs.existsSync(path.join(dataDir, `${body.profile.id}.wav`))).toBe(true);

    const list: any = await (await get('/api/recourse/voice/profiles')).json();
    expect(list.count).toBe(1);
    expect(list.profiles[0].id).toBe(body.profile.id);
  });

  it('rejects a profile without a name or clip, and keeps the validation error honest', async () => {
    const { post } = await setup(makeDeps());
    expect((await post('/api/recourse/voice/profiles', { referenceBase64: REFERENCE_B64 })).status).toBe(400);
    expect((await post('/api/recourse/voice/profiles', { name: 'x' })).status).toBe(400);

    const probing = makeDeps({ validateReference: async () => ({ ok: false, error: 'sidecar unreachable' }) });
    const saved = await (await setup(probing)).post('/api/recourse/voice/profiles', {
      name: 'Offline Probe',
      referenceBase64: REFERENCE_B64,
    });
    const body: any = await saved.json();
    expect(body.success).toBe(true);
    expect(body.validated).toBe(false);
    expect(body.validationError).toBe('sidecar unreachable');
  });

  it('synthesizes speech for a saved profile', async () => {
    const deps = makeDeps();
    const profile = await createProfile(deps);
    const { post } = await setup(deps);
    const res = await post('/api/recourse/voice/speak', { text: 'hello world', profileId: profile.id });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.audioBase64).toBe('QUJD');
    expect(body.engine).toBe('xtts');
    expect(deps.synthesize).toHaveBeenCalledWith(
      'hello world',
      REFERENCE_B64,
      expect.objectContaining({ language: 'en', referenceFilename: expect.stringContaining('.wav') }) as never,
    );
  });

  it('returns 503 with the sidecar reason when no TTS backend is installed', async () => {
    const deps = makeDeps({
      synthesize: async () => ({ ok: false, reason: 'no zero-shot TTS backend installed on the voice sidecar' }),
    });
    const profile = await createProfile(deps);
    const { post } = await setup(deps);
    const res = await post('/api/recourse/voice/speak', { text: 'hi', profileId: profile.id });
    expect(res.status).toBe(503);
    const body: any = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('no zero-shot TTS backend installed');
  });

  it('404s synthesis for an unknown profile and for a missing clip', async () => {
    const deps = makeDeps();
    const profile = await createProfile(deps);
    const { post, base } = await setup(deps);
    expect((await post('/api/recourse/voice/speak', { text: 'hi', profileId: randomUUID() })).status).toBe(404);

    fs.rmSync(path.join(dataDir, `${profile.id}.wav`));
    const res = await fetch(`${base}/api/recourse/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi', profileId: profile.id }),
    });
    expect(res.status).toBe(404);
  });

  it('deletes a profile and 404s an unknown id', async () => {
    const deps = makeDeps();
    const profile = await createProfile(deps);
    const { del, get } = await setup(deps);
    expect((await del(`/api/recourse/voice/profiles/${profile.id}`)).status).toBe(200);
    expect((await del(`/api/recourse/voice/profiles/${randomUUID()}`)).status).toBe(404);

    const list: any = await (await get('/api/recourse/voice/profiles')).json();
    expect(list.count).toBe(0);
  });

  it('gates profile writes behind the injected mutation guard', async () => {
    const guarded = makeDeps({
      requireMutationAuth: (_req, res) => {
        res.status(401).json({ success: false, error: 'unauthorized' });
        return false;
      },
    });
    const { post, del, get } = await setup(guarded);
    expect((await post('/api/recourse/voice/profiles', { name: 'n', referenceBase64: REFERENCE_B64 })).status).toBe(401);
    expect((await post('/api/recourse/voice/speak', { text: 't', profileId: randomUUID() })).status).toBe(401);
    expect((await del(`/api/recourse/voice/profiles/${randomUUID()}`)).status).toBe(401);
    // Reads stay open.
    expect((await get('/api/recourse/voice/status')).status).toBe(200);
  });

  it('rejects a reference clip that is not a WAV', async () => {
    const { post } = await setup(makeDeps());
    const res = await post('/api/recourse/voice/profiles', {
      name: 'Garbage',
      referenceBase64: Buffer.from('not a wav').toString('base64'),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/WAV/i);
  });

  it('413s text beyond the sidecar cap and on an oversized transcript', async () => {
    const deps = makeDeps();
    const profile = await createProfile(deps);
    const { post } = await setup(deps);

    const longText = await post('/api/recourse/voice/speak', { text: 'x'.repeat(5001), profileId: profile.id });
    expect(longText.status).toBe(413);

    const longTranscript = await post('/api/recourse/voice/profiles', {
      name: 'Long',
      referenceBase64: REFERENCE_B64,
      referenceText: 'x'.repeat(2001),
    });
    expect(longTranscript.status).toBe(413);
  });

  it('clamps out-of-range speed instead of forwarding it to the model', async () => {
    const deps = makeDeps();
    const profile = await createProfile(deps);
    const { post } = await setup(deps);

    await post('/api/recourse/voice/speak', { text: 'a', profileId: profile.id, speed: 999 });
    expect(deps.synthesize).toHaveBeenLastCalledWith('a', REFERENCE_B64, expect.objectContaining({ speed: 2 }) as never);

    await post('/api/recourse/voice/speak', { text: 'b', profileId: profile.id, speed: 0.01 });
    expect(deps.synthesize).toHaveBeenLastCalledWith('b', REFERENCE_B64, expect.objectContaining({ speed: 0.5 }) as never);

    await post('/api/recourse/voice/speak', { text: 'c', profileId: profile.id, speed: Number.NaN });
    const call = (deps.synthesize as any).mock.calls.at(-1);
    expect(call[2].speed).toBeUndefined();
  });

  it('reports the profile count alongside sidecar health', async () => {
    const deps = makeDeps();
    await createProfile(deps);
    const { get } = await setup(deps);
    const body: any = await (await get('/api/recourse/voice/status')).json();
    expect(body.profileCount).toBe(1);
    expect(body.profiles[0].name).toBe('Test Voice');
    expect(body.sidecar.defaultEngine).toBe('xtts');
  });
});
