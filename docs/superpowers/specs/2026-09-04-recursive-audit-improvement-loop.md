# Recursive Business Audit & Improvement Loop — Design Spec

**Date:** 2026-09-04
**Status:** Approved
**Related:** [Business Autopilot Spec](./2026-09-04-recourse-business-autopilot-design.md)

## 1. Problem

Recourse today can produce artifacts for three businesses (HempForge, Aetherdesk, Truck Buddy). What it cannot do is:

1. **Audit** an existing business repo (code quality, doc completeness, security, market position) using a reproducible, multi-auditor process.
2. **Find gaps** between the current state and a "good" state, prioritized by impact.
3. **Propose and apply upgrades** that close those gaps, with the ability to evolve the audit/upgrade genes themselves.

The Uplift ecosystem has the right tools (Grader, RepoRank, The Deep, Codegang, Benchmark Olympics, audit-chain, Keywire), but Recourse is not yet wired into them. The recursive improvement loop — where Recourse gets better at auditing over time — does not exist.

## 2. Goals

1. **Run a real, multi-auditor audit** against each business repo on demand.
2. **Score the business** on dimensions the operator cares about (code quality, security, docs, web presence, market signals).
3. **Generate upgrade proposals** that close the largest gaps, with sandbox verification for code.
4. **Apply upgrades via time-bounded auto-merge** (24h veto window) using Keywire-managed GitHub tokens.
5. **Recursively improve the audit genes** by measuring whether their output led to a higher business score after the upgrade was applied.

## 3. Non-Goals

1. **Not building new auditors.** Grader, RepoRank, The Deep, Codegang, Olympics, and audit-chain already exist. We compose them, we don't replace them.
2. **Not running audits against Recourse itself in v1.** Focus is the three businesses.
3. **Not auto-merging anything that breaks the build.** The pre-merge gate is mandatory.
4. **Not replacing human review on strategy and copy.** The audit can find "missing landing page" but the landing page copy still goes through tier B/C review from the autopilot spec.
5. **Not running against non-Overlay365 businesses.** This is internal tooling for the operator's three repos.

## 4. Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   RECURSIVE IMPROVEMENT LOOP                │
│                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│   │  Business    │    │   Multi-     │    │   Gap        │ │
│   │  Profile     │───▶│   Auditor    │───▶│   Analysis   │ │
│   │  (existing)  │    │   Suite      │    │   (Recourse) │ │
│   └──────────────┘    └──────┬───────┘    └──────┬───────┘ │
│                              │                    │         │
│                              ▼                    ▼         │
│                       audit-chain          ┌──────────────┐  │
│                       output               │  Upgrade     │  │
│                              │             │  Proposal    │  │
│                              ▼             │  Generator   │  │
│                       Sealed               │  (Recourse)  │  │
│                       Audit                └──────┬───────┘  │
│                       Statement                   │          │
│                                                   ▼          │
│                                            ┌──────────────┐  │
│                                            │  Pre-Merge   │  │
│                                            │  Gate        │  │
│                                            │  - sandbox   │  │
│                                            │  - lint      │  │
│                                            │  - tests     │  │
│                                            └──────┬───────┘  │
│                                                   │          │
│                              ┌────────────────────┼──────┐   │
│                              ▼                    ▼      ▼   │
│                       ┌─────────────┐     ┌──────────┐  ...  │
│                       │ Draft PR    │     │ Staged   │       │
│                       │ via Keywire │     │ (tier B) │       │
│                       │ 24h veto    │     │ (tier C) │       │
│                       └──────┬──────┘     └──────────┘       │
│                              │                                │
│                              ▼                                │
│                       ┌─────────────┐                         │
│                       │ Auto-merge  │  (if no veto in 24h)   │
│                       └──────┬──────┘                         │
│                              │                                │
│                              ▼                                │
│                       ┌─────────────┐                         │
│                       │ Post-Merge  │                         │
│                       │ Re-Audit    │──────────────────────┐  │
│                       └──────┬──────┘                      │  │
│                              │                             │  │
│                              ▼                             │  │
│                       ┌─────────────┐                      │  │
│                       │ Gene        │                      │  │
│                       │ Fitness     │                      │  │
│                       │ Update      │◀─────────────────────┘  │
│                       └─────────────┘  (loop closes)         │
└────────────────────────────────────────────────────────────┘
```

## 5. Components

### 5.1 BusinessProfile + RepoBinding (new, in `businessProfile.ts`)

Extends the existing profile with a repo binding:

```yaml
business:
  name: HempForge
  ...
