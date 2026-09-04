/**
 * SoundLab piece emitter — turn a realized Track into a self-contained SoundLab
 * "piece" that SoundLab's own synths + pattern-chain can play.
 *
 * HONEST PLATFORM FACTS encoded here (SoundLab v1.1.0):
 *  - SoundLab step cells are monophonic per layer per step, and song mode chains
 *    ≤4 one/two-bar patterns. So a full multi-bar chord progression does NOT map
 *    to SoundLab playback. What maps cleanly is a 1-bar "pocket": the head chord
 *    spelled across SIMULTANEOUS synth VOICE layers (one per chord tone), a bass
 *    layer, a lead layer, and synth-percussion drum layers — chained for the
 *    requested bar count. The full harmony still lives in the sibling `.mid`.
 *  - SoundLab has no built-in drum voices and its arranger's live multi-bar
 *    playback is unwired; the bridge must assign real SynthSettings per `role`.
 *
 * This module only emits the CONTRACT (chord-correct, deterministic, Node-tested).
 * Hydrating it into SoundLab SoundLayer/SynthSettings objects is the bridge's job.
 */

import type { Track } from './types.js';
import { CHORD_TONES, pcName } from './theory.js';
import { GROOVES } from './lexicons.js';

export type LayerRole =
  | 'keysVoice' // one simultaneous chord tone of the head chord
  | 'bass'
  | 'lead'
  | 'kick'
  | 'snare'
  | 'hat';

export interface PieceLayer {
  id: string;
  name: string;
  role: LayerRole;
  kind: 'synth';
  /** The bridge maps role -> real SoundLab SynthSettings; midi is the note to voice. */
  midi?: number;
}

export interface Cell {
  on: boolean;
  note?: number;
  duration?: number;
}

export interface RecoursePiece {
  format: 'recourse-soundlab-piece';
  version: 1;
  style: string;
  title: string;
  bpm: number;
  bars: number;
  headChord: { rootPc: number; quality: string; rootName: string };
  layers: PieceLayer[];
  /** A single 1-bar (16-step) pattern; rows keyed by layer id. */
  pattern: Record<string, Cell[]>;
  /** Repeat the pocket this many bars (song-chain length). */
  chainBars: number;
}

const GM = { kick: 36, snare: 38, hat: 42 };
const STEP = 120; // 16th in ticks

function emptyRow(): Cell[] {
  return Array.from({ length: 16 }, () => ({ on: false }));
}

/**
 * Build the SoundLab piece from a Track. Uses the head bar's REAL realized
 * voicing (the DP voice-leading output) so chord spelling is exact.
 */
export function encodeSoundlabPiece(track: Track): RecoursePiece {
  const barStart = 0;
  const barEnd = 16 * STEP;
  const keysVoices = [...new Set(
    track.events.filter((e) => e.part === 'keys' && e.tick >= barStart && e.tick < barEnd).map((e) => e.pitch),
  )].sort((a, b) => a - b);
  const bassEvents = track.events.filter((e) => e.part === 'bass' && e.tick >= barStart && e.tick < barEnd);
  const bassPitch = bassEvents.length ? bassEvents[0].pitch : undefined;
  const leadEvents = track.events.filter((e) => e.part === 'lead' && e.tick >= barStart && e.tick < barEnd);
  const head = track.chords[0];

  const layers: PieceLayer[] = [];
  const pattern: Record<string, Cell[]> = {};
  keysVoices.forEach((midi, i) => {
    const id = `keys${i}`;
    layers.push({ id, name: `Keys voice ${i + 1}`, role: 'keysVoice', kind: 'synth', midi });
    const row = emptyRow();
    row[0] = { on: true, note: midi, duration: 16 }; // whole-bar chord tone
    pattern[id] = row;
  });
  if (bassPitch != null) {
    const id = 'bass';
    layers.push({ id, name: 'Bass', role: 'bass', kind: 'synth', midi: bassPitch });
    const row = emptyRow();
    row[0] = { on: true, note: bassPitch, duration: 16 };
    row[8] = { on: true, note: bassPitch, duration: 2 };
    pattern[id] = row;
  }
  // Lead notes placed on their 16th steps.
  if (leadEvents.length) {
    const id = 'lead';
    layers.push({ id, name: 'Lead', role: 'lead', kind: 'synth' });
    const row = emptyRow();
    for (const e of leadEvents) {
      const s = Math.min(15, Math.floor(e.tick / STEP));
      if (!row[s].on) row[s] = { on: true, note: e.pitch, duration: Math.max(1, Math.round(e.dur / STEP)) };
    }
    pattern[id] = row;
  }
  // Synth-percussion drum layers from the style groove.
  const groove = GROOVES[track.style];
  const drums: Array<{ id: string; role: LayerRole; gm: number }> = [
    { id: 'kick', role: 'kick', gm: GM.kick },
    { id: 'snare', role: 'snare', gm: GM.snare },
    { id: 'hat', role: 'hat', gm: GM.hat },
  ];
  const grooveOf: Record<string, number[]> = { kick: groove.kick, snare: groove.snare, hat: groove.hat };
  for (const d of drums) {
    layers.push({ id: d.id, name: d.role, role: d.role, kind: 'synth' });
    const row = emptyRow();
    grooveOf[d.id].forEach((on, s) => {
      if (on) row[s] = { on: true, note: d.gm, duration: s % 4 === 2 && d.id === 'hat' ? 1 : 1 };
    });
    pattern[d.id] = row;
  }

  const rootName = pcName(head.rootPc);
  return {
    format: 'recourse-soundlab-piece',
    version: 1,
    style: track.style,
    title: track.title,
    bpm: track.bpm,
    bars: track.bars,
    headChord: { rootPc: head.rootPc, quality: head.quality, rootName },
    layers,
    pattern,
    chainBars: track.bars,
  };
}

const SHARP: string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Validate the piece is chord-correct: every keys-voice note is a tone of the
 *  head chord; bass is the head root. Returns problems[] (empty = valid). */
export function validatePiece(piece: RecoursePiece): string[] {
  const problems: string[] = [];
  const tonePcs = new Set(CHORD_TONES[piece.headChord.quality as keyof typeof CHORD_TONES]?.map((t) => ((piece.headChord.rootPc + t) % 12 + 12) % 12) ?? []);
  for (const layer of piece.layers) {
    const row = piece.pattern[layer.id] ?? [];
    if (layer.role === 'keysVoice') {
      for (const c of row) {
        if (c.on && c.note != null && !tonePcs.has(((c.note % 12) + 12) % 12)) {
          problems.push(`keys voice ${layer.id} note ${c.note} not a tone of ${piece.headChord.rootName}${piece.headChord.quality}`);
        }
      }
    }
    if (layer.role === 'bass') {
      for (const c of row) {
        if (c.on && c.note != null && ((c.note % 12) + 12) % 12 !== piece.headChord.rootPc) {
          problems.push(`bass note ${c.note} is not the root ${piece.headChord.rootPc}`);
        }
      }
    }
  }
  return problems;
}

export function pieceToJson(p: RecoursePiece): string {
  return JSON.stringify(p, null, 2);
}
