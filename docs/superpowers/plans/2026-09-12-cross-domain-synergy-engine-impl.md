# Cross-Domain Synergy Engine — Plan 1 (Deterministic Closed-Discovery Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, no-AI core of the cross-domain synergy engine: sector registry, controlled vocabulary, method/problem indexing, a weighted concept graph, closed-discovery bridge search, deterministic filters, a synergy map, a route, and ledger wiring.

**Architecture:** Pure modules under `src/lib/synergy/` following the repo's `src/lib/composer/` and `src/lib/memory/` conventions. Graph nodes are methods, problems, and controlled-vocabulary terms; bridges are shared vocabulary terms; a candidate transfer is scored `score = base * coverage^0.5` with `base = mean(min(w(M,b), w(b,P)))`. Everything is deterministic and content-hashed. No model, no network.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), vitest, Express router (mounted at `/api/recourse`), `node:crypto`. Reuses `src/lib/trendLedger.ts`, `src/lib/problemArchive.ts`, `src/lego/contracts.ts` shapes, `src/lib/novelty.ts` style.

**Spec:** `docs/superpowers/specs/2026-09-12-cross-domain-synergy-engine-design.md`

**Deferred to later plans (do NOT build here):** SME structural alignment + MAC/FAC (Plan 2), statistical layer (Plan 3), sandbox resolver + admission gate (Plan 4), AI adapter drafting + `decisionEngine` rewire + UI (Plan 5).

---

## File Structure

**Create:**
- `src/lib/synergy/types.ts` — shared types
- `src/lib/synergy/manifest.ts` — `sha256Hex`, `stableStringify`, `manifestHash`
- `src/lib/synergy/vocabulary.ts` — controlled primitives/functors + hash
- `src/lib/synergy/domainRegistry.ts` — `DomainSpec` registry
- `src/lib/synergy/methodIndex.ts` — method extraction + determinism gate
- `src/lib/synergy/problemIndex.ts` — problem extraction
- `src/lib/synergy/graph.ts` — controlled-token weighted graph
- `src/lib/synergy/filters.ts` — deterministic bridge gates
- `src/lib/synergy/closedDiscovery.ts` — bridge search + candidate scoring
- `src/lib/synergy/synergyMap.ts` — map build + `crossDomainSynergyFor`
- `src/lib/synergy/store.ts` — file-backed map store
- `src/lib/synergy/ledger.ts` — discovery-ledger wiring
- `src/routes/synergy.ts` — Express routes
- `tests/synergy/*.test.ts` — one test file per module

**Modify:**
- `vitest.config.ts` — exclude `src/lib/synergy/types.ts` from coverage
- `src/intake/corpus/index.ts` — add Truck Buddy corpus root
- `server.ts` — mount synergy router
- `README.md` — add a "Cross-domain synergy engine" section

**Conventions:** source-relative imports use `.js`; test imports use `.js`; tests are named `tests/synergy/<module>.test.ts`; commits are conventional (`feat(synergy): ...`).

---

### Task 1: Deterministic hashing utilities

**Files:**
- Create: `src/lib/synergy/manifest.ts`
- Test: `tests/synergy/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/manifest.test.ts
import { describe, it, expect } from 'vitest';
import { sha256Hex, stableStringify, manifestHash } from '../../src/lib/synergy/manifest.js';

describe('manifest hashing', () => {
  it('sha256Hex is stable and hex', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
  });

  it('stableStringify sorts object keys but keeps array order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify([2, 1])).toBe('[2,1]');
    expect(stableStringify({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
  });

  it('manifestHash is order/format stable over the same parts', () => {
    expect(manifestHash(['a', 'b'])).toBe(manifestHash(['a', 'b']));
    expect(manifestHash(['a', 'b'])).not.toBe(manifestHash(['b', 'a']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/manifest.test.ts`
Expected: FAIL — cannot find module `../../src/lib/synergy/manifest.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/manifest.ts
/**
 * Deterministic content hashing for the synergy engine. Every map/candidate
 * carries a manifest hash so re-runs are diffable bit-for-bit.
 */
import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic, key-sorted JSON. Arrays keep their given order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function manifestHash(parts: string[]): string {
  return sha256Hex(parts.join('\n'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/manifest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/manifest.ts tests/synergy/manifest.test.ts
git commit -m "feat(synergy): add deterministic manifest hashing"
```

---

### Task 2: Shared types + coverage exclusion

**Files:**
- Create: `src/lib/synergy/types.ts`
- Modify: `vitest.config.ts` (add to `coverage.exclude`)

- [ ] **Step 1: Write the types**

```ts
// src/lib/synergy/types.ts
/**
 * Shared types for the cross-domain synergy engine. Types only — no runtime.
 */

export type EvidenceStatus = 'hypothesis' | 'tested' | 'reproduced' | 'refuted' | 'stale';
export type RelType = 'rel' | 'attr' | 'fn';

export interface Rel {
  functor: string;
  type: RelType;
  args: string[];
  order: number;
}

export interface StudShape {
  dims: Array<number | string>;
  dtype: string;
  preconditions: string[];
}

export interface MethodSignature {
  id: string;
  name: string;
  domain: string;
  source: 'tool' | 'brick' | 'translation';
  primitives: string[];
  inputContract?: StudShape;
  outputContract?: StudShape;
  complexity?: string;
  deterministic: boolean;
  relations: Rel[];
  suiteHash?: string;
}

export interface ProblemSignature {
  id: string;
  name: string;
  domain: string;
  requiredPrimitives: string[];
  requiredContract?: StudShape;
  acceptanceTest: string;
  testHash: string;
  extraction: 'heuristic' | 'declared';
  relations: Rel[];
}

export interface BridgeEvidence {
  term: string;
  weightAB: number;
  weightBC: number;
  score: number;
  docs: number;
}

export interface FilterDecision {
  gate: string;
  passed: boolean;
  reason: string;
}

export interface TransferCandidate {
  id: string;
  methodId: string;
  problemId: string;
  fromDomain: string;
  toDomain: string;
  bridges: BridgeEvidence[];
  score: number;
  support: number;
  prediction: 'pass' | 'fail';
  falsification: string;
  filters: FilterDecision[];
  engineVersion: string;
}

export interface SynergyEdge {
  from: string;
  to: string;
  kind: 'resolved' | 'candidate';
  score: number;
  passes: number;
  attempts: number;
  backingIds: string[];
}

export interface SynergyMap {
  engineVersion: string;
  generatedAtRun: string;
  domains: string[];
  edges: SynergyEdge[];
  candidates: TransferCandidate[];
  manifestHash: string;
}
```

