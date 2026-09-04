/**
 * SoundLab `.seq` encoder (ncsoundlab-mpc-sequence v2).
 *
 * Honest capability note: a SoundLab `.seq` carries ONE pattern's step rows
 * (the importer replicates them onto patterns A–D) and each cell is a single
 * monophonic note on a layer whose VOICE must already exist in your kit. So
 * `.seq` cannot carry a multi-bar chord progression — it expresses a playable
 * 1-bar "pocket" (head chord + groove) that chains to the requested bar count
 * and voices with whatever pitched layer(s) you name (bass/keys/lead + drums).
 * The full harmonic arrangement is delivered by the sibling `.mid` (DAW) file.
 *
 * Layer ids are conventional; a `.seq` only sounds for layers you already have
 * (or remap the rows to). This is documented, not hidden.
 */

import type { Chord, Track } from '../types.js';
import { GROOVES } from '../lexicons.js';
import { CHORD_TONES } from '../theory.js';

export interface SeqCell {
  on: boolean;
  note?: number;
  velocity?: number;
  duration?: number;
}

export type SeqV2 = {
  format: 'ncsoundlab-mpc-sequence';
  version: 2;
  bpm: number;
  timeSignature: [number, number];
  stepLength: 16 | 32;
  swing: number;
  steps: number;
  ppq: number;
  pattern: Record<string, SeqCell[]>;
  songChain: { order: string[] };
};

const STEPS = 16;

function emptyRow(): SeqCell[] {
  return Array.from({ length: STEPS }, () => ({ on: false }));
}
function put(row: SeqCell[], step: number, note: number, dur: number, vel: number): void {
  row[step] = { on: true, note, velocity: vel, duration: dur };
}

/** A 16-step single-bar voicing of one chord on pitched layers. */
function harmonicRow(chord: Chord, rootOctave: number): { bass: SeqCell[]; keys: SeqCell[]; lead: SeqCell[] } {
  const bass = emptyRow();
  const keys = emptyRow();
  const lead = emptyRow();
  const rootMidi = (rootOctave + 1) * 12 + chord.rootPc;
  put(bass, 0, rootMidi, 14, 100);
  put(bass, 8, rootMidi, 3, 84); // eighth pulse
  // Roll the chord tones across the bar (monophonic arpeggio).
  const tones = toneRow(chord, 4);
  const pick = [0, 2, 1, 3, 0, 1, 2, 0]; // simple repeated contour over 16 steps (every 2nd step)
  for (let s = 0; s < 16; s += 2) {
    const idx = pick[(s / 2) % pick.length] % tones.length;
    put(keys, s, tones[idx], 2, 78);
  }
  // Light top hook on chord tones.
  put(lead, 2, tones[tones.length - 1], 2, 92);
  put(lead, 10, tones[0] + 12, 3, 90);
  return { bass, keys, lead };
}

function toneRow(chord: Chord, octave: number): number[] {
  const base = (octave + 1) * 12 + chord.rootPc;
  return CHORD_TONES[chord.quality].map((t) => base + t);
}

/** 16-step groove rows for the drum layers (GM notes). */
function drumRows(): Record<string, SeqCell[]> {
  const out: Record<string, SeqCell[]> = {};
  out.kick = emptyRow();
  out.snare = emptyRow();
  out.hat = emptyRow();
  return out; // filled by caller using the style groove arrays
}

/**
 * Encode a realized track as a SoundLab `.seq` 1-bar pocket. `bars` controls the
 * chain length (the pocket repeats that many times). Returns the JSON object the
 * `.seq` file is written from.
 */
export function encodeToSeq(track: Track): SeqV2 {
  const headChord = track.chords[0];
  const style = track.style;
  const groove = GROOVES[style];
  const rootOctave = 2;

  const layers: Record<string, SeqCell[]> = {};
  // Drums
  layers.kick = emptyRow();
  layers.snare = emptyRow();
  layers.hat = emptyRow();
  groove.kick.forEach((on, s) => { if (on) put(layers.kick, s, 36, 1, 100); });
  groove.snare.forEach((on, s) => { if (on) put(layers.snare, s, 38, 1, 100); });
  groove.hat.forEach((on, s) => { if (on) put(layers.hat, s, s % 4 === 2 ? 46 : 42, 1, 70); });
  // Harmony (head chord) + drums on conventional ids.
  const h = harmonicRow(headChord, rootOctave);
  layers.bass = h.bass;
  layers.keys = h.keys;
  layers.lead = h.lead;

  const order: string[] = [];
  for (let i = 0; i < track.bars; i++) order.push('A'); // 1-bar pocket repeated

  return {
    format: 'ncsoundlab-mpc-sequence',
    version: 2,
    bpm: track.bpm,
    timeSignature: [4, 4],
    stepLength: 16,
    swing: 0,
    steps: 16,
    ppq: 96,
    pattern: layers,
    songChain: { order },
  };
}

export function seqToJson(v: SeqV2): string {
  return JSON.stringify(v, null, 2);
}
