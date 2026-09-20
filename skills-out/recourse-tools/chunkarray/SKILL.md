---
name: chunkArray
description: [Capability Forge] Array chunking — self-hosted, verified live
---

# chunkArray

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Array chunking — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: 2a2c262b68aec15a

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 3 assertions executed green in 7.38ms)

## Source

```ts
export function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
```

## Test suite

```ts
assert JSON.stringify(chunkArray([1,2,3,4,5],2)) === JSON.stringify([[1,2],[3,4],[5]]);
assert JSON.stringify(chunkArray([1,2,3],5)) === JSON.stringify([[1,2,3]]);
assert chunkArray([],2).length === 0;
assert JSON.stringify(chunkArray([1,2,3,4],2)) === JSON.stringify([[1,2],[3,4]]);
```
