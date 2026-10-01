// src/lib/synergy/closedDiscovery.ts
/**
 * Deterministic closed-discovery core: A = method, C = problem, B = a shared
 * controlled-vocabulary term. bridgeScore = min(w(A,b), w(b,C)); candidate
 * score = base * coverage^exponent. Pure, seeded by content, no wall clock.
 */
import type {
  MethodSignature,
  ProblemSignature,
  BridgeEvidence,
  TransferCandidate,
  FilterDecision,
} from './types.js';
import { buildGraph, termDocFrequency, type GraphDoc, type WeightedGraph } from './graph.js';
import { filterBridge, allPassed, type FilterContext } from './filters.js';
import { manifestHash, sha256Hex, stableStringify } from './manifest.js';
import { vocabularyHash } from './vocabulary.js';
import { dgroupFromRelations, align as smeAlign, farTransfer } from './sme.js';
import { grangerCausality, transferEntropy, stationarize } from './stats.js';
import { macFac } from './macFac.js';

export const SYNERGY_ENGINE_VERSION = '0.1.0';

export interface DiscoverOptions {
  maxDocFrequency?: number;
  minDocsPerLeg?: number;
  topBridges?: number;
  passThreshold?: number;
  coverageExponent?: number;
  stoplist?: string[];
  knownPairs?: string[];
  align?: boolean;
  /** Time-series data for directional statistics (Granger, transfer entropy).
   *  Keyed by `${fromDomain}:${toDomain}`. */
  seriesData?: Record<string, { xs: number[]; ys: number[] }>;
  /** Enable MAC/FAC prefilter for SME alignment. */
  useMacFac?: boolean;
}

export const SYNERGY_CALIBRATION = {
  maxDocFrequency: 0.9,
  minDocsPerLeg: 1,
  topBridges: 5,
  passThreshold: 0.25,
  coverageExponent: 0.5,
  stoplist: [] as string[],
} as const;

function docText(s: MethodSignature | ProblemSignature): string {
  const prims = 'primitives' in s ? s.primitives : s.requiredPrimitives;
  return [s.name, s.domain, ...prims].join(' ');
}

function resolveOptions(opts: DiscoverOptions) {
  return {
    maxDocFrequency: opts.maxDocFrequency ?? SYNERGY_CALIBRATION.maxDocFrequency,
    minDocsPerLeg: opts.minDocsPerLeg ?? SYNERGY_CALIBRATION.minDocsPerLeg,
    topBridges: Math.max(1, opts.topBridges ?? SYNERGY_CALIBRATION.topBridges),
    passThreshold: opts.passThreshold ?? SYNERGY_CALIBRATION.passThreshold,
    coverageExponent: opts.coverageExponent ?? SYNERGY_CALIBRATION.coverageExponent,
    stoplist: opts.stoplist ?? [...SYNERGY_CALIBRATION.stoplist],
    knownPairs: opts.knownPairs ?? [],
  };
}

export function findBridges(graph: WeightedGraph, methodId: string, problemId: string): BridgeEvidence[] {
  const mRow = graph.adjacency.get(methodId);
  const pRow = graph.adjacency.get(problemId);
  if (!mRow || !pRow) return [];
  const bridges: BridgeEvidence[] = [];
  for (const [term, wAB] of mRow) {
    const wBC = pRow.get(term);
    if (!wBC) continue;
    bridges.push({
      term,
      weightAB: wAB,
      weightBC: wBC,
      score: Math.round(Math.min(wAB, wBC) * 1000) / 1000,
      docs: termDocFrequency(graph, term),
    });
  }
  return bridges.sort((a, b) => b.score - a.score || (a.term < b.term ? -1 : 1));
}

