# Synergy Plan 2 — SME Structural Alignment + MAC/FAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic structure-mapping (SME-style) alignment and a cheap MAC/FAC prefilter over method/problem relational signatures, and enrich closed-discovery candidates with an alignment score and a far-transfer measure.

**Architecture:** Pure modules under `src/lib/synergy/`. Represent each signature as a typed relational "dgroup" (`Rel` functors as relations, primitives as attributes). SME generates same-functor match hypotheses, enforces one-to-one + parallel connectivity, propagates evidence by systematicity, greedily merges into maximal consistent gmaps, and emits candidate inferences + a structural weight. MAC/FAC pre-filters by content-vector dot product before SME runs. `closedDiscovery.discover` optionally attaches `alignment`/`farTransfer` to each candidate. All constants are calibration.

**Tech Stack:** TypeScript ESM (`.js` import extensions), vitest, `node:crypto`. Reuses `types.ts`, `vocabulary.ts`, `graph.ts`, `closedDiscovery.ts`, `manifest.ts`.

**Spec:** `docs/superpowers/specs/2026-09-12-cross-domain-synergy-engine-design.md` §8.4, §8.5.
**Depends on:** Plan 1 (merged/committed on `feat/cross-domain-synergy`).

**Deferred:** statistics (Plan 3), resolver/admission gate (Plan 4), AI drafting + decisionEngine rewire (Plan 5).

---

## File Structure

**Create:**
- `src/lib/synergy/sme.ts` — dgroups, match hypotheses, consistency, systematicity, gmap merge, alignment result
- `src/lib/synergy/macFac.ts` — content vectors + MAC prefilter + FAC (SME on survivors)
- `tests/synergy/sme.test.ts`, `tests/synergy/macFac.test.ts`

**Modify:**
- `src/lib/synergy/types.ts` — add `AlignmentResult`, `AlignmentMapping`, add `alignment?`/`farTransfer?` to `TransferCandidate`
- `src/lib/synergy/closedDiscovery.ts` — attach alignment via MAC/FAC when `opts.align !== false`
- `tests/synergy/closedDiscovery.test.ts` — manifest changes; update golden; add alignment assertions

**Conventions:** source/test imports use `.js`; conventional commits `feat(synergy): ...`; do NOT use `--no-verify`.

---

### Task 1: Alignment types

**Files:**
- Modify: `src/lib/synergy/types.ts`
- Test: `tests/synergy/types` has none (type-only); verify via `tsc`.

- [ ] **Step 1: Add types**

Append to `src/lib/synergy/types.ts`:

```ts
export interface AlignmentMapping {
  /** base functor or entity */
  base: string;
  /** target functor or entity */
  target: string;
  /** [0,1] evidence weight for this match */
  evidence: number;
}

export interface AlignmentResult {
  /** summed positive evidence of the chosen gmap, normalized to [0,1] */
  gmapWeight: number;
  mappings: AlignmentMapping[];
  /** base predicates projected onto the target */
  inferences: string[];
  /** structural consistency (one-to-one + parallel connectivity) held */
  consistent: boolean;
}
```

Add to `TransferCandidate` (after `support`):

```ts
  alignment?: AlignmentResult;
  /** high structure + low surface similarity = far (true analogy) transfer, [0,1] */
  farTransfer?: number;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/synergy/types.ts
git commit -m "feat(synergy): add alignment result types"
```

---

### Task 2: Dgroups + match hypotheses + consistency

