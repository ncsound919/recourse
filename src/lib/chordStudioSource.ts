/**
 * chordStudioSource.ts — read ChordStudio's progression data as a training
 * source for the remote (Kaggle) small-model job.
 *
 * ChordStudio (a native JUCE app) writes `.progression` JSON. Its export carries
 * the Critic score plus the generation context needed to predict it:
 *   { progression: { name, rootNote, scale, recordingOctave, score, styleId,
 *     writerId, chords: [{ name, role, notes:[midi...], bass: midi }] } }
 * (see ProgressionLibraryController::exportProgression and
 *  music/ProgressionFactory.cpp). `.cstudio` project files are NOT read here —
 * they are JUCE ValueTree XML and do not carry the score.
 *
 * A progression only becomes a training row when a numeric `score` (or
 * `rating`) is present; otherwise the set is refused, exactly like the composer
 * learner refuses a flat-rating corpus.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ComposerTrainingSet, ComposerTrainingRefusal } from './composerTraining.js';

export const CHORDSTUDIO_FEATURE_NAMES = [
  'chordCount',
  'distinctRoots',
  'meanAbsRootMove',
  'stdRootMove',
  'rootSpan',
  'meanNotesPerChord',
  'distinctRoles',
  'meanVoiceLeap',
  'maxVoiceLeap',
  'leapViolations',
  'leapViolationFraction',
  'meanLowestMove',
  'minLowestNote',
  'meanSpread',
  'extensionCount',
  'accidentalCount',
  'distinctQualities',
  'bassCompGapMean',
  'bassCollisions',
  'bassMoveMean',
] as const;

export interface ChordStudioChord {
  name: string;
  role?: string;
  notes?: number[];
  /** Generated bass MIDI (extension field; undefined for imports). */
  bass?: number;
}

export interface ChordStudioProgression {
  name: string;
  rootNote?: string;
  scale?: string;
  chords: ChordStudioChord[];
  /** Critic score (0..100) or a 1..5 human rating, when the export carries one. */
  score?: number;
  /** Generation context (extension fields). */
  styleId?: string;
  writerId?: string;
  /** Absolute path of the source file (set by the reader; useful to map back). */
  file?: string;
}

export interface ChordStudioScan {
  dir: string;
  scanned: number;
  progressions: ChordStudioProgression[];
  errors: string[];
}

/** Where ChordStudio keeps its data (env override wins; else %APPDATA%). */
export function chordStudioDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CHORDSTUDIO_DATA && env.CHORDSTUDIO_DATA.trim()) return env.CHORDSTUDIO_DATA.trim();
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Chord Studio');
}

/**
 * Directories scanned by default. `%CHORDSTUDIO_DATA%` overrides everything;
 * otherwise the app-data dir (scanned deeply) plus the user's Documents folder —
 * because `ProgressionLibraryController::exportProgression` defaults the save
 * dialog to Documents, so a manually exported progression otherwise never
 * reaches the retrain job.
 */
export function chordStudioScanRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.CHORDSTUDIO_DATA && env.CHORDSTUDIO_DATA.trim()) return [env.CHORDSTUDIO_DATA.trim()];
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const home = env.USERPROFILE || os.homedir();
  return [path.join(appData, 'Chord Studio'), path.join(home, 'Documents')];
}

