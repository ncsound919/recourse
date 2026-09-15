// src/lib/synergy/ledger.ts
/**
 * Discovery-ledger wiring. Reuses trendLedger.appendInsight unchanged so the
 * hash chain stays intact; template id crossdomain_bridge marks hypotheses.
 */
import { appendInsight, type LedgerInsight } from '../trendLedger.js';
import type { SynergyMap } from './types.js';

export function recordSynergyScan(map: SynergyMap): LedgerInsight | null {
  // Invariant: buildSynergyMap emits candidates sorted by score desc, so [0] is the top.
  const top = map.candidates[0];
  return appendInsight({
    createdRun: map.generatedAtRun,
    hypothesisId: top?.id ?? 'none',
    templateId: 'crossdomain_bridge',
    statement: `${map.candidates.length} cross-domain transfer candidate(s) across ${map.domains.length} sector(s) (manifest ${map.manifestHash.slice(0, 12) || 'unspecified'})`,
    confidence: top ? top.score : 0,
    provenanceRoot: map.manifestHash,
    payload: {
      edges: map.edges.length,
      candidates: map.candidates.slice(0, 10).map((c) => ({
        id: c.id,
        from: c.fromDomain,
        to: c.toDomain,
        score: c.score,
        prediction: c.prediction,
        falsification: c.falsification.slice(0, 200),
      })),
    },
  });
}