export function discover(
  methods: MethodSignature[],
  problems: ProblemSignature[],
  opts: DiscoverOptions = {},
): { candidates: TransferCandidate[]; graph: WeightedGraph; manifest: string } {
  const resolved = resolveOptions(opts);
  const { maxDocFrequency, minDocsPerLeg, topBridges, passThreshold, coverageExponent, stoplist, knownPairs } = resolved;
  const seriesData = opts.seriesData ?? {};
  const useMacFac = opts.useMacFac ?? false;

  const docs: GraphDoc[] = [
    ...methods.map((m) => ({ id: m.id, domain: m.domain, text: docText(m) })),
    ...problems.map((p) => ({ id: p.id, domain: p.domain, text: docText(p) })),
  ];
  const graph = buildGraph(docs);
  const candidates: TransferCandidate[] = [];

  for (const m of methods) {
    for (const p of problems) {
      if (m.domain === p.domain) continue;
      const bridges = findBridges(graph, m.id, p.id);
      if (bridges.length === 0) continue;
      const ctx: FilterContext = {
        graph, stoplist, maxDocFrequency, minDocsPerLeg,
        fromDomain: m.domain, toDomain: p.domain, knownPairs,
      };
      const failed: FilterDecision[] = [];
      const passing: BridgeEvidence[] = [];
      for (const b of bridges) {
        const decisions = filterBridge(b, ctx);
        for (const d of decisions) if (!d.passed) failed.push({ ...d, gate: `${b.term}:${d.gate}` });
        if (allPassed(decisions)) passing.push(b);
      }
      if (passing.length === 0) continue;
      const top = passing.slice(0, topBridges);
      const base = top.reduce((s, b) => s + b.score, 0) / top.length;
      const coverage = passing.length / bridges.length;
      let score = Math.round(base * Math.pow(coverage, coverageExponent) * 1000) / 1000;

      // Directional statistics: augment score with Granger/TE evidence
      const seriesKey = `${m.domain}:${p.domain}`;
      const series = seriesData[seriesKey];
      let directionalStats;
      if (series && series.xs.length >= 16 && series.ys.length >= 16) {
        const station = stationarize(series.xs);
        const xs = station.series;
        const ys = series.ys.slice(0, xs.length);
        const granger = grangerCausality(xs, ys);
        const te = transferEntropy(xs, ys);
        directionalStats = {
          granger: { ok: granger.ok, bestLag: granger.bestLag, fStat: granger.fStat, p: granger.p, significant: granger.significant, n: granger.n, reason: granger.reason },
          transferEntropy: { ok: te.ok, bits: te.bits, n: te.n, bins: te.bins, history: te.history, reason: te.reason },
          stationarity: { transforms: station.transforms, wasNonStationary: station.transforms.length > 0 },
        };
        if (granger.ok && granger.significant) {
          score = Math.round(score * 1.1 * 1000) / 1000;
        }
      }

      const useAlign = opts.align !== false;
      let alignment;
      let far;
      const relationsDeclared = m.relationBasis === 'declared' && p.relationBasis === 'declared';
      if (useAlign && relationsDeclared && m.relations.length > 0 && p.relations.length > 0) {
        const bd = dgroupFromRelations(m.domain, m.relations, [...new Set(m.relations.flatMap((r) => r.args))]);
        const td = dgroupFromRelations(p.domain, p.relations, [...new Set(p.relations.flatMap((r) => r.args))]);
        if (useMacFac) {
          const results = macFac(td, [bd], { k: 1 });
          alignment = results[0];
        } else {
          alignment = smeAlign(bd, td);
        }
        far = farTransfer(bd, td);
      }
      const id = `tc_${sha256Hex([
        m.id, p.id, SYNERGY_ENGINE_VERSION, String(score),
        top.map((b) => b.term).join(','),
        stableStringify(resolved),
      ].join('|')).slice(0, 16)}`;
      candidates.push({
        id,
        methodId: m.id,
        problemId: p.id,
        fromDomain: m.domain,
        toDomain: p.domain,
        bridges: top,
        score,
        support: passing.length,
        alignment,
        farTransfer: far,
        prediction: score >= passThreshold ? 'pass' : 'fail',
        falsification: `If a sandbox run of "${m.name}" against the acceptance test for "${p.name}" fails, this transfer is rejected (engine ${SYNERGY_ENGINE_VERSION}).`,
        filters: failed,
        engineVersion: SYNERGY_ENGINE_VERSION,
        directionalStats,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const manifest = manifestHash([
    SYNERGY_ENGINE_VERSION,
    vocabularyHash(),
    stableStringify(resolved),
    ...methods.map((m) => m.id).sort(),
    ...problems.map((p) => p.id).sort(),
    ...candidates.map((c) => `${c.id}:${c.score}:${c.farTransfer ?? ''}:${stableStringify(c.alignment ?? null)}:${c.bridges.map((b) => b.term).join(',')}`),
  ]);
  return { candidates, graph, manifest };
}
