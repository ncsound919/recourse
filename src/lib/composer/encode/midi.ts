/**
 * Standard MIDI File encoder (format 0, single track, PPQ=480).
 * Converts a realized Track's NoteEvents into a spec-valid .mid byte stream
 * that any DAW imports. Tempo + 4/4 time signature + per-part program channels.
 */

import type { PartName, Track } from '../types.js';
import { PPQ, usPerQuarter } from '../theory.js';

const CHANNEL: Record<PartName, number> = { keys: 0, bass: 1, lead: 2, horns: 3, bgvox: 4, strings: 5, drums: 9 };

function vlq(n: number): number[] {
  const bytes: number[] = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

interface Raw { abs: number; bytes: number[] }

export function toMidiBytes(track: Track): Uint8Array {
  const raws: Raw[] = [];
  // Tempo + time signature at tick 0.
  raws.push({ abs: 0, bytes: [0xff, 0x51, 0x03].concat(int24(usPerQuarter(track.bpm))) });
  raws.push({ abs: 0, bytes: [0xff, 0x58, 0x04, 4, 2, 0x18, 8] });

  for (const ev of track.events) {
    const ch = CHANNEL[ev.part] ?? 0;
    raws.push({ abs: ev.tick, bytes: [0x90 | ch, ev.pitch, clamp7(ev.velocity)] });
    raws.push({ abs: ev.tick + ev.dur, bytes: [0x80 | ch, ev.pitch, 0x40] });
  }
  raws.sort((a, b) => a.abs - b.abs);

  const body: number[] = [];
  let last = 0;
  for (const r of raws) {
    const delta = Math.max(0, r.abs - last);
    body.push(...vlq(delta), ...r.bytes);
    last = r.abs;
  }
  // End of track.
  body.push(...vlq(0), 0xff, 0x2f, 0x00);

  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff]; // MThd, format0, 1 track, division
  const len = body.length;
  const trackHead = [0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]; // MTrk
  const out = new Uint8Array(header.length + trackHead.length + body.length);
  out.set([...header, ...trackHead, ...body]);
  return out;
}

function int24(n: number): number[] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function clamp7(n: number): number {
  return Math.max(1, Math.min(127, Math.round(n)));
}

export function writeMidiFile(track: Track, file: string): Promise<void> {
  return import('node:fs/promises').then(async (fs) => {
    await fs.writeFile(file, toMidiBytes(track));
  });
}
