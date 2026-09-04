# Recursive Audit Loop — Phase 2: Gap Analysis Through Gene Fitness
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete recursive improvement loop: gap analysis, upgrade generation, pre-merge gate, Keywire GitHub integration, auto-merge with 24h veto, post-merge re-audit, and gene fitness update.

**Architecture:** The loop is structured as a state machine with explicit transitions: AUDIT → ANALYZE → GENERATE → GATE → PR → VETO_WAIT → MERGE|VETO → RE_AUDIT → FITNESS_UPDATE. Each transition is a separate function with tests. The Keywire adapter uses the existing Keywire server protocol for token retrieval. Gene fitness uses the existing `recourse_learner.json` ledger format.

**Tech Stack:** TypeScript, Zod, `node:fs`, `node:path`, `node:child_process` for sandbox/lint/typecheck, GitHub REST API v3, existing `recourse_learner.json` ledger.

---

## File Structure

```
src/autopilot/
  gapAnalyzer.ts        # NEW: score gaps, build upgrade queue
  upgradeGenerator.ts   # NEW: generate upgrade proposals by tier
  preMergeGate.ts       # NEW: sandbox + lint + typecheck + test gate
  keywireClient.ts       # NEW: fetch GitHub token from Keywire
  gitHubClient.ts        # NEW: create PR, check veto status, merge
  vetoScheduler.ts       # NEW: 24h timer, veto window, auto-merge
  fitnessLoop.ts          # NEW: post-merge re-audit + gene update
  loopStateMachine.ts     # NEW: orchestrates the full state machine

data/business-profiles/<slug>/
  gaps/
    upgrade-queue-<ISO>.json  # ranked upgrade proposals
  prs/
    pr-<number>.json          # PR metadata, veto status, timestamps
  fitness/
    gene-fitness-<ISO>.json  # fitness deltas after each cycle

tests/
  gapAnalyzer.test.ts
  upgradeGenerator.test.ts
  preMergeGate.test.ts
  keywireClient.test.ts
  gitHubClient.test.ts
  vetoScheduler.test.ts
  fitnessLoop.test.ts
  loopStateMachine.test.ts
```

---

## Task 4: Gap Analyzer

**Files:**
- Create: `src/autopilot/gapAnalyzer.ts`
- Test: `tests/gapAnalyzer.test.ts`

### What it does

`analyzeGaps(scorecard: BusinessScorecardT, profile: BusinessProfileT): UpgradeQueue`

Reads the scorecard and profile gaps, scores each gap, and returns a priority-sorted queue of upgrade candidates.

```typescript
export const GapWeight = z.object({
  auditSignal: z.number().min(0).max(1).default(0.4),
  profileSignal: z.number().min(0).max(1).default(0.3),
  fixability: z.number().min(0).max(1).default(0.2),
  risk: z.number().min(0).max(1).default(0.1),
});
export type GapWeightT = z.infer<typeof GapWeight>;

export const Gap = z.object({
  id: z.string(),
  description: z.string(),
  source: z.enum(['audit', 'profile', 'both']),
  auditMentions: z.number().int().min(0).default(0),
  profileDeclared: z.boolean().default(false),
  fixability: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
  tier: z.enum(['A', 'B', 'C']),
  affectedDimensions: z.array(z.string()),
  estimatedScoreDelta: z.number(),
});
export type GapT = z.infer<typeof Gap>;

export const UpgradeQueue = z.object({
  businessSlug: z.string(),
  generatedAt: z.string().datetime(),
  scorecardSnapshot: BusinessScorecard,
  gaps: z.array(Gap),
  weights: GapWeight,
});
export type UpgradeQueueT = z.infer<typeof UpgradeQueue>;

export const UPGRADE_WEIGHTS: Required<GapWeightT> = {
  auditSignal: 0.4,
  profileSignal: 0.3,
  fixability: 0.2,
  risk: 0.1,
};

export function analyzeGaps(
  scorecard: BusinessScorecardT,
  profile: BusinessProfileT,
  weights: GapWeightT = UPGRADE_WEIGHTS,
): UpgradeQueueT {
  const gaps = buildGaps(scorecard, profile);
  const scored = gaps.map(g => ({
    ...g,
    priorityScore: scoreGap(g, weights),
  }));
  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  return UpgradeQueue.parse({
    businessSlug: scorecard.businessSlug,
    generatedAt: new Date().toISOString(),
    scorecardSnapshot: scorecard,
    gaps: scored,
    weights,
  });
}

function scoreGap(gap: GapT, weights: GapWeightT): number {
  const maxMentions = 5;
  return (
    weights.auditSignal * Math.min(1, gap.auditMentions / maxMentions) +
    weights.profileSignal * (gap.profileDeclared ? 1 : 0) +
    weights.fixability * gap.fixability -
    weights.risk * gap.risk
  );
}
```

