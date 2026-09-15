/**
 * Music sector — Recourse's composition workspace that hands progressions to
 * SoundLab.
 *
 * Pure helpers only (URL building, chord parsing, summaries) so the sector is
 * testable and the React view stays thin. The composer itself is the existing
 * `src/lib/composer` engine; this module wires it to SoundLab.
 */

export interface ProgressionBrief {
  style: string;
  seed: number;
  bars?: number;
  mode?: 'loop' | 'arr';
  /** Pitch class 0..11 (omit to let the composer choose). */
  key?: number;
  major?: boolean;
  bpm?: number;
}

/** Where SoundLab is running (its Vite dev server / desktop port). */
export const SOUNDLAB_DEFAULT_URL = 'http://localhost:3123';

export const MUSIC_SECTOR = {
  id: 'music',
  label: 'Music / composition (SoundLab)',
  verified: true,
  /** The real evidence this sector is bound to (no padding). */
  sources: ['recourse composer (deterministic)', 'SoundLab chord/song bridge'],
} as const;

/** Same-origin URL the Recourse UI fetches a song payload from. */
export function songPayloadUrl(brief: ProgressionBrief, base = ''): string {
  const query = new URLSearchParams({
    style: brief.style,
    seed: String(brief.seed),
    bars: String(brief.bars ?? 8),
    mode: brief.mode ?? 'loop',
  });
  if (typeof brief.key === 'number') query.set('key', String(brief.key));
  if (typeof brief.major === 'boolean') query.set('major', String(brief.major));
  if (typeof brief.bpm === 'number') query.set('bpm', String(brief.bpm));
  return `${base}/api/recourse/compose/song.json?${query.toString()}`;
}

/**
 * Deep link that opens SoundLab's Recourse Composer pre-filled with this
 * progression (SoundLab reads `recourseStyle` / `recourseSeed` / `recourseBpm`).
 */
export function soundlabHandoffUrl(soundlabBase: string, brief: ProgressionBrief): string {
  const root = (soundlabBase || SOUNDLAB_DEFAULT_URL).replace(/\/+$/, '');
  const query = new URLSearchParams({
    recourseStyle: brief.style,
    recourseSeed: String(brief.seed),
  });
  if (typeof brief.bpm === 'number') query.set('recourseBpm', String(brief.bpm));
  if (typeof brief.mode === 'string') query.set('recourseMode', brief.mode);
  return `${root}/?${query.toString()}`;
}

/** Split a chord label like `F#m7b5` into root `F#` + quality `m7b5`. */
export function chordParts(label: string): { root: string; quality: string } {
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(String(label).trim());
  if (!match) return { root: 'C', quality: '' };
  return { root: match[1], quality: match[2] };
}

/** Display facts about a progression (count + the distinct chords, in order). */
export function progressionSummary(chords: readonly string[]): { count: number; unique: string[] } {
  const unique: string[] = [];
  for (const c of chords) if (!unique.includes(c)) unique.push(c);
  return { count: chords.length, unique };
}
