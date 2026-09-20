---
name: quickSort
description: [Capability Forge] Quicksort (stable, non-mutating) — self-hosted, verified live
---

# quickSort

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Quicksort (stable, non-mutating) — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: 383a30878f5904c8

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 3 assertions executed green in 7.81ms)

## Source

```ts
export function quickSort(arr) {
  if (arr.length <= 1) return arr.slice();
  const pivot = arr[0];
  const left = [];
  const right = [];
  const equal = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item < pivot) left.push(item);
    else if (item > pivot) right.push(item);
    else equal.push(item);
  }
  return quickSort(left).concat(equal, quickSort(right));
}
```

## Test suite

```ts
assert JSON.stringify(quickSort([3, 1, 2])) === "[1,2,3]";
assert JSON.stringify(quickSort([])) === "[]";
assert JSON.stringify(quickSort([5, 5, 1])) === "[1,5,5]";
assert JSON.stringify(quickSort([9, 7, 8, 7])) === "[7,7,8,9]";
```