`buildGaps` synthesizes gap candidates from:
1. **Profile gaps**: each `profile.gaps[]` entry becomes a Gap with `profileDeclared: true`
2. **Scorecard deficits**: any dimension below 50 becomes a gap with `auditMentions` proportional to the deficit
3. **Critical findings**: each critical/high finding from The Deep creates a security gap

Each gap maps to a tier (A/B/C) via the qualityTier router.

- [ ] **Step 1: Write failing tests for gap scoring**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement gapAnalyzer.ts**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

```bash
git add src/autopilot/gapAnalyzer.ts tests/gapAnalyzer.test.ts
git commit -m "feat(autopilot): gap analyzer with priority scoring"
```

---

## Task 5: Upgrade Generator

**Files:**
- Create: `src/autopilot/upgradeGenerator.ts`
- Test: `tests/upgradeGenerator.test.ts`

### What it does

`generateUpgrade(gap: GapT, profile: BusinessProfileT): UpgradeProposal`

For each gap, generates the actual code/doc/diff that would close it. The generator is tier-aware:

- **Tier A**: generates JavaScript code via Recourse's existing sandbox code path, returns the code + test
- **Tier B**: generates HTML/markdown/text diff, returns a rendered file + REVIEW_REQUIRED.md
- **Tier C**: generates a strategy memo markdown file + DISCLAIMER.md + NO_AUTO_DEPLOY.md

```typescript
export const UpgradeProposal = z.object({
  id: z.string(),
  gapId: z.string(),
  tier: z.enum(['A', 'B', 'C']),
  title: z.string(),
  description: z.string(),
  files: z.array(z.object({
    path: z.string(),
    action: z.enum(['create', 'modify', 'delete']),
    content: z.string(),
  })),
  expectedScoreDelta: z.record(z.string(), z.number()),
  generatedAt: z.string().datetime(),
  markerFile: z.string().optional(),
  requiresSandboxVerify: z.boolean(),
  passedSandbox: z.boolean().optional(),
  passedLint: z.boolean().optional(),
  passedTypecheck: z.boolean().optional(),
});
export type UpgradeProposalT = z.infer<typeof UpgradeProposal>;

export async function generateUpgrade(
  gap: GapT,
  profile: BusinessProfileT,
): Promise<UpgradeProposalT> {
  const id = `upgrade-${gap.id}-${Date.now()}`;
  const repo = repoBinding(profile);

  if (gap.tier === 'A') {
    return generateCodeUpgrade(gap, profile, id, repo);
  } else if (gap.tier === 'B') {
    return generateCopyUpgrade(gap, profile, id);
  } else {
    return generateStrategyMemo(gap, profile, id);
  }
}
```

Tier A (code) uses the existing Recourse sandbox to generate working code with tests. The generator prompt is seeded with the gap description and the repo context.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement upgradeGenerator.ts**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

---

## Task 6: Pre-Merge Gate

