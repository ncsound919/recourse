/**
 * Recourse Composer — public entry point.
 * compose(brief) -> a realized Track; then encode to .mid (DAW) and/or SoundLab
 * .seq and write to disk.
 */
import type { ComposeBrief, Track } from './types.js';
import { compose, listStyles } from './composer.js';
import { encodeToSeq, seqToJson, type SeqV2 } from './encode/seq.js';
import { toMidiBytes } from './encode/midi.js';
import { pcName } from './theory.js';

export { compose, listStyles } from './composer.js';
export { toMidiBytes } from './encode/midi.js';
export { encodeToSeq, seqToJson } from './encode/seq.js';
export type { ComposeBrief, Track, Chord, NoteEvent, StyleId } from './types.js';
export { STYLE_LEXICONS, GROOVES } from './lexicons.js';

export interface ComposeOutcome {
  track: Track;
  keyName: string;
  bpm: number;
  bars: number;
  chordLabels: string[];
  styles: string[];
  midi?: { bytes: number };
  seq?: SeqV2;
}

export function composeToOutcome(brief: ComposeBrief, emit: { midi?: boolean; seq?: boolean } = { midi: true, seq: true }): ComposeOutcome {
  const track = compose(brief);
  const keyName = pcName(track.key) + (track.major ? '' : 'm');
  const chordLabels = track.chords.map((c) => `${pcName(c.rootPc)}${c.quality}`);
  const out: ComposeOutcome = { track, keyName, bpm: track.bpm, bars: track.bars, chordLabels, styles: listStyles() };
  if (emit.midi) out.midi = { bytes: toMidiBytes(track).byteLength };
  if (emit.seq) out.seq = encodeToSeq(track);
  return out;
}

/** Deterministic, human-summary markdown for a composed track. */
export function summarizeTrack(out: ComposeOutcome): string {
  const t = out.track;
  const L: string[] = [];
  L.push(`# ${t.title}`);
  L.push('');
  L.push(`- Style: ${t.style}`);
  L.push(`- Key: ${out.keyName}  |  BPM: ${t.bpm}  |  ${t.bars}-bar loop  |  seed ${t.seed}`);
  L.push(`- Chord progression: ${out.chordLabels.join('  ')}`);
  L.push(`- Events: ${t.events.length} (keys/bass/drums/lead)`);
  if (out.midi) L.push(`- MIDI: ${out.midi.bytes} bytes (DAW-ready .mid)`);
  if (out.seq) L.push(`- SoundLab .seq layers: ${Object.keys(out.seq.pattern).join(', ')} (needs those layer voices in your kit)`);
  return L.join('\n') + '\n';
}