repo:
  localPath: "C:/Users/User/Downloads/Uplift/02_Pillars/Overlay Science/Biotech/HempForge-main"
  githubUrl: "https://github.com/..."  # optional, when public
  defaultBranch: "main"
  auditScheduleCron: "0 6 * * *"  # daily 6am audit
  autoMergeEnabled: true
  autoMergeVetoHours: 24
  minSandboxScore: 0.7
```

When `autoMergeEnabled: true`, the operator has explicitly opted in. The kill switch is a one-line toggle: `autoMergeEnabled: false`.

### 5.2 Multi-Auditor Adapter (`src/autopilot/auditRunner.ts`)

Composes the audit-chain package's adapters. Uses the existing `packages/audit-chain` if it's a workspace dep, otherwise implements the same contract against the live services.

| Auditor | Service URL | Adapter | What It Scores |
|---|---|---|---|
| Grader | :3201 | `@overlay365/audit-chain/adapters/grader` | 9 sections: security, quality, market, compliance, valuation, architecture, ossRisk, quickWins, roadmap, hotspots |
| RepoRank | :3200 | `@overlay365/audit-chain/adapters/reporank` | Overall A+ to F + AI/human code mix + drift |
| The Deep | :3100 | `@overlay365/audit-chain/adapters/deep` | Static analysis + 20-bug taxonomy (capped at 200 findings) |
| Codegang | :3204 | `@overlay365/audit-chain/adapters/codegang` | Multi-scanner deterministic suite |
| Olympics | :probe | `@overlay365/audit-chain/adapters/olympics` | Live HTTP latency/error rate |

**Honest limits**:
- Grader, RepoRank use AI (Gemini). Their scores are model opinions, honestly labeled `scoreBasis: "ai-generated"`.
- The Deep and Codegang are deterministic. Their findings are real.
- Olympics is only included if a running service exists; otherwise excluded with reason.
- The "full view" implied by the operator is the **composition of all configured auditors** with their honestly-labeled scores, sealed into one audit-chain statement.

**Output**: `data/business-profiles/<slug>/audits/audit-<ISO>.json` (full audit-chain statement) plus a normalized `scorecard` for Recourse's own use.

### 5.3 Normalized Business Scorecard

For Recourse's own improvement loop, the audit-chain statement is too verbose. We project a normalized `BusinessScorecard`:

```typescript
interface BusinessScorecard {
  businessSlug: string;
  auditedAt: string;
  auditorsUsed: string[];          // which of the 5 ran
  auditorsExcluded: { name: string; reason: string }[];

  // Code-quality dimensions (from The Deep, Codegang, RepoRank)
  codeQuality: number;            // 0-100
  securityPosture: number;         // 0-100
  testCoverage: number;            // 0-100
  documentationCompleteness: number; // 0-100

  // Business dimensions (from Grader's market/quality/compliance sections)
  marketSignals: number;           // 0-100
  complianceMaturity: number;      // 0-100
  valuationEstimate: number;       // dollar amount (informational only)

  // Project-specific (from business profile gaps)
  profileGapCoverage: number;      // 0-100, % of declared gaps that the audit found
  webPresence: number;             // 0-100, simple proxy: does landing exist? SEO? OG tags?

  // Composite
  overallScore: number;            // 0-1000, weighted
  gradeCategory: string;           // A+ to F

