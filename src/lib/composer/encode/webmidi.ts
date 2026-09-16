/**
 * Web MIDI hardware output — send a realized Track straight to a connected
 * MIDI device from the browser. The tick→message conversion is pure and
 * unit-testable; the actual `requestMIDIAccess` send is browser-only and
 * fails honestly (never pretends to have played) when unsupported.
 */
import type { PartName, Track } from '../types.js';
import { PPQ } from '../theory.js';

const CHANNEL: Record<PartName, number> = { keys: 0, bass: 1, lead: 2, horns: 3, bgvox: 4, strings: 5, drums: 9 };

export interface MidiMessage {
  /** Milliseconds from track start. */
  timeMs: number;
  /** Stable ordering for equal timestamps: note-offs before note-ons. */
  order: number;
  data: number[];
}

/** Convert a Track's events into scheduled MIDI messages (deterministic). */
export function trackToMidiMessages(track: Track): MidiMessage[] {
  const msPerTick = (60_000 / Math.max(20, track.bpm)) / PPQ;
  const msgs: MidiMessage[] = [];
  for (const ev of track.events) {
    const ch = CHANNEL[ev.part] ?? 0;
    const vel = Math.max(1, Math.min(127, Math.round(ev.velocity)));
    msgs.push({ timeMs: ev.tick * msPerTick, order: 1, data: [0x90 | ch, ev.pitch, vel] });
    msgs.push({ timeMs: (ev.tick + ev.dur) * msPerTick, order: 0, data: [0x80 | ch, ev.pitch, 0x40] });
  }
  return msgs.sort((a, b) => a.timeMs - b.timeMs || a.order - b.order);
}

export function isWebMidiAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as any).requestMIDIAccess === 'function';
}

export interface WebMidiSendResult {
  ok: boolean;
  outputName?: string;
  sent?: number;
  error?: string;
}

/**
 * Send the track to a Web MIDI output. Prefers an output whose name contains
 * `preferName`, else the first available. Honest failure when Web MIDI is
 * unavailable or permission is denied.
 */
export async function sendTrackToWebMidi(
  track: Track,
  opts: { outputId?: string; preferName?: string } = {},
): Promise<WebMidiSendResult> {
  if (!isWebMidiAvailable()) {
    return { ok: false, error: 'Web MIDI is not available in this environment' };
  }
  try {
    const access = await (navigator as any).requestMIDIAccess();
    const outputs: Map<string, any> = access.outputs;
    const list = Array.from(outputs.values()) as any[];
    if (list.length === 0) return { ok: false, error: 'no MIDI output devices found' };
    const chosen =
      (opts.outputId && outputs.get(opts.outputId)) ||
      (opts.preferName && list.find((o) => String(o.name || '').toLowerCase().includes(opts.preferName!.toLowerCase()))) ||
      list[0];
    const messages = trackToMidiMessages(track);
    const t0 = performance.now();
    for (const m of messages) chosen.send(m.data, t0 + m.timeMs);
    return { ok: true, outputName: String(chosen.name ?? 'output'), sent: messages.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
