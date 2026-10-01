// src/lib/synergy/decisionBridge.ts
/**
 * Bridges the persisted synergy map into the deterministic growth decision
 * engine. The engine scores per-`ToolDomain`; the map may be keyed either by
 * sector (caller-supplied scans) or by native ToolDomain (the self-feeding job).
 * This module translates sector scores onto ToolDomains (a sector may map to
 * several), passes native ToolDomain keys straight through, and merges by max,
 * then reports honestly whether a real map backed the input.
 *
 * Fail-soft: a missing, unreadable, or corrupt map yields `source: 'none'` and
 * an empty record — the engine then computes an honest `0`, never a fabricated
 * constant. Keys with no ToolDomain mapping are skipped, not invented.
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

// The native ToolDomain vocabulary. The self-feeding scan emits these directly
// (no sector round-trip), so the bridge must recognise them as already-mapped.
const TOOL_DOMAINS = new Set<string>([
  'coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim',
]);

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
  for (const [domain, score] of Object.entries(sectorScores)) {
    const spec = getDomain(domain);
    if (spec) {
      for (const td of spec.toolDomains) {
        byToolDomain[td] = Math.max(byToolDomain[td] ?? 0, score);
      }
    } else if (TOOL_DOMAINS.has(domain)) {
      // Already in the native ToolDomain vocabulary (self-feeding job) — pass
      // through directly rather than dropping it for lacking a sector binding.
      byToolDomain[domain] = Math.max(byToolDomain[domain] ?? 0, score);
    }
  }

  const crossDomainSynergyByDomain: Record<string, number> = {};
  for (const key of Object.keys(byToolDomain).sort()) {
    crossDomainSynergyByDomain[key] = byToolDomain[key];
  }
  return { crossDomainSynergyByDomain, source: 'map', manifestHash: map.manifestHash };
}
