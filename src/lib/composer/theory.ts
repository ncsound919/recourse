/**
 * Composer theory — note names, pitch-class math, chord-tone sets, voicings.
 * Self-contained (no soundlab dependency) so the Recourse engine can turn a
 * chord sequence into sounding notes for both the MIDI and SoundLab encoders.
 */

import type { ChordQuality } from './types.js';

export const NOTE_PCS: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

const SHARP: string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pcName(pc: number): string {
  return SHARP[((pc % 12) + 12) % 12];
}

/** Pitch classes (semitones above root) that define each quality. Tones are
 *  given within one octave; voicing spreads them. */
export const CHORD_TONES: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  aug: [0, 4, 8],
  dim7: [0, 3, 6, 9],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 14],
  '13': [0, 4, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7#11': [0, 4, 7, 10, 18],
  '7b13': [0, 4, 7, 10, 20],
  '7sus': [0, 5, 7, 10],
  '6/9': [0, 4, 7, 9, 14],
  'maj6': [0, 4, 7, 9],
  'maj7': [0, 4, 7, 11],
  'maj9': [0, 4, 7, 11, 14],
  'maj7#11': [0, 4, 7, 11, 18],
  'mu': [0, 2, 4, 7], // add9: keeps the 3rd, adds 2 (Steely Dan "mu" chord)
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  mM7: [0, 3, 7, 11],
  sus: [0, 5, 7],
};

/** Chord tones as absolute MIDI in a given octave (root sits in that octave). */
export function chordTonesMidi(rootPc: number, quality: ChordQuality, octave = 4): number[] {
  const tones = CHORD_TONES[quality];
  const base = (octave + 1) * 12 + rootPc; // root MIDI for pc at this octave (C4 = 60 = (4+1)*12)
  return tones.map((t) => base + t);
}

/**
 * Voice a chord into a playable spread voicing ascending between loMidi..hiMidi.
 * Keeps ~4..6 notes, spreads the top color tones so they are audible without
 * clashing in the bass (i.e. no 2nd above the bass unless it is the mu color).
 */
export function voiceChord(rootPc: number, quality: ChordQuality, loMidi = 55, hiMidi = 84, n = 5): number[] {
  const tones = CHORD_TONES[quality];
  const notes: number[] = [];
  // Start the root an octave or more below loMidi.
  let cursor = rootPc;
  while (cursor < loMidi - 12) cursor += 12;
  // We want n distinct chord tones spread. Walk quality tones ascending across
  // octaves, dropping the very first octave to keep the sound open.
  let idx = 0;
  let placed = 0;
  let current = cursor;
  const usedTones = tones.slice();
  let guard = 0;
  while (placed < n && guard < 200) {
    guard++;
    const t = usedTones[idx % usedTones.length];
    // absolute note for this tone above `current`
    const note = current + t;
    // accept while under hiMidi
    if (note >= loMidi && note <= hiMidi) {
      notes.push(note);
      placed++;
    }
    idx++;
    if (idx % usedTones.length === 0) current += 12; // next octave
    if (note > hiMidi + 24) break;
  }
  return dedupeAsc(notes);
}

function dedupeAsc(notes: number[]): number[] {
  const sorted = [...notes].sort((a, b) => a - b);
  const out: number[] = [];
  for (const n of sorted) if (out[out.length - 1] !== n) out.push(n);
  return out;
}

/** Bass note for a chord: root in a low register, honoring passing movement. */
export function bassMidi(rootPc: number, octave = 2): number {
  return (octave + 1) * 12 + rootPc;
}

function firstMidiAtOrAbove(pc: number, target: number): number {
  const pc12 = ((pc % 12) + 12) % 12;
  let m = Math.floor(target / 12) * 12 + pc12;
  if (m < target) m += 12;
  return m;
}

function dedupeAscLocal(notes: number[]): number[] {
  const sorted = [...notes].sort((a, b) => a - b);
  const out: number[] = [];
  for (const n of sorted) if (out[out.length - 1] !== n) out.push(n);
  return out;
}

/**
 * Steely Dan "mu" voicing. Rule (documented, Becker & Fagen): a major chord with
 * an ADDED 2nd, voiced so the 2nd and 3rd sit as an adjacent WHOLE TONE — NOT a
 * sus (the 3rd is kept) and NOT a "jazz chord." This explicit construction keeps
 * the add2 + 3rd adjacent (2 semitones apart, same octave) rather than letting a
 * generic spread separate them across octaves.
 */
export function voiceMuChord(rootPc: number, lo = 55, hi = 88): number[] {
  const thirdPc = ((rootPc + 4) % 12 + 12) % 12;
  const third = firstMidiAtOrAbove(thirdPc, lo + 6);
  const two = third - 2; // added 2nd, a whole tone below the 3rd — same octave => adjacent
  const root = firstMidiAtOrAbove(rootPc, lo);
  const fifthPc = ((rootPc + 7) % 12 + 12) % 12;
  const notes = [root, two, third];
  let fifth = firstMidiAtOrAbove(fifthPc, third + 1);
  while (fifth <= third) fifth += 12;
  if (fifth <= hi) notes.push(fifth);
  return dedupeAscLocal(notes.filter((n) => n >= lo && n <= hi || n === two || n === third));
}

/**
 * Rootless voicing for dominant/altered chords: the bass owns the root, the keys
 * layer voices only the upper-structure chord tones (so 9th/#9/#11/b13 extensions
 * ring clearly). Returns ascending notes in [lo, hi].
 */
export function voiceRootless(rootPc: number, quality: ChordQuality, lo = 55, hi = 88): number[] {
  const tones = (CHORD_TONES[quality] ?? []).filter((t) => t % 12 !== 0); // drop the root
  if (tones.length === 0) return voiceChord(rootPc, quality, lo, hi, 3);
  const notes: number[] = [];
  for (const t of tones) {
    let n = firstMidiAtOrAbove((rootPc + t) % 12, lo);
    if (n > hi) n -= 12;
    if (n >= lo && n <= hi) notes.push(n);
  }
  return dedupeAscLocal(notes);
}

/** True for dominant/altered-dominant qualities suited to rootless voicing. */
export const DOMINANT_QUALITIES = new Set<ChordQuality>(['7', '9', '13', '7b9', '7#9', '7#11', '7b13', '7sus']);


/** Cents/MIDI utils used by encoders. */
export const PPQ = 480;
export function beatsToTicks(beats: number): number {
  return Math.round(beats * PPQ);
}
export function barTicks(bpm: number): number {
  return Math.round(4 * PPQ);
}
/** MIDI microseconds-per-quarter for a tempo (SMF tempo meta). */
export function usPerQuarter(bpm: number): number {
  return Math.round(60000000 / bpm);
}
