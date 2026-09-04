/**
 * Composer style lexicons — the RESULT of the per-act research, encoded as data
 * the generator consumes. Each lexicon captures the COMPOSING DNA of a style so
 * Recourse can write original material "in the vein of" it (never a copy).
 *
 * Data model (per lexicon):
 *  - keyTendency: tonal centers the style favors (tonicPc, major?, weight).
 *  - qualityWeights: which chord colors dominate and how likely each is.
 *  - rootMotion: a weighted set of semitone root-steps for the next bar; the
 *    generator walks this to build motion. Half-steps => Steely Dan chromatic
 *    cadence; -5/+5 => circle fifths; 0 => static vamp (D'Angelo / Airplane).
 *  - archetypes: optional fixed multi-bar progression seeds (semitone root
 *    offsets from the tonic + a quality) the generator prefers before falling
 *    back to free root-motion.
 *  - form: phrase shape / signature devices (key lifts, cut-offs) as flags.
 *  - drum: GM-note groove (16-step) data the SoundLab/.mid drum writer uses.
 *
 * Every lexicon is authored with weighted randomness so repeated calls with a
 * new seed explore the space while a fixed seed stays reproducible.
 */

import type { ChordQuality, StyleId } from './types.js';

export interface StyleLexicon {
  id: StyleId;
  label: string;
  blurb: string;
  /** Preferred tonal centers: (pc, major) with weight. */
  keys: Array<{ pc: number; major: boolean; w: number }>;
  bpm: [number, number]; // min..max
  qualityWeights: Array<{ q: ChordQuality; w: number }>;
  /** Root motion (semitones) for the next chord. -5 = up a 4th (circle). */
  rootSteps: Array<{ step: number; w: number }>;
  /** Optional fixed seed progressions: arrays of {off, q} root-offset from tonic. */
  archetypes: Array<Array<{ off: number; q: ChordQuality }>>;
  /** Voicing register for the keys/chord part. */
  voicing: { lo: number; hi: number; n: number };
  bassOctave: number;
  /** Optional specialized voicing engine. 'steely' applies the mu(add2)
   *  adjacency rule and rootless dominant voicings (Steely Dan deepening). */
  voicer?: 'standard' | 'steely';
  /** Signature behavior knobs. */
  signature: {
    /** whole/half-step final-chorus lift for ballads; false to disable. */
    finalKeyLift?: number;
    /** hold one chord the whole loop and just groove (D'Angelo/psych vamps). */
    staticVampChance?: number;
    /** how likely a bar prolongs its chord rather than moving. */
    holdBarChance?: number;
    /** density of the drum 16-step groove (0..1). */
    drumDensity?: number;
  };
}

/** 16-step groove: kick/snare/hats. GM: kick 36, snare 38, closed hat 42, open hat 46. */
export type Groove = { kick: number[]; snare: number[]; hat: number[] };