  // Per-auditor raw findings
  findings: AuditFinding[];
}
```

The scorecard is computed deterministically from the audit-chain statement. No LLM in the loop.

### 5.4 Gap Analyzer (`src/autopilot/gapAnalyzer.ts`)

Reads the business scorecard + the profile's `gaps` list + the audit findings, and produces a prioritized list of upgrade opportunities.

**Priority scoring** (deterministic):

```typescript
function scoreGap(gap: Gap): number {
  const w = weights();
  return w.auditSignal * (gap.auditMentions / maxMentions)
       + w.profileSignal * (gap.profileDeclared ? 1 : 0)
       + w.fixability * gap.fixability
       - w.risk * gap.risk
}
```

Each gap is tagged with:
- `auditMentions` — how many auditors flagged it
- `profileDeclared` — was it on the operator's `gaps` list
- `fixability` — 0 to 1, how easy (lint fix vs. architecture change)
- `risk` — 0 to 1, what could break
- `tier` — A, B, or C (from quality tier router)

**Output**: a ranked `UpgradeQueue` for the business.

### 5.5 Upgrade Generator (`src/autopilot/upgradeGenerator.ts`)

For each gap in the queue, generates an upgrade proposal:

- **Tier A (auto)**: code upgrades. Uses the Recourse sandbox + property tests (existing). The proposal includes the new code, a test, and a `VERIFIED.md` marker.
- **Tier B (staged)**: copy, docs, config. Generated as diffs or new files. Includes a `REVIEW_REQUIRED.md` marker and renders a human-readable diff summary.
- **Tier C (human)**: strategy, positioning, pricing. Generates a `strategy-memo.md` for the operator. Never applies.

**For each proposal, the generator also computes an expected impact estimate** based on which scorecard dimensions it moves. This is `scoreDelta` — a deterministic projection from the gap's relationship to the scorecard dimensions.

### 5.6 Pre-Merge Gate

Before any auto-merge-eligible upgrade is applied, it must pass:

1. **Sandbox verification** (code tier A) — the existing Recourse sandbox runs the upgrade's test suite
2. **Lint** — oxlint must pass on changed files
3. **Type check** — `tsc --noEmit` must pass
4. **Test suite** — the repo's existing tests must pass
5. **Self-impact estimate** — the upgrade must move the scorecard in a non-zero direction
6. **No regression** — the change must not modify any file on a "protected paths" list (e.g., the existing `.env`, the operator's `KEYWIRE.md`)

**Failure modes**:
- Any check fails → upgrade is rejected, logged, and the gene fitness is updated negatively
- Sandbox score < `minSandboxScore` (default 0.7) → upgrade is rejected
- The operator can add files to a per-business "always require human review" list

### 5.7 Auto-Merge via Keywire

For upgrades that pass the gate and are tier A:

1. Generate a new git branch in the repo
2. Open a draft PR via the GitHub API
3. Mark it as "Recourse auto-merge candidate" with the time-bounded label
4. Wait 24h (or `autoMergeVetoHours`)
5. If no veto received, the PR is merged automatically
6. If veto received, the PR is closed

**Keywire integration** (per operator decision):
- GitHub tokens for each business are stored in Keywire
- Recourse fetches the token at PR-create time, uses it, and never persists it
- The kill switch is `autoMergeEnabled: false` in the business profile (one line, committed)

**Audit trail**: every auto-merge PR includes the audit-chain statement, the scorecard, the proposed gap, and the expected score delta in the PR body. Operators can grep the git history and reconstruct what Recourse did and why.

### 5.8 Post-Merge Re-Audit & Gene Fitness

After the auto-merge window expires (merge or veto):

1. Trigger a fresh audit on the updated repo
2. Compute the new scorecard
3. Compare to the pre-merge scorecard
4. Update the fitness of the gene(s) that generated the upgrade

**Gene fitness update**:
- If the scorecard improved along the predicted axis → +1 to the gene's success counter
- If the scorecard regressed → -1
- If the scorecard didn't change → 0
- These are folded into the existing `recourse_learner.json` ledger (no new system)

**The recursive loop closes** here. Over time, the audit/upgrade genes that produce scorecard-improving upgrades are more likely to be selected for the next round.

### 5.9 Fitness Signals: Multi-Source

Per the operator's decision, fitness is computed from multiple signals:

1. **Coverage score** (recommended primary): `scoreDelta = newScorecard - oldScorecard`, weighted by which dimensions the gap targeted
2. **RepoRank score** (passive): the RepoRank grade delta between audits
3. **Grader score** (passive): the Grader overallScore delta
4. **Benchmark Olympics** (when applicable): if a measurable endpoint was deployed, its benchmark score
5. **The Deep's findings count** (sanity): fewer critical/high findings = better

The composite fitness is `weightedAverage(signals)`. Weights are configurable per business.

### 5.10 Kill Switches

Three independent kill switches:

1. **Per-business**: `autoMergeEnabled: false` in the profile
2. **Per-gene**: any gene can be quarantined via the existing Recourse self-repair mechanism
3. **Global**: a `RECOURSE_AUTOPILOT_DISABLED=1` environment variable

Any kill switch stops the auto-merge immediately. Draft PRs already opened remain open (the operator can merge them manually).

## 6. Data Flow

### 6.1 Daily Audit Cycle

```
[cron] triggers audit at 06:00
    │
    ▼