- [ ] **Step 2: Exclude the type-only module from coverage**

In `vitest.config.ts`, inside `coverage.exclude` (after `'src/lib/memory/types.ts',`), add:

```ts
        // Pure type module — no runtime to cover.
        'src/lib/synergy/types.ts',
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/synergy/types.ts vitest.config.ts
git commit -m "feat(synergy): add shared types and coverage exclusion"
```

---

### Task 3: Controlled vocabulary

**Files:**
- Create: `src/lib/synergy/vocabulary.ts`
- Test: `tests/synergy/vocabulary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/vocabulary.test.ts
import { describe, it, expect } from 'vitest';
import {
  PRIMITIVES,
  FUNCTORS,
  VOCAB_VERSION,
  canonicalizeTerm,
  isKnownPrimitive,
  vocabularyTerms,
  vocabularyHash,
  bridgeTerms,
} from '../../src/lib/synergy/vocabulary.js';
import { manifestHash } from '../../src/lib/synergy/manifest.js';

describe('controlled vocabulary', () => {
  it('canonicalizes surface terms to stable ids', () => {
    expect(canonicalizeTerm('Time Series!')).toBe('time_series');
    expect(canonicalizeTerm('  Graph  ')).toBe('graph');
    expect(canonicalizeTerm('optimization')).toBe('optimization');
  });

  it('recognizes only known primitives', () => {
    expect(isKnownPrimitive('graph')).toBe(true);
    expect(isKnownPrimitive('nonsense')).toBe(false);
  });

  it('terms = primitives + functors; bridges = primitives only', () => {
    expect(vocabularyTerms()).toContain('graph');
    expect(vocabularyTerms().length).toBe(PRIMITIVES.length + FUNCTORS.length);
    expect(bridgeTerms()).not.toContain('depends_on');
    expect(bridgeTerms().length).toBe(PRIMITIVES.length);
    expect(VOCAB_VERSION).toBe('1.0.0');
  });

  it('pins the vocabulary fingerprint and detects any change', () => {
    const digest = vocabularyHash();
    expect(digest).toHaveLength(64);
    // Golden value: pin the exact digest so any vocabulary/encoding change fails.
    expect(digest).toBe('f6cb72357f01b72d70558132ed5b3201943d7372f807f8569e22d9a5dcbfa42e');
  });

  it('length-prefixes separate primitive/functor lists so the boundary is load-bearing', () => {
    const separated = manifestHash([
      VOCAB_VERSION,
      ...PRIMITIVES.map((p) => `P:${p}`),
      ...FUNCTORS.map((f) => `F:${f}`),
    ]);
    expect(separated).toBe(vocabularyHash());

    const collapsed = manifestHash([
      VOCAB_VERSION,
      ...[...PRIMITIVES, ...FUNCTORS].map((t) => `T:${t}`),
    ]);
    expect(collapsed).not.toBe(vocabularyHash());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/vocabulary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/vocabulary.ts
/**
 * Versioned controlled relational vocabulary. This is the precision lever:
 * only these tokens become graph bridge terms, which is what keeps the
 * closed-discovery baseline from degenerating into free-text lexical noise.
 */
import { manifestHash } from './manifest.js';

export const VOCAB_VERSION = '1.0.0';

export const PRIMITIVES = [
  'transform', 'loss', 'optimizer', 'memory', 'router', 'evaluator',
  'graph', 'sequence', 'geometry', 'statistics', 'scheduling', 'compliance',
  'prediction', 'search', 'optimization', 'probability', 'linear_algebra',
  'signal', 'control', 'ranking', 'clustering', 'simulation',
] as const;

export const FUNCTORS = [
  'depends_on', 'derives', 'maps_to', 'satisfies', 'bounds',
  'schedules', 'measures', 'classifies',
] as const;

const PRIMITIVE_SET = new Set<string>(PRIMITIVES);

export function isKnownPrimitive(x: string): boolean {
  return PRIMITIVE_SET.has(x);
}

export function canonicalizeTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Primitives only — the only tokens allowed as graph bridge terms. Functors
 *  are relational and are rejected by the semantic_type gate by design. */
export function bridgeTerms(): string[] {
  return PRIMITIVES.map(canonicalizeTerm);
}

export function vocabularyTerms(): string[] {
  return [...PRIMITIVES, ...FUNCTORS].map(canonicalizeTerm);
}

export function vocabularyHash(): string {
  // Length-prefixed (via manifestHash) over separate P:/F: lists so a term
  // moving across the primitive/functor boundary changes the digest.
  return manifestHash([
    VOCAB_VERSION,
    ...PRIMITIVES.map((p) => `P:${p}`),
    ...FUNCTORS.map((f) => `F:${f}`),
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/vocabulary.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/vocabulary.ts tests/synergy/vocabulary.test.ts
git commit -m "feat(synergy): add versioned controlled vocabulary"
```

---

### Task 4: Sector registry