export const STYLE_LEXICONS: Record<StyleId, StyleLexicon> = {
  'steely-dan': {
    id: 'steely-dan',
    label: 'Steely Dan (Aja-era harmonic complexity)',
    blurb:
      'Chromatically-driven jazz-pop: mu(add2) clusters, altered/altered-maj7 colors, extended minor chords, half-step cadences, written charts over multi-bar harmony.',
    keys: [
      { pc: 9, major: true, w: 2 }, { pc: 2, major: true, w: 2 }, { pc: 0, major: true, w: 2 },
      { pc: 11, major: true, w: 1 }, { pc: 4, major: true, w: 1 }, { pc: 7, major: true, w: 1 },
    ],
    bpm: [84, 104],
    qualityWeights: [
      { q: 'mu', w: 3 }, { q: 'maj7', w: 3 }, { q: 'maj7#11', w: 2 }, { q: 'maj9', w: 2 }, { q: 'm9', w: 3 }, { q: 'm11', w: 2 },
      { q: '7#11', w: 3 }, { q: '7b9', w: 2 }, { q: '7b13', w: 2 }, { q: 'm7', w: 2 }, { q: '6/9', w: 1 }, { q: '7#9', w: 1 }, { q: '13', w: 1 },
    ],
    rootSteps: [
      { step: -5, w: 4 }, { step: -1, w: 3 }, { step: 1, w: 2 }, { step: 2, w: 2 }, { step: -2, w: 2 },
      { step: 7, w: 1 }, { step: 0, w: 1 },
    ],
    archetypes: [
      // half-step chromatic descent over m11 (documented on "Aja")
      [
        { off: 0, q: 'm11' }, { off: -1, q: 'm9' }, { off: -2, q: 'm11' }, { off: -3, q: 'm9' },
      ],
      // Neapolitan + half-step resolve to tonic (bIImaj -> I)
      [
        { off: 1, q: 'maj7' }, { off: 0, q: 'maj7#11' }, { off: 7, q: '7b9' }, { off: 0, q: 'maj7' },
      ],
      // Peg-style altered-blues with maj7/9 color on top
      [
        { off: 0, q: 'maj7' }, { off: 4, q: '7#11' }, { off: -3, q: 'maj7' }, { off: 0, q: 'maj7#11' },
      ],
    ],
    voicing: { lo: 55, hi: 88, n: 5 },
    bassOctave: 2,
    voicer: 'steely',
    signature: { holdBarChance: 0.25, drumDensity: 0.5 },
  },

  'jasper-ballad': {
    id: 'jasper-ballad',
    label: 'Chris Jasper quiet-storm / gospel soul ballad',
    blurb:
      'Smooth 1980s soul ballad: lush extended triads (maj7/9, 6/9, m9), gospel IV->I and ii9-V13 phrases, held-note space, and the signature upward final-chorus key lift.',
    keys: [
      { pc: 0, major: true, w: 2 }, { pc: 9, major: false, w: 2 }, { pc: 10, major: false, w: 1 },
      { pc: 3, major: true, w: 1 }, { pc: 5, major: true, w: 1 },
    ],
    bpm: [62, 84],
    qualityWeights: [
      { q: 'maj7', w: 3 }, { q: 'maj9', w: 3 }, { q: '6/9', w: 2 }, { q: 'm9', w: 2 }, { q: 'm7', w: 2 },
      { q: 'maj6', w: 1 }, { q: '7sus', w: 1 }, { q: 'mM7', w: 1 },
    ],
    rootSteps: [
      { step: 0, w: 3 }, { step: -5, w: 3 }, { step: -2, w: 2 }, { step: 3, w: 2 }, { step: -3, w: 1 },
    ],
    archetypes: [
      // quiet-storm slow-jam: I | vi | ii | V
      [
        { off: 0, q: 'maj7' }, { off: 3, q: 'm7' }, { off: -3, q: 'm9' }, { off: 2, q: '7sus' },
      ],
      // gospel plagal: I | IVmaj | ii9 V13 | I
      [
        { off: 0, q: 'maj7' }, { off: 5, q: 'maj9' }, { off: -3, q: 'm9' }, { off: 0, q: '6/9' },
      ],
      // sensual smooth-soul hold + lift
      [
        { off: 0, q: 'maj9' }, { off: 0, q: 'maj9' }, { off: -5, q: 'm7' }, { off: -2, q: '7sus' },
      ],
    ],
    voicing: { lo: 55, hi: 84, n: 5 },
    bassOctave: 2,
    signature: { finalKeyLift: 2, staticVampChance: 0.1, holdBarChance: 0.3, drumDensity: 0.35 },
  },

  'dangelo-glasper': {
    id: 'dangelo-glasper',
    label: "D'Angelo x Robert Glasper neo-soul",
    blurb:
      'Gospel/blues vamp with jazz reharm: static or two-chord minor vamps, maj7/6/9/m9/13 color, upper-structure & quartal motion on top, behind-the-beat pocket, ever-rising climax.',
    keys: [
      { pc: 5, major: false, w: 2 }, { pc: 7, major: false, w: 2 }, { pc: 3, major: true, w: 2 },
      { pc: 8, major: true, w: 1 }, { pc: 1, major: true, w: 1 }, { pc: 10, major: false, w: 1 },
    ],
    bpm: [55, 88],
    qualityWeights: [
      { q: 'm9', w: 3 }, { q: 'maj7', w: 2 }, { q: '6/9', w: 2 }, { q: 'm11', w: 2 }, { q: '9', w: 2 },
      { q: '7sus', w: 2 }, { q: 'maj9', w: 1 }, { q: 'm7', w: 1 }, { q: '7b13', w: 1 }, { q: '13', w: 1 },
    ],
    rootSteps: [
      { step: 0, w: 5 }, { step: -2, w: 2 }, { step: -5, w: 2 }, { step: 2, w: 1 }, { step: 1, w: 1 },
    ],
    archetypes: [
      // one-chord gospel/blues vamp (D'Angelo)
      [{ off: 0, q: 'm9' }, { off: 0, q: 'm9' }, { off: 0, q: 'm9' }, { off: 0, q: 'm9' }],
      // i -> bVII -> i modal oscillation with color
      [
        { off: 0, q: 'm9' }, { off: -2, q: '6/9' }, { off: 0, q: 'm11' }, { off: -2, q: 'maj7' },
      ],
      // gospel reharm turnaround (Glasper)
      [
        { off: 0, q: 'm9' }, { off: -4, q: 'maj7' }, { off: -2, q: '7sus' }, { off: 0, q: '9' },
      ],
    ],
    voicing: { lo: 57, hi: 90, n: 5 }, // open/quartal-friendly upper spread
    bassOctave: 2,
    signature: { staticVampChance: 0.4, holdBarChance: 0.5, drumDensity: 0.3 },
  },

  airplane: {
    id: 'airplane',
    label: 'Jefferson Airplane psychedelic rock',
    blurb:
      'Modal, triadic psych-rock: drone/pedal vamps, mixolydian/Dorian/aeolian color, open-fifth texture, dual-lead tension, build-and-release dynamics — no jazz extensions.',
    keys: [
      { pc: 4, major: false, w: 2 }, { pc: 7, major: true, w: 2 }, { pc: 9, major: false, w: 2 },
      { pc: 2, major: true, w: 1 }, { pc: 0, major: true, w: 1 },
    ],
    bpm: [96, 124],
    qualityWeights: [
      { q: 'min', w: 3 }, { q: 'maj', w: 3 }, { q: 'sus', w: 2 }, { q: '7', w: 1 }, { q: 'maj6', w: 1 },
    ],
    rootSteps: [
      { step: -2, w: 4 }, { step: 0, w: 3 }, { step: -5, w: 2 }, { step: 5, w: 2 }, { step: -7, w: 1 },
    ],
    archetypes: [
      // i - bVII - i modal drone
      [
        { off: 0, q: 'min' }, { off: -2, q: 'maj' }, { off: 0, q: 'min' }, { off: -2, q: 'sus' },
      ],
      // mixolydian I - bVII - IV
      [
        { off: 0, q: 'maj' }, { off: -2, q: 'maj' }, { off: 5, q: 'maj' }, { off: 0, q: 'maj' },
      ],
      // minor drone with a chromatic drop for menace
      [
        { off: 0, q: 'min' }, { off: 0, q: 'min' }, { off: -1, q: 'min' }, { off: 0, q: 'min' },
      ],
    ],
    voicing: { lo: 52, hi: 79, n: 3 }, // open triads/fifths, few notes, wide
    bassOctave: 2,
    signature: { staticVampChance: 0.35, holdBarChance: 0.4, drumDensity: 0.55 },
  },
};

export const GROOVES: Record<StyleId, Groove> = {
  'steely-dan': {
    // half-time-feel pocket: kick 1&3, snare on 3 (beat 2), swung-ish hat eighths
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
  },
  'jasper-ballad': {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  'dangelo-glasper': {
    // sparse, behind-the-beat; snare cross-stick-ish on 2&4, airy hat
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  },
  airplane: {
    // driving rock 8ths, snare backbeat
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
};

export function getLexicon(style: StyleId): StyleLexicon {
  const lx = STYLE_LEXICONS[style];
  if (!lx) throw new Error(`unknown style: ${style}`);
  return lx;
}
