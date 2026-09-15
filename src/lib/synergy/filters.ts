// src/lib/synergy/filters.ts
/**
 * Deterministic bridge gates (spec §8.6). Order: cross_domain, semantic_type,
 * generalness, evidence, novelty. Every decision (pass or fail) is returned
 * with a reason so rejections are auditable. The spec's `direction` and
 * `cross-cluster` gates are intentionally deferred (cross_domain covers the
 * cross-sector requirement; direction needs typed predicates from Plan 2).
 */
import type { FilterDecision, BridgeEvidence } from './types.js';
import { termDocFrequency, type WeightedGraph } from './graph.js';
import { isKnownPrimitive } from './vocabulary.js';

export interface FilterContext {
  graph: WeightedGraph;
  stoplist: string[];
  maxDocFrequency: number;
  minDocsPerLeg: number;
  fromDomain: string;
  toDomain: string;
  knownPairs: string[];
}

function termId(node: string): string {
  return node.startsWith('term:') ? node.slice(5) : node;
}

export function filterBridge(bridge: BridgeEvidence, ctx: FilterContext): FilterDecision[] {
  const term = termId(bridge.term);
  const pair = `${ctx.fromDomain}->${ctx.toDomain}`;
  const df = termDocFrequency(ctx.graph, bridge.term);
  const known = isKnownPrimitive(term);
  const stoplisted = ctx.stoplist.includes(term);
  const maxDf = ctx.maxDocFrequency * ctx.graph.docCount;
  // docCount === 0 is vacuously non-general; unknown terms are still caught by semantic_type.
  const overGeneral = ctx.graph.docCount > 0 && df > maxDf + 1e-9;
  return [
    {
      gate: 'cross_domain',
      passed: ctx.fromDomain !== ctx.toDomain,
      reason: ctx.fromDomain !== ctx.toDomain ? 'distinct sectors' : 'same sector',
    },
    {
      gate: 'semantic_type',
      passed: known,
      reason: known ? 'known primitive' : `unknown term "${term}"`,
    },
    {
      gate: 'generalness',
      passed: !stoplisted && !overGeneral,
      reason: stoplisted
        ? `"${term}" is stoplisted`
        : `df=${df} max=${Math.round(maxDf * 100) / 100} (${ctx.maxDocFrequency} of ${ctx.graph.docCount})`,
    },
    {
      gate: 'evidence',
      passed: bridge.docs >= ctx.minDocsPerLeg,
      reason: `docs=${bridge.docs} min=${ctx.minDocsPerLeg}`,
    },
    {
      gate: 'novelty',
      passed: !ctx.knownPairs.includes(pair),
      reason: ctx.knownPairs.includes(pair) ? 'pair already known' : 'new pair',
    },
  ];
}

export function allPassed(decisions: FilterDecision[]): boolean {
  return decisions.every((d) => d.passed);
}