**Files:**
- Create: `src/lib/synergy/domainRegistry.ts`
- Test: `tests/synergy/domainRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/domainRegistry.test.ts
import { describe, it, expect } from 'vitest';
import {
  listDomains,
  getDomain,
  unverifiedDomains,
  domainsForToolDomain,
} from '../../src/lib/synergy/domainRegistry.js';

describe('domain registry', () => {
  it('includes the seven operator sectors and marks logistics verified', () => {
    const ids = listDomains().map((d) => d.id);
    for (const id of ['health_oncology', 'mathematics', 'cybersecurity', 'neuro_music', 'aging', 'sports', 'logistics']) {
      expect(ids).toContain(id);
    }
    expect(getDomain('logistics')?.verified).toBe(true);
    expect(getDomain('logistics')?.corpusProjects).toContain('truck-buddy');
  });

  it('maps tool domains to sectors', () => {
    expect(domainsForToolDomain('math').map((d) => d.id)).toContain('mathematics');
    expect(domainsForToolDomain('cyber_defense').map((d) => d.id)).toContain('cybersecurity');
  });

  it('reports unverified sectors honestly', () => {
    expect(unverifiedDomains()).toEqual([]);
    expect(getDomain('does_not_exist')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/domainRegistry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/domainRegistry.ts
/**
 * Sector registry. Each DomainSpec binds a sector to its real evidence
 * sources. A sector with no source stays verified:false and is reported as an
 * honest empty node — never padded.
 */
import type { ToolDomain } from '../../types.js';
import type { TranslationEngineId } from '../translationBridge.js';

export interface DomainSpec {
  id: string;
  label: string;
  toolDomains: ToolDomain[];
  corpusProjects: string[];
  translationEngines: TranslationEngineId[];
  seriesTerms?: string[];
  verified: boolean;
}

export const DEFAULT_DOMAINS: DomainSpec[] = [
  { id: 'health_oncology', label: 'Health & oncology / biotech', toolDomains: ['biotech'], corpusProjects: ['overlay-oncology', 'blackmind', 'hempforge', 'cancer-pdfs'], translationEngines: [], verified: true },
  { id: 'mathematics', label: 'Mathematics', toolDomains: ['math'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'cybersecurity', label: 'Cybersecurity', toolDomains: ['cyber_defense'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'neuro_music', label: 'Neuroscience / music therapy / auditory', toolDomains: ['neuro_symbolic'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'aging', label: 'Aging / geroscience / longevity', toolDomains: ['biotech'], corpusProjects: [], seriesTerms: ['senescence', 'rapamycin', 'metformin', 'longevity', 'telomere'], verified: true },
  { id: 'sports', label: 'Sports (basketball, golf)', toolDomains: ['biotech'], corpusProjects: ['bb-tech', 'sports-science', 'golf-surgery'], translationEngines: ['bbtech', 'golf-surgery'], verified: true },
  { id: 'logistics', label: 'Logistics & freight', toolDomains: ['systemic', 'coding'], corpusProjects: ['truck-buddy'], translationEngines: [], verified: true },
];

export function listDomains(): DomainSpec[] {
  return [...DEFAULT_DOMAINS];
}

export function getDomain(id: string): DomainSpec | undefined {
  return DEFAULT_DOMAINS.find((d) => d.id === id);
}

export function unverifiedDomains(): DomainSpec[] {
  return DEFAULT_DOMAINS.filter((d) => !d.verified);
}

export function domainsForToolDomain(td: ToolDomain): DomainSpec[] {
  return DEFAULT_DOMAINS.filter((d) => d.toolDomains.includes(td));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/domainRegistry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/domainRegistry.ts tests/synergy/domainRegistry.test.ts
git commit -m "feat(synergy): add sector registry with real evidence sources"
```

---

### Task 5: Method index + determinism admission gate

**Files:**
- Create: `src/lib/synergy/methodIndex.ts`
- Test: `tests/synergy/methodIndex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/methodIndex.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectNonDeterminism,
  extractMethod,
  extractMethods,
  type RawMethod,
} from '../../src/lib/synergy/methodIndex.js';

const pure: RawMethod = {
  id: 'predictMaintenance',
  name: 'Predictive maintenance',
  domain: 'logistics',
  source: 'tool',
  primitives: ['prediction', 'statistics'],
  suite: 'assert predictMaintenance(vehicle).length === 0;',
  sourceCode: 'export function trend(v){ return v[v.length-1] - v[0]; }',
};

describe('method index', () => {
  it('extracts a pure method with stable id, primitives, and suite hash', () => {
    const r = extractMethod(pure);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method.id).toBe('method:tool:predictmaintenance');
      expect(r.method.primitives).toEqual(['prediction', 'statistics']);
      expect(r.method.deterministic).toBe(true);
      expect(r.method.suiteHash).toHaveLength(64);
    }
  });

  it('rejects non-deterministic sources with an explicit reason', () => {
    expect(detectNonDeterminism('return new Date().toISOString();')).toContain('new Date');
    expect(detectNonDeterminism('return Date.now();')).toContain('Date.now');
    expect(detectNonDeterminism('return Math.random();')).toContain('Math.random');
    expect(detectNonDeterminism('const t = values[values.length-1];')).toBeNull();

    const r = extractMethod({ ...pure, id: 'buildDossier', sourceCode: 'return new Date().toISOString();' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected).toContain('new Date');
  });

  it('extractMethods sorts and reports rejections', () => {
    const { methods, rejected } = extractMethods([
      pure,
      { ...pure, id: 'zMethod', name: 'Z' },
      { ...pure, id: 'buildDossier', sourceCode: 'return Date.now();' },
    ]);
    expect(methods.map((m) => m.name)).toEqual(['Predictive maintenance', 'Z']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].id).toBe('buildDossier');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/methodIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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

export function detectNonDeterminism(code: string): string | null {
  if (/\bDate\.now\s*\(/.test(code)) return 'wall-clock: Date.now()';
  if (/\bnew\s+Date\s*\(/.test(code)) return 'wall-clock: new Date()';
  if (/\bMath\.random\s*\(/.test(code)) return 'rng: Math.random()';
  if (/\bprocess\.hrtime\b/.test(code)) return 'wall-clock: process.hrtime';
  return null;
}

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
    if (r.ok) methods.push(r.method);
    else rejected.push({ id: raw.id, reason: r.rejected });
  }
  methods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { methods, rejected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/methodIndex.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/methodIndex.ts tests/synergy/methodIndex.test.ts
git commit -m "feat(synergy): add method index with determinism gate"
```

---

### Task 6: Problem index

