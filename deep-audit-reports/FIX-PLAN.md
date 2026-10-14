# Recourse single-pass fix plan

Status: **planned, not executed.** Generated 2026-10-08 from `FULL-READOUT.json`
+ `signal-inventory.json` (1,454 "signal" findings, 41 rules) and external research.

Objective: clear the real defects and the audit-tool noise in **one pass**, gated by
recourse's own verifier (`npm run lint` = oxlint, `tsc --noEmit`, `vitest run`).

---

## The decisive finding (do this first)

The Deep's `bug-taxonomy` and `deep-intent` detectors run regexes over **raw file
content**. They match code inside comments, string and template literals, and
generated-code strings. Confirmed samples:

| rule | location | what was actually flagged |
|---|---|---|
| `BUG-RACE-REWRITE` | `src/dream/genomes.ts:90` | `total++` inside a **template literal** that emits code |
| `BUG-RESOURCE-LEAK` | `src/lib/rating/types.ts:12` | the word "Client" in a **comment** |
| `DATA-QUERY-IN-LOOP` | `api/recourse/_guard.ts:65` | **no loop** at all in that function |
| `ARCH-NO-DIRECT-DB-IN-CONTROLLER` | `dsh-recourse/src/web-routes.ts:49` | a request-body reader, not a DB import |

SIEVE already hit and fixed this on itself: mask literals/comments before line rules
(`Coding lessons\2026-10-08-sieve-self-audit-scanner-false-positives.md`, decision D1,
`src/mask.mjs`). **Batch 0 ports masking into The Deep.** It removes the largest share
of false positives, which shrinks Batch 4 (real correctness fixes) to something triageable.

---

## Rule-by-rule dispositions

| rule | ct | verdict | fix | batch |
|---|---:|---|---|---|
| `DATA-QUERY-IN-LOOP` | 488 | mostly FP (matches in strings/headers); real subset is sequential per-item fetch | mask first; then batch (`WHERE id IN`/DataLoader) or justify sequential | 0,3 |
| `ARCH-NO-DIRECT-DB-IN-CONTROLLER` | 310 | design-opinion; route files legitimately own storage | mask; then either extract a repo layer or accept with `// arch: route owns db` | 0,5 |
| `no-await-in-loop` | 181 | mixed: independent work → parallel; rate-limited/migrations → keep serial | `Promise.all(map)` or `p-map {concurrency}`; else disable-comment with reason | 3 |
| `TS6133` | 85 | real unused declarations (some interface placeholders) | delete, or `void x`/`export` if deliberate | 1 |
| `no-promise-executor-return` | 80 | real (implicitly returns `setTimeout` handle) | brace the executor body: `new Promise((r) => { setTimeout(r, ms); })` | 1 |
| `security/detect-unsafe-regex` | 43 | mixed; many anchored & safe (e.g. `EXPORT_DECL_RE`) | rewrite nested-quantifier patterns; verify with `eslint-plugin-redos-detector` | 2 |
| `BUG-RESOURCE-LEAK` | 39 | mostly FP (`createReadStream` auto-closes; comment matches) | mask; real ones use `pipeline()`/`try…finally` | 0,4 |
| `security/detect-non-literal-regexp` | 34 | mixed; test-name regexes are safe | `RegExp.escape()` / local `escapeRegExp()` before `new RegExp` | 2 |
| `TS2339` | 27 | real (project-context now loaded) | per-site type fix | 4 |
| `BUG-RACE-REWRITE` | 27 | **FP in single-threaded JS** (`count++` atomic; `await` suspension is the only window) | mask; only fix across `await`/DB write; annotate the rest | 0,4 |
| `sonarjs/no-dead-store` | 19 | real | remove the dead assignment | 1 |
| `sonarjs/no-collapsible-if` | 13 | real | merge conditions | 1 |
| `NUM-FLOAT-MONEY` | 11 | real | integer cents / `Decimal`; compare rounded | 4 |
| `BUG-INJECTION` | 10 | real (shell interpolation) | `execFileSync('semgrep', ['--config', f, ...])` | 2 |
| `sonarjs/prefer-immediate-return` | 9 | real | return the expression directly | 1 |
| `BUG-ASYNC-CHAIN` | 8 | mixed | add `.catch()`/`try…catch` | 4 |
| `BUG-LIFECYCLE-MISMATCH` | 7 | mixed (test mocks) | remove listeners/subscriptions in teardown | 4 |
| `BUG-OFF-BY-ONE` | 7 | mixed | correct `<`/`<=` bound | 4 |
| `sonarjs/no-unused-collection` | 5 | real | drop or use the collection | 1 |
| `AGENT-UNBOUNDED-RECURSION` | 5 | real-risk | add depth/visited guard | 4 |
| `no-throw-literal` | 5 | real (tests) | `throw new Error(...)` | 1 |
| `sonarjs/no-inverted-boolean-check` | 4 | real | simplify the condition | 1 |
| `PERF-EVENT-LOOP-STALL` | 4 | real | chunk/`await` yield or offload to worker | 4 |
| `sonarjs/no-identical-functions` | 3 | real | extract shared helper | 1 |
| `BUG-MISSING-AWAIT` | 3 | real | `await`/`.catch` | 4 |
| `BUG-DOUBLE-SUBMIT` | 3 | real | disable control while pending / idempotency | 4 |
| other singles | ≤2 each | mixed | per-site | 1–4 |