**Files:**
- Create: `src/autopilot/preMergeGate.ts`
- Test: `tests/preMergeGate.test.ts`

### What it does

`runGate(proposal: UpgradeProposalT, repoPath: string): Promise<GateResult>`

Sequentially runs each pre-merge check. Any failure stops the chain and logs the failure reason. Returns `{ passed: boolean; checks: CheckResult[]; overallScore?: number }`.

```typescript
export const CheckResult = z.object({
  name: z.string(),
  passed: z.boolean(),
  output: z.string(),
  durationMs: z.number(),
  error: z.string().optional(),
});
export type CheckResultT = z.infer<typeof CheckResult>;

export const GateResult = z.object({
  proposalId: z.string(),
  passed: z.boolean(),
  checks: z.array(CheckResult),
  overallScore: z.number().min(0).max(1).optional(),
  rejectedReason: z.string().optional(),
});
export type GateResultT = z.infer<typeof GateResult>;

export async function runGate(
  proposal: UpgradeProposalT,
  repoPath: string,
): Promise<GateResultT> {
  const checks: CheckResultT[] = [];

  for (const file of proposal.files) {
    const filePath = path.join(repoPath, file.path);
    if (file.action === 'create' || file.action === 'modify') {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf8');
    } else if (file.action === 'delete') {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  const sandboxResult = await runSandboxVerify(repoPath);
  checks.push(sandboxResult);

  if (!sandboxResult.passed) {
    return GateResult.parse({
      proposalId: proposal.id,
      passed: false,
      checks,
      rejectedReason: `Sandbox verification failed: ${sandboxResult.error}`,
    });
  }

  const lintResult = await runLint(repoPath, proposal.files.map(f => path.join(repoPath, f.path)));
  checks.push(lintResult);

  const typecheckResult = await runTypecheck(repoPath);
  checks.push(typecheckResult);

  const testResult = await runTests(repoPath);
  checks.push(testResult);

  const allPassed = checks.every(c => c.passed);
  const overallScore = sandboxResult.passed && allPassed ? 1 : checks.filter(c => c.passed).length / checks.length;

  return GateResult.parse({
    proposalId: proposal.id,
    passed: allPassed,
    checks,
    overallScore,
    rejectedReason: allPassed ? undefined : `Failed: ${checks.find(c => !c.passed)?.name}`,
  });
}
```

Each sub-check (`runSandboxVerify`, `runLint`, `runTypecheck`, `runTests`) is a separate function that returns a `CheckResult`. They use `child_process.spawn` to run `tsx`, `oxlint`, `tsc --noEmit`, and the repo's test script respectively.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement preMergeGate.ts**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

---

## Task 7: Keywire + GitHub Client

**Files:**
- Create: `src/autopilot/keywireClient.ts`
- Create: `src/autopilot/gitHubClient.ts`
- Test: `tests/keywireClient.test.ts`, `tests/gitHubClient.test.ts`

### What they do

**keywireClient.ts** — fetches the GitHub token for a business at PR-create time:

```typescript
export interface KeywireConfig {
  url: string;
  service: string;
  key: string;
}

export const DEFAULT_KEYWIRE: KeywireConfig = {
  url: process.env.KEYWIRE_URL ?? 'http://localhost:3000',
  service: 'github',
  key: process.env.KEYWIRE_SERVICE_TOKEN ?? '',
};

export async function fetchGitHubToken(
  owner: string,
  config: KeywireConfig = DEFAULT_KEYWIRE,
): Promise<string> {
  const res = await fetch(`${config.url}/api/secrets/${owner}/github-token`, {
    headers: { Authorization: `Bearer ${config.key}` },
  });
  if (!res.ok) throw new Error(`Keywire token fetch failed: ${res.status} for ${owner}`);
  const data = await res.json() as { token: string };
  return data.token;
}
```

**gitHubClient.ts** — wraps GitHub REST API v3:

