---
name: dedupeStable
description: [Capability Forge] Stable array deduplication — self-hosted, verified live
---

# dedupeStable

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Stable array deduplication — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: e04f7944790099a1

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 3 assertions executed green in 9.46ms)

## Source

```ts
export function dedupeStable(arr) {
  const seen = new Set();
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}
```

## Test suite

```ts
assert JSON.stringify(dedupeStable([1,2,1,3,2,4])) === JSON.stringify([1,2,3,4]);
assert dedupeStable(["a","b","a","c","b"]).length === 3;
assert dedupeStable([]).length === 0;
assert JSON.stringify(dedupeStable([5,5,5])) === JSON.stringify([5]);
```
