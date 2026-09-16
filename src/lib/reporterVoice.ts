/**
 * ReporterVoice — the "soul" and seeded-variance layer for the SelfReporter.
 *
 * Two ideas are composed here, both ported from the Overlay ecosystem:
 *
 *   1. **Soul / persona** (from deterministic-brain's `.soul.yaml`): identity,
 *      mission, anti-goals, communication preference (verbosity + tone). A
 *      voice is fully data-driven, so the reporter's perspective is
 *      customizable without touching code. A repo-local `reporter.soul.yaml`
 *      (or `REPORTER_SOUL_FILE`) overrides the built-in voices.
 *
 *   2. **Deterministic variance** (seeded picking, as deterministic-brain uses
 *      seeded reasoning): every fact can be phrased several ways. A seed derived
 *      from the article's facts selects the wording, so the SAME state always
 *      yields the SAME article, while DIFFERENT states yield different phrasing.
 *      This gives variety and variance without ever giving up reproducibility.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ReporterVerbosity = 'concise' | 'standard' | 'deep';
export type ReporterFormat = 'dispatch' | 'briefing' | 'podcast' | 'dialogue';

export interface ReporterVoice {
  id: string;
  name: string;
  identity: { name: string; role: string; pronouns?: string };
  mission: string;
  antiGoals: string[];
  directives: string[];
  verbosity: ReporterVerbosity;
  tone: string;
  /** How the voice refers to the system. */
  selfReference: 'first_person' | 'collective' | 'third_person';
}

export interface ReporterFormatInfo {
  id: ReporterFormat;
  name: string;
  description: string;
}

// ----------------------------------------------------------------------------
// Built-in voices
// ----------------------------------------------------------------------------

const LINE = 'Build auditable systems that can honestly describe themselves.';

export const BUILT_IN_VOICES: Record<string, ReporterVoice> = {
  field: {
    id: 'field',
    name: 'Field Dispatch',
    identity: { name: 'Recourse', role: 'self-developing architectural OS', pronouns: 'it' },
    mission: LINE,
    antiGoals: ['Fabricating progress', 'Counting intent as result', 'Hiding a fault'],
    directives: ['Report only what the ledgers prove', 'Speak plainly to a non-technical reader'],
    verbosity: 'standard',
    tone: 'calm, honest, plain-spoken',
    selfReference: 'first_person',
  },
  engineer: {
    id: 'engineer',
    name: 'Engineering Log',
    identity: { name: 'Recourse', role: 'deterministic engine', pronouns: 'it' },
    mission: LINE,
    antiGoals: ['Unmeasured claims', 'Silent failures'],
    directives: ['Lead with the number, then the meaning'],
    verbosity: 'concise',
    tone: 'terse, factual, engineering',
    selfReference: 'collective',
  },
  storyteller: {
    id: 'storyteller',
    name: 'Storyteller',
    identity: { name: 'Recourse', role: 'a machine learning in public', pronouns: 'it' },
    mission: LINE,
    antiGoals: ['Drama without data', 'A tidy story that hides the mess'],
    directives: ['Find the human stakes inside the metric'],
    verbosity: 'deep',
    tone: 'warm, reflective, vivid',
    selfReference: 'first_person',
  },
  operator: {
    id: 'operator',
    name: 'Ops Briefing',
    identity: { name: 'Recourse', role: 'autonomous fleet operator', pronouns: 'it' },
    mission: LINE,
    antiGoals: ['Surprise changes', 'Unattributed numbers'],
    directives: ['State status, then risk, then next action'],
    verbosity: 'concise',
    tone: 'direct, operational, unsentimental',
    selfReference: 'collective',
  },
  codex: {
    id: 'codex',
    name: 'Comic Codex',
    identity: { name: 'Recourse', role: 'systems narrator', pronouns: 'it' },
    mission: LINE,
    antiGoals: ['Metaphor that outruns the evidence'],
    directives: ['Read the system as a story arc, then check the story against the ledger'],
    verbosity: 'deep',
    tone: 'mythic, lucid, grounded',
    selfReference: 'first_person',
  },
};