**Files:**
- Create: `src/lib/synergy/problemIndex.ts`
- Test: `tests/synergy/problemIndex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/problemIndex.test.ts
import { describe, it, expect } from 'vitest';
import { extractProblem, extractProblems } from '../../src/lib/synergy/problemIndex.js';
import type { RecourseProblem } from '../../src/lib/problemArchive.js';

const problem: RecourseProblem = {
  id: 'repro:trend-analyzer',
  domain: 'mathematics',
  title: 'Reproduce: Time-Series Trend & Breakout Analyzer',
  statement: 'Implement a capability that satisfies the acceptance criteria. Analyze the trend and detect a breakout over the series.',
  acceptanceTest: 'const a = TrendAnalyzer.analyzeTrend([{value:1},{value:2}]); assert a.slope > 0;',
};

describe('problem index', () => {
  it('extracts a stable id, test hash, and heuristic primitives', () => {
    const p = extractProblem(problem);
    expect(p.id).toBe('problem:repro_trend_analyzer');
    expect(p.testHash).toHaveLength(64);
    expect(p.extraction).toBe('heuristic');
    expect(p.requiredPrimitives).toContain('prediction');
  });

  it('produces no primitives when the text mentions none', () => {
    const p = extractProblem({ ...problem, title: 'Alpha', statement: 'Beta', acceptanceTest: 'assert true;' });
    expect(p.requiredPrimitives).toEqual([]);
  });

  it('extractProblems sorts by id', () => {
    const ps = extractProblems([problem, { ...problem, id: 'aaa' }]);
    expect(ps.map((p) => p.domain)).toEqual(['mathematics', 'mathematics']);
    expect(ps[0].id < ps[1].id).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/problemIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/problemIndex.ts
/**
 * Problem extraction from RecourseProblem. Primitive detection is a labeled
 * heuristic over the statement + acceptance test — never claimed as measured.
 */
import type { RecourseProblem } from '../problemArchive.js';
import type { ProblemSignature, Rel } from './types.js';
import { PRIMITIVES, canonicalizeTerm } from './vocabulary.js';
import { sha256Hex } from './manifest.js';

export function extractProblem(p: RecourseProblem): ProblemSignature {
  const text = `${p.title}\n${p.statement}\n${p.acceptanceTest}`.toLowerCase();
  const requiredPrimitives = PRIMITIVES
    .filter((prim) => new RegExp(`\\b${String(prim).replace(/_/g, '[_ ]?')}\\b`).test(text))
    .map((prim) => canonicalizeTerm(prim));
  const relations: Rel[] = requiredPrimitives.map((prim, i) => ({
    functor: prim,
    type: 'rel',
    args: [p.domain],
    order: i + 1,
  }));
  return {
    id: `problem:${canonicalizeTerm(p.id)}`,
    name: p.title,
    domain: p.domain,
    requiredPrimitives,
    acceptanceTest: p.acceptanceTest,
    testHash: sha256Hex(p.acceptanceTest),
    extraction: 'heuristic',
    relations,
  };
}

export function extractProblems(ps: RecourseProblem[]): ProblemSignature[] {
  return ps.map(extractProblem).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/problemIndex.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/problemIndex.ts tests/synergy/problemIndex.test.ts
git commit -m "feat(synergy): add problem index with heuristic primitive extraction"
```

---

### Task 7: Controlled-token weighted graph

**Files:**
- Create: `src/lib/synergy/graph.ts`
- Test: `tests/synergy/graph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/graph.test.ts
import { describe, it, expect } from 'vitest';
import { controlledTokens, buildGraph, edgeWeight, termDocFrequency } from '../../src/lib/synergy/graph.js';

describe('controlled-token graph', () => {
  it('extracts only vocabulary terms, ignoring free text', () => {
    const toks = controlledTokens('Analyze the trend and detect a breakout over the series with a graph');
    expect(toks).toContain('graph');
    expect(toks).not.toContain('breakout');
    expect(toks).not.toContain('trend');
  });

  it('builds tf-normalized method/term edges and document frequencies', () => {
    const g = buildGraph([
      { id: 'method:a', domain: 'mathematics', text: 'graph graph sequence' },
      { id: 'problem:b', domain: 'logistics', text: 'graph prediction' },
    ]);
    expect(edgeWeight(g, 'method:a', 'term:graph')).toBe(1);
    expect(edgeWeight(g, 'method:a', 'term:sequence')).toBe(0.5);
    expect(termDocFrequency(g, 'term:graph')).toBe(2);
    expect(termDocFrequency(g, 'term:prediction')).toBe(1);
    expect(g.docCount).toBe(2);
  });

  it('returns 0 for unknown edges', () => {
    const g = buildGraph([{ id: 'x', domain: 'd', text: 'graph' }]);
    expect(edgeWeight(g, 'x', 'term:nope')).toBe(0);
    expect(edgeWeight(g, 'missing', 'term:graph')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/graph.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/graph.ts
/**
 * Controlled-token weighted graph. Nodes are method/problem doc ids and
 * `term:<vocab>` nodes. Edges are tf-normalized weights; df is tracked for the
 * generalness filter. Only vocabulary tokens become terms — this is the
 * precision lever from the spec's representation-bottleneck warning.
 */
import { bridgeTerms } from './vocabulary.js';

export interface GraphDoc {
  id: string;
  domain: string;
  text: string;
}

export interface WeightedGraph {
  nodes: string[];
  adjacency: Map<string, Map<string, number>>;
  docFrequency: Map<string, number>;
  docCount: number;
}

export function controlledTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const term of bridgeTerms()) {
    const re = new RegExp(`\\b${term.replace(/_/g, '[_ ]?')}\\b`, 'g');
    const matches = lower.match(re);
    if (matches) for (let i = 0; i < matches.length; i++) out.push(term);
  }
  return out;
}

export function buildGraph(docs: GraphDoc[]): WeightedGraph {
  const adjacency = new Map<string, Map<string, number>>();
  const docFrequency = new Map<string, number>();
  for (const doc of docs) {
    const counts = new Map<string, number>();
    for (const t of controlledTokens(doc.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    const row = new Map<string, number>();
    for (const [t, c] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const key = `term:${t}`;
      row.set(key, Math.round((c / max) * 1000) / 1000);
      docFrequency.set(key, (docFrequency.get(key) ?? 0) + 1);
    }
    adjacency.set(doc.id, row);
  }
  const nodes = [...new Set([...adjacency.keys(), ...docFrequency.keys()])].sort();
  return { nodes, adjacency, docFrequency, docCount: docs.length };
}

export function edgeWeight(g: WeightedGraph, a: string, b: string): number {
  return g.adjacency.get(a)?.get(b) ?? 0;
}

export function termDocFrequency(g: WeightedGraph, term: string): number {
  return g.docFrequency.get(term) ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/graph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/graph.ts tests/synergy/graph.test.ts
git commit -m "feat(synergy): add controlled-token weighted graph"
```

---

### Task 8: Deterministic bridge filters

