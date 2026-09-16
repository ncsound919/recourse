## Summary

<!-- What changed and why, in a sentence or two. -->

## Honesty checklist

- [ ] No fabricated output: anything unverifiable reports `ok:false` / `offline`
      / `unsupported` rather than inventing a result.
- [ ] New mutating routes sit behind `requireMutationAuth` (fail-closed).
- [ ] New autonomous capabilities are default-deny and, where they spend, gated
      by the wallet + policy engine.
- [ ] No `eval` of untrusted code outside the sandbox; no `dangerouslySetInnerHTML`.

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

## Notes for reviewers

<!-- Trade-offs, follow-ups, and anything intentionally left limited. -->
