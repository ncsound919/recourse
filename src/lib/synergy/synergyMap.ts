// src/lib/synergy/synergyMap.ts
/**
 * Synergy map: aggregates candidate transfers into per-domain-pair edges and
 * exposes crossDomainSynergyFor() for the decision engine. Resolved edges
 * (Plan 4) are the earned layer; candidates are the labeled opportunity layer.
 * Deterministic: no wall clock, stable sort, manifest hash.
 */
import type { TransferCandidate, SynergyEdge, SynergyMap } from './types.js';
import { manifestHash } from './manifest.js';
import { SYNERGY_ENGINE_VERSION } from './closedDiscovery.js';

export interface SynergyMapOptions {
  generatedAtRun?: string;
}

export const SYNERGY_MAP_CALIBRATION = {
  crossDomainBlend: 0.5,
  openScoreFloor: 0.25,
} as const;

export function buildSynergyMap(candidates: TransferCandidate[], opts: SynergyMapOptions = {}): SynergyMap {
  const generatedAtRun = opts.generatedAtRun ?? 'run:manual';
  const ordered = [...candidates].sort((a, b) =>
    b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const grouped = new Map<string, SynergyEdge>();
  for (const c of ordered) {
    const key = `${c.fromDomain}->${c.toDomain}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        from: c.fromDomain, to: c.toDomain, kind: 'candidate',
        score: c.score, passes: 0, attempts: 1, backingIds: [c.id],
      });
    } else {
      existing.score = Math.max(existing.score, c.score);
      existing.attempts += 1;
      existing.backingIds.push(c.id);
    }
  }
  const edges = [...grouped.values()].sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0,
  );
  const domains = [...new Set(ordered.flatMap((c) => [c.fromDomain, c.toDomain]))].sort();
  const manifest = manifestHash([
    SYNERGY_ENGINE_VERSION,
    generatedAtRun,
    ...edges.map((e) => `${e.from}->${e.to}:${e.score}:${e.attempts}`),
    ...ordered.map((c) => `${c.id}:${c.score}`),
  ]);
  return {
    engineVersion: SYNERGY_ENGINE_VERSION,
    generatedAtRun,
    domains,
    edges,
    candidates: ordered,
    manifestHash: manifest,
  };
}

/**
 * Blend of earned (resolved) and open (candidate) synergy for a domain.
 * Deviation from spec §9 pending Plan 3/4: the earned term sums resolved
 * `passes` (evidence weight, currently always 0 in Plan 1) normalized by the
 * global max, and omits `surpriseBits_norm`; the open term credits a candidate
 * to BOTH endpoints (direction is deliberately ignored for a per-domain signal).
 */
export function crossDomainSynergyFor(
  map: SynergyMap,
  domain: string,
  opts: { openScoreFloor?: number; blend?: number } = {},
): number {
  const floor = opts.openScoreFloor ?? SYNERGY_MAP_CALIBRATION.openScoreFloor;
  const blend = opts.blend ?? SYNERGY_MAP_CALIBRATION.crossDomainBlend;
  const resolvedEdges = map.edges.filter((e) => e.kind === 'resolved');
  const touching = resolvedEdges.filter((e) => e.from === domain || e.to === domain);
  const resolvedDegree = touching.reduce((s, e) => s + e.passes, 0);
  const maxResolved = Math.max(1, ...resolvedEdges.map((e) => e.passes));
  const open = map.candidates.filter((c) => (c.fromDomain === domain || c.toDomain === domain) && c.score >= floor);
  const openPotential = open.length ? open.reduce((s, c) => s + c.score, 0) / open.length : 0;
  const value = blend * (resolvedDegree / maxResolved) + (1 - blend) * openPotential;
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