**Files:**
- Create: `src/lib/synergy/filters.ts`
- Test: `tests/synergy/filters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/filters.test.ts
import { describe, it, expect } from 'vitest';
import { filterBridge, allPassed, type FilterContext } from '../../src/lib/synergy/filters.js';
import { buildGraph } from '../../src/lib/synergy/graph.js';
import type { BridgeEvidence } from '../../src/lib/synergy/types.js';

const graph = buildGraph([
  { id: 'method:a', domain: 'mathematics', text: 'graph sequence' },
  { id: 'problem:b', domain: 'logistics', text: 'graph prediction' },
]);

const baseCtx: FilterContext = {
  graph,
  stoplist: [],
  maxDocFrequency: 0.9,
  minDocsPerLeg: 1,
  fromDomain: 'mathematics',
  toDomain: 'logistics',
  knownPairs: [],
};

const bridge: BridgeEvidence = { term: 'term:graph', weightAB: 1, weightBC: 1, score: 1, docs: 2 };

describe('bridge filters', () => {
  it('passes a known primitive with sufficient evidence', () => {
    const d = filterBridge(bridge, baseCtx);
    expect(allPassed(d)).toBe(true);
  });

  it('rejects unknown terms at the semantic_type gate', () => {
    const d = filterBridge({ ...bridge, term: 'term:breakout' }, baseCtx);
    expect(allPassed(d)).toBe(false);
    expect(d.find((x) => x.gate === 'semantic_type')?.passed).toBe(false);
  });

  it('rejects same-sector pairs', () => {
    const d = filterBridge(bridge, { ...baseCtx, toDomain: 'mathematics' });
    expect(d.find((x) => x.gate === 'cross_domain')?.passed).toBe(false);
  });

  it('rejects over-general terms and known pairs', () => {
    const general = filterBridge(bridge, { ...baseCtx, maxDocFrequency: 0.5 });
    expect(general.find((x) => x.gate === 'generalness')?.passed).toBe(false);
    const known = filterBridge(bridge, { ...baseCtx, knownPairs: ['mathematics->logistics'] });
    expect(known.find((x) => x.gate === 'novelty')?.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/filters.ts
/**
 * Deterministic bridge gates (spec §8.6). Order: cross_domain, semantic_type,
 * generalness, evidence, novelty. Every decision (pass or fail) is returned
 * with a reason so rejections are auditable.
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
  return [
    {
      gate: 'cross_domain',
      passed: ctx.fromDomain !== ctx.toDomain,
      reason: ctx.fromDomain !== ctx.toDomain ? 'distinct sectors' : 'same sector',
    },
    {
      gate: 'semantic_type',
      passed: isKnownPrimitive(term),
      reason: isKnownPrimitive(term) ? 'known primitive' : `unknown term "${term}"`,
    },
    {
      gate: 'generalness',
      passed: !ctx.stoplist.includes(term) && df <= ctx.maxDocFrequency,
      reason: `df=${df} max=${ctx.maxDocFrequency}`,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/filters.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/filters.ts tests/synergy/filters.test.ts
git commit -m "feat(synergy): add deterministic bridge filters"
```

---

### Task 9: Closed-discovery bridge search + candidate scoring

**Files:**
- Create: `src/lib/synergy/closedDiscovery.ts`
- Test: `tests/synergy/closedDiscovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/closedDiscovery.test.ts
import { describe, it, expect } from 'vitest';
import { discover, findBridges, SYNERGY_ENGINE_VERSION } from '../../src/lib/synergy/closedDiscovery.js';
import type { MethodSignature, ProblemSignature } from '../../src/lib/synergy/types.js';

function method(id: string, domain: string, primitives: string[]): MethodSignature {
  return {
    id, name: id, domain, source: 'tool', primitives, deterministic: true,
    relations: primitives.map((p, i) => ({ functor: p, type: 'rel', args: [domain], order: i + 1 })),
  };
}
function problem(id: string, domain: string, requiredPrimitives: string[], acceptanceTest = 'assert true;'): ProblemSignature {
  return {
    id, name: id, domain, requiredPrimitives, acceptanceTest, testHash: 'x', extraction: 'heuristic',
    relations: requiredPrimitives.map((p, i) => ({ functor: p, type: 'rel', args: [domain], order: i + 1 })),
  };
}

const methods = [method('method:a', 'mathematics', ['graph', 'sequence'])];
const problems = [problem('problem:b', 'logistics', ['graph', 'prediction'])];

describe('closed discovery', () => {
  it('finds the shared controlled-vocabulary bridge', () => {
    // Build a graph implicitly through discover; findBridges needs it, so test via discover.
    const { candidates } = discover(methods, problems);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].bridges.map((b) => b.term)).toContain('term:graph');
    expect(candidates[0].fromDomain).toBe('mathematics');
    expect(candidates[0].toDomain).toBe('logistics');
  });

  it('is deterministic (same inputs -> same candidate ids and manifest)', () => {
    const a = discover(methods, problems);
    const b = discover(methods, problems);
    expect(a.manifest).toBe(b.manifest);
    expect(a.candidates).toEqual(b.candidates);
  });

  it('excludes same-domain pairs', () => {
    const { candidates } = discover(methods, [problem('problem:c', 'mathematics', ['graph'])]);
    expect(candidates).toHaveLength(0);
  });

  it('emits a falsification statement per candidate', () => {
    const { candidates } = discover(methods, problems);
    expect(candidates[0].falsification).toMatch(/sandbox run/i);
    expect(candidates[0].engineVersion).toBe(SYNERGY_ENGINE_VERSION);
  });

  it('findBridges returns [] for unindexed ids', () => {
    const { graph } = discover(methods, problems);
    expect(findBridges(graph, 'method:a', 'problem:b').length).toBeGreaterThan(0);
    expect(findBridges(graph, 'missing', 'problem:b')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/closedDiscovery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
import { manifestHash, sha256Hex } from './manifest.js';
import { vocabularyHash } from './vocabulary.js';

export const SYNERGY_ENGINE_VERSION = '0.1.0';

export interface DiscoverOptions {
  maxDocFrequency?: number;
  minDocsPerLeg?: number;
  topBridges?: number;
  passThreshold?: number;
  coverageExponent?: number;
  stoplist?: string[];
  knownPairs?: string[];
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
  return [s.name, s.domain, ...prims, ...s.relations.map((r) => r.functor)].join(' ');
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
  const maxDocFrequency = opts.maxDocFrequency ?? SYNERGY_CALIBRATION.maxDocFrequency;
  const minDocsPerLeg = opts.minDocsPerLeg ?? SYNERGY_CALIBRATION.minDocsPerLeg;
  const topBridges = opts.topBridges ?? SYNERGY_CALIBRATION.topBridges;
  const passThreshold = opts.passThreshold ?? SYNERGY_CALIBRATION.passThreshold;
  const coverageExponent = opts.coverageExponent ?? SYNERGY_CALIBRATION.coverageExponent;
  const stoplist = opts.stoplist ?? [...SYNERGY_CALIBRATION.stoplist];
  const knownPairs = opts.knownPairs ?? [];

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
      const score = Math.round(base * Math.pow(coverage, coverageExponent) * 1000) / 1000;
      const id = `tc_${sha256Hex(`${m.id}|${p.id}|${SYNERGY_ENGINE_VERSION}`).slice(0, 16)}`;
      candidates.push({
        id,
        methodId: m.id,
        problemId: p.id,
        fromDomain: m.domain,
        toDomain: p.domain,
        bridges: top,
        score,
        support: passing.length,
        prediction: score >= passThreshold ? 'pass' : 'fail',
        falsification: `If a sandbox run of "${m.name}" against the acceptance test for "${p.name}" fails, this transfer is rejected (engine ${SYNERGY_ENGINE_VERSION}).`,
        filters: failed,
        engineVersion: SYNERGY_ENGINE_VERSION,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const manifest = manifestHash([
    SYNERGY_ENGINE_VERSION,
    vocabularyHash(),
    ...methods.map((m) => m.id),
    ...problems.map((p) => p.id),
    ...candidates.map((c) => `${c.id}:${c.score}:${c.bridges.map((b) => b.term).join(',')}`),
  ]);
  return { candidates, graph, manifest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/closedDiscovery.test.ts`
