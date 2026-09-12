// src/lib/synergy/methodIndex.ts
/**
 * Method extraction. Only pure functions become MethodSignatures; wall-clock /
 * RNG sources are rejected with a recorded reason (see spec §8.1).
 */
import type { MethodSignature, Rel, StudShape } from './types.js';
import { canonicalizeTerm, isKnownPrimitive } from './vocabulary.js';
import { sha256Hex } from './manifest.js';

export interface RawMethod {
  id: string;
  name: string;
  domain: string;
  source: 'tool' | 'brick' | 'translation';
  primitives?: string[];
  inputContract?: StudShape;
  outputContract?: StudShape;
  complexity?: string;
  sourceCode?: string;
  suite?: string;
  relations?: Rel[];
  deterministic?: boolean;
}

/**
 * Best-effort determinism denylist. May false-positive on comments/string
 * literals; over-rejection is safe (a rejected method simply never enters the
 * index). Unknown-time sources that this scanner cannot see must be caught by
 * the Plan 4 admission gate.
 */
export function detectNonDeterminism(code: string): string | null {
  if (/\bDate\.now\s*\(/.test(code)) return 'wall-clock: Date.now()';
  if (/\bnew\s+Date\s*\(/.test(code)) return 'wall-clock: new Date()';
  if (/\bDate\s*\(/.test(code)) return 'wall-clock: Date()';
  if (/\bperformance\.now\s*\(/.test(code)) return 'wall-clock: performance.now()';
  if (/\bMath\.random\s*\(/.test(code)) return 'rng: Math.random()';
  if (/\bcrypto\.(randomUUID|randomBytes|getRandomValues)\s*\(/.test(code)) return 'rng: crypto.random';
  if (/\bprocess\.hrtime\b/.test(code)) return 'wall-clock: process.hrtime';
  return null;
}

/**
 * Coarse structural placeholder: maps primitives to relations for the
 * closed-discovery stage only. SME (Plan 2) must NOT use these for same-functor
 * matching — real relational predicates must come from `raw.relations`.
 */
export function relationsFromPrimitives(primitives: string[], domain: string): Rel[] {
  return primitives.map((p, i) => ({
    functor: canonicalizeTerm(p),
    type: 'rel' as const,
    args: [domain],
    order: i + 1,
  }));
}

export type ExtractResult = { ok: true; method: MethodSignature } | { ok: false; rejected: string };

export function extractMethod(raw: RawMethod): ExtractResult {
  if (!raw.id || !raw.name) return { ok: false, rejected: 'missing id/name' };
  if (raw.deterministic === false) return { ok: false, rejected: 'declared non-deterministic' };
  if (raw.sourceCode) {
    const reason = detectNonDeterminism(raw.sourceCode);
    if (reason) return { ok: false, rejected: reason };
  }
  const primitives = (raw.primitives ?? []).map(canonicalizeTerm).filter(isKnownPrimitive);
  return {
    ok: true,
    method: {
      id: `method:${raw.source}:${canonicalizeTerm(raw.id)}`,
      name: raw.name,
      domain: raw.domain,
      source: raw.source,
      primitives,
      inputContract: raw.inputContract,
      outputContract: raw.outputContract,
      complexity: raw.complexity,
      deterministic: true,
      relations: raw.relations ?? relationsFromPrimitives(primitives, raw.domain),
      suiteHash: raw.suite ? sha256Hex(raw.suite) : undefined,
    },
  };
}

export function extractMethods(raws: RawMethod[]): {
  methods: MethodSignature[];
  rejected: Array<{ id: string; reason: string }>;
} {
  const methods: MethodSignature[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const raw of raws) {
    const r = extractMethod(raw);
    if (r.ok === true) methods.push(r.method);
    else rejected.push({ id: raw.id, reason: r.rejected });
  }
  methods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { methods, rejected };
}
