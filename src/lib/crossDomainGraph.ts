/**
 * crossDomainGraph.ts — the unified cross-domain graph.
 *
 * Recourse had two independent cross-domain engines that never met:
 *   - the trend engine emits *temporal* evidence (significant lagged Pearson
 *     correlations between time series), and
 *   - the synergy engine emits *structural* evidence (method→problem transfer
 *     candidates backed by shared controlled-vocabulary bridges).
 *
 * This module merges both, on the shared domain vocabulary, into one link per
 * domain pair with a single combined score. It is pure and deterministic: no
 * clock, stable sort, content-addressed manifest. A link carries which evidence
 * channels back it, so a caller can always tell temporal from structural — the
 * combined number is never presented as more than the evidence that produced
 * it.
 */
import type { TransferCandidate } from './synergy/types.js';
import type { LaggedCorrelation } from './trendEngine.js';
import { canonicalDomain } from './crossDomainVocabulary.js';
import { manifestHash } from './synergy/manifest.js';

export interface CrossDomainLink {
  from: string;
  to: string;
  /** Temporal channel (trend engine lagged correlation), when present. */
  temporal?: {
    a: string;
    b: string;
    correlation: number;
    bestLag: number;
    n?: number;
    pValue?: number;
  };
  /** Structural channel (best synergy transfer candidate for the pair). */
  structural?: {
    candidateId: string;
    methodId: string;
    problemId: string;
    score: number;
    support: number;
    farTransfer?: number;
  };
  /** Combined evidence in [0,1]; equals the available channel(s) only. */
  combined: number;
  evidence: Array<'temporal' | 'structural'>;
}

export interface CrossDomainGraphInput {
  correlations?: LaggedCorrelation[];
  /** Series identity + domain, so correlation ids can be mapped to domains. */
  series?: Array<{ id: string; domain: string }>;
  candidates?: TransferCandidate[];
}

export interface CrossDomainGraphResult {
  links: CrossDomainLink[];
  domains: string[];
  manifestHash: string;
  counts: { temporal: number; structural: number; merged: number };
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Build the unified graph. Correlations whose series domains are unknown or
 * collapse to the same canonical domain are dropped (a same-domain "link" is
 * not cross-domain). Candidates already carry sector domains and are canonicalized.
 */
export function buildCrossDomainGraph(input: CrossDomainGraphInput): CrossDomainGraphResult {
  const domainOf = new Map<string, string>();
  for (const s of input.series ?? []) domainOf.set(s.id, canonicalDomain(s.domain));

  const temporal = new Map<string, CrossDomainLink['temporal']>();
  let temporalCount = 0;
  for (const c of input.correlations ?? []) {
    const da = domainOf.get(c.a);
    const db = domainOf.get(c.b);
    if (!da || !db || da === db) continue;
    const key = pairKey(da, db);
    const prev = temporal.get(key);
    const next = {
      a: da,
      b: db,
      correlation: round3(Math.abs(c.correlation)),
      bestLag: c.bestLag,
      ...(typeof c.n === 'number' ? { n: c.n } : {}),
      ...(typeof c.pValue === 'number' ? { pValue: c.pValue } : {}),
    };
    // Keep the strongest correlation per unordered pair (deterministic).
    if (!prev || next.correlation > prev.correlation) temporal.set(key, next);
    temporalCount += 1;
  }

  const structural = new Map<string, { from: string; to: string; data: NonNullable<CrossDomainLink['structural']> }>();
  let structuralCount = 0;
  for (const c of input.candidates ?? []) {
    const from = canonicalDomain(c.fromDomain);
    const to = canonicalDomain(c.toDomain);
    if (from === to) continue;
    const key = pairKey(from, to);
    const prev = structural.get(key);
    const data: NonNullable<CrossDomainLink['structural']> = {
      candidateId: c.id,
      methodId: c.methodId,
      problemId: c.problemId,
      score: round3(clamp01(c.score)),
      support: c.support,
      ...(typeof c.farTransfer === 'number' ? { farTransfer: round3(c.farTransfer) } : {}),
    };
    // Keep the strongest transfer per unordered pair (deterministic tie-break).
    if (!prev || data.score > prev.data.score || (data.score === prev.data.score && data.candidateId < prev.data.candidateId)) {
      structural.set(key, { from, to, data });
    }
    structuralCount += 1;
  }

  const keys = new Set<string>([...temporal.keys(), ...structural.keys()]);
  const links: CrossDomainLink[] = [];
  for (const key of keys) {
    const t = temporal.get(key);
    const s = structural.get(key);
    const evidence: Array<'temporal' | 'structural'> = [];
    if (t) evidence.push('temporal');
    if (s) evidence.push('structural');
    // Combined = mean over the channels that exist. With one channel this is
    // exactly that channel's score — no inflation.
    const parts: number[] = [];
    if (t) parts.push(t.correlation);
    if (s) parts.push(s.data.score);
    const combined = round3(parts.reduce((a, b) => a + b, 0) / parts.length);
    // Direction: prefer structural (method -> problem); else temporal a -> b.
    const from = s ? s.from : t!.a;
    const to = s ? s.to : t!.b;
    links.push({
      from,
      to,
      ...(t ? { temporal: t } : {}),
      ...(s ? { structural: s.data } : {}),
      combined,
      evidence,
    });
  }

  links.sort(
    (a, b) =>
      b.combined - a.combined ||
      (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
      (a.to < b.to ? -1 : a.to > b.to ? 1 : 0),
  );

  const domains = [...new Set(links.flatMap((l) => [l.from, l.to]))].sort();
  const merged = links.filter((l) => l.evidence.length === 2).length;
  const manifest = manifestHash([
    'cross-domain-graph:1',
    ...links.map((l) => `${l.from}->${l.to}:${l.combined}:${l.evidence.join('+')}:${l.temporal?.correlation ?? ''}:${l.structural?.score ?? ''}`),
  ]);

  return {
    links,
    domains,
    manifestHash: manifest,
    counts: { temporal: temporalCount, structural: structuralCount, merged },
  };
}

/** Links touching a canonical domain, strongest first. */
export function linksForDomain(graph: CrossDomainGraphResult, domain: string): CrossDomainLink[] {
  const d = canonicalDomain(domain);
  return graph.links.filter((l) => l.from === d || l.to === d);
}
