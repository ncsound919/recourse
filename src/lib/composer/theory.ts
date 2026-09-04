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