[auditRunner] runs all configured auditors
    │
    ▼
[audit-chain] produces sealed statement
    │
    ▼
[scorecard] projected from statement
    │
    ▼
[gapAnalyzer] compares to previous scorecard + profile gaps
    │
    ▼
[upgradeGenerator] produces ranked queue
    │
    ▼
For each upgrade:
    [pre-merge-gate] verifies
    [PR creation] via Keywire
    [24h veto window]
    [auto-merge or close]
    │
    ▼
[post-merge re-audit]
    │
    ▼
[gene fitness update] in recourse_learner.json
```

### 6.2 Manual Audit (on-demand)

The operator can run `npm run audit --business=hempforge` to trigger an audit and see the scorecard + proposed upgrades without applying anything.

## 7. Honest Limits

This loop has real capability. It also has real limits. The spec names them so we don't pretend otherwise.

### 7.1 What the loop can do well

- **Code quality**: real static analysis (The Deep, Codegang), real dependency audit
- **Security**: real secret scanning, real CVE matching
- **Documentation gaps**: real detection of missing README sections, missing CHANGELOG, missing API docs
- **Web presence**: real check for landing page existence, OG tags, robots.txt, sitemap
- **Test coverage**: real detection of files with no tests
- **API consistency**: real detection of endpoints that don't follow the repo's contract patterns
- **Simple copy fixes**: real lint of markdown, real word-count checks, real detection of "TODO" / "FIXME" placeholders
- **Apply most tier A code upgrades automatically** (tests pass, lint passes, typecheck passes)

### 7.2 What the loop does poorly or cannot do

- **Market positioning**: Grader's market score is AI opinion, not measured. The loop cannot tell you "your ICP is wrong" — it can only find "your ICP is undefined" (a structural fact).
- **Conversion rate**: the loop cannot tell you "your landing page converts 2%" — only that the landing page exists, has meta tags, mentions the price, etc.
- **Customer feedback**: the loop reads code, not customer conversations.
- **Visual design quality**: the loop cannot evaluate whether the design is good, only whether it follows the template.
- **Tier B and C artifacts still need the operator**: copy review, strategy review, brand decisions.

### 7.3 The recursive-improvement risk

The genes evolve toward "produces scorecard-improving upgrades." This is a narrow fitness signal. It can produce:
- **Good**: genes that learn to fix common lint errors first because those move the scorecard most
- **Bad**: genes that learn to game the scorecard by, e.g., adding empty test files that satisfy coverage checks
- **Ugly**: genes that learn to game RepoRank/Grader scores by adding cosmetic metadata without actually improving the code

**Mitigations**:
- The Deep's static analysis is a sanity check — code that "passes" by adding empty tests will still have real lint issues flagged
- The scorecard explicitly weights multiple dimensions so no single signal dominates
- Human review is required for any upgrade that touches files on the "protected" list
- The post-merge re-audit closes the loop: if the upgrade didn't actually improve the underlying code, the scorecard won't move

## 8. Testing & Verification

### 8.1 Unit Tests (vitest)

- BusinessProfile.repo binding validation
- Scorecard projection from audit-chain statement
- Gap scoring (priority order is deterministic)
- Pre-merge gate logic (sandbox, lint, typecheck, test)
- Kill switch behavior
- Gene fitness update math

### 8.2 Integration Tests

- End-to-end: profile → audit → scorecard → gap → upgrade → gate → PR (against a sandbox repo)
- Post-merge re-audit cycle (against a sandbox repo with a fake GitHub server)
- Keywire token retrieval (mocked)

### 8.3 Manual Verification Gates

- **First-time audit gate**: no auto-merge enabled until operator has reviewed one full audit + scorecard
- **Per-business first-PR gate**: first auto-merge for each business requires operator sign-off in the PR comment
- **Scorecard regression gate**: if any dimension regresses by >10 points after a merge, the gene is auto-quarantined

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Auto-merge breaks a working production repo | Medium | High | Sandbox + lint + typecheck + tests gates; 24h veto window; per-business kill switch |
| Genes game the scorecard (e.g., empty tests) | Medium | Medium | The Deep's static analysis is the floor; multi-signal fitness |
| Recourse starts running too many audits and exhausts API quotas | Medium | Low | Per-business `auditScheduleCron`; per-auditor rate limits |
| Keywire token leakage | Low | Critical | Token fetched at PR-create time, never persisted, used only for `POST /repos/.../pulls` |
| Operator overwhelmed by 24h veto decisions | Medium | Medium | Auto-merge is opt-in per business; default for new businesses is `autoMergeEnabled: false` |
| Recourse's "fix" makes a code change the operator disagrees with | High | Medium | Every PR includes a human-readable diff summary; veto is one click |
| Scorecard becomes a vanity metric | Medium | Medium | Multi-source signals; post-merge re-audit; periodic human review of the scorecard itself |

## 10. Definition of Done

The loop is done when:

1. HempForge has a baseline audit and scorecard.
2. Aetherdesk has a baseline audit and scorecard.
3. Truck Buddy has a baseline audit and scorecard.
4. The first auto-merge PR has been opened, reviewed by the operator, and either merged or vetoed.
5. The post-merge re-audit demonstrates the scorecard moved in the predicted direction (or the gene is quarantined if it didn't).
6. The recursive loop runs autonomously (audit → gap → upgrade → PR → merge → re-audit → fitness) for at least one full cycle per business.
7. All kill switches are tested and verified to stop the loop.
8. The operator can run `npm run audit --business=<slug>` and see the current scorecard + proposed upgrades in under 30 seconds (when services are up).
9. The operator's AGENTS.md is updated with the operational procedure.

## 11. Open Questions (deferred to implementation)

- Specific weights for the multi-signal fitness function. Default proposal: RepoRank 0.25, Grader 0.25, Deep findings count 0.2, profile gap coverage 0.2, web presence 0.1. Operator can override.
- Specific "protected paths" list per business. Default proposal: `.env`, `KEYWIRE.md`, `gh token.txt`, anything matching `*secrets*`.
- The minimum RepoRank grade to allow auto-merge. Default proposal: only D+ and below trigger upgrades (no auto-merge on already-healthy code).
- Whether to include Benchmark Olympics in v1. Recommendation: skip for the three current businesses since none have a live public endpoint; include when one does.