function toProgression(raw: unknown): ChordStudioProgression | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const inner = (o.progression && typeof o.progression === 'object' ? o.progression : o) as Record<string, unknown>;
  const chordsRaw = Array.isArray(inner.chords) ? inner.chords : [];
  const chords: ChordStudioChord[] = [];
  for (const c of chordsRaw) {
    if (!c || typeof c !== 'object') continue;
    const co = c as Record<string, unknown>;
    chords.push({
      name: typeof co.name === 'string' ? co.name : '',
      role: typeof co.role === 'string' ? co.role : undefined,
      notes: Array.isArray(co.notes) ? co.notes.filter((n): n is number => typeof n === 'number') : [],
      ...(typeof co.bass === 'number' && Number.isFinite(co.bass) ? { bass: co.bass } : {}),
    });
  }
  if (chords.length === 0) return null;
  const scoreCandidates = [inner.score, o.score, inner.rating, o.rating];
  const score = scoreCandidates.find((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return {
    name: typeof inner.name === 'string' ? inner.name : 'untitled',
    rootNote: typeof inner.rootNote === 'string' ? inner.rootNote : undefined,
    scale: typeof inner.scale === 'string' ? inner.scale : undefined,
    chords,
    ...(score !== undefined ? { score } : {}),
    ...(typeof inner.styleId === 'string' && inner.styleId ? { styleId: inner.styleId } : {}),
    ...(typeof inner.writerId === 'string' && inner.writerId ? { writerId: inner.writerId } : {}),
  };
}

/**
 * Read `.progression` JSON files. With no argument, scans the default roots
 * (app-data deep, Documents top-level). A string or array argument scans those
 * directories deeply — used by tests and explicit callers.
 */
export function readChordStudioProgressions(dir?: string | string[]): ChordStudioScan {
  const out: ChordStudioScan = { dir: '', scanned: 0, progressions: [], errors: [] };
  const walk = (d: string, depth: number, maxDepth: number): void => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (err) {
      out.errors.push(`${d}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1, maxDepth);
      } else if (e.name.toLowerCase().endsWith('.progression')) {
        out.scanned += 1;
        try {
          const j = JSON.parse(fs.readFileSync(full, 'utf-8').replace(/^\uFEFF/, ''));
          const p = toProgression(j);
          if (p) {
            p.file = full;
            out.progressions.push(p);
          }
        } catch (err) {
          out.errors.push(`${e.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  };

  if (dir === undefined) {
    const roots = chordStudioScanRoots();
    out.dir = roots.join('; ');
    roots.forEach((root, i) => {
      // The app-data dir is ours (deep); a user dir like Documents is skimmed at
      // the top level only, so an entire home folder is never walked.
      if (fs.existsSync(root)) walk(root, 1, i === 0 ? 4 : 1);
    });
  } else {
    const list = Array.isArray(dir) ? dir : [dir];
    out.dir = list.join('; ');
    for (const d of list) if (fs.existsSync(d)) walk(d, 1, 4);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Root of a chord = its lowest MIDI note (ChordStudio voicings list root first). */
function chordRoot(c: ChordStudioChord): number | null {
  if (c.notes && c.notes.length) return Math.min(...c.notes);
  return null;
}

export function chordStudioFeatures(p: ChordStudioProgression): number[] {
  const chords = p.chords;
  const roots = chords.map(chordRoot).filter((r): r is number => r !== null);

  // Root movement (pitch-class, wrapped to [-6, 6]).
  const moves: number[] = [];
  for (let i = 1; i < roots.length; i++) {
    let d = (roots[i] - roots[i - 1]) % 12;
    if (d > 6) d -= 12;
    if (d < -6) d += 12;
    moves.push(d);
  }

  // Voice-leading leaps between consecutive chords, aligned by sorted voice
  // index. This mirrors the Critic's voice_leading finding directly, so it is
  // the single strongest predictor of the score.
  const leaps: number[] = [];
  const lowestMoves: number[] = [];
  for (let i = 1; i < chords.length; i++) {
    const a = [...(chords[i - 1].notes ?? [])].sort((x, y) => x - y);
    const b = [...(chords[i].notes ?? [])].sort((x, y) => x - y);
    const len = Math.min(a.length, b.length);
    let maxLeap = 0;
    for (let v = 0; v < len; v++) maxLeap = Math.max(maxLeap, Math.abs(a[v] - b[v]));
    if (len > 0) leaps.push(maxLeap);
    if (a.length && b.length) lowestMoves.push(Math.abs(a[0] - b[0]));
  }

  // Register / density: the Critic's register_collision finding looks at the
  // low end, so minLowestNote and spread matter.
  const spreads = chords.map((c) => {
    const ns = c.notes ?? [];
    return ns.length ? Math.max(...ns) - Math.min(...ns) : 0;
  });
  const noteCounts = chords.map((c) => c.notes?.length ?? 0);

  // Harmonic vocabulary (from chord names).
  const names = chords.map((c) => c.name || '');
  const extensionCount = names.filter((n) => /(7|9|11|13)/.test(n)).length;
  const accidentalCount = names.filter((n) => /[#b]/.test(n)).length;
  const distinctQualities = new Set(names).size;
  const roles = new Set(chords.map((c) => c.role).filter((r): r is string => Boolean(r)));

  // Threshold features: the Critic penalises a leap of >= 7 semitones as a
  // voice_leading finding. A MEAN leap smooths that step away; the count of
  // violations matches how the score is actually deducted, so it predicts it
  // far better than the average does.
  const leapViolations = leaps.filter((l) => l >= 7).length;
  const leapViolationFraction = leaps.length ? leapViolations / leaps.length : 0;

  // Bass-line features: the Critic's register_collision finding needs the bass —
  // the gap between the comp's lowest note and the bass, in the low register.
  // Absent on imports, so these are 0-based and degrade honestly.
  const bassPairs = chords
    .filter((c) => typeof c.bass === 'number' && (c.notes?.length ?? 0) > 0)
    .map((c) => ({ bass: c.bass as number, low: Math.min(...(c.notes as number[])) }));
  const gaps = bassPairs.map((p) => p.low - p.bass);
  const bassCollisions = bassPairs.filter((p) => p.low - p.bass >= 0 && p.low - p.bass <= 3 && p.bass < 48).length;
  // Consecutive-chord bass moves. Only between chords that BOTH carry a bass, so
  // a file with an unscored/imported chord doesn't diff across a gap.
  const bassMoves: number[] = [];
  for (let i = 1; i < chords.length; i++) {
    const a = chords[i - 1].bass;
    const b = chords[i].bass;
    if (typeof a === 'number' && typeof b === 'number') bassMoves.push(Math.abs(b - a));
  }

  return [
    chords.length,
    new Set(roots.map((r) => ((r % 12) + 12) % 12)).size,
    mean(moves.map((m) => Math.abs(m))),
    std(moves),
    roots.length ? Math.max(...roots) - Math.min(...roots) : 0,
    mean(noteCounts),
    roles.size,
    mean(leaps),
    leaps.length ? Math.max(...leaps) : 0,
    leapViolations,
    leapViolationFraction,
    mean(lowestMoves),
    roots.length ? Math.min(...roots) : 0,
    mean(spreads),
    extensionCount,
    accidentalCount,
    distinctQualities,
    mean(gaps),
    bassCollisions,
    mean(bassMoves),
  ];
}

/**
 * Build a training set from scored ChordStudio progressions. Refuses — like the
 * composer extractor — without `minRows` rows and `minDistinctScores` distinct
 * target values, so an unscored corpus never manufactures a metric.
 */
export function buildChordStudioTrainingRows(
  progressions: ChordStudioProgression[],
  opts: { minRows?: number; minDistinctScores?: number } = {},
): ComposerTrainingSet | ComposerTrainingRefusal {
  const minRows = opts.minRows ?? 4;
  const minDistinct = opts.minDistinctScores ?? 2;
  const scored = progressions.filter((p) => typeof p.score === 'number' && Number.isFinite(p.score) && p.chords.length > 0);
  if (scored.length < minRows) {
    return { ok: false, reason: `only ${scored.length} scored ChordStudio progressions (need >= ${minRows})` };
  }
  const histogram: Record<string, number> = {};
  for (const p of scored) histogram[String(p.score)] = (histogram[String(p.score)] ?? 0) + 1;
  const distinct = Object.keys(histogram).length;
  if (distinct < minDistinct) {
    return { ok: false, reason: `all ${scored.length} scored progressions share ${distinct} score value(s) (need >= ${minDistinct})` };
  }
  return {
    rows: scored.map(chordStudioFeatures),
    target: scored.map((p) => p.score as number),
    featureNames: [...CHORDSTUDIO_FEATURE_NAMES],
    distinctRatings: distinct,
    ratingHistogram: histogram,
  };
}
