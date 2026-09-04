# Recourse Autopilot — Operating Procedure

Operator runbook for the scheduled business audit loop. It matches what
`scripts/autopilot-cron.ts` actually does — no invented commands.

Spec: [`docs/superpowers/specs/2026-09-04-recursive-audit-improvement-loop.md`](./superpowers/specs/2026-09-04-recursive-audit-improvement-loop.md)

## 1. What this is

The recursive audit & improvement loop, in two steps:

**runLoop** (one scheduled pass): **audit → scorecard → gaps → upgrades → pre-merge gate → draft PR → veto_wait**

**resumeAfterVeto** (a later tick on a persisted PR): **veto check → merge | veto → post-merge re-audit → gene fitness**

Recourse audits a business repo with the configured auditors, projects the
results onto a deterministic scorecard, ranks the gaps between current state and
a good state, generates tiered upgrade proposals, verifies each proposal at the
pre-merge gate, and (for businesses that opted in) opens a draft PR that a later
`resumeAfterVeto` tick merges after the veto window. After a merge it re-audits
and folds the measured scorecard delta back into gene fitness so the loop gets
better at picking upgrades that actually move the score. Full detail is in the
spec.

## 2. Prerequisites

- This Recourse repo, with business profiles under `data/business-profiles/`.
- A repo binding on the business profile (`repo.localPath`, and `repo.githubUrl`
  when the repo is public) — see §3. Without a binding the audit refuses to run.
- **v1 adapter wiring is a follow-up.** The audit runner ships the adapter seam
  (`auditRunner.runAudit` accepts an injected `adapters` map), but no live
  Grader/RepoRank/Deep/Codegang **HTTP adapters are shipped yet**. A run without
  provided adapters fails honestly with `All auditors failed or were excluded`
  and the cron exits `1`. Until adapters are wired, the loop is exercised through
  the unit/dry-run path. Planned service env for those adapters:
  - Grader (`http://localhost:3201`) — `GRADER_URL` / `GRADER_API_KEY`
  - RepoRank (`http://localhost:3200`) — `REPORANK_URL` / `REPORANK_API_KEY`
  - The Deep (`http://localhost:3100`) — `DEEP_URL` / `DEEP_TOKEN`
  - Codegang (`http://localhost:3204`) — `CODEGANG_URL` / `CODEGANG_API_KEY`
- Keywire (`KEYWIRE_URL`, `KEYWIRE_SERVICE_TOKEN`) for the GitHub token at
  PR-create time — see §4.

## 3. Business profile

Profiles live at `data/business-profiles/<slug>.yaml` and are the human-authored
grounding for everything the loop produces. A profile is read, never mutated, by
the autopilot.

The `repo:` binding is what opts a business into the loop:

```yaml
repo:
  localPath: "C:/path/to/the-business/repo"
  githubUrl: ""          # optional, when the repo is public
  defaultBranch: "main"
  auditScheduleCron: "0 6 * * *"   # metadata for cron wiring
  autoMergeEnabled: false           # the per-business kill switch / opt-in
  autoMergeVetoHours: 24
  minSandboxScore: 0.7
  protectedPaths: [".env", "*.env*", "*secret*", "*token*", "*key*", "gh token.txt"]
```

To add a business: author the profile YAML with `business`, `customer`,
`offering`, and `gaps` sections (the profile schema in
`src/autopilot/businessProfile.ts` validates on load), commit it, then add a
`repo:` binding when you want the loop to act on it. `autoMergeEnabled` defaults
to `false` — auto-merge is always an explicit opt-in.

The HempForge, Aetherdesk, and Truck Buddy profiles already exist but have **no
`repo:` bindings yet**. `npm run audit` will skip them until a binding is added.

## 4. Keywire token

GitHub tokens are never stored in this repo or on disk by the autopilot.

- `src/autopilot/keywireClient.ts` `fetchGitHubToken(owner)` reads
  `KEYWIRE_URL` and `KEYWIRE_SERVICE_TOKEN`.
- The token is fetched from Keywire at **PR-create time**, used immediately for
  that one API call, and never persisted.
- Store each repo owner's token in Keywire under:
  `/api/secrets/<owner>/github-token` (e.g. `github-token` for owner
  `overlay365`).

No Keywire token configured → PR creation fails cleanly and that business's run
errors out (the loop never falls back to a local token).

## 5. Running

```bash
npm run audit                  # every profiled business, in order
npm run audit:one -- hempforge # just one business (slug after the --)
npm run audit:dry-run          # every business, read-only (no PR opened)
```

- `--all` is the default selection. `--business=hempforge` (or a bare trailing
  slug) selects one business.
- `--dry-run` still audits but never opens a PR, and does **not** skip
  businesses whose auto-merge is disabled — it reports what the loop would do.
- Businesses with `autoMergeEnabled: false` are skipped with
  `[autopilot] <slug>: auto-merge disabled, skipping` unless `--dry-run` is set.
- Per business the cron logs one outcome line:
  `[autopilot] <slug>: <status>` plus `pr=<prNumber>` or `reason=<reason>` when
  the loop state carries them.