Expected: PASS (5 tests). If `prediction` is `fail` for the graph bridge that is fine; tests do not assert prediction value.

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/closedDiscovery.ts tests/synergy/closedDiscovery.test.ts
git commit -m "feat(synergy): add deterministic closed-discovery bridge search"
```

---

### Task 10: Synergy map + `crossDomainSynergyFor`

**Files:**
- Create: `src/lib/synergy/synergyMap.ts`
- Test: `tests/synergy/synergyMap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/synergyMap.test.ts
import { describe, it, expect } from 'vitest';
import { buildSynergyMap, crossDomainSynergyFor } from '../../src/lib/synergy/synergyMap.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

function candidate(id: string, from: string, to: string, score: number): TransferCandidate {
  return {
    id, methodId: 'm', problemId: 'p', fromDomain: from, toDomain: to,
    bridges: [], score, support: 1, prediction: 'pass', falsification: '',
    filters: [], engineVersion: '0.1.0',
  };
}

const candidates = [
  candidate('tc_1', 'mathematics', 'logistics', 0.8),
  candidate('tc_2', 'mathematics', 'logistics', 0.4),
  candidate('tc_3', 'sports', 'health_oncology', 0.6),
];

describe('synergy map', () => {
  it('aggregates candidate edges per domain pair deterministically', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    const edge = map.edges.find((e) => e.from === 'mathematics' && e.to === 'logistics');
    expect(edge?.attempts).toBe(2);
    expect(edge?.score).toBe(0.8);
    expect(edge?.kind).toBe('candidate');
    expect(map.domains).toEqual(['health_oncology', 'logistics', 'mathematics', 'sports']);
    const again = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    expect(again.manifestHash).toBe(map.manifestHash);
  });

  it('crossDomainSynergyFor is 0 for a domain with no resolved edges and no candidates', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    expect(crossDomainSynergyFor(map, 'cybersecurity')).toBe(0);
  });

  it('crossDomainSynergyFor rises with open opportunity', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    const math = crossDomainSynergyFor(map, 'mathematics');
    const empty = crossDomainSynergyFor(map, 'cybersecurity');
    expect(math).toBeGreaterThan(empty);
    expect(math).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/synergyMap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
  const grouped = new Map<string, SynergyEdge>();
  for (const c of candidates) {
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
  const domains = [...new Set(candidates.flatMap((c) => [c.fromDomain, c.toDomain]))].sort();
  const manifest = manifestHash([
    SYNERGY_ENGINE_VERSION,
    generatedAtRun,
    ...edges.map((e) => `${e.from}->${e.to}:${e.score}:${e.attempts}`),
    ...candidates.map((c) => `${c.id}:${c.score}`),
  ]);
  return {
    engineVersion: SYNERGY_ENGINE_VERSION,
    generatedAtRun,
    domains,
    edges,
    candidates: [...candidates],
    manifestHash: manifest,
  };
}

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/synergyMap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/synergyMap.ts tests/synergy/synergyMap.test.ts
git commit -m "feat(synergy): add synergy map and crossDomainSynergyFor"
```

---

### Task 11: File-backed map store

**Files:**
- Create: `src/lib/synergy/store.ts`
- Test: `tests/synergy/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/store.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { synergyMapPath, readSynergyMap, writeSynergyMap } from '../../src/lib/synergy/store.js';
import type { SynergyMap } from '../../src/lib/synergy/types.js';

const TEST_FILE = `${process.cwd()}\\data\\test-synergy-map.json`;

beforeAll(() => {
  process.env.SYNERGY_MAP_FILE = TEST_FILE;
  fs.rmSync(TEST_FILE, { force: true });
});

const map: SynergyMap = {
  engineVersion: '0.1.0', generatedAtRun: 'run:test', domains: ['a', 'b'],
  edges: [], candidates: [], manifestHash: 'deadbeef',
};

describe('synergy map store', () => {
  it('reads null when the file is absent (fail-soft)', () => {
    expect(readSynergyMap()).toBeNull();
    expect(synergyMapPath()).toBe(TEST_FILE);
  });

  it('round-trips a map', () => {
    writeSynergyMap(map);
    expect(readSynergyMap()).toEqual(map);
  });

  it('returns null on corrupt content rather than throwing', () => {
    fs.writeFileSync(TEST_FILE, '{not json', 'utf-8');
    expect(readSynergyMap()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/store.ts
/**
 * File-backed synergy map store. Env override SYNERGY_MAP_FILE keeps tests
 * isolated from the real data/synergy-map.json. Fail-soft reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SynergyMap } from './types.js';

const DEFAULT_FILE = path.join(process.cwd(), 'data', 'synergy-map.json');

export function synergyMapPath(): string {
  return process.env.SYNERGY_MAP_FILE || DEFAULT_FILE;
}

export function readSynergyMap(): SynergyMap | null {
  const file = synergyMapPath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as SynergyMap;
  } catch {
    return null;
  }
}

export function writeSynergyMap(map: SynergyMap): void {
  const file = synergyMapPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/store.ts tests/synergy/store.test.ts
git commit -m "feat(synergy): add file-backed synergy map store"
```

---

### Task 12: Ledger wiring

**Files:**
- Create: `src/lib/synergy/ledger.ts`
- Test: `tests/synergy/ledger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/ledger.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { recordSynergyScan } from '../../src/lib/synergy/ledger.js';
import { readLedger, verifyLedgerChain } from '../../src/lib/trendLedger.js';
import type { SynergyMap } from '../../src/lib/synergy/types.js';

const TEST_LEDGER = `${process.cwd()}\\data\\test-synergy-ledger.jsonl`;

beforeAll(() => {
  process.env.TREND_LEDGER_FILE = TEST_LEDGER;
  fs.rmSync(TEST_LEDGER, { force: true });
});

const map: SynergyMap = {
  engineVersion: '0.1.0', generatedAtRun: 'run:test', domains: ['mathematics', 'logistics'],
  edges: [{ from: 'mathematics', to: 'logistics', kind: 'candidate', score: 0.8, passes: 0, attempts: 1, backingIds: ['tc_1'] }],
  candidates: [{
    id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
    bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: '', filters: [], engineVersion: '0.1.0',
  }],
  manifestHash: 'abc123',
};

describe('synergy ledger wiring', () => {
  it('appends a chained crossdomain_bridge insight', () => {
    const before = readLedger().length;
    const rec = recordSynergyScan(map);
    expect(rec).not.toBeNull();
    expect(rec?.templateId).toBe('crossdomain_bridge');
    expect(rec?.provenanceRoot).toBe('abc123');
    const verify = verifyLedgerChain();
    expect(verify.valid).toBe(true);
    expect(verify.length).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/ledger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/ledger.ts
/**
 * Discovery-ledger wiring. Reuses trendLedger.appendInsight unchanged so the
 * hash chain stays intact; template id crossdomain_bridge marks hypotheses.
 */
import { appendInsight, type LedgerInsight } from '../trendLedger.js';
import type { SynergyMap } from './types.js';

export function recordSynergyScan(map: SynergyMap): LedgerInsight | null {
  return appendInsight({
    createdRun: map.generatedAtRun,
    hypothesisId: map.candidates[0]?.id ?? 'none',
    templateId: 'crossdomain_bridge',
    statement: `${map.candidates.length} cross-domain transfer candidate(s) across ${map.domains.length} sector(s) (manifest ${map.manifestHash.slice(0, 12)})`,
    confidence: map.candidates.length ? map.candidates[0].score : 0,
    provenanceRoot: map.manifestHash,
    payload: {
      edges: map.edges.length,
      candidates: map.candidates.slice(0, 10).map((c) => ({
        id: c.id, from: c.fromDomain, to: c.toDomain, score: c.score,
      })),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/ledger.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/ledger.ts tests/synergy/ledger.test.ts
git commit -m "feat(synergy): wire discovery ledger for crossdomain_bridge insights"
```

---

### Task 13: Add the Truck Buddy logistics corpus root

**Files:**
- Modify: `src/intake/corpus/index.ts` (append to `DEFAULT_CORPUS_ROOTS`)

- [ ] **Step 1: Add the root**

In `src/intake/corpus/index.ts`, immediately before the closing `];` of `DEFAULT_CORPUS_ROOTS`, add:

```ts
  // Truck Buddy: real logistics methods + tests (load boards, compliance,
  // dispatch prediction, mechanic budget/search). Source for the logistics
  // synergy sector; only pure/tested functions are indexed as methods.
  {
    project: 'truck-buddy',
    root: 'C:\\Users\\User\\Downloads\\Truck Buddy\\web',
  },
```

- [ ] **Step 2: Verify typecheck and corpus tests**

Run: `npx tsc --noEmit; npx vitest run tests/corpus.test.ts`
Expected: typecheck clean; corpus tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/intake/corpus/index.ts
git commit -m "feat(synergy): add Truck Buddy logistics corpus root"
```

---

### Task 14: Express routes + server mount

**Files:**
- Create: `src/routes/synergy.ts`
- Modify: `server.ts` (import + mount)
- Test: `tests/synergy/router.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/router.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createSynergyRouter } from '../../src/routes/synergy.js';
import type { RawMethod } from '../../src/lib/synergy/methodIndex.js';
import type { RecourseProblem } from '../../src/lib/problemArchive.js';

const TEST_FILE = `${process.cwd()}\\data\\test-synergy-router-map.json`;
const TEST_LEDGER = `${process.cwd()}\\data\\test-synergy-router-ledger.jsonl`;

beforeAll(() => {
  process.env.SYNERGY_MAP_FILE = TEST_FILE;
  process.env.TREND_LEDGER_FILE = TEST_LEDGER;
  fs.rmSync(TEST_FILE, { force: true });
  fs.rmSync(TEST_LEDGER, { force: true });
});

function handler(path: string) {
  const router = createSynergyRouter() as any;
  const layer = (router.stack ?? []).find((l: any) => l?.route?.path === path);
  return layer.route.stack[0].handle;
}

describe('synergy router', () => {
  it('registers the synergy routes', () => {
    const router = createSynergyRouter() as any;
    const paths = (router.stack ?? []).map((l: any) => l?.route?.path).filter(Boolean);
    for (const p of ['/synergy/domains', '/synergy/map', '/synergy/candidates', '/synergy/score/:domain', '/synergy/scan']) {
      expect(paths).toContain(p);
    }
  });

  it('domains returns the registry + unverified list', async () => {
    const res = { json: (v: unknown) => (res as any).payload = v } as any;
    await handler('/synergy/domains')({} as any, res);
    expect(res.payload.success).toBe(true);
    expect(res.payload.domains.length).toBe(7);
  });

  it('score returns 0 when no map exists yet', async () => {
    const res = { json: (v: unknown) => (res as any).payload = v } as any;
    await handler('/synergy/score/:domain')({ params: { domain: 'logistics' } } as any, res);
    expect(res.payload.value).toBe(0);
  });

  it('scan builds and persists a map from real method/problem payloads', async () => {
    const method: RawMethod = { id: 'trendAnalyzer', name: 'Trend analyzer', domain: 'mathematics', source: 'tool', primitives: ['prediction', 'statistics'] };
    const problem: RecourseProblem = {
      id: 'repro:forecast', domain: 'logistics', title: 'Forecast demand', statement: 'Predict demand from a series.',
      acceptanceTest: 'assert true;',
    };
    const res = { json: (v: unknown) => (res as any).payload = v } as any;
    await handler('/synergy/scan')({ body: { methods: [method], problems: [problem] } } as any, res);
    expect(res.payload.success).toBe(true);
    expect(res.payload.candidates.length).toBeGreaterThan(0);
    expect(res.payload.manifest).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the router**

```ts
// src/routes/synergy.ts
/**
 * Cross-domain synergy routes. Stateless handlers over synergy lib modules;
 * scan is deterministic and persists a manifest-hashed map + ledger insight.
 */
import { Router } from 'express';
import { listDomains, unverifiedDomains } from '../lib/synergy/domainRegistry.js';
import { readSynergyMap, writeSynergyMap } from '../lib/synergy/store.js';
import { buildSynergyMap, crossDomainSynergyFor } from '../lib/synergy/synergyMap.js';
import { discover } from '../lib/synergy/closedDiscovery.js';
import { extractMethods, type RawMethod } from '../lib/synergy/methodIndex.js';
import { extractProblems } from '../lib/synergy/problemIndex.js';
import { recordSynergyScan } from '../lib/synergy/ledger.js';
import type { RecourseProblem } from '../lib/problemArchive.js';

export function createSynergyRouter(): Router {
  const router = Router();

  router.get('/synergy/domains', (_req, res) => {
    res.json({
      success: true,
      domains: listDomains(),
      unverified: unverifiedDomains().map((d) => d.id),
    });
  });

  router.get('/synergy/map', (_req, res) => {
    res.json({ success: true, map: readSynergyMap() });
  });

  router.get('/synergy/candidates', (_req, res) => {
    const map = readSynergyMap();
    res.json({ success: true, count: map?.candidates.length ?? 0, candidates: map?.candidates ?? [] });
  });

  router.get('/synergy/score/:domain', (req, res) => {
    const map = readSynergyMap();
    if (!map) return res.json({ success: true, domain: req.params.domain, value: 0, reason: 'no map' });
    res.json({ success: true, domain: req.params.domain, value: crossDomainSynergyFor(map, req.params.domain) });
  });

  router.post('/synergy/scan', (req, res) => {
    const body = (req.body ?? {}) as {
      methods?: RawMethod[];
      problems?: RecourseProblem[];
      knownPairs?: string[];
    };
    if (!Array.isArray(body.methods) || !Array.isArray(body.problems)) {
      return res.status(400).json({ success: false, error: 'methods and problems arrays required' });
    }
    const { methods, rejected } = extractMethods(body.methods);
    const problems = extractProblems(body.problems);
    const { candidates, manifest } = discover(methods, problems, { knownPairs: body.knownPairs ?? [] });
    const map = buildSynergyMap(candidates, { generatedAtRun: `manifest:${manifest}` });
    writeSynergyMap(map);
    recordSynergyScan(map);
    res.json({
      success: true,
      rejectedMethods: rejected,
      methods: methods.length,
      problems: problems.length,
      manifest,
      ...map,
    });
  });

  return router;
}
```

- [ ] **Step 4: Mount the router in `server.ts`**

Add the import immediately after the `createServicesRouter` import (line ~264):

```ts
import { createSynergyRouter } from './src/routes/synergy.js';
```

Add the mount immediately after the services mount (`app.use('/api/recourse', createServicesRouter());`, line ~2197):

```ts
app.use('/api/recourse', createSynergyRouter());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/synergy/router.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/routes/synergy.ts server.ts tests/synergy/router.test.ts
git commit -m "feat(synergy): add routes and mount at /api/recourse"
```

---

### Task 15: README honesty section

**Files:**
- Modify: `README.md` (append a section)

- [ ] **Step 1: Append the section**

At the end of `README.md`, add:

```markdown
## Cross-domain synergy engine (deterministic core)

`src/lib/synergy/` maps transferable structure across the sectors this instance
works in (health/oncology, mathematics, cybersecurity, neuro/music, aging,
sports, logistics). It is a **closed-discovery** engine: A = method, C = problem,
B = a shared controlled-vocabulary term.

Honesty contract:

- Only pure functions are indexed as methods. Sources that call `Date.now()`,
  `new Date()`, `Math.random()`, or `process.hrtime` are rejected with a reason
  (see `methodIndex.detectNonDeterminism`). Example: Truck Buddy's
  `deriveStatus`/`dossierVerdict` are indexed; `buildDossier` is not.
- Bridges are only controlled-vocabulary terms, never free text. An unknown
  term is rejected at the `semantic_type` gate.
- Missing evidence is excluded, never imputed; a pair with no passing bridge is
  dropped.
- Every map carries a `manifestHash` over its inputs and candidates, so re-runs
  are diffable bit-for-bit.
- Candidate scores are **calibration**, not measured properties. `SCORER`
  constants live in `closedDiscovery.SYNERGY_CALIBRATION`.
- A candidate is a **hypothesis**, not a discovery. Promotion to a resolved
  edge requires execution verification (Plan 4, admission gate).

Routes: `GET /api/recourse/synergy/domains`, `GET /api/recourse/synergy/map`,
`GET /api/recourse/synergy/candidates`, `GET /api/recourse/synergy/score/:domain`,
`POST /api/recourse/synergy/scan`.

Deferred: SME structural alignment, corrected statistics, sandbox resolver +
admission gate, AI adapter drafting, decision-engine rewire.
```

- [ ] **Step 2: Verify typecheck + full synergy suite**

Run: `npx tsc --noEmit; npx vitest run tests/synergy`
Expected: typecheck clean; all synergy tests PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(synergy): document the deterministic core and honesty contract"
```

---

## Self-Review

**1. Spec coverage (Plan 1 portion):**

| Spec section | Task |
|---|---|
| §5 sector registry | Task 4 |
| §6 module layout (`types`, `vocabulary`, `domainRegistry`, `methodIndex`, `problemIndex`, `graph`, `closedDiscovery`, `filters`, `synergyMap`, `store`) | Tasks 2–11 |
| §7 data model | Task 2 |
| §8.1 canonicalize + determinism admission | Tasks 3, 5 |
| §8.2 weighted graph | Task 7 |
| §8.3 closed discovery + `min` aggregation | Task 9 |
| §8.6 filters | Task 8 |
| §9 ledger + routes | Tasks 12, 14 |
| §11 determinism (manifest) | Tasks 1, 9, 10 |
| §12 unit tests | every task |
| §5 Truck Buddy / logistics source | Tasks 4, 13 |
| §4 calibration tagging | `SYNERGY_CALIBRATION` / `SYNERGY_MAP_CALIBRATION`, README |
| §13 M1 scope | this plan |

Deferred correctly (not gaps): §8.4 SME, §8.5 MAC/FAC, §8.7–8.8 stats, §8.9 resolver/gate, §10 AI, `decisionEngine` rewire, UI.

**2. Placeholder scan:** no TBD/TODO/"add error handling"/"similar to Task N"; every code step has full code and exact commands.

**3. Type consistency:** `MethodSignature`/`ProblemSignature`/`BridgeEvidence`/`FilterDecision`/`TransferCandidate`/`SynergyEdge`/`SynergyMap` are defined once in `types.ts` and used with those exact names in Tasks 5–14. `SYNERGY_ENGINE_VERSION` is defined in `closedDiscovery.ts` and imported by `synergyMap.ts`. `SYNERGY_CALIBRATION` / `SYNERGY_MAP_CALIBRATION` naming is consistent. `extractMethods` returns `{ methods, rejected }` and the router consumes exactly that.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-12-cross-domain-synergy-engine-impl.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