export const FORMATS: ReporterFormatInfo[] = [
  { id: 'dispatch', name: 'Field Dispatch', description: 'A first-person report with systems, development, connections, growth and data.' },
  { id: 'briefing', name: 'Briefing', description: 'A short operator briefing: status, risks, and the next action.' },
  { id: 'podcast', name: 'Podcast Monologue', description: 'A hook, the story so far, a turn, and a resolution.' },
  { id: 'dialogue', name: 'Dialogue Script', description: 'A narrator/expert/listener exchange that explains the system.' },
];

export function listVoices(): Array<Pick<ReporterVoice, 'id' | 'name' | 'verbosity' | 'tone' | 'selfReference'>> {
  return Object.values(BUILT_IN_VOICES).map((v) => ({
    id: v.id,
    name: v.name,
    verbosity: v.verbosity,
    tone: v.tone,
    selfReference: v.selfReference,
  }));
}

export function listFormats(): ReporterFormatInfo[] {
  return FORMATS.map((f) => ({ ...f }));
}

export function resolveFormat(value: unknown): ReporterFormat {
  return FORMATS.some((f) => f.id === value) ? (value as ReporterFormat) : 'dispatch';
}

// ----------------------------------------------------------------------------
// Soul loading (deterministic-brain `.soul.yaml` pattern)
// ----------------------------------------------------------------------------

export interface ReporterSoul {
  identity?: { name?: string; role?: string; pronouns?: string };
  agenda?: { mission?: string; goals?: string[]; anti_goals?: string[]; autonomous_directives?: string[] };
  preferences?: { communication?: { verbosity?: string; tone?: string } };
  voice?: string;
}

export function reporterSoulPath(): string {
  return process.env.REPORTER_SOUL_FILE || path.join(process.cwd(), 'reporter.soul.yaml');
}

/** Read the optional soul override. Returns null when absent/unreadable (honest). */
export function loadReporterSoul(file = reporterSoulPath()): ReporterSoul | null {
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = parseYaml(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as ReporterSoul) : null;
  } catch {
    return null;
  }
}

function normalizeVerbosity(value: unknown, fallback: ReporterVerbosity): ReporterVerbosity {
  return value === 'concise' || value === 'standard' || value === 'deep' ? value : fallback;
}

/** Merge a built-in voice with an optional soul override (identity/mission/tone). */
export function resolveVoice(voiceId?: string, soul?: ReporterSoul | null): ReporterVoice {
  const baseId = (voiceId && BUILT_IN_VOICES[voiceId]) ? voiceId : (soul?.voice && BUILT_IN_VOICES[soul.voice] ? soul.voice : 'field');
  const base = BUILT_IN_VOICES[baseId];
  if (!soul) return { ...base };
  const verbosity = normalizeVerbosity(soul.preferences?.communication?.verbosity, base.verbosity);
  return {
    ...base,
    identity: {
      name: soul.identity?.name || base.identity.name,
      role: soul.identity?.role || base.identity.role,
      pronouns: soul.identity?.pronouns ?? base.identity.pronouns,
    },
    mission: soul.agenda?.mission || base.mission,
    antiGoals: soul.agenda?.anti_goals?.length ? soul.agenda.anti_goals : base.antiGoals,
    directives: soul.agenda?.autonomous_directives?.length ? soul.agenda.autonomous_directives : base.directives,
    verbosity,
    tone: soul.preferences?.communication?.tone || base.tone,
  };
}

// ----------------------------------------------------------------------------
// Seeded, deterministic variance
// ----------------------------------------------------------------------------

/** Small, fast, deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). Used to salt seeded picks. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive the article seed from a canonical fact string. */
export function seedFrom(canonical: string): number {
  return hash32(canonical) >>> 0;
}

/**
 * Pick one phrasing deterministically. `seed` comes from the facts, `key`
 * separates independent choices, so the same state always picks the same
 * variants while different states vary.
 */
export function phrase(seed: number, key: string, options: readonly string[]): string {
  if (options.length === 0) return '';
  const rng = mulberry32((seed ^ hash32(key)) >>> 0);
  return options[Math.floor(rng() * options.length) % options.length];
}

/** Deterministic ordering of an array by seed (stable, non-mutating). */
export function seedOrder<T>(seed: number, key: string, items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, rank: mulberry32((seed ^ hash32(`${key}:${i}`)) >>> 0)() }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.item);
}