```typescript
export interface GitHubClient {
  createBranch(owner: string, repo: string, fromBranch: string, toBranch: string): Promise<string>;
  createCommit(owner: string, repo: string, branch: string, files: { path: string; content: string }[]): Promise<string>;
  createDraftPR(owner: string, repo: string, opts: CreatePROpts): Promise<number>;
  addLabel(owner: string, repo: string, prNumber: number, label: string): Promise<void>;
  checkVeto(owner: string, repo: string, prNumber: number): Promise<boolean>;
  mergePR(owner: string, repo: string, prNumber: number): Promise<void>;
  closePR(owner: string, repo: string, prNumber: number): Promise<void>;
  getComments(owner: string, repo: string, prNumber: number): Promise<PRComment[]>;
}
```

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement keywireClient.ts + gitHubClient.ts**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

---

## Task 8: Veto Scheduler + Auto-Merge

**Files:**
- Create: `src/autopilot/vetoScheduler.ts`
- Create: `src/autopilot/loopStateMachine.ts`
- Test: `tests/vetoScheduler.test.ts`, `tests/loopStateMachine.test.ts`

### What they do

**vetoScheduler.ts** — manages the 24h veto window:

```typescript
export const PRState = z.object({
  prNumber: z.number(),
  owner: z.string(),
  repo: z.string(),
  branch: string,
  proposalId: z.string(),
  openedAt: z.string().datetime(),
  vetoDeadline: z.string().datetime(),
  vetoReceived: z.boolean().default(false),
  merged: z.boolean().default(false),
  closed: z.boolean().default(false),
  mergeError: z.string().optional(),
});
export type PRStateT = z.infer<typeof PRState>;

// Persisted to data/business-profiles/<slug>/prs/pr-<number>.json
export function computeVetoDeadline(openedAt: string, vetoHours: number): string {
  const deadline = new Date(openedAt);
  deadline.setHours(deadline.getHours() + vetoHours);
  return deadline.toISOString();
}

export async function checkAndMerge(
  state: PRStateT,
  github: GitHubClient,
  vetoHours: number,
): Promise<PRStateT> {
  if (state.vetoReceived || state.merged || state.closed) return state;

  const now = new Date();
  const deadline = new Date(state.vetoDeadline);

  // Check for veto comments
  const comments = await github.getComments(state.owner, state.repo, state.prNumber);
  const vetoComment = comments.find(c => c.body.toLowerCase().includes('veto'));
  if (vetoComment) {
    await github.closePR(state.owner, state.repo, state.prNumber);
    return { ...state, vetoReceived: true, closed: true };
  }

  // Check deadline
  if (now >= deadline) {
    try {
      await github.mergePR(state.owner, state.repo, state.prNumber);
      return { ...state, merged: true };
    } catch (err) {
      return { ...state, mergeError: String(err) };
    }
  }

  return state; // still in veto window
}
```

**loopStateMachine.ts** — orchestrates the full loop as a state machine:

