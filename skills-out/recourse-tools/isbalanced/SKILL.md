---
name: isBalanced
description: [Capability Forge] Balanced bracket validator — self-hosted, verified live
---

# isBalanced

Recourse self-developing-OS tool — **coding** domain.

[Capability Forge] Balanced bracket validator — self-hosted, verified live

## Provenance

- Version: 1.0.0-forge
- Verifier: PASSED
- Score: 1.00
- Hash: cd2ef814a5501d1e

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 4 assertions executed green in 9.02ms)

## Source

```ts
export function isBalanced(str) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const openers = new Set(['(', '[', '{']);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (openers.has(ch)) {
      stack.push(ch);
    } else if (pairs[ch]) {
      if (stack.length === 0 || stack.pop() !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}
```

## Test suite

```ts
assert isBalanced("(a[b]{c})") === true;
assert isBalanced("") === true;
assert isBalanced("([)]") === false;
assert isBalanced("(") === false;
assert isBalanced("{[]}") === true;
```