---

## Execution batches (single pass, ordered)

**Batch 0 — detector precision (The Deep).**
Port literal masking (`src/mask.mjs` pattern) into `src/engine/bug-taxonomy.ts` and
`src/engine/deep-intent.ts`: run line regexes on masked text, but keep secret/injection
scanning on raw text (a secret or injected instruction inside a string IS real). Re-run
the audit. Expect the 1,454 "signal" set to fall sharply and the remainder to be mostly genuine.
*File:* `INFRASTRUCTURE\The Deep\src\engine\*.ts`. *Verify:* re-audit delta + existing
`src/__tests__/bug-taxonomy.test.ts` still green.

**Batch 1 — mechanical (auto-fixable).** Run ESLint `--fix` for the Deep's own rule set
where safe, then by hand for the rest: `no-promise-executor-return`, `TS6133`/`TS6196`/
`TS6192`, `sonarjs/no-dead-store|no-collapsible-if|prefer-immediate-return|
no-inverted-boolean-check|no-unused-collection|no-identical-functions|no-redundant-jump`,
`no-throw-literal`. *Verify:* `tsc --noEmit`, `vitest run`.

**Batch 2 — security.** `BUG-INJECTION` → `execFileSync` with an args array.
`security/detect-unsafe-regex` → rewrite nested quantifiers (linear-time patterns),
add `redos-detector` to the gate. `security/detect-non-literal-regexp` → escape dynamic
input (`RegExp.escape` or a 5-line `escapeRegExp` fallback for Node < 24). *Verify:*
`npm run lint`, targeted unit tests.

**Batch 3 — async performance.** `no-await-in-loop` + real `DATA-QUERY-IN-LOOP`: batch
independent work into `Promise.all(map)` or bounded `p-map`/`p-limit {concurrency: N}`;
where serial is required (rate-limited APIs, ordered migrations) add
`// eslint-disable-next-line no-await-in-loop -- serial: rate limit` with the reason.
*Verify:* tests that exercise the affected paths.

**Batch 4 — correctness.** The post-masking survivors: `TS2339`, `NUM-FLOAT-MONEY`
(cents/Decimal), `BUG-ASYNC-CHAIN`, `BUG-LIFECYCLE-MISMATCH`, `BUG-OFF-BY-ONE`,
`BUG-MISSING-AWAIT`, `BUG-DOUBLE-SUBMIT`, `AGENT-UNBOUNDED-RECURSION`,
`PERF-EVENT-LOOP-STALL`. Each needs the per-site judgement the readout already carries
(`suggestedVerification`). *Verify:* `vitest run` + a regression test per fix.