```typescript
export type LoopState =
  | { status: 'idle' }
  | { status: 'auditing' }
  | { status: 'analyzing' }
  | { status: 'generating'; progress: number }
  | { status: 'gating'; proposalId: string }
  | { status: 'pr_open'; prNumber: number }
  | { status: 'veto_wait'; prNumber: number; deadline: string }
  | { status: 'merged'; prNumber: number }
  | { status: 'vetoed'; prNumber: number }
  | { status: 'error'; reason: string };

export interface LoopContext {
  profile: BusinessProfileT;
  scorecard: BusinessScorecardT;
  queue: UpgradeQueueT;
  currentProposal: UpgradeProposalT | null;
  prState: PRStateT | null;
}

export async function runLoop(
  profile: BusinessProfileT,
  options: { dryRun?: boolean } = {},
): Promise<{ finalState: LoopState; context: LoopContext }> {
  if (isKillSwitchActive()) return { finalState: { status: 'error', reason: 'kill_switch' }, context: { profile, scorecard: null as any, queue: null as any, currentProposal: null, prState: null } };
  if (!isAutoMergeEnabled(profile)) return { finalState: { status: 'idle' }, context: { profile, scorecard: null as any, queue: null as any, currentProposal: null, prState: null } };

  const scorecard = await runAudit(...);           // AUDIT
  const queue = analyzeGaps(scorecard, profile);   // ANALYZE
  saveQueue(queue, profile);

  for (const gap of queue.gaps) {
    const proposal = await generateUpgrade(gap, profile);  // GENERATE
    const gateResult = await runGate(proposal, repoBinding(profile)!.localPath);  // GATE
    if (!gateResult.passed) continue;

    if (options.dryRun) return { finalState: { status: 'pr_open', prNumber: -1 }, context: { profile, scorecard, queue, currentProposal: proposal, prState: null } };

    const prNumber = await createUpgradePR(proposal, profile);  // PR
    const vetoDeadline = computeVetoDeadline(new Date().toISOString(), repoBinding(profile)!.autoMergeVetoHours);
    const prState = PRState.parse({ prNumber, ...proposal, openedAt: new Date().toISOString(), vetoDeadline });

    return { finalState: { status: 'veto_wait', prNumber, deadline: vetoDeadline }, context: { profile, scorecard, queue, currentProposal: proposal, prState } };
  }

  return { finalState: { status: 'idle' }, context: { profile, scorecard, queue, currentProposal: null, prState: null } };
}
```

- [ ] **Step 1: Write failing tests for veto scheduler**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement vetoScheduler.ts**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Implement loopStateMachine.ts**
- [ ] **Step 6: Run loopStateMachine tests — verify they pass**
- [ ] **Step 7: Commit**

---

## Task 9: Post-Merge Re-Audit + Gene Fitness

**Files:**
- Create: `src/autopilot/fitnessLoop.ts`
- Test: `tests/fitnessLoop.test.ts`

### What it does

After a merge (or a timeout), triggers a re-audit and updates gene fitness in `recourse_learner.json`.

```typescript
export async function updateGeneFitness(
  proposalId: string,
  preAuditScorecard: BusinessScorecardT,
  postAuditScorecard: BusinessScorecardT,
): Promise<FitnessDelta> {
  const preScore = preAuditScorecard.overallScore;
  const postScore = postAuditScorecard.overallScore;
  const delta = postScore - preScore;

  // Security dimension delta
  const securityDelta = postAuditScorecard.securityPosture - preAuditScorecard.securityPosture;
  // Code quality delta
  const codeDelta = postAuditScorecard.codeQuality - preAuditScorecard.codeQuality;
  // Docs delta
  const docsDelta = postAuditScorecard.documentationCompleteness - preAuditScorecard.documentationCompleteness;

  const fitnessDelta: FitnessDelta = {
    proposalId,
    timestamp: new Date().toISOString(),
    overallDelta: delta,
    dimensionDeltas: { security: securityDelta, codeQuality: codeDelta, docs: docsDelta },
    verdict: delta > 0 ? 'improved' : delta < 0 ? 'regressed' : 'neutral',
  };

  // Load existing learner ledger and append
  const ledger = loadLearnerLedger();
  ledger.geneFitnessUpdates = ledger.geneFitnessUpdates ?? [];
  ledger.geneFitnessUpdates.push(fitnessDelta);
  saveLearnerLedger(ledger);

  // If regressed, quarantine the gene
  if (fitnessDelta.verdict === 'regressed') {
    await quarantineGene(proposalId);
  }

  return fitnessDelta;
}
```

`FitnessDelta` shape:

```typescript
export const FitnessDelta = z.object({
  proposalId: z.string(),
  timestamp: z.string().datetime(),
  overallDelta: z.number(),
  dimensionDeltas: z.object({
    security: z.number(),
    codeQuality: z.number(),
    docs: z.number(),
  }),
  verdict: z.enum(['improved', 'regressed', 'neutral']),
});
export type FitnessDeltaT = z.infer<typeof FitnessDelta>;
```

**Gene quarantine**: reads the existing `recourse_learner.json` ledger, finds genes that produced the proposal, and sets their `weight` to 0 or moves them to a quarantine list. The format is compatible with the existing ledger schema.

- [ ] **Step 1: Write failing tests for fitness loop**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement fitnessLoop.ts**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

---

## Task 10: Cron + Manual Triggers + Operational Docs

**Files:**
- Create: `scripts/autopilot-cron.ts`
- Modify: `package.json` (add scripts)
- Create: `docs/autopilot-operating-procedure.md`

### What it does

**scripts/autopilot-cron.ts** — entry point for `pm2` or `cron`:

```typescript
import { listBusinessSlugs, loadBusinessProfile, isAutoMergeEnabled } from '../src/autopilot/businessProfile';

export async function runScheduledAudit() {
  const slugs = listBusinessSlugs();
  for (const slug of slugs) {
    const profile = loadBusinessProfile(slug);
    if (!isAutoMergeEnabled(profile)) {
      console.log(`[autopilot] ${slug}: auto-merge disabled, skipping`);
      continue;
    }
    if (isKillSwitchActive()) {
      console.log('[autopilot] KILL_SWITCH active, aborting all audits');
      break;
    }
    console.log(`[autopilot] Running audit for ${slug}...`);
    const { finalState } = await runLoop(profile);
    console.log(`[autopilot] ${slug}: ${finalState.status}`);
  }
}
```

**package.json scripts**:

```json
{
  "scripts": {
    "audit": "tsx scripts/autopilot-cron.ts --business",
    "audit:all": "tsx scripts/autopilot-cron.ts",
    "audit:dry-run": "tsx scripts/autopilot-cron.ts --dry-run"
  }
}
```

**docs/autopilot-operating-procedure.md** — operator-facing runbook covering:
- How to add a new business
- How to configure Keywire tokens per repo
- How to trigger an audit manually
- How to veto a PR
- How to read the scorecard
- Kill switch locations (global, per-business, per-gene)
- What to do when the loop produces bad upgrades

- [ ] **Step 1: Write scripts/autopilot-cron.ts**
- [ ] **Step 2: Add npm scripts to package.json**
- [ ] **Step 3: Write docs/autopilot-operating-procedure.md**
- [ ] **Step 4: Commit**

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Gap scoring with multi-signal weights | Task 4 |
| Priority queue with profile + audit signals | Task 4 |
| Tier A code generation via Recourse sandbox | Task 5 |
| Tier B copy/doc generation with REVIEW_REQUIRED.md | Task 5 |
| Tier C strategy memo with DISCLAIMER.md + NO_AUTO_DEPLOY.md | Task 5 |
| Sandbox verification in pre-merge gate | Task 6 |
| Lint + typecheck + test suite in gate | Task 6 |
| No regression on protected paths | Task 6 |
| Keywire token fetch at PR-create time | Task 7 |
| GitHub PR creation (draft, label, branch) | Task 7 |
| 24h veto window | Task 8 |
| Auto-merge on deadline | Task 8 |
| Veto via PR comment | Task 8 |
| State machine: AUDIT → ANALYZE → GENERATE → GATE → PR → VETO_WAIT → MERGE\|VETO | Task 8 |
| Post-merge re-audit | Task 9 |
| Gene fitness update in recourse_learner.json | Task 9 |
| Gene quarantine on regression | Task 9 |
| Cron trigger + manual audit command | Task 10 |
| Operating procedure docs | Task 10 |
| First-PR gate (operator sign-off before 24h clock) | Task 8 (enforced in loopStateMachine: first PR for each business returns dryRun state) |
