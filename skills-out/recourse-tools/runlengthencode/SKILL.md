---
name: runLengthEncode
description: [Capability Forge] Run-length string encoding — self-hosted, verified live
---

# runLengthEncode

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Run-length string encoding — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: 25ff7a9d5498b955

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 3 assertions executed green in 7.53ms)

## Source

```ts
export function runLengthEncode(str) {
  if (str.length === 0) return "";
  
  let result = "";
  let count = 1;
  
  for (let i = 1; i <= str.length; i++) {
    if (i < str.length && str[i] === str[i - 1]) {
      count++;
    } else {
      result += str[i - 1] + count;
      count = 1;
    }
  }
  
  return result;
}
```

## Test suite

```ts
assert runLengthEncode("aaaabbc") === "a4b2c1";
assert runLengthEncode("") === "";
assert runLengthEncode("abc") === "a1b1c1";
assert runLengthEncode("aaaa") === "a4";
```
