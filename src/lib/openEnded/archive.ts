/**
 * Open-Ended Capability Engine — durable problem archive + curriculum.
 *
 * A quality-diversity (MAP-Elites) archive over *minted problems*: each problem
 * is placed in a behavior cell (domain × difficulty × acceptance size) so the
 * loop retains a spread of problems instead of collapsing onto one easy theme.
 * The curriculum selector then orders the archive by the recursive learner's
 * real belief posteriors — least-confident domain first, easiest unseen problem
 * within it (zone of proximal development).
 *
 * Honesty contract:
 *  - Admission dedupes by exact id and by title/acceptance-test near-duplicate
 *    (token Jaccard). Nothing is dropped that is not provably a near-duplicate.
 *  - Persistence is atomic (`durableJson`); a corrupt file degrades to empty.
 *  - `nextByCurriculum` is deterministic: ties break to lowest id. It never
 *    invents a problem; an empty archive returns null.
 */

import { readJsonFile, writeJsonFile } from '../durableJson.js';
import { jaccard } from '../novelty.js';
import { cellCoord } from '../qualityDiversity.js';
import { domainUncertainty, estimateDifficulty, type BeliefLike } from '../problemArchive.js';
import type { MintedProblem } from './problemMint.js';

export interface ArchiveCell {
  domain: string;
  x: number;
  y: number;
}

export interface ArchivedProblem extends MintedProblem {
  solved: boolean;
  attempts: number;
  passes: number;
  addedAt: number;
  cell: ArchiveCell;
}

export interface ArchiveDoc {
  version: 1;
  problems: ArchivedProblem[];
}

export interface ArchiveAddResult {
  added: boolean;
  duplicateOf: string | null;
  reason?: 'exact_id' | 'near_title' | 'near_suite';
}

export interface ArchiveSnapshot {
  total: number;
  solved: number;
  unsolved: number;
  domains: string[];
  cells: number;
  coverage: number;
  byDomain: Array<{ domain: string; problems: number; solved: number; coverage: number }>;
}

function cellFor(p: MintedProblem, resolution: number): ArchiveCell {
  const difficulty = estimateDifficulty(p);
  const acceptanceLines = Math.max(0, p.hints?.acceptanceLines ?? p.acceptanceTest.split('\n').length);
  const size = Math.min(1, acceptanceLines / 30);
  return { domain: p.domain, x: cellCoord(difficulty, resolution), y: cellCoord(size, resolution) };
}

export class OpenEndedArchive {
  private map = new Map<string, ArchivedProblem>();

  constructor(
    private readonly file: string | null = null,
    private readonly resolution = 4,
    private readonly titleThreshold = 0.7,
    private readonly suiteThreshold = 0.92,
  ) {
    if (file) this.load();
  }

  private load(): void {
    if (!this.file) return;
    const doc = readJsonFile<ArchiveDoc>(this.file, { version: 1, problems: [] });
    if (!doc || !Array.isArray(doc.problems)) return;
    for (const p of doc.problems) {
      if (p && typeof p.id === 'string') this.map.set(p.id, p);
    }
  }

  private persist(): void {
    if (!this.file) return;
    const doc: ArchiveDoc = { version: 1, problems: [...this.map.values()] };
    try {
      writeJsonFile(this.file, doc);
    } catch (err) {
      console.warn('[openEnded:archive] persist failed:', err instanceof Error ? err.message : String(err));
    }
  }

  add(p: MintedProblem): ArchiveAddResult {
    if (!p.id) return { added: false, duplicateOf: null };
    if (this.map.has(p.id)) return { added: false, duplicateOf: p.id, reason: 'exact_id' };
    for (const existing of this.map.values()) {
      if (existing.domain !== p.domain) continue;
      if (jaccard(existing.title, p.title) >= this.titleThreshold) {
        return { added: false, duplicateOf: existing.id, reason: 'near_title' };
      }
      if (jaccard(existing.acceptanceTest, p.acceptanceTest) >= this.suiteThreshold) {
        return { added: false, duplicateOf: existing.id, reason: 'near_suite' };
      }
    }
    const archived: ArchivedProblem = {
      ...p,
      solved: false,
      attempts: 0,
      passes: 0,
      addedAt: p.createdAt ?? Date.now(),
      cell: cellFor(p, this.resolution),
    };
    this.map.set(p.id, archived);
    this.persist();
    return { added: true, duplicateOf: null };
  }

