// src/lib/synergy/macFac.ts
/**
 * MAC/FAC: cheap content-vector prefilter, then SME on survivors. Deterministic.
 */
import type { AlignmentResult } from './types.js';
import { canonicalizeTerm, FUNCTORS } from './vocabulary.js';
import { align, type DGroup } from './sme.js';

/** Functor-frequency content vector over the controlled FUNCTORS vocabulary. */
export function contentVector(d: DGroup): number[] {
  const counts = new Map<string, number>();
  for (const r of d.relations) counts.set(r.functor, (counts.get(r.functor) ?? 0) + 1);
  return FUNCTORS.map((f) => counts.get(canonicalizeTerm(f)) ?? 0);
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function cosine(a: number[], b: number[]): number {
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return na === 0 || nb === 0 ? 0 : dot(a, b) / (na * nb);
}

export function macFilter(target: DGroup, candidates: DGroup[], k: number): DGroup[] {
  const tv = contentVector(target);
  return [...candidates]
    .map((c) => ({ c, sim: Math.round(cosine(tv, contentVector(c)) * 1000) / 1000 }))
    .sort((a, b) => b.sim - a.sim || (a.c.domain < b.c.domain ? -1 : 1))
    .slice(0, Math.max(1, k))
    .map((x) => x.c);
}

export function macFac(target: DGroup, candidates: DGroup[], opts: { k?: number } = {}): AlignmentResult[] {
  const survivors = macFilter(target, candidates, opts.k ?? 5);
  return survivors
    .map((c) => align(target, c))
    .sort((a, b) => b.gmapWeight - a.gmapWeight);
}