- Exit codes: `0` all green, `1` at least one business errored (the run
  continues to the next business), `2` global kill switch aborted the run.

## 6. The 24h veto window

A merge candidate is a **draft PR** created by `runLoop` and labeled
`recourse-auto-merge`. `runLoop` ends in `veto_wait`; a later
`resumeAfterVeto` call (driven by a scheduler tick against the persisted
`prs/pr-<number>.json` state) advances the PR after `autoMergeVetoHours`
(default 24h).

- **No veto:** when the deadline passes, `resumeAfterVeto` merges the PR
  automatically and then re-audits + folds the fitness delta.
- **Veto:** posting a PR comment containing the standalone word `veto`
  (case-insensitive) makes `resumeAfterVeto` close the PR instead. One comment
  is enough — the check reads comments before merging.

Veto is the operator's one-click kill for a single change. It does not stop the
next cycle. Note the trigger is the word `veto` anywhere in a comment; a comment
like "we considered a veto but decided no" will still close the PR, so comment
the bare word only when you actually want to veto.

## 7. Kill switches

Three independent levels. Any of them stops auto-merge immediately; draft PRs
already opened stay open for the operator to merge or close manually.

| Level | Where | How |
|---|---|---|
| Global | environment | `RECOURSE_AUTOPILOT_DISABLED=1` (or `true`/`yes`) → cron logs `[autopilot] KILL_SWITCH active, aborting` and exits `2`. |
| Per-business | profile YAML | `repo.autoMergeEnabled: false` → the cron skips that business (or runs it read-only under `--dry-run`). |
| Per-gene | `recourse_learner.json` | The fitness loop quarantines a proposal id when the post-merge scorecard **regressed ≥ 10 composite points**; the id is appended to the `quarantined` array. v1 quarantine is append-only — re-selection suppression that consults `quarantined` is a follow-up. |

## 8. Reading outputs

Outputs land per business under `data/business-profiles/<slug>/`:

- `audits/audit-<ISO>.json` — the sealed audit-chain statement: one
  `auditors` section per auditor plus the honesty `disclosures`.
- `scorecard-<ISO>.json` — the normalized business scorecard projected
  deterministically from the statement (no LLM in the projection).
- `prs/pr-<number>.json` — persisted PR/veto state for an opened draft PR.
- `recourse_learner.json` (repo root) — the gene-fitness ledger: `geneFitnessUpdates`
  and the `quarantined` list.

Scorecard fields: eight dimensions each 0–100 (`codeQuality`,
`securityPosture`, `testCoverage`, `documentationCompleteness`, `marketSignals`,
`complianceMaturity`, `webPresence`, `profileGapCoverage`), `overallScore`
0–1000, `gradeCategory`, `valuationEstimate` (informational), plus
`auditorsUsed` / `auditorsExcluded` and critical/high finding counts.

Honesty labels: every statement records in `disclosures` which auditors were
`aiGenerated` (model opinions — Grader, RepoRank), which were `deterministic`
(The Deep, Codegang), which were `measured` (Olympics probes), and which were
`excluded`, with the reason. Treat `ai-generated` numbers as opinions and
`deterministic` numbers as measurements.

## 9. Protected paths

By default the pre-merge gate refuses any change touching: `.env`,
`gh token.txt`, `*.env*`, `*secret*`, `*token*`, `*key*`. The list is
configurable per business via `repo.protectedPaths` in the profile.

A proposal that touches a protected path is **blocked at the gate before
anything is written to disk** — the gate reports `protected_paths` as the
failing check, and the proposal is never applied, rolled back, or PR'd. The gate
also snapshots every file it applies and **rolls the working tree back** if a
later verification step fails, so a rejected proposal leaves the local clone
exactly as it found it. `--dry-run` runs the gate with `applyFiles: false`,
which writes nothing at all.

## 10. Auto-merge scope

Only **Tier A** proposals are auto-merge candidates. In a non-dry run the loop
skips Tier B and Tier C gaps entirely (they carry `REVIEW_REQUIRED.md` /
`NO_AUTO_DEPLOY.md` markers and always need a human). Dry runs may select any
tier because nothing is opened or merged.

## 11. Known limits

- **Tier B and C artifacts always need a human.** Tier B (copy/docs/web)
  carries a `REVIEW_REQUIRED.md` marker; Tier C (strategy) carries a
  `NO_AUTO_DEPLOY.md` marker. The loop never auto-deploys either.
- **Tier A code that needs real synthesis is not fabricated.** Until a planner
  model is configured, such gaps are emitted as a review document with
  `requiresSandboxVerify: true` — never invented source that pretends to work.
  The gate reports `requires_sandbox_not_available` rather than a fake pass.
- **No shipped live auditor adapters yet** — see §2. `npm run audit` fails
  honestly until adapters are wired; the unit/dry-run path exercises the loop.
- **v1 quarantine is append-only** (no re-selection guard yet) — see §7.
- AI-scored dimensions (market, compliance, valuation from Grader; RepoRank
  grade) are model opinions, not measurements — see §8 honesty labels.