**Files:**
- Create: `src/lib/synergy/sme.ts`
- Test: `tests/synergy/sme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/sme.test.ts
import { describe, it, expect } from 'vitest';
import { dgroupFromRelations, matchHypotheses, isStructurallyConsistent, type DGroup, type MatchHypothesis } from '../../src/lib/synergy/sme.js';
import type { Rel } from '../../src/lib/synergy/types.js';

const rel = (functor: string, args: string[], order = 1): Rel => ({ functor, type: 'rel', args, order });

const base: DGroup = dgroupFromRelations('math', [rel('maps_to', ['graph', 'sequence']), rel('depends_on', ['sequence', 'statistics'])], ['graph', 'sequence', 'statistics']);
const target: DGroup = dgroupFromRelations('logi', [rel('maps_to', ['schema', 'route']), rel('depends_on', ['route', 'cost'])], ['schema', 'route', 'cost']);

describe('sme dgroups + match hypotheses', () => {
  it('builds dgroups with relations and entities', () => {
    expect(base.domain).toBe('math');
    expect(base.relations.map((r) => r.functor)).toEqual(['maps_to', 'depends_on']);
    expect(base.entities).toContain('graph');
  });

  it('generates same-functor match hypotheses', () => {
    const mh = matchHypotheses(base, target);
    const functors = mh.map((m) => m.baseFunctor);
    expect(functors).toContain('maps_to');
    expect(functors).toContain('depends_on');
    // parallel connectivity: argument pairs come with each relation MH
    expect(mh.find((m) => m.baseFunctor === 'maps_to')?.argPairs.length).toBe(2);
  });

  it('rejects a mapping where one base entity maps to two targets (one-to-one)', () => {
    const bad: MatchHypothesis[] = [{ baseFunctor: 'maps_to', targetFunctor: 'maps_to', argPairs: [['graph', 'schema'], ['graph', 'route']], score: 0.9 }];
    expect(isStructurallyConsistent(bad)).toBe(false);
  });

  it('accepts a one-to-one + parallel mapping', () => {
    const good: MatchHypothesis[] = [{ baseFunctor: 'maps_to', targetFunctor: 'maps_to', argPairs: [['graph', 'schema'], ['sequence', 'route']], score: 0.9 }];
    expect(isStructurallyConsistent(good)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/sme.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/synergy/sme.ts
/**
 * Deterministic SME-style structure mapping over relational dgroups. All numeric
 * constants are CALIBRATION (published SME rule set), not measured properties.
 */
import type { Rel, AlignmentResult, AlignmentMapping } from './types.js';
import { canonicalizeTerm } from './vocabulary.js';

export interface DGroup {
  domain: string;
  entities: string[];
  relations: Rel[];
}

export interface MatchHypothesis {
  baseFunctor: string;
  targetFunctor: string;
  /** aligned argument pairs, positionally: [baseArg, targetArg] */
  argPairs: Array<[string, string]>;
  score: number;
}

/** Published SME rule weights (calibration). */
export const SME_CALIBRATION = {
  relationSameFunctor: 0.5,
  attributeSameFunctor: 0.2,
  argMatch: 0.4,
  orderSame: 0.3,
  higherOrderTrickle: 0.8,
} as const;

export function dgroupFromRelations(domain: string, relations: Rel[], entities: string[]): DGroup {
  return { domain, entities: entities.map(canonicalizeTerm), relations };
}

export function matchHypotheses(base: DGroup, target: DGroup): MatchHypothesis[] {
  const out: MatchHypothesis[] = [];
  for (const br of base.relations) {
    for (const tr of target.relations) {
      if (br.functor !== tr.functor) continue;
      const argPairs: Array<[string, string]> = [];
      const n = Math.min(br.args.length, tr.args.length);
      for (let i = 0; i < n; i++) argPairs.push([canonicalizeTerm(br.args[i]), canonicalizeTerm(tr.args[i])]);
      let score = br.type === 'rel' ? SME_CALIBRATION.relationSameFunctor : SME_CALIBRATION.attributeSameFunctor;
      if (argPairs.length > 0) score += SME_CALIBRATION.argMatch;
      if (br.order === tr.order) score += SME_CALIBRATION.orderSame;
      out.push({ baseFunctor: br.functor, targetFunctor: tr.functor, argPairs, score: Math.round(score * 1000) / 1000 });
    }
  }
  return out.sort((a, b) => b.score - a.score || (a.baseFunctor < b.baseFunctor ? -1 : 1));
}

/** One-to-one: no base element maps to two targets and vice versa. */
export function isStructurallyConsistent(mhs: MatchHypothesis[]): boolean {
  const baseToTarget = new Map<string, string>();
  const targetToBase = new Map<string, string>();
  for (const mh of mhs) {
    for (const [b, t] of mh.argPairs) {
      const prevT = baseToTarget.get(b);
      if (prevT !== undefined && prevT !== t) return false;
      const prevB = targetToBase.get(t);
      if (prevB !== undefined && prevB !== b) return false;
      baseToTarget.set(b, t);
      targetToBase.set(t, b);
    }
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/sme.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/sme.ts tests/synergy/sme.test.ts
git commit -m "feat(synergy): add SME dgroups, match hypotheses, consistency"
```

---

### Task 3: Gmap merge + systematicity + candidate inferences

**Files:**
- Modify: `src/lib/synergy/sme.ts`
- Test: `tests/synergy/sme.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```ts
  it('align prefers a systematic (multi-relation) mapping over an isolated one', () => {
    const systematic = align(base, target);
    const isolatedBase: DGroup = dgroupFromRelations('m2', [rel('maps_to', ['graph', 'sequence'])], ['graph', 'sequence']);
    const isolated = align(isolatedBase, target);
    expect(systematic.gmapWeight).toBeGreaterThan(isolated.gmapWeight);
  });

  it('align is deterministic and consistent', () => {
    const a = align(base, target);
    const b = align(base, target);
    expect(a).toEqual(b);
    expect(a.consistent).toBe(true);
    expect(a.mappings.length).toBeGreaterThan(0);
  });
