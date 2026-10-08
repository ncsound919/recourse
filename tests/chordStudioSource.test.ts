import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  chordStudioDataDir,
  chordStudioScanRoots,
  readChordStudioProgressions,
  buildChordStudioTrainingRows,
  chordStudioFeatures,
  CHORDSTUDIO_FEATURE_NAMES,
  type ChordStudioProgression,
} from '../src/lib/chordStudioSource';
import { isComposerTrainingSet } from '../src/lib/composerTraining';

let dir = '';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chordstudio-test-'));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const prog = (over: Partial<ChordStudioProgression> = {}): ChordStudioProgression => ({
  name: 'p',
  rootNote: 'C',
  scale: 'major',
  chords: [
    { name: 'Cmaj7', role: 'tonic', notes: [60, 64, 67, 71] },
    { name: 'Am7', role: 'submediant', notes: [57, 60, 64, 67] },
    { name: 'Fmaj7', role: 'subdominant', notes: [53, 57, 60, 64] },
  ],
  ...over,
});

describe('chordStudioDataDir', () => {
  it('honours CHORDSTUDIO_DATA then falls back under APPDATA', () => {
    expect(chordStudioDataDir({ CHORDSTUDIO_DATA: 'D:/cs' } as NodeJS.ProcessEnv)).toBe('D:/cs');
    expect(chordStudioDataDir({ APPDATA: 'C:/AppData/Roaming' } as NodeJS.ProcessEnv)).toBe(
      path.join('C:/AppData/Roaming', 'Chord Studio'),
    );
  });
});

describe('chordStudioScanRoots', () => {
  it('returns the app-data dir plus Documents (where the export dialog defaults)', () => {
    const roots = chordStudioScanRoots({ APPDATA: 'C:/AppData/Roaming', USERPROFILE: 'C:/Users/x' } as NodeJS.ProcessEnv);
    expect(roots).toEqual([path.join('C:/AppData/Roaming', 'Chord Studio'), path.join('C:/Users/x', 'Documents')]);
  });

  it('honours CHORDSTUDIO_DATA as the sole root', () => {
    expect(chordStudioScanRoots({ CHORDSTUDIO_DATA: 'D:/cs' } as NodeJS.ProcessEnv)).toEqual(['D:/cs']);
  });
});

describe('readChordStudioProgressions', () => {
  it('reads the documented .progression export shape and carries an optional score', () => {
    const exportDir = path.join(dir, 'exports');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(
      path.join(exportDir, 'Take 1.progression'),
      JSON.stringify({
        progression: {
          name: 'Take 1',
          rootNote: 'C',
          scale: 'major',
          chords: [
            { name: 'Cmaj7', role: 'tonic', notes: [60, 64, 67, 71] },
            { name: 'G7', role: 'dominant', notes: [55, 59, 62, 65] },
          ],
          score: 88,
        },
      }),
      'utf-8',
    );
    const scan = readChordStudioProgressions(exportDir);
    expect(scan.scanned).toBe(1);
    expect(scan.progressions).toHaveLength(1);
    expect(scan.progressions[0].chords).toHaveLength(2);
    expect(scan.progressions[0].score).toBe(88);
  });

  it('reports missing dirs and malformed files without throwing', () => {
    const missing = readChordStudioProgressions(path.join(dir, 'nope'));
    expect(missing.progressions).toEqual([]);
    const badDir = path.join(dir, 'bad');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'x.progression'), '{ not json', 'utf-8');
    const scan = readChordStudioProgressions(badDir);
    expect(scan.progressions).toEqual([]);
    expect(scan.errors.length).toBeGreaterThan(0);
  });

  it('scans the app-data dir (deep) and Documents (top-level) by default', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-home-'));
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-appdata-'));
    const nested = path.join(appData, 'Chord Studio', 'sub');
    const docsDir = path.join(home, 'Documents');
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });
    const mk = (name: string, score: number) =>
      JSON.stringify({ progression: { name, chords: [{ name: 'Cmaj7', notes: [60, 64, 67] }], score } });
    fs.writeFileSync(path.join(nested, 'deep.progression'), mk('deep', 80));
    fs.writeFileSync(path.join(docsDir, 'top.progression'), mk('top', 60));
    vi.stubEnv('APPDATA', appData);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('CHORDSTUDIO_DATA', '');
    try {
      const scan = readChordStudioProgressions();
      expect(scan.progressions.map((p) => p.name).sort()).toEqual(['deep', 'top']);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(appData, { recursive: true, force: true });
    }
  });
});

describe('buildChordStudioTrainingRows', () => {
  it('refuses an unscored corpus (ChordStudio does not persist the Critic score yet)', () => {
    const r = buildChordStudioTrainingRows([prog(), prog(), prog(), prog()]);
    expect(isComposerTrainingSet(r)).toBe(false);
    if (isComposerTrainingSet(r)) return;
    expect(r.reason).toMatch(/scored/i);
  });

  it('refuses a constant score', () => {
    const r = buildChordStudioTrainingRows([prog({ score: 90 }), prog({ score: 90 }), prog({ score: 90 }), prog({ score: 90 })]);
    expect(isComposerTrainingSet(r)).toBe(false);
  });

  it('builds rows from varied scores', () => {
    const r = buildChordStudioTrainingRows([
      prog({ score: 90 }),
      prog({ score: 70 }),
      prog({ score: 55 }),
      prog({ score: 80 }),
    ]);
    expect(isComposerTrainingSet(r)).toBe(true);
    if (!isComposerTrainingSet(r)) return;
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toHaveLength(CHORDSTUDIO_FEATURE_NAMES.length);
    expect(r.target).toEqual([90, 70, 55, 80]);
  });
});

describe('chordStudioFeatures', () => {
  it('is finite, deterministic, and orders notes/roots sensibly', () => {
    const f = chordStudioFeatures(prog());
    expect(f).toHaveLength(CHORDSTUDIO_FEATURE_NAMES.length);
    expect(f.every((v) => Number.isFinite(v))).toBe(true);
    expect(f[0]).toBe(3); // chordCount
    expect(chordStudioFeatures(prog())).toEqual(f);
  });
});