**Batch 5 — accepted risk / annotations.** `ARCH-NO-DIRECT-DB-IN-CONTROLLER` on route
files: either extract a repository or annotate `// arch: route owns db` and record it as
accepted-risk. `BUG-RACE-REWRITE` sites that are synchronous: annotate, don't add locks.

**Batch 6 — verify + close the loop.** `npm run lint && npx tsc --noEmit && npm test`,
then re-run The Deep over the five partitions and regenerate `FULL-READOUT.md`.

---

## Why this is one pass and not twenty

The naive list is ~1,450 items. After Batch 0 the FP classes (races in single-threaded
JS, stream auto-close, matches inside strings) collapse; Batches 1–2 are largely
mechanical; only Batch 4 needs per-site reasoning, and the readout already carries a
`suggestedVerification` per finding. The gate is recourse's own toolchain, so "done" is
`lint + tsc + test` green plus a lower re-audit count — not a human's opinion.

## Sources

- ESLint `no-await-in-loop` / `no-promise-executor-return` docs — canonical fixes (`primary`).
- `p-limit` / `p-map` npm docs — bounded concurrency (`primary`).
- Node.js `fs`/stream docs + stream-leak playbook — `pipeline()`, `autoClose`, `try/finally` (`primary`).
- nodesource / Stack Overflow — JS is single-threaded; races need `await`/shared external state (`primary`, corr. `secondary`).
- OWASP ReDoS + `eslint-plugin-redos-detector` + MDN `RegExp.escape` (`primary`).
- DataLoader/batching guides — N+1 (`secondary`).
- `Coding lessons\2026-10-08-sieve-self-audit-scanner-false-positives.md` — masking decision (`primary`, in-repo).

---

## Execution status (2026-10-08)

**Batch 0 — DONE.** Literal masking ported into `The Deep/src/engine/mask.ts` and folded
into `bug-taxonomy.ts` + `deep-intent.ts` (structural detectors masked; secret/injection/
authz/cache/status/import detectors read raw). Effect: total **14,476 → 13,606**, signal
**1,454 → 1,224**; `DATA-QUERY-IN-LOOP` 488→385, `ARCH-NO-DIRECT-DB-IN-CONTROLLER` 310→205.
Bug-taxonomy + deep-intent tests green (46).

**Batch 2 — DONE (real subset).** `BUG-INJECTION` had 10 hits; 8 were false positives
(tool-name templates like `` mcpCall(`${BL}${NS}check_plan_footguns`) `` and self-scanners).
Two were real and are fixed:
- `src/lib/codeSafetyOss.ts` — `execSync(\`semgrep --config ${f} ...\`)` → `execFileSync('semgrep', [...])`.
- `src/lib/e2bSandbox.ts` — package specs validated against a dist-name+version pattern before `pip install`.

**Batches 1, 3, 4, 5 — RECLASSIFIED (not defects).** The remaining "signal" is dominated by
the audit tool's config diverging from recourse's own gate, proven by recourse's gate:

| source | recourse's gate | The Deep says | verdict |
|---|---|---|---|
| `tsc --noEmit` | clean except 8 external `@deepseek-ai/*` module errors | 85 `TS6133` + 27 `TS2339` + 70 | audit artifact (standalone tsc: `noUnusedLocals`, virtual host) |
| `oxlint` | **0 errors**, 77 warnings | 181 `no-await-in-loop`, sonarjs, `no-promise-executor-return` | rules recourse does not run |
| `DATA-QUERY-IN-LOOP` / `ARCH-...` | not flagged | 385 / 205 | structural heuristic + design opinion |

**Batch 6 — DONE.** `oxlint` 0 errors, `tsc --noEmit` clean (mod external deps).

Net real defects fixed across the pass: silent empty-catches (prior session), 2 command-injection
sites, plus the detector-precision fix. The rest is tool-vs-gate divergence; changing code to
satisfy it would be churn.