```

Update the import line to add `align`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/synergy/sme.test.ts` → FAIL (`align` not exported).

- [ ] **Step 3: Implement gmap merge + align**

Append to `src/lib/synergy/sme.ts`:

```ts
export function align(base: DGroup, target: DGroup): AlignmentResult {
  const mhs = matchHypotheses(base, target);
  // Greedy merge into a maximal one-to-one consistent set (deterministic order).
  const chosen: MatchHypothesis[] = [];
  const usedBase = new Set<string>();
  const usedTarget = new Set<string>();
  for (const mh of mhs) {
    if (!isStructurallyConsistent([...chosen, mh])) continue;
    const [b0] = mh.argPairs[0] ?? ['', ''];
    if (b0 && (usedBase.has(b0) || usedTarget.has(mh.argPairs[0][1]))) continue;
    chosen.push(mh);
    for (const [b, t] of mh.argPairs) { usedBase.add(b); usedTarget.add(t); }
  }
  // Systematicity: propagate evidence to relations that share entities with the core.
  const coreEntities = new Set<string>();
  for (const mh of chosen) for (const [b] of mh.argPairs) coreEntities.add(b);
  const systematic = SME_CALIBRATION.higherOrderTrickle * (coreEntities.size / Math.max(1, base.entities.length));
  const raw = chosen.reduce((s, m) => s + m.score, 0) + (chosen.length > 1 ? systematic : 0);
  const gmapWeight = Math.round(Math.min(1, raw / (SME_CALIBRATION.relationSameFunctor + SME_CALIBRATION.argMatch + SME_CALIBRATION.orderSame + 1)) * 1000) / 1000;

  const mappings: AlignmentMapping[] = [];
  for (const mh of chosen) {
    for (const [b, t] of mh.argPairs) mappings.push({ base: b, target: t, evidence: mh.score });
  }
  // Candidate inferences: base relations whose constituents all mapped, but with no target match.
  const targetFunctors = new Set(target.relations.map((r) => r.functor));
  const inferences: string[] = [];
  for (const br of base.relations) {
    if (targetFunctors.has(br.functor)) continue;
    if (br.args.every((a) => usedBase.has(canonicalizeTerm(a)))) inferences.push(br.functor);
  }
  mappings.sort((a, b) => (a.base < b.base ? -1 : a.base > b.base ? 1 : a.target < b.target ? -1 : 1));
  inferences.sort();
  return { gmapWeight, mappings, inferences, consistent: isStructurallyConsistent(chosen) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/synergy/sme.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/sme.ts tests/synergy/sme.test.ts
git commit -m "feat(synergy): add SME gmap merge, systematicity, align"
```

---

### Task 4: Far-transfer measure

**Files:**
- Modify: `src/lib/synergy/sme.ts`
- Test: `tests/synergy/sme.test.ts`

- [ ] **Step 1: Add failing test**

```ts
  it('farTransfer is high for high structure at low surface similarity', () => {
    const high = farTransfer(base, target);
    const near: DGroup = dgroupFromRelations('m', base.relations.map((r) => ({ ...r })), base.entities);
    const nearTransfer = farTransfer(base, near);
    expect(high).toBeGreaterThan(nearTransfer);
    expect(high).toBeLessThanOrEqual(1);
  });
```

Update import to add `farTransfer`.

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

```ts
/** Jaccard of entity sets (surface similarity). */
function surfaceSimilarity(a: DGroup, b: DGroup): number {
  const sa = new Set(a.entities);
  const sb = new Set(b.entities);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** High structural weight + low surface similarity = far (true analogy) transfer. */
export function farTransfer(base: DGroup, target: DGroup): number {
  const structural = align(base, target).gmapWeight;
  const surface = surfaceSimilarity(base, target);
  return Math.round(structural * (1 - surface) * 1000) / 1000;
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/sme.ts tests/synergy/sme.test.ts
git commit -m "feat(synergy): add far-transfer measure"
```

---

### Task 5: MAC/FAC prefilter

