/**
 * SoundLab `.seq` encoder (ncsoundlab-mpc-sequence v2).
 *
 * Honest capability note: a SoundLab `.seq` carries ONE pattern's step rows
 * (the importer replicates them onto patterns A–D) and each cell is a single
 * monophonic note on a layer whose VOICE must already exist in your kit. So
 * `.seq` cannot carry a multi-bar chord progression — it expresses a playable
 * 1-bar "pocket" that chains to the requested bar count. The full harmonic
 * arrangement is delivered by the sibling `.mid` (DAW) file.
 *
 * FIDELITY: the pocket is DERIVED from the realized `track` (bar 0 of its real
 * events), not a hardcoded groove — drums/velocity/duration come from the same
 * NoteEvents the `.mid` writes. Because a SoundLab cell is monophonic per layer,
 * each distinct chord voice is placed on its own `keys<N>` layer (mirroring the
 * piece emitter in `soundlab.ts`) so the voicing is preserved rather than
 * collapsed to one note.
 */

import type { NoteEvent, Track } from '../types.js';

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
/** Recourse PPQ is 480 → 16 steps per 4/4 bar = 120 ticks/step. */
const STEP_TICKS = 120;
const BAR_TICKS = 4 * 480;
/** GM drum notes. */
const GM = { kick: 36, snare: 38, hat: 42, openHat: 46 };

function emptyRow(): SeqCell[] {
  return Array.from({ length: STEPS }, () => ({ on: false }));
}

function stepIndex(tick: number): number {
  return Math.max(0, Math.min(STEPS - 1, Math.floor(tick / STEP_TICKS)));
}

function durSteps(dur: number): number {
  return Math.max(1, Math.min(STEPS, Math.round(dur / STEP_TICKS)));
}

/** Collapse a monophonic part's bar-0 events onto 16 steps (louder wins a step). */
function putMono(row: SeqCell[], events: NoteEvent[]): void {
  for (const e of events) {
    const s = stepIndex(e.tick);
    const cell: SeqCell = { on: true, note: e.pitch, velocity: Math.round(e.velocity), duration: durSteps(e.dur) };
    if (!row[s].on || (row[s].velocity ?? 0) < (cell.velocity ?? 0)) row[s] = cell;
  }
}

/** Encode a realized track as a SoundLab `.seq` 1-bar pocket (chained `bars`×). */
export function encodeToSeq(track: Track): SeqV2 {
  const bar0 = track.events.filter((e) => e.tick >= 0 && e.tick < BAR_TICKS);
  const pattern: Record<string, SeqCell[]> = {};

  pattern.kick = emptyRow();
  putMono(pattern.kick, bar0.filter((e) => e.part === 'drums' && e.drum === GM.kick));
  pattern.snare = emptyRow();
  putMono(pattern.snare, bar0.filter((e) => e.part === 'drums' && e.drum === GM.snare));
  pattern.hat = emptyRow();
  putMono(pattern.hat, bar0.filter((e) => e.part === 'drums' && (e.drum === GM.hat || e.drum === GM.openHat)));

  // Keys: one layer per distinct chord voice (monophonic cells per layer).
  const keyEvents = bar0.filter((e) => e.part === 'keys');
  const voices = [...new Set(keyEvents.map((e) => e.pitch))].sort((a, b) => a - b);
  if (voices.length === 0) {
    pattern.keys = emptyRow();
  } else {
    voices.forEach((pitch, i) => {
      const row = emptyRow();
      putMono(row, keyEvents.filter((e) => e.pitch === pitch));
      pattern[`keys${i}`] = row;
    });
  }

  pattern.bass = emptyRow();
  putMono(pattern.bass, bar0.filter((e) => e.part === 'bass'));
  pattern.lead = emptyRow();
  putMono(pattern.lead, bar0.filter((e) => e.part === 'lead'));

  const order: string[] = [];
  for (let i = 0; i < track.bars; i++) order.push('A'); // 1-bar pocket repeated

  return {
    format: 'ncsoundlab-mpc-sequence',
    version: 2,
    bpm: track.bpm,
    timeSignature: [4, 4],
    stepLength: 16,
    swing: 0,
    steps: STEPS,
    ppq: 96,
    pattern,
    songChain: { order },
  };
}

export function seqToJson(v: SeqV2): string {
  return JSON.stringify(v, null, 2);
}
