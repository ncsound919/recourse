---
name: mergeSorted
description: [Capability Forge] Merge two sorted arrays — self-hosted, verified live
---

# mergeSorted

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Merge two sorted arrays — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: 1da80e319c9ad4a7

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 2 assertions executed green in 7.36ms)

## Source

```ts
export function mergeSorted(a, b) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) {
      result.push(a[i]);
      i++;
    } else {
      result.push(b[j]);
      j++;
    }
  }
  while (i < a.length) {
    result.push(a[i]);
    i++;
  }
  while (j < b.length) {
    result.push(b[j]);
    j++;
  }
  return result;
}
```

## Test suite

```ts
const m = mergeSorted([1, 4, 6], [2, 3, 5]);
assert m.length === 6;
assert JSON.stringify(m) === "[1,2,3,4,5,6]";
assert JSON.stringify(mergeSorted([], [1])) === "[1]";
```
