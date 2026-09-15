// src/lib/synergy/decisionBridge.ts
/**
 * Bridges the persisted synergy map into the deterministic growth decision
 * engine. The engine scores per-`ToolDomain`; the map scores per-sector. This
 * module translates sector scores onto ToolDomains (a sector may map to several)
 * and merges by max, then reports honestly whether a real map backed the input.
 *
 * Fail-soft: a missing, unreadable, or corrupt map yields `source: 'none'` and
 * an empty record — the engine then computes an honest `0`, never a fabricated
 * constant. Sectors absent from the registry are skipped, not invented.
 */
import type { SynergyMap } from './types.js';
import { readSynergyMap } from './store.js';
import { domainScoresFromMap } from './synergyMap.js';
import { getDomain } from './domainRegistry.js';

export interface DecisionSynergyInputs {
  crossDomainSynergyByDomain: Record<string, number>;
  source: 'map' | 'none';
  manifestHash?: string;
}

export function decisionSynergyInputs(): DecisionSynergyInputs {
  let map: SynergyMap | null;
  try {
    map = readSynergyMap();
  } catch {
    return { crossDomainSynergyByDomain: {}, source: 'none' };
  }
  if (!map) return { crossDomainSynergyByDomain: {}, source: 'none' };

  const sectorScores = domainScoresFromMap(map);
  const byToolDomain: Record<string, number> = {};
  for (const [sector, score] of Object.entries(sectorScores)) {
    const spec = getDomain(sector);
    if (!spec) continue;
    for (const td of spec.toolDomains) {
      byToolDomain[td] = Math.max(byToolDomain[td] ?? 0, score);
    }
  }

  const crossDomainSynergyByDomain: Record<string, number> = {};
  for (const key of Object.keys(byToolDomain).sort()) {
    crossDomainSynergyByDomain[key] = byToolDomain[key];
  }
  return { crossDomainSynergyByDomain, source: 'map', manifestHash: map.manifestHash };
}
