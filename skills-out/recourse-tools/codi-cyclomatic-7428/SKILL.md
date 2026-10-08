---
name: CODI_CYCLOMATIC_7428
description: Crystallized from dream: A capped branch/loop pressure score separates risky diffs from noise with a hard upper bound
---

# CODI_CYCLOMATIC_7428

Recourse self-developing-OS tool — **coding** domain.

Crystallized from dream: A capped branch/loop pressure score separates risky diffs from noise with a hard upper bound

## Provenance

- Version: 1.0.0-reverified.014184
- Verifier: not passed
- Score: 0.00
- Hash: 41c89ebfdeaeb1cb

- Notes: GENESIS RE-VERIFIED: suite passed, QUALITY GATE FAILED — not audited: no_suite

## Source

```ts
export function cyclomaticPressureScorer(input) {
  const { branches, loops, nesting } = input;
  const raw = 1.4256758 * branches + 1.0188636 * loops + 0.5 * nesting;
  const capped = Math.min(71.773151, raw);
  return Number(capped.toFixed(4));
}
```
