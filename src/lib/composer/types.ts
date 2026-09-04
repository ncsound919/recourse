/**
 * Recourse Composer — shared types + seeded PRNG.
 *
 * The Composer turns a creative brief into an ORIGINAL music structure ("in the
 * vein of" a studied style, never a reproduction) and encodes it as:
 *   - a Standard MIDI File (.mid) for the operator's real DAW / production,
 *   - a SoundLab `.seq` (ncsoundlab-mpc-sequence v2) for playback inside SoundLab.
 *
 * This file only holds data shapes; it contains no logic. Keeping the brief's
 * structure explicit is what lets the learner later record "this brief -> your
 * rating" episodes and feed them back.
 */

export type StyleId =
  | 'steely-dan'      // complex jazz-harmony; mu(add2) voicings; chromatic half-step cadences
  | 'jasper-ballad'   // Chris Jasper quiet-storm / gospel soul ballad; final-chorus key lift
  | 'dangelo-glasper' // neo-soul: D'Angelo gospel/blues vamp × Robert Glasper jazz reharm
  | 'airplane';       // Jefferson Airplane psych-rock: modal vamps, drone, dynamics

export type ChordQuality =
  | 'maj' | 'maj7' | 'maj9' | 'maj7#11' | 'maj6' | '6/9' | 'mu'        // mu = add9 (1 2 3 5)
  | 'min' | 'm7' | 'm9' | 'm11' | 'mM7'
  | '7' | '7b9' | '7#9' | '7#11' | '7b13' | '7sus' | '9' | '13'
  | 'sus' | 'dim7' | 'aug';

export interface Chord {
  /** Root as a pitch class 0..11 (C=0). */
  rootPc: number;
  quality: ChordQuality;
  /** Bars this chord occupies (default 1). */
  bars?: number;
}

export interface ComposeBrief {
  style: StyleId;
  /** Tonic pitch class 0..11 (C=0). When omitted the style's key tendency picks one. */
  key?: number;
  /** Major (true) or minor-ish (false) tonic color for style that cares. */
  major?: boolean;
  bpm?: number;
  /** Total loop length in bars: one of 4 | 8 | 16. */
  bars?: number;
  /** Deterministic seed. Same brief + seed == same track. */
  seed?: number;
  /** Named variant tag, e.g. "Aja-lush". Surfaced to the learner/episode. */
  title?: string;
}

/** One notated musical event with an explicit time (ticks) so both encoders
 *  share a single source of truth and stay bit-consistent. */
export interface NoteEvent {
  /** Absolute time in ticks (PPQ=480; 4 ticks per 1/128, 480 per quarter). */
  tick: number;
  /** Duration in ticks. */
  dur: number;
  /** MIDI note number. */
  pitch: number;
  velocity: number;
  /** Logical part: piano/rhodes/keys/bass/drums/horns/bgvox/lead. */
  part: PartName;
  /** GM drum note when part === 'drums' (kick 36 / snare 38 / hat 42...). */
  drum?: number;
}

export type PartName =
  | 'keys'      // chord voicings (piano / rhodes / organ / clav)
  | 'bass'
  | 'drums'
  | 'lead'      // melody / hook / sax-lead
  | 'horns'     // stabs / accents
  | 'bgvox'     // background vocal / choir stack
  | 'strings';  // sustained string / pad wash

export interface Track {
  style: StyleId;
  key: number;
  major: boolean;
  bpm: number;
  bars: number;
  seed: number;
  title: string;
  /** Chord sequence aligned one-per-bar (length === bars) for easy grid mapping. */
  chords: Chord[];
  /** Deterministic expansion of the chord sequence into sounding notes. */
  events: NoteEvent[];
  /** Where the structure came from — provenance for the learner. */
  brief: ComposeBrief;
  /** Non-looping arrangement metadata when produced via `arr:` mode. */
  sections?: ArrSection[];
  mode?: 'loop' | 'arr';
}

/** One section of a written-out arrangement (bar ranges are inclusive-start). */
export interface ArrSection {
  name: string;
  startBar: number;
  bars: number;
  /** Whole/half-step lift applied to this section's chords (e.g. jasper final). */
  lift?: number;
}

/** Deterministic, seedable PRNG (mulberry32). Reproducible composition. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T extends { w: number }>(rng: () => number, items: T[]): Omit<T, 'w'> {
  const total = items.reduce((s, it) => s + Math.max(0, it.w), 0);
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, it.w);
    if (r <= 0) {
      const { w: _w, ...rest } = it;
      return rest as Omit<T, 'w'>;
    }
  }
  const { w: _w2, ...last } = items[items.length - 1];
  return last as Omit<T, 'w'>;
}
