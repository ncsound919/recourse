import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createComposeRouter } from '../src/routes/compose';
import { ComposerLearner, defaultLearnerFile } from '../src/lib/composer/index';

const servers: http.Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function setup(denyWrites = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-compose-'));
  dirs.push(dir);
  const learner = new ComposerLearner(defaultLearnerFile(path.join(dir, 'learner.json')));
  const guard = (_req: express.Request, res: express.Response) => {
    if (!denyWrites) return true;
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  };
  const app = express();
  app.use(express.json());
  app.use('/api/recourse', createComposeRouter({ requireMutationAuth: guard, getLearner: () => learner }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base };
}

describe('compose router (extracted)', () => {
  it('lists styles and renders a song JSON', async () => {
    const { base } = await setup();
    const styles: any = await (await fetch(`${base}/api/recourse/compose/styles`)).json();
    expect(styles.success).toBe(true);
    expect(styles.styles.length).toBeGreaterThan(0);

    const song: any = await (await fetch(`${base}/api/recourse/compose/song.json?style=jasper-ballad&seed=1&bars=8`)).json();
    expect(song.success).toBe(true);
    expect(song.style).toBe('jasper-ballad');
    expect(Array.isArray(song.chords)).toBe(true);
  });

  it('serves the wav/midi/track endpoints as real bytes/json', async () => {
    const { base } = await setup();
    const wav = await fetch(`${base}/api/recourse/compose/wav?style=jasper-ballad&seed=1&bars=4`);
    expect(wav.headers.get('content-type')).toContain('audio/wav');
    expect((await wav.arrayBuffer()).byteLength).toBeGreaterThan(44);

    const midi = await fetch(`${base}/api/recourse/compose/midi?style=jasper-ballad&seed=1&bars=4`);
    expect(midi.headers.get('content-type')).toContain('audio/midi');

    const track: any = await (await fetch(`${base}/api/recourse/compose/track.json?style=jasper-ballad&seed=1&bars=4`)).json();
    expect(track.style).toBe('jasper-ballad');
  });

  it('guards the composing POST', async () => {
    const { base } = await setup(true);
    const res = await fetch(`${base}/api/recourse/compose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: 'jasper-ballad' }),
    });
    expect(res.status).toBe(401);
  });
});
