/**
 * Composer learner — the honest "gets better" loop.
 *
 * An EPISODE is a real, reproducible composition (captured deterministically by
 * (style, seed, ...)) plus a HUMAN rating. Ratings are the only signal: there is
 * no fake autonomy. From accumulated episodes the learner derives per-style
 * ADJUSTMENTS (root-motion and chord-quality boosts/penalties) that bias future
 * composition toward the DNA the operator actually liked, and it can SUGGEST
 * new briefs to explore near liked seeds.
 *
 * Everything is file-backed (path injectable for tests) so learning survives
 * restarts. The pure engine in composer.ts stays seed-deterministic; learning is
 * an overlay applied on top via an adjusted lexicon.
 */

import fs from 'fs';
import * as path from 'node:path';
import { getLexicon, type StyleLexicon } from './lexicons.js';
import { compose } from './composer.js';
import { pcName } from './theory.js';
import type { ComposeBrief, StyleId } from './types.js';

export interface Episode {
  id: string;
  style: StyleId;
  /** Canonical brief (key/bpm resolved) that reproduces this track exactly. */
  brief: Required<Pick<ComposeBrief, 'seed' | 'bars' | 'key' | 'major' | 'bpm'>> & { style: StyleId };
  chords: string[];
  rootMoves: number[]; // semitone root->root sequence
  qualities: string[];
  rating: number; // 1..5
  tags?: string[];
  notes?: string;
  ts: number;
}

export interface Adjustment {
  /** Quality-weight deltas keyed by quality id (semitone-agnostic vocabulary). */
  qualities: Record<string, number>;
}

export interface StyleLearning {
  episodes: Episode[];
  adjustments: Adjustment;
}

export function defaultLearnerFile(): string {
  return process.env.RECOURSE_COMPOSER_DATA || path.join(process.cwd(), 'data', 'composer-learner.json');
}

export class ComposerLearner {
  private file: string;
  private state: Record<StyleId, StyleLearning>;

  constructor(file = defaultLearnerFile()) {
    this.file = file;
    this.state = load(file);
  }

  /** Record (or update) a rating for a reproducible composition brief. */
  rate(brief: Pick<ComposeBrief, 'style' | 'seed' | 'bars' | 'key' | 'major' | 'bpm'>, rating: number, tags?: string[], notes?: string): Episode {
    if (![4, 8, 16].includes(brief.bars)) throw new Error('bars must be 4, 8 or 16');
    if (rating < 1 || rating > 5) throw new Error('rating must be 1..5');
    const style = brief.style as StyleId;
    // Capture the canonical, reproducible track.
    const t = compose({ style, seed: brief.seed, bars: brief.bars, key: brief.key, major: brief.major, bpm: brief.bpm });
    const rootMoves: number[] = [];
    for (let i = 1; i < t.chords.length; i++) {
      let d = (t.chords[i].rootPc - t.chords[i - 1].rootPc) % 12;
      if (d > 6) d -= 12;
      if (d < -6) d += 12;
      rootMoves.push(d);
    }
    const episode: Episode = {
      id: `${style}-${brief.seed}-${brief.bars}`,
      style,
      brief: { style, seed: brief.seed, bars: brief.bars, key: t.key, major: t.major, bpm: t.bpm },
      chords: t.chords.map((c) => `${pcName(c.rootPc)}${c.quality}`),
      rootMoves,
      qualities: t.chords.map((c) => c.quality),
      rating,
      tags,
      notes,
      ts: Date.now(),
    };
    this.state[style] = this.state[style] ?? { episodes: [], adjustments: emptyAdjustment() };
    const sl = this.state[style];
    const idx = sl.episodes.findIndex((e) => e.id === episode.id);
    if (idx >= 0) sl.episodes[idx] = episode;
    else sl.episodes.push(episode);
    sl.adjustments = deriveAdjustments(sl.episodes);
    this.persist();
    return episode;
  }

  /** Learned adjustments for a style (may be empty). */
  adjustmentsFor(style: StyleId): Adjustment {
    return this.state[style]?.adjustments ?? emptyAdjustment();
  }

  /** A lexicon clone with the operator's learned biases applied. */
  adjustedLexicon(style: StyleId): StyleLexicon {
    const lx = getLexicon(style);
    const adj = this.adjustmentsFor(style);
    const qEntries = Object.entries(adj.qualities);
    if (qEntries.length === 0) return lx;
    const qualityWeights = lx.qualityWeights.map((item) => {
      const delta = adj.qualities[item.q];
      return delta ? { ...item, w: Math.max(0.05, item.w * (1 + delta)) } : item;
    });
    return { ...lx, qualityWeights };
  }

  episodesFor(style: StyleId): Episode[] {
    return this.state[style]?.episodes ?? [];
  }

  /** Candidate briefs to explore: around liked seeds + unrated seed range. */
  suggestNext(style: StyleId, count = 4, bars = 8): ComposeBrief[] {
    const liked = this.episodesFor(style).filter((e) => e.rating >= 4);
    const out: ComposeBrief[] = [];
    const rngState = { n: Date.now() % 0x7fffffff };
    const rnd = () => { rngState.n = (rngState.n * 48271) % 0x7fffffff; return rngState.n; };
    if (liked.length) {
      const base = liked[0];
      for (let i = 1; i <= count; i++) {
        out.push({ style, seed: base.brief.seed + i, bars, key: base.brief.key, major: base.brief.major, bpm: base.brief.bpm, title: `${style} explore ${i}` });
      }
    }
    const existing = new Set(this.episodesFor(style).map((e) => e.brief.seed));
    let guard = 0;
    while (out.length < count && guard < 200) {
      guard++;
      const seed = (rnd() % 1000) + 1;
      if (existing.has(seed)) continue;
      out.push({ style, seed, bars, title: `${style} explore` });
      existing.add(seed);
    }
    return out.slice(0, count);
  }

  leaderboard(): Array<{ style: StyleId; n: number; avg: number; top: Episode | null }> {
    return (Object.keys(this.state) as StyleId[]).map((style) => {
      const es = this.state[style].episodes;
      const avg = es.length ? es.reduce((s, e) => s + e.rating, 0) / es.length : 0;
      const sorted = [...es].sort((a, b) => b.rating - a.rating);
      return { style, n: es.length, avg, top: sorted[0] ?? null };
    });
  }

  persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[composer-learner] could not persist:', err);
    }
  }
}

function emptyAdjustment(): Adjustment {
  return { qualities: {} };
}

/** Derive quality-weight biases from ratings: qualities seen in high-rated
 *  tracks (>=4) get a boost; in low-rated (<=2) tracks a penalty. Delta = +/-. */
function deriveAdjustments(episodes: Episode[]): Adjustment {
  const acc: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const e of episodes) {
    const w = e.rating >= 4 ? 1 : e.rating <= 2 ? -0.6 : 0;
    if (w === 0) continue;
    for (const q of e.qualities) {
      acc[q] = (acc[q] ?? 0) + w;
      count[q] = (count[q] ?? 0) + 1;
    }
  }
  const qualities: Record<string, number> = {};
  for (const q of Object.keys(acc)) {
    // Normalize by sample count to keep deltas in a stable, mild range.
    qualities[q] = clamp(acc[q] / Math.max(1, count[q]), -0.5, 0.6);
  }
  return { qualities };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function load(file: string): Record<StyleId, StyleLearning> {
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (parsed && typeof parsed === 'object') return parsed as Record<StyleId, StyleLearning>;
    }
  } catch (err) {
    console.warn('[composer-learner] could not load, starting empty:', err);
  }
  return {} as Record<StyleId, StyleLearning>;
}
