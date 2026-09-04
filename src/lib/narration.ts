/**
 * Narration engine — event-driven spoken telemetry with verbosity levels.
 *
 * Layers on top of `voice.ts` (which owns the single master mute + the Web
 * Speech / Web Audio primitives). This module decides WHAT is worth saying and
 * WHEN, so a 24/7 tick stream never becomes a wall of noise:
 *
 *   quiet   -> critical + major events only
 *   normal  -> + minor events (default)
 *   verbose -> + generation milestones
 *
 * Every announcement carries a kind that maps to a verbosity floor and a
 * minimum inter-announcement gap (throttle) per kind. Announcements never
 * fabricate content — callers pass real, observed system state.
 */

import { isVoiceEnabled, speak, playChirp } from './voice';

export type NarrationLevel = 'quiet' | 'normal' | 'verbose';
export type NarrationKind = 'critical' | 'major' | 'minor' | 'milestone';

const LEVEL_KEY = 'recourse_narration_level';
const MIN_GAP_MS: Record<NarrationKind, number> = {
  critical: 1500,
  major: 2000,
  minor: 8000,
  milestone: 45000
};

let level: NarrationLevel = 'normal';
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem(LEVEL_KEY);
    if (stored === 'quiet' || stored === 'normal' || stored === 'verbose') level = stored;
  } catch {
    /* keep default */
  }
}

const lastSpokenAt: Record<NarrationKind, number> = {
  critical: 0,
  major: 0,
  minor: 0,
  milestone: 0
};

export function getNarrationLevel(): NarrationLevel {
  return level;
}

export function setNarrationLevel(next: NarrationLevel): void {
  level = next;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LEVEL_KEY, next);
    } catch {
      /* ignore */
    }
  }
}

export function narrationLevelLabel(l: NarrationLevel): string {
  switch (l) {
    case 'quiet':
      return 'QUIET';
    case 'verbose':
      return 'VERBOSE';
    default:
      return 'NORMAL';
  }
}

function kindAllowedAt(kind: NarrationKind, l: NarrationLevel): boolean {
  switch (l) {
    case 'quiet':
      return kind === 'critical' || kind === 'major';
    case 'verbose':
      return true;
    default:
      return kind !== 'milestone';
  }
}

/**
 * Speak an observed event. Respects the master voice mute (from voice.ts) and
 * the current narration level + per-kind throttle. Use `force` for
 * user-initiated read-alouds that should speak even when muted.
 */
export function announce(
  kind: NarrationKind,
  text: string,
  opts: { force?: boolean; chirp?: 'success' | 'failure' | 'synthesize' | 'loop_tick' | 'alert' } = {}
): void {
  if (!isVoiceEnabled() && !opts.force) return;
  if (!opts.force && !kindAllowedAt(kind, level)) return;

  const now = Date.now();
  if (!opts.force) {
    const last = lastSpokenAt[kind] || 0;
    if (now - last < MIN_GAP_MS[kind]) return;
    lastSpokenAt[kind] = now;
  }

  const chirp = opts.chirp ?? defaultChirpFor(kind);
  playChirp(chirp);
  speak(text, opts.force ?? false);
}

function defaultChirpFor(kind: NarrationKind): 'success' | 'failure' | 'synthesize' | 'loop_tick' | 'alert' {
  switch (kind) {
    case 'critical':
      return 'alert';
    case 'major':
      return 'success';
    case 'milestone':
      return 'synthesize';
    default:
      return 'loop_tick';
  }
}

/** Explicit one-shot read-aloud (e.g. the insight panel "SPEAK BRIEF"). */
export function speakBrief(text: string): void {
  if (!text.trim()) return;
  speak(text, true);
}
