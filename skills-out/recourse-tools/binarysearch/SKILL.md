---
name: binarySearch
description: [Capability Forge] Binary search in a sorted array — self-hosted, verified live
---

# binarySearch

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Binary search in a sorted array — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: 950d42dd527377aa

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 4 assertions executed green in 7.01ms)

## Source

```ts
export function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (arr[mid] === target) {
      return mid;
    } else if (arr[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return -1;
}
```

## Test suite

```ts
const a = [1, 3, 5, 7, 9];
assert binarySearch(a, 5) === 2;
assert binarySearch(a, 1) === 0;
assert binarySearch(a, 9) === 4;
assert binarySearch(a, 4) === -1;
assert binarySearch([], 3) === -1;
```
