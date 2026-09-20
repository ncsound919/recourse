import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  deleteVoiceProfile,
  getVoiceProfile,
  listVoiceProfiles,
  readReferenceBase64,
  saveVoiceProfile,
  voiceProfileDir,
} from '../src/lib/voiceProfileStore';

function makeWav(seconds = 0.5, sampleRate = 16000): Buffer {
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const dataSize = frames * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const WAV_B64 = makeWav().toString('base64');

let dataDir = '';

beforeEach(() => {
  dataDir = path.join(os.tmpdir(), `recourse-voiceps-${randomUUID()}`);
  process.env.VOICE_PROFILE_DIR = dataDir;
});

afterEach(() => {
  delete process.env.VOICE_PROFILE_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function save(overrides: Partial<Parameters<typeof saveVoiceProfile>[0]> = {}) {
  return saveVoiceProfile({ name: 'Voice', referenceBase64: WAV_B64, ...overrides });
}

describe('voiceProfileStore', () => {
  it('persists a profile and reads the clip back byte-for-byte', () => {
    const meta = save({ name: 'My Voice', durationSec: 0.5, sampleRate: 16000 });
    expect(meta.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta.bytes).toBeGreaterThan(44);

    const stored = readReferenceBase64(meta.id);
    expect(stored).toBe(WAV_B64);
    expect(getVoiceProfile(meta.id)?.name).toBe('My Voice');
    expect(listVoiceProfiles()).toHaveLength(1);
  });

  it('rejects a clip that is not a WAV', () => {
    expect(() => save({ referenceBase64: Buffer.from('just some text').toString('base64') })).toThrow(/WAV/i);
  });

  it('rejects malformed base64 and an empty clip', () => {
    expect(() => save({ referenceBase64: '!!!not base64!!!' })).toThrow(/base64/i);
    expect(() => save({ referenceBase64: '' })).toThrow(/required|empty/i);
  });

  it('enforces name and transcript caps', () => {
    expect(() => save({ name: 'x'.repeat(81) })).toThrow(/name exceeds/);
    expect(() => save({ name: 'ok', referenceText: 'x'.repeat(2001) })).toThrow(/referenceText exceeds/);
  });

  it('overwrites an existing profile by name, preserving its id and createdAt', () => {
    const first = save({ name: 'My Voice' });
    const second = save({ name: 'my voice', durationSec: 9 });
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.durationSec).toBe(9);
    expect(listVoiceProfiles()).toHaveLength(1);
  });

  it('refuses path-traversal and malformed ids on every read path', () => {
    const bad = '../../etc/passwd';
    expect(getVoiceProfile(bad)).toBeUndefined();
    expect(readReferenceBase64(bad)).toBeNull();
    expect(deleteVoiceProfile(bad)).toBe(false);
    expect(getVoiceProfile('not-a-uuid')).toBeUndefined();
    // Nothing escaped the store directory.
    expect(fs.existsSync(path.join(dataDir, '..', 'etc'))).toBe(false);
  });

  it('returns null when the clip file is missing rather than guessing', () => {
    const meta = save({ name: 'Ghost' });
    fs.rmSync(path.join(voiceProfileDir(), `${meta.id}.wav`));
    expect(readReferenceBase64(meta.id)).toBeNull();
  });

  it('degrades a corrupt index to an empty list instead of throwing', () => {
    save({ name: 'A' });
    fs.writeFileSync(path.join(voiceProfileDir(), 'index.json'), '{ this is not json', 'utf-8');
    expect(listVoiceProfiles()).toEqual([]);
  });

  it('drops index entries whose ids are malformed', () => {
    const meta = save({ name: 'A' });
    fs.writeFileSync(
      path.join(voiceProfileDir(), 'index.json'),
      JSON.stringify([...listVoiceProfiles(), { id: '../evil', name: 'bad' }]),
      'utf-8',
    );
    const list = listVoiceProfiles();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(meta.id);
  });

  it('caps the index at 100 profiles', () => {
    fs.mkdirSync(voiceProfileDir(), { recursive: true });
    const seeded = Array.from({ length: 105 }, (_, i) => ({
      id: randomUUID(),
      name: `Voice ${i}`,
      createdAt: i,
      updatedAt: i,
      language: 'en',
      filename: `${i}.wav`,
      bytes: 100,
    }));
    fs.writeFileSync(path.join(voiceProfileDir(), 'index.json'), JSON.stringify(seeded), 'utf-8');

    const meta = save({ name: 'Newest' });
    const list = listVoiceProfiles();
    expect(list.length).toBeLessThanOrEqual(100);
    expect(list[0].id).toBe(meta.id);
  });

  it('deletes metadata and clip, and 404s an unknown id', () => {
    const meta = save({ name: 'Gone' });
    expect(deleteVoiceProfile(meta.id)).toBe(true);
    expect(fs.existsSync(path.join(voiceProfileDir(), `${meta.id}.wav`))).toBe(false);
    expect(getVoiceProfile(meta.id)).toBeUndefined();
    expect(deleteVoiceProfile(meta.id)).toBe(false);
  });
});
