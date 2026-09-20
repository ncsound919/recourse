---
name: flattenDeep
description: [Capability Forge] Deep array flatten — self-hosted, verified live
---

# flattenDeep

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Deep array flatten — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: eb6ad1260d16f649

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 2 assertions executed green in 9.4ms)

## Source

```ts
export function flattenDeep(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (Array.isArray(item)) {
      const flattened = flattenDeep(item);
      for (let j = 0; j < flattened.length; j++) {
        result.push(flattened[j]);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}
```

## Test suite

```ts
assert JSON.stringify(flattenDeep([1, [2, [3, [4]], 5]])) === "[1,2,3,4,5]";
assert JSON.stringify(flattenDeep([[], [[]]])) === "[]";
assert JSON.stringify(flattenDeep([1, 2, 3])) === "[1,2,3]";
```
