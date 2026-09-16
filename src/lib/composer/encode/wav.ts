/**
 * Offline WAV renderer — turns a realized Track into real audio, with no DAW
 * and no network. This is the audio actuator: the composer's output is no
 * longer only a symbolic .mid/.seq; it is a playable PCM stream (and per-part
 * stems) that can be served, downloaded, or broadcast.
 *
 * Deterministic: the synth uses a seeded PRNG for noise, so the same Track
 * always renders bit-identical PCM. Pure — no wall clock, no Math.random.
 */
import type { NoteEvent, PartName, Track } from '../types.js';
import { PPQ } from '../theory.js';

export interface WavRenderOptions {
  sampleRate?: number;
  /** Hard cap on rendered length (guards pathological tracks). */
  maxSeconds?: number;
}

const DEFAULT_SR = 22050;
const TWO_PI = Math.PI * 2;

/** Per-part mix gain (drums/keys forward; strings/bgvox as bed). */
const PART_GAIN: Record<PartName, number> = {
  drums: 0.9, keys: 0.5, bass: 0.6, lead: 0.42, horns: 0.32, bgvox: 0.28, strings: 0.22,
};
/** Per-part stereo pan in [-1, 1]. */
const PART_PAN: Record<PartName, number> = {
  drums: 0, keys: -0.15, bass: 0, lead: 0.35, horns: 0.5, bgvox: -0.5, strings: 0.2,
};

interface Voice { wave: 'sine' | 'noise'; freq: number; decay: number; gain: number; seed: number }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function voiceFor(ev: NoteEvent): Voice {
  if (ev.part === 'drums') {
    const drum = ev.drum ?? ev.pitch;
    if (drum === 36) return { wave: 'sine', freq: 60, decay: 0.18, gain: 1, seed: ev.tick + 1 };
    if (drum === 42 || drum === 44) return { wave: 'noise', freq: 9000, decay: 0.05, gain: 0.35, seed: ev.tick + 2 };
    return { wave: 'noise', freq: 3000, decay: 0.12, gain: 0.6, seed: ev.tick + 3 };
  }
  const freq = 440 * Math.pow(2, (ev.pitch - 69) / 12);
  const bright = ev.part === 'bass' ? 0.6 : 1;
  return { wave: 'sine', freq, decay: 0.6 * bright, gain: 1, seed: ev.tick + ev.pitch };
}

function addEvent(
  left: Float32Array,
  right: Float32Array,
  ev: NoteEvent,
  secondsPerTick: number,
  sampleRate: number,
): void {
  const start = Math.max(0, Math.round(ev.tick * secondsPerTick * sampleRate));
  const durSec = Math.max(0.02, ev.dur * secondsPerTick);
  const count = Math.min(left.length - start, Math.round(durSec * sampleRate));
  if (count <= 0) return;
  const v = voiceFor(ev);
  const gain = (PART_GAIN[ev.part] ?? 0.4) * Math.max(0, Math.min(1, ev.velocity / 127)) * v.gain * 0.35;
  const pan = PART_PAN[ev.part] ?? 0;
  const gl = gain * Math.sqrt((1 - pan) / 2);
  const gr = gain * Math.sqrt((1 + pan) / 2);
  const rnd = v.wave === 'noise' ? mulberry32(v.seed) : null;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t / v.decay);
    const s = v.wave === 'sine' ? Math.sin(TWO_PI * v.freq * t) : (rnd!() * 2 - 1);
    const idx = start + i;
    left[idx] += s * env * gl;
    right[idx] += s * env * gr;
  }
}

/** Render a 16-bit PCM stereo WAV from a note-event stream. */
function renderEventsToWav(
  events: NoteEvent[],
  opts: { bpm: number; lastTickHint: number; sampleRate: number; maxSeconds: number },
): Uint8Array {
  const { sampleRate, maxSeconds } = opts;
  const secondsPerTick = (60 / Math.max(20, opts.bpm)) / PPQ;
  const natural = Math.max(0, opts.lastTickHint) * secondsPerTick + 0.5;
  const n = Math.max(1, Math.round(Math.min(natural, maxSeconds) * sampleRate));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (const ev of events) addEvent(left, right, ev, secondsPerTick, sampleRate);
  return encodeWav16(left, right, sampleRate);
}

function encodeWav16(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const frames = Math.min(left.length, right.length);
  const dataBytes = frames * 2 * 2;
  const out = new Uint8Array(44 + dataBytes);
  const dv = new DataView(out.buffer);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 2, true); // stereo
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2 * 2, true); // byte rate
  dv.setUint16(32, 4, true); // block align
  dv.setUint16(34, 16, true); // bits
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    dv.setInt16(o, (l < 0 ? l * 0x8000 : l * 0x7fff) | 0, true); o += 2;
    dv.setInt16(o, (r < 0 ? r * 0x8000 : r * 0x7fff) | 0, true); o += 2;
  }
  return out;
}

function optsWithDefaults(opts: WavRenderOptions): { sampleRate: number; maxSeconds: number } {
  return {
    sampleRate: Math.max(8000, opts.sampleRate ?? DEFAULT_SR),
    maxSeconds: Math.max(1, opts.maxSeconds ?? 600),
  };
}

function lastTickOf(events: NoteEvent[]): number {
  let last = 0;
  for (const ev of events) last = Math.max(last, ev.tick + ev.dur);
  return last;
}

/** Render the full track to a stereo WAV. */
export function renderTrackToWav(track: Track, opts: WavRenderOptions = {}): Uint8Array {
  const { sampleRate, maxSeconds } = optsWithDefaults(opts);
  return renderEventsToWav(track.events, { bpm: track.bpm, lastTickHint: lastTickOf(track.events), sampleRate, maxSeconds });
}

/** Render one part (stem) to a stereo WAV. */
export function renderStemToWav(track: Track, part: PartName, opts: WavRenderOptions = {}): Uint8Array {
  const { sampleRate, maxSeconds } = optsWithDefaults(opts);
  const events = track.events.filter((e) => e.part === part);
  return renderEventsToWav(events, { bpm: track.bpm, lastTickHint: lastTickOf(track.events), sampleRate, maxSeconds });
}

/** Render every part that sounds in the track as a named stem. */
export function renderStems(track: Track, opts: WavRenderOptions = {}): Array<{ part: PartName; wav: Uint8Array }> {
  const parts = Array.from(new Set(track.events.map((e) => e.part)));
  return parts.map((part) => ({ part, wav: renderStemToWav(track, part, opts) }));
}

export async function writeWavFile(bytes: Uint8Array, file: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.writeFile(file, bytes);
}