**Files:**
- Create: `src/lib/synergy/macFac.ts`
- Test: `tests/synergy/macFac.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/synergy/macFac.test.ts
import { describe, it, expect } from 'vitest';
import { contentVector, macFilter, macFac } from '../../src/lib/synergy/macFac.js';
import { dgroupFromRelations } from '../../src/lib/synergy/sme.js';
import type { Rel } from '../../src/lib/synergy/types.js';

const rel = (functor: string, args: string[]): Rel => ({ functor, type: 'rel', args, order: 1 });
const target = dgroupFromRelations('t', [rel('maps_to', ['a', 'b'])], ['a', 'b']);
const near = dgroupFromRelations('n', [rel('maps_to', ['a', 'b'])], ['a', 'b']);
const far = dgroupFromRelations('f', [rel('depends_on', ['x', 'y'])], ['x', 'y']);

describe('mac/fac', () => {
  it('content vectors are deterministic functor histograms', () => {
    const v = contentVector(target);
    expect(v).toEqual(contentVector(target));
    expect(v.length).toBeGreaterThan(0);
  });

  it('macFilter returns the top-k by content similarity, deterministic', () => {
    const top = macFilter(target, [far, near], 1);
    expect(top).toHaveLength(1);
    expect(top[0].domain).toBe('n');
  });

  it('macFac returns alignment results for survivors', () => {
    const results = macFac(target, [far, near], { k: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('gmapWeight');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/synergy/macFac.ts
/**
 * MAC/FAC: cheap content-vector prefilter, then SME on survivors. Deterministic.
 */
import type { AlignmentResult } from './types.js';
import { canonicalizeTerm } from './vocabulary.js';
import { align, type DGroup } from './sme.js';

/** Functor-frequency content vector over a fixed vocabulary order. */
export function contentVector(d: DGroup): number[] {
  const functors = [...new Set(d.relations.map((r) => r.functor))].sort();
  return functors.map((f) => d.relations.filter((r) => r.functor === f).length);
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
```

> NOTE: vector shape differs across dgroups (functor sets). For a stable prefilter, index content vectors over the **controlled FUNCTORS vocabulary** instead. Replace `contentVector` with:

```ts
import { FUNCTORS } from './vocabulary.js';

export function contentVector(d: DGroup): number[] {
  const counts = new Map<string, number>();
  for (const r of d.relations) counts.set(r.functor, (counts.get(r.functor) ?? 0) + 1);
  return FUNCTORS.map((f) => counts.get(canonicalizeTerm(f)) ?? 0);
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
```

The implementer must delete the first `contentVector` block and keep the final version (the NOTE is an instruction, not code).

- [ ] **Step 4: Run test to verify it passes** → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/macFac.ts tests/synergy/macFac.test.ts
git commit -m "feat(synergy): add MAC/FAC prefilter"
```

---

### Task 6: Enrich closed-discovery candidates with alignment

**Files:**
- Modify: `src/lib/synergy/closedDiscovery.ts`
- Test: `tests/synergy/closedDiscovery.test.ts`

- [ ] **Step 1: Add failing test**

Add to `tests/synergy/closedDiscovery.test.ts`:

```ts
  it('attaches an alignment and farTransfer when relations allow', () => {
    const { candidates } = discover(methods, problems);
    expect(candidates[0].alignment).toBeDefined();
    expect(typeof candidates[0].farTransfer).toBe('number');
  });

  it('can disable alignment via opts', () => {
    const { candidates } = discover(methods, problems, { align: false });
    expect(candidates[0].alignment).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

In `closedDiscovery.ts`:
- Add `align?: boolean` to `DiscoverOptions`.
- Import `dgroupFromRelations`, `align as smeAlign`, `farTransfer` from `./sme.js`.
- In `discover`, after computing `base`/`coverage`/`score`, compute:
```ts
      const useAlign = opts.align !== false;
      let alignment;
      let far;
      if (useAlign && m.relations.length > 0 && p.relations.length > 0) {
        const bd = dgroupFromRelations(m.domain, m.relations, m.relations.flatMap((r) => r.args));
        const td = dgroupFromRelations(p.domain, p.relations, p.relations.flatMap((r) => r.args));
        alignment = smeAlign(bd, td);
        far = farTransfer(bd, td);
      }
```
- Include `alignment` and `farTransfer` in the pushed candidate object, and include `far` in the manifest candidate line: `` `${c.id}:${c.score}:${c.farTransfer ?? ''}:${c.bridges.map((b) => b.term).join(',')}` ``.
- Update the golden manifest test value (run once, pin the new hash).

- [ ] **Step 4: Run test to verify it passes** → PASS (8 tests), with the golden updated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/synergy/closedDiscovery.ts tests/synergy/closedDiscovery.test.ts
git commit -m "feat(synergy): enrich candidates with SME alignment and far-transfer"
```

---

## Self-Review

**Spec coverage:** §8.4 SME (dgroups, same-functor MHs, one-to-one + parallel connectivity, systematicity, gmap merge, candidate inferences) → Tasks 2–3; far-transfer → Task 4; §8.5 MAC/FAC → Task 5; integration → Task 6. Constants are calibration (`SME_CALIBRATION`). No statistics/resolver/AI (deferred).

**Determinism:** greedy merge iterates score-sorted MHs; mappings/inferences sorted; `align` is pure. Golden manifest updated.

## Execution Handoff

Two options: **Subagent-Driven (recommended)** or **Inline Execution**. Which approach?
