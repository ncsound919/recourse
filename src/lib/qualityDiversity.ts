/**
 * Quality-Diversity archive (MAP-Elites) over the tool registry.
 *
 * Recourse's registry is today a linear promotion ledger: a tool is either the
 * current version or it is replaced. Quality-diversity (QD) treats the registry
 * as a low-dimensional *archive*: each cell of a behavior space keeps the
 * highest-fitness tool that landed in it, so the system retains *variety* (a
 * fast niche tool, a robust niche tool, a minimal niche tool) instead of a
 * single greedy champion per domain. This is the search-structure upgrade that
 * MAP-Elites / OpenEvolve brought to program evolution; here it runs over real,
 * already-verified registry genes.
 *
 * Honesty contract:
 *  - Everything here is pure + deterministic over the tools you pass in: given
 *    the same registry you get the same archive. Nothing is measured, invented,
 *    or calibrated — descriptors are computed from the versions' real
 *    verifier/sanity fields (passed_verifier, score, healthStatus).
 *  - The archive is a *view + retention policy*, not a rewrite of promotion.
 *    Promotion still requires the sandbox+lint gate; QD decides which verified
 *    variant is worth *keeping visible* per niche, not what may be added.
 */

export interface QDBehavior {
  /** fraction of versions that passed their real verifier (0..1) */
  passRate: number;
  /** mean score across versions (0..1) */
  meanScore: number;
  /** healthy=1, degraded=0.5, corrupted/healing=0 */
  healthRank: number;
  /** archive fitness for the tool (its current/active version score, else mean) */
  fitness: number;
}

export interface QDToolLike {
  domain: string;
  name?: string;
  healthStatus?: string;
  currentVersion?: string;
  versions?: Array<{ passed_verifier?: boolean; score?: number; promoted?: boolean; version?: string }>;
}

export interface QDNiche {
  domain: string;
  /** quantized descriptor cell coordinates */
  x: number;
  y: number;
  passRate: number;
  meanScore: number;
  fitness: number;
  toolName: string;
}

export interface QDDomainStat {
  domain: string;
  cells: number;
  covered: number;
  coverage: number; // 0..1
}

export interface QDArchiveSnapshot {
  resolution: number;
  cells: number;
  covered: number;
  coverage: number; // 0..1
  niches: QDNiche[];
  byDomain: QDDomainStat[];
}

const HEALTH_RANK: Record<string, number> = {
  healthy: 1,
  degraded: 0.5,
  corrupted: 0,
  healing: 0.25,
};

/** Compute the behavior + fitness descriptors for one tool from its real data. */
export function behaviorOf(tool: QDToolLike): QDBehavior {
  const versions = Array.isArray(tool.versions) ? tool.versions : [];
  const passed = versions.filter((v) => v.passed_verifier === true).length;
  const passRate = versions.length ? passed / versions.length : 0;

  const scored = versions.filter((v) => typeof v.score === 'number');
  const meanScore = scored.length ? scored.reduce((a, v) => a + (v.score ?? 0), 0) / scored.length : 0;

  const healthRank = tool.healthStatus ? (HEALTH_RANK[tool.healthStatus] ?? 0.5) : 0.5;

  const active = versions.find((v) => v.promoted === true && (v.version === tool.currentVersion || !tool.currentVersion));
  const fallback = versions.length ? versions[versions.length - 1] : undefined;
  const currentScore = (active ?? fallback)?.score;
  const rawFitness = typeof currentScore === 'number' ? currentScore : meanScore;

  return { passRate, meanScore, healthRank, fitness: clamp01(rawFitness) };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Quantize a [0,1] value into a cell coordinate for `resolution` per axis. */
export function cellCoord(value: number, resolution: number): number {
  const clamped = clamp01(value);
  const idx = Math.floor(clamped * resolution);
  return idx >= resolution ? resolution - 1 : idx;
}

/**
 * Build the MAP-Elites archive: per domain, fill a `resolution x resolution`
 * cell grid over (passRate, meanScore) and keep the highest-fitness tool per
 * cell. Deterministic given the same input.
 */
export function buildQDArchive(
  tools: QDToolLike[],
  resolution = 8
): QDArchiveSnapshot {
  const safeRes = Math.max(2, Math.min(64, Math.floor(resolution) || 8));
  // best per niche key `${domain}:${x}:${y}` -> {behavior, niche-ish}
  const best = new Map<string, { tool: QDToolLike; b: QDBehavior; x: number; y: number }>();

  for (const tool of tools) {
    const domain = tool.domain || 'unknown';
    const b = behaviorOf(tool);
    const x = cellCoord(b.passRate, safeRes);
    const y = cellCoord(b.meanScore, safeRes);
    const key = `${domain}:${x}:${y}`;
    const existing = best.get(key);
    if (!existing || b.fitness > existing.b.fitness) {
      best.set(key, { tool, b, x, y });
    }
  }

  const niches: QDNiche[] = [...best.values()].map(({ tool, b, x, y }) => ({
    domain: tool.domain || 'unknown',
    x,
    y,
    passRate: Math.round(b.passRate * 1000) / 1000,
    meanScore: Math.round(b.meanScore * 1000) / 1000,
    fitness: Math.round(b.fitness * 1000) / 1000,
    toolName: tool.name ?? tool.currentVersion ?? 'unnamed',
  }));

  const totalCells = niches.length;
  const byDomainMap = new Map<string, QDDomainStat>();
  for (const n of niches) {
    const cur = byDomainMap.get(n.domain) ?? { domain: n.domain, cells: 0, covered: 0, coverage: 0 };
    cur.covered += 1;
    byDomainMap.set(n.domain, cur);
  }
  const byDomain: QDDomainStat[] = [...byDomainMap.values()].map((s) => ({
    domain: s.domain,
    cells: safeRes * safeRes,
    covered: s.covered,
    coverage: Math.round((s.covered / (safeRes * safeRes)) * 1000) / 1000,
  }));

  return {
    resolution: safeRes,
    cells: byDomain.length * safeRes * safeRes,
    covered: totalCells,
    coverage: Math.round((niches.length / Math.max(1, byDomain.length * safeRes * safeRes)) * 1000) / 1000,
    niches,
    byDomain,
  };
}

/** Which tools are "dominated" (a strictly-better niche sibling exists) — the
 *  QD signal that a tool is redundant within its behavior niche. */
export function findRedundant(
  tools: QDToolLike[],
  resolution = 8
): Array<{ name: string; kept: string }> {
  const snapshot = buildQDArchive(tools, resolution);
  const kept = new Set(snapshot.niches.map((n) => n.toolName));
  const out: Array<{ name: string; kept: string }> = [];
  for (const t of tools) {
    const name = t.name ?? t.currentVersion ?? 'unnamed';
    if (!kept.has(name)) out.push({ name, kept: 'a higher-fitness sibling occupies its niche' });
  }
  return out;
}
