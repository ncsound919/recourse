import { describe, it, expect } from 'vitest';
import {
  MUSIC_SECTOR,
  SOUNDLAB_DEFAULT_URL,
  chordParts,
  progressionSummary,
  soundlabHandoffUrl,
  songPayloadUrl,
} from '../src/lib/musicSector.js';

describe('music sector', () => {
  it('describes a verified sector bound to real sources', () => {
    expect(MUSIC_SECTOR.id).toBe('music');
    expect(MUSIC_SECTOR.verified).toBe(true);
    expect(MUSIC_SECTOR.sources.length).toBeGreaterThan(0);
  });

  it('builds the same-origin song payload URL', () => {
    const url = songPayloadUrl({ style: 'jasper-ballad', seed: 3, bars: 8, mode: 'loop' });
    expect(url.startsWith('/api/recourse/compose/song.json?')).toBe(true);
    expect(url).toContain('style=jasper-ballad');
    expect(url).toContain('seed=3');
    expect(url).toContain('mode=loop');
    expect(url).not.toContain('key=');
  });

  it('includes optional key / major / bpm', () => {
    const url = songPayloadUrl({ style: 'airplane', seed: 1, key: 5, major: true, bpm: 92 });
    expect(url).toContain('key=5');
    expect(url).toContain('major=true');
    expect(url).toContain('bpm=92');
  });

  it('builds the SoundLab handoff deep link', () => {
    const url = soundlabHandoffUrl('http://localhost:3123/', { style: 'steely-dan', seed: 7, bpm: 90, mode: 'arr' });
    expect(url.startsWith('http://localhost:3123/?')).toBe(true);
    expect(url).toContain('recourseStyle=steely-dan');
    expect(url).toContain('recourseSeed=7');
    expect(url).toContain('recourseBpm=90');
    expect(url).toContain('recourseMode=arr');
  });

  it('falls back to the default SoundLab URL', () => {
    expect(soundlabHandoffUrl('', { style: 'x', seed: 1 })).toContain(SOUNDLAB_DEFAULT_URL);
  });

  it('parses chord labels and summarizes progressions', () => {
    expect(chordParts('Cmaj7')).toEqual({ root: 'C', quality: 'maj7' });
    expect(chordParts('F#m7b5')).toEqual({ root: 'F#', quality: 'm7b5' });
    expect(chordParts('???')).toEqual({ root: 'C', quality: '' });
    expect(progressionSummary(['Cm7', 'Fm7', 'Cm7'])).toEqual({ count: 3, unique: ['Cm7', 'Fm7'] });
  });
});