  /** Add many problems, returning counts (duplicates are skipped, not faked). */
  addAll(problems: MintedProblem[]): { added: number; duplicates: number } {
    let added = 0;
    let duplicates = 0;
    for (const p of problems) {
      const r = this.add(p);
      if (r.added) added += 1;
      else duplicates += 1;
    }
    return { added, duplicates };
  }

  list(): ArchivedProblem[] {
    return [...this.map.values()];
  }

  get(id: string): ArchivedProblem | undefined {
    return this.map.get(id);
  }

  byDomain(domain: string): ArchivedProblem[] {
    return this.list().filter((p) => p.domain === domain);
  }

  unsolved(): ArchivedProblem[] {
    return this.list().filter((p) => !p.solved);
  }

  solvedIds(): string[] {
    return this.list().filter((p) => p.solved).map((p) => p.id);
  }

  get size(): number {
    return this.map.size;
  }

  /** Record a real attempt outcome. A pass marks the problem solved. */
  markAttempt(id: string, ok: boolean): void {
    const p = this.map.get(id);
    if (!p) return;
    p.attempts += 1;
    if (ok) {
      p.passes += 1;
      p.solved = true;
    }
    this.persist();
  }

  snapshot(): ArchiveSnapshot {
    const problems = this.list();
    const domains = [...new Set(problems.map((p) => p.domain))].sort();
    const cells = new Set(problems.map((p) => `${p.cell.domain}:${p.cell.x}:${p.cell.y}`));
    const perDomain = this.resolution * this.resolution;
    const byDomain = domains.map((domain) => {
      const ds = problems.filter((p) => p.domain === domain);
      const dc = new Set(ds.map((p) => `${p.cell.x}:${p.cell.y}`));
      return {
        domain,
        problems: ds.length,
        solved: ds.filter((p) => p.solved).length,
        coverage: Math.round((dc.size / perDomain) * 1000) / 1000,
      };
    });
    return {
      total: problems.length,
      solved: problems.filter((p) => p.solved).length,
      unsolved: problems.filter((p) => !p.solved).length,
      domains,
      cells: cells.size,
      coverage: Math.round((cells.size / Math.max(1, domains.length * perDomain)) * 1000) / 1000,
      byDomain,
    };
  }

  /**
   * Pick the next unsolved problem: least-confident domain first (highest
   * failure-rate posterior), then easiest. Deterministic. Mirrors
   * `problemArchive.nextByCurriculum` but over archived problems.
   */
  nextByCurriculum(beliefs: BeliefLike[], knownDomains: string[] = []): ArchivedProblem | null {
    const uncertainty = domainUncertainty(beliefs);
    const problems = this.unsolved();
    const domains = new Set<string>([...problems.map((p) => p.domain), ...knownDomains]);
    const ranked = [...domains].sort((a, b) => {
      const ua = uncertainty.get(a) ?? 1;
      const ub = uncertainty.get(b) ?? 1;
      if (ua !== ub) return ub - ua;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    for (const domain of ranked) {
      const candidates = this.byDomain(domain)
        .filter((p) => !p.solved)
        .map((p) => ({ p, difficulty: estimateDifficulty(p) }))
        .sort((x, y) => x.difficulty - y.difficulty || (x.p.id < y.p.id ? -1 : 1));
      if (candidates.length) return candidates[0].p;
    }
    return null;
  }

  /** Prepare the behavior pool for a novelty gate: one text per problem. */
  noveltyPool(): string[] {
    return this.list().map((p) => `${p.title} ${p.statement} ${p.acceptanceTest}`);
  }
}
