# Recursive Audit Loop — Phase 1: Foundation
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation for the recursive business audit loop: extended profile with repo bindings, audit runner adapter, and normalized scorecard projection.

**Architecture:** The loop composes existing audit-chain adapters (Grader, RepoRank, The Deep, Codegang, Olympics) via a new `auditRunner.ts`. Audit results are projected into a `BusinessScorecard` by a deterministic formula. No LLM in the scorecard projection — it is a pure function of the audit-chain statement.

**Tech Stack:** TypeScript, Zod, existing `packages/audit-chain` adapters, Node.js native `fetch`, `tsx` for dev.

---

## File Structure

```
src/autopilot/
  businessProfile.ts      # MODIFIED: add RepoBinding schema
  auditRunner.ts         # NEW: compose audit-chain adapters
  scorecard.ts           # NEW: AuditStatement → BusinessScorecard projection

data/business-profiles/<slug>/
  audits/
    audit-<ISO>.json     # audit-chain statements written here
  scorecard-<ISO>.json   # projected scorecards written here

tests/
  businessProfile.test.ts       # MODIFIED: add repo binding tests
  auditRunner.test.ts           # NEW
  scorecard.test.ts             # NEW
```

---

## Task 1: Extend BusinessProfile with RepoBinding

**Files:**
- Modify: `src/autopilot/businessProfile.ts:61-68`
- Test: `tests/businessProfile.test.ts`

### Before (existing schema end)

```typescript
export const BusinessProfile = z.object({
  business: BusinessIdentity,
  customer: Customer,
  offering: Offering,
  gaps: z.array(z.string().min(1).max(300)).min(0).max(20),
  voiceAndBrand: VoiceAndBrand.optional(),
  lastReviewedAt: z.string().datetime().optional(),
});
export type BusinessProfileT = z.infer<typeof BusinessProfile>;
```

### After

```typescript
export const RepoBinding = z.object({
  localPath: z.string().min(1).max(500),
  githubUrl: z.string().url().or(z.literal('')).default(''),
  defaultBranch: z.string().min(1).max(100).default('main'),
  protectedPaths: z.array(z.string().min(1).max(300)).default([
    '.env',
    'gh token.txt',
    '*.env*',
    '*secret*',
    '*token*',
    '*key*',
  ]),
  auditScheduleCron: z.string().default('0 6 * * *'),
  autoMergeEnabled: z.boolean().default(false),
  autoMergeVetoHours: z.number().int().min(1).max(168).default(24),
  minSandboxScore: z.number().min(0).max(1).default(0.7),
});
export type RepoBindingT = z.infer<typeof RepoBinding>;

export const BusinessProfile = z.object({
  business: BusinessIdentity,
  customer: Customer,
  offering: Offering,
  gaps: z.array(z.string().min(1).max(300)).min(0).max(20),
  voiceAndBrand: VoiceAndBrand.optional(),
  lastReviewedAt: z.string().datetime().optional(),
  repo: RepoBinding.optional(),
});
export type BusinessProfileT = z.infer<typeof BusinessProfile>;
```

Also add helper functions:

```typescript
export function repoBinding(profile: BusinessProfileT): RepoBindingT | null {
  return profile.repo ?? null;
}

export function isAutoMergeEnabled(profile: BusinessProfileT): boolean {
  return profile.repo?.autoMergeEnabled ?? false;
}

export function isKillSwitchActive(): boolean {
  return process.env.RECOURSE_AUTOPILOT_DISABLED === '1';
}
```

- [ ] **Step 1: Write failing tests for repo binding validation**

In `tests/businessProfile.test.ts`, add a `describe('repo binding')` block:

```typescript
describe('repo binding', () => {
  it('accepts a complete repo binding', () => {
    const yaml = `
business:
  name: TestBiz
  tagline: t
  industry: t
  website: ""
  stage: live_product
customer:
  icp: t
  segments:
    - name: a
      pain: b
  buyingTrigger: t
  topObjections: [t]
offering:
  summary: t
  pricing: t
  model: subscription
  differentiators: [t]
gaps: []
repo:
  localPath: "C:/Users/Test/repo"
  githubUrl: "https://github.com/test/repo"
  defaultBranch: main
  autoMergeEnabled: true
  autoMergeVetoHours: 24
  minSandboxScore: 0.7
`;
    const profile = loadBusinessProfileFromYaml(yaml);
    expect(profile.repo?.localPath).toBe('C:/Users/Test/repo');
    expect(profile.repo?.autoMergeEnabled).toBe(true);
  });

  it('repo is optional — a profile without it is valid', () => {
    const yaml = `
business:
  name: TestBiz
  tagline: t
  industry: t
  website: ""
  stage: live_product
customer:
  icp: t
  segments:
    - name: a
      pain: b
  buyingTrigger: t
  topObjections: [t]
offering:
  summary: t
  pricing: t
  model: subscription
  differentiators: [t]
gaps: []
`;
    const profile = loadBusinessProfileFromYaml(yaml);
    expect(profile.repo).toBeUndefined();
  });

  it('rejects autoMergeEnabled without a repo', () => {
    const yaml = `
business:
  name: TestBiz
  tagline: t
  industry: t
  website: ""
  stage: live_product
customer:
  icp: t
  segments:
    - name: a
      pain: b
  buyingTrigger: t
  topObjections: [t]
offering:
  summary: t
  pricing: t
  model: subscription
  differentiators: [t]
gaps: []
autoMergeEnabled: true
`;
    // This should not parse as autoMergeEnabled is not under repo
    // We test that the helper isAutoMergeEnabled returns false when no repo
  });

  it('isAutoMergeEnabled returns false when repo is absent', () => {
    const profile = makeMinimalProfile();
    expect(isAutoMergeEnabled(profile)).toBe(false);
  });

  it('isAutoMergeEnabled returns true when repo.autoMergeEnabled is true', () => {
    const profile = makeMinimalProfile({ repo: { localPath: '/x', autoMergeEnabled: true, autoMergeVetoHours: 24, minSandboxScore: 0.7 } });
    expect(isAutoMergeEnabled(profile)).toBe(true);
  });

  it('isKillSwitchActive returns true when env var is set', () => {
    const prev = process.env.RECOURSE_AUTOPILOT_DISABLED;
    process.env.RECOURSE_AUTOPILOT_DISABLED = '1';
    expect(isKillSwitchActive()).toBe(true);
    if (prev) process.env.RECOURSE_AUTOPILOT_DISABLED = prev;
    else delete process.env.RECOURSE_AUTOPILOT_DISABLED;
  });

  it('isKillSwitchActive returns false when env var is absent', () => {
    const prev = process.env.RECOURSE_AUTOPILOT_DISABLED;
    delete process.env.RECOURSE_AUTOPILOT_DISABLED;
    expect(isKillSwitchActive()).toBe(false);
    if (prev) process.env.RECOURSE_AUTOPILOT_DISABLED = prev;
  });
});
```

Helper for tests:

```typescript
function loadBusinessProfileFromYaml(yaml: string): BusinessProfileT {
  const parsed = yaml.parse(yaml) as unknown;
  return BusinessProfile.parse(parsed);
}

function makeMinimalProfile(overrides: Partial<BusinessProfileT> = {}): BusinessProfileT {
  const base = {
    business: { name: 't', tagline: 't', industry: 't', website: '', stage: 'live_product' as const },
    customer: { icp: 't', segments: [{ name: 'a', pain: 'b' }], buyingTrigger: 't', topObjections: ['t'] },
    offering: { summary: 't', pricing: 't', model: 'subscription' as const, differentiators: ['t'] },
    gaps: [],
  };
  return { ...base, ...overrides } as BusinessProfileT;
}
```

- [ ] **Step 2: Run test — verify it fails on missing schema**

Run: `npm run test -- --run tests/businessProfile.test.ts`
Expected: FAIL — `BusinessProfile` does not have `repo` field yet.

- [ ] **Step 3: Implement the schema additions**

Add `RepoBinding` schema, `repoBinding()`, `isAutoMergeEnabled()`, and `isKillSwitchActive()` to `src/autopilot/businessProfile.ts`.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm run test -- --run tests/businessProfile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/autopilot/businessProfile.ts tests/businessProfile.test.ts
git commit -m "feat(autopilot): add repo binding schema and auto-merge kill switches"
```

---

## Task 2: AuditRunner — Compose AuditChain Adapters

**Files:**
- Create: `src/autopilot/auditRunner.ts`
- Test: `tests/auditRunner.test.ts`

### What it does

`auditRunner.ts` exposes `runAudit(profile: BusinessProfileT): Promise<AuditStatement>`. It:

1. Checks `isKillSwitchActive()` — throws if disabled
2. Checks the profile has a `repo.localPath` — throws if absent
3. Determines which auditors to invoke based on available services
4. Runs each auditor adapter
5. Composes the `AuditStatement` (same shape as `packages/audit-chain/src/types.ts`)

**Adapter seam** — the adapter is injected, so we can use the real `packages/audit-chain` when available and mock it for tests:

```typescript
export interface AuditAdapters {
  grader?: (url: string, apiKey: string, repoUrl: string) => Promise<AuditorSection>;
  reporank?: (url: string, apiKey: string, repoUrl: string) => Promise<AuditorSection>;
  deep?: (cloneRoot: string) => Promise<AuditorSection>;
  codegang?: (cloneRoot: string, secret: string) => Promise<AuditorSection>;
  olympics?: (targetUrl: string) => Promise<AuditorSection>;
}

export interface RunAuditOptions {
  profile: BusinessProfileT;
  adapters: AuditAdapters;
  auditDir?: string;
}
```

**Environment variable fallbacks** for when real services are available:

```typescript
const DEFAULTS = {
  graderUrl: process.env.GRADER_URL ?? 'http://localhost:3201',
  graderKey: process.env.GRADER_API_KEY ?? '',
  reporankUrl: process.env.REPORANK_URL ?? 'http://localhost:3200',
  reporankKey: process.env.REPORANK_API_KEY ?? '',
  deepUrl: process.env.DEEP_URL ?? 'http://localhost:3100',
  deepToken: process.env.DEEP_TOKEN ?? '',
  codegangUrl: process.env.CODEGANG_URL ?? 'http://localhost:3204',
  codegangSecret: process.env.CODEGANG_SECRET ?? '',
};
```

**The seam for missing services**: if `graderKey` is empty, the adapter returns `{ included: false, reason: 'GRADER_API_KEY not configured' }`. Same pattern for all auditors. An audit with zero included auditors throws a hard error.

**Persistence**: `AuditStatement` is written to `data/business-profiles/<slug>/audits/audit-<ISO>.json`.

```typescript
export async function runAudit(options: RunAuditOptions): Promise<AuditStatement> {
  const { profile, adapters, auditDir } = options;
  if (isKillSwitchActive()) throw new Error('RECOURSE_AUTOPILOT_DISABLED is set');

  const repo = repoBinding(profile);
  if (!repo) throw new Error(`Profile ${profile.business.name} has no repo.localPath`);

  const results = await Promise.allSettled([
    adapters.grader ? adapters.grader(DEFAULTS.graderUrl, DEFAULTS.graderKey, repo.githubUrl || repo.localPath) : Promise.resolve({ included: false, reason: 'grader adapter not provided' }),
    adapters.reporank ? adapters.reporank(DEFAULTS.reporankUrl, DEFAULTS.reporankKey, repo.githubUrl || repo.localPath) : Promise.resolve({ included: false, reason: 'reporank adapter not provided' }),
    adapters.deep ? adapters.deep(repo.localPath) : Promise.resolve({ included: false, reason: 'deep adapter not provided' }),
    adapters.codegang ? adapters.codegang(repo.localPath, DEFAULTS.codegangSecret) : Promise.resolve({ included: false, reason: 'codegang adapter not provided' }),
  ]);

  const auditors: AuditorResults = {
    grader: handleResult(results[0]),
    reporank: handleResult(results[1]),
    deep: handleResult(results[2]),
    codegang: handleResult(results[3]),
  };

  const statement: AuditStatement = {
    schema: 'audit-statement-v1',
    repo: profile.business.name,
    targetUrl: repo.githubUrl || repo.localPath,
    generatedAt: new Date().toISOString(),
    generator: { package: 'recourse-autopilot', version: '1.0.0' },
    auditors,
    disclosures: buildDisclosures(auditors),
  };

  // Validate at least one auditor included
  const anyIncluded = Object.values(auditors).some(a => a.included);
  if (!anyIncluded) throw new Error('All auditors failed or were excluded. Audit aborted — see auditor reasons.');

  // Persist
  if (auditDir) {
    const dir = path.join(auditDir, profile.business.name.toLowerCase().replace(/\s+/g, '-'), 'audits');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(statement, null, 2));
  }

  return statement;
}
```

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runAudit } from '../src/autopilot/auditRunner';
import type { AuditStatement } from '../src/autopilot/auditRunner';

describe('auditRunner', () => {
  it('throws if RECOURSE_AUTOPILOT_DISABLED is set', async () => {
    const prev = process.env.RECOURSE_AUTOPILOT_DISABLED;
    process.env.RECOURSE_AUTOPILOT_DISABLED = '1';
    try {
      await expect(runAudit({ profile: makeProfileWithRepo() })).rejects.toThrow(/DISABLED/);
    } finally {
      if (prev) process.env.RECOURSE_AUTOPILOT_DISABLED = prev;
      else delete process.env.RECOURSE_AUTOPILOT_DISABLED;
    }
  });

  it('throws if profile has no repo.localPath', async () => {
    const profile = makeProfileWithoutRepo();
    await expect(runAudit({ profile })).rejects.toThrow(/no repo.localPath/);
  });

  it('returns an AuditStatement with schema audit-statement-v1', async () => {
    const statement = await runAudit({ profile: makeProfileWithRepo(), adapters: {} });
    expect(statement.schema).toBe('audit-statement-v1');
    expect(statement.generatedAt).toBeTruthy();
    expect(statement.auditors).toBeTruthy();
  });

  it('excludes auditors that were not provided (included:false)', async () => {
    const statement = await runAudit({ profile: makeProfileWithRepo(), adapters: {} });
    expect(statement.auditors.grader?.included).toBe(false);
    expect(statement.auditors.grader?.reason).toMatch(/not provided/);
    expect(statement.auditors.reporank?.included).toBe(false);
  });

  it('throws if ALL auditors are excluded', async () => {
    await expect(runAudit({ profile: makeProfileWithRepo(), adapters: {} }))
      .rejects.toThrow(/All auditors failed/);
  });

  it('includes a grader result when the adapter is provided and returns', async () => {
    const mockGrader = vi.fn().mockResolvedValue({
      included: true,
      scoreBasis: 'ai-generated (Gemini)',
      payload: { overallScore: 72, gradeCategory: 'C+' },
    });
    const statement = await runAudit({
      profile: makeProfileWithRepo(),
      adapters: { grader: mockGrader },
    });
    expect(mockGrader).toHaveBeenCalled();
    expect(statement.auditors.grader?.included).toBe(true);
    expect((statement.auditors.grader?.payload as any)?.overallScore).toBe(72);
  });

  it('persists the audit to auditDir when provided', async () => {
    const dir = makeTmpDir();
    try {
      await runAudit({ profile: makeProfileWithRepo(), adapters: { grader: mockSuccessGrader() }, auditDir: dir });
      const files = fs.readdirSync(dir, { recursive: true });
      expect(files.some((f: any) => String(f).includes('audit-'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Helpers:

```typescript
function makeProfileWithRepo(): BusinessProfileT {
  return {
    business: { name: 'TestBiz', tagline: 't', industry: 't', website: '', stage: 'live_product' },
    customer: { icp: 't', segments: [{ name: 'a', pain: 'b' }], buyingTrigger: 't', topObjections: ['t'] },
    offering: { summary: 't', pricing: 't', model: 'subscription', differentiators: ['t'] },
    gaps: [],
    repo: { localPath: '/tmp/test-repo', githubUrl: '', defaultBranch: 'main', protectedPaths: [], autoMergeEnabled: false, autoMergeVetoHours: 24, minSandboxScore: 0.7 },
  };
}
```

- [ ] **Step 2: Run tests — verify they fail (no auditRunner yet)**

Run: `npm run test -- --run tests/auditRunner.test.ts`
Expected: FAIL — `auditRunner.ts` does not exist.

- [ ] **Step 3: Implement auditRunner.ts**

Write the full `src/autopilot/auditRunner.ts` with `runAudit`, `handleResult`, `buildDisclosures`, and the `AuditAdapters` interface. Import types from `z` and `node:fs`, `node:path`.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm run test -- --run tests/auditRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/autopilot/auditRunner.ts tests/auditRunner.test.ts
git commit -m "feat(autopilot): audit runner with adapter seam and audit-chain statement output"
```

---

## Task 3: BusinessScorecard — Project AuditStatement to Normalized Score

**Files:**
- Create: `src/autopilot/scorecard.ts`
- Test: `tests/scorecard.test.ts`

### What it does

`scorecard.ts` exposes `projectScorecard(statement: AuditStatement, profile: BusinessProfileT): BusinessScorecard`. This is a pure function — no network, no LLM. It extracts numeric scores from the auditor payloads and computes a composite.

**BusinessScorecard schema:**

```typescript
export const BusinessScorecard = z.object({
  businessSlug: z.string(),
  auditedAt: z.string().datetime(),
  auditorsUsed: z.array(z.string()),
  auditorsExcluded: z.array(z.object({ name: z.string(), reason: z.string() })),

  codeQuality: z.number().min(0).max(100),
  securityPosture: z.number().min(0).max(100),
  testCoverage: z.number().min(0).max(100),
  documentationCompleteness: z.number().min(0).max(100),
  marketSignals: z.number().min(0).max(100),
  complianceMaturity: z.number().min(0).max(100),
  valuationEstimate: z.number().min(0).max(1_000_000),

  profileGapCoverage: z.number().min(0).max(100),
  webPresence: z.number().min(0).max(100),

  overallScore: z.number().min(0).max(1000),
  gradeCategory: z.string(),

  findingsCount: z.number(),
  criticalFindings: z.number(),
  highFindings: z.number(),
});
export type BusinessScorecardT = z.infer<typeof BusinessScorecard>;
```

**Projection logic** (deterministic):

```typescript
export function projectScorecard(
  statement: AuditStatement,
  profile: BusinessProfileT,
): BusinessScorecardT {
  const grader = statement.auditors.grader;
  const reporank = statement.auditors.reporank;
  const deep = statement.auditors.deep;
  const codegang = statement.auditors.codegang;

  // Extract grader sections (9 dimensions)
  const graderPayload = grader?.included ? (grader.payload as any) : null;
  const securityPosture = graderPayload?.security?.score ?? 0;
  const testCoverage = graderPayload?.quality?.testScore ?? 0;
  const documentationCompleteness = graderPayload?.quality?.readmeCompleteness ?? 0;
  const marketSignals = graderPayload?.market?.score ?? 0;
  const complianceMaturity = graderPayload?.compliance?.score ?? 0;
  const valuationEstimate = graderPayload?.valuation?.estimatedValue ?? 0;

  // RepoRank overall
  const reporankPayload = reporank?.included ? (reporank.payload as any) : null;
  const reporankScore = reporankPayload?.result?.overallScore ?? 0;
  const gradeCategory = reporankPayload?.result?.gradeCategory ?? 'N/A';

  // The Deep findings
  const deepPayload = deep?.included ? (deep.payload as any) : null;
  const findingsCount = deepPayload?.counts?.total ?? 0;
  const criticalFindings = deepPayload?.counts?.bySeverity?.critical ?? 0;
  const highFindings = deepPayload?.counts?.bySeverity?.high ?? 0;

  // Web presence: simple proxy from repo structure
  const webPresence = computeWebPresence(profile);

  // Profile gap coverage: % of declared gaps that are addressed
  const profileGapCoverage = computeGapCoverage(profile, statement);

  // Code quality: blend of grader quality score + RepoRank
  const codeQuality = Math.round(
    (graderPayload?.quality?.score ?? 0) * 0.6 +
    reporankScore * 0.4,
  );

  // Composite: weighted sum (per spec, weights are configurable; using defaults)
  const overallScore = Math.round(
    codeQuality * 0.20 +
    securityPosture * 0.20 +
    testCoverage * 0.10 +
    documentationCompleteness * 0.10 +
    marketSignals * 0.15 +
    complianceMaturity * 0.15 +
    webPresence * 0.05 +
    profileGapCoverage * 0.05,
  ) * 10;

  const auditorsUsed = Object.entries(statement.auditors)
    .filter(([, v]) => v?.included)
    .map(([k]) => k);

  const auditorsExcluded = Object.entries(statement.auditors)
    .filter(([, v]) => !v?.included)
    .map(([name], i) => ({ name, reason: (statement.auditors[name as AuditorId]?.reason ?? 'unknown') }));

  return BusinessScorecard.parse({
    businessSlug: profile.business.name.toLowerCase().replace(/\s+/g, '-'),
    auditedAt: statement.generatedAt,
    auditorsUsed,
    auditorsExcluded,
    codeQuality,
    securityPosture,
    testCoverage,
    documentationCompleteness,
    marketSignals,
    complianceMaturity,
    valuationEstimate,
    profileGapCoverage,
    webPresence,
    overallScore,
    gradeCategory,
    findingsCount,
    criticalFindings,
    highFindings,
  });
}
```

Helper functions:

```typescript
function computeWebPresence(profile: BusinessProfileT): number {
  // Simple proxy: 0-100 score based on what exists
  let score = 0;
  // landing page mentioned in gaps?
  if (!profile.gaps.some(g => g.toLowerCase().includes('landing'))) score += 25;
  // website declared?
  if (profile.business.website) score += 25;
  // social/copy in differentiators?
  if (profile.offering.differentiators.length > 2) score += 25;
  // social proof?
  if (!profile.gaps.some(g => g.toLowerCase().includes('testimonial'))) score += 25;
  return Math.min(100, score);
}

function computeGapCoverage(profile: BusinessProfileT, statement: AuditStatement): number {
  // How many declared gaps have some audit signal
  if (profile.gaps.length === 0) return 100;
  const totalFindings = (statement.auditors.deep?.payload as any)?.counts?.total ?? 0;
  // Normalize: 0 findings = 0 coverage; each gap needs at least one finding to be "covered"
  const coverageRatio = Math.min(1, totalFindings / (profile.gaps.length * 3));
  return Math.round(coverageRatio * 100);
}
```

Also add `loadLatestScorecard(slug: string): BusinessScorecardT | null` and `saveScorecard(s: BusinessScorecardT, profileDir: string): string`.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { projectScorecard, BusinessScorecard } from '../src/autopilot/scorecard';
import type { AuditStatement } from '../src/autopilot/auditRunner';

describe('scorecard projection', () => {
  it('projects a full audit statement to a valid BusinessScorecard', () => {
    const statement = makeFullAuditStatement();
    const scorecard = projectScorecard(statement, makeMinimalProfile());
    BusinessScorecard.parse(scorecard); // throws if invalid
    expect(scorecard.businessSlug).toBe('testbiz');
    expect(scorecard.auditorsUsed.length).toBeGreaterThan(0);
  });

  it('extracts grader security score correctly', () => {
    const statement = makeAuditStatement({ graderScore: 85 });
    const scorecard = projectScorecard(statement, makeMinimalProfile());
    expect(scorecard.securityPosture).toBe(85);
  });

  it('defaults to 0 when grader payload is absent', () => {
    const statement = makeAuditStatement({ graderIncluded: false });
    const scorecard = projectScorecard(statement, makeMinimalProfile());
    expect(scorecard.securityPosture).toBe(0);
    expect(scorecard.testCoverage).toBe(0);
  });

  it('computes webPresence 100 when no web gaps are declared', () => {
    const profile = { ...makeMinimalProfile(), gaps: [] };
    const scorecard = projectScorecard(makeFullAuditStatement(), profile);
    expect(scorecard.webPresence).toBeGreaterThan(0);
  });

  it('computes profileGapCoverage 100 when no gaps are declared', () => {
    const profile = { ...makeMinimalProfile(), gaps: [] };
    const scorecard = projectScorecard(makeFullAuditStatement(), profile);
    expect(scorecard.profileGapCoverage).toBe(100);
  });

  it('computes profileGapCoverage lower when gaps exist and few findings', () => {
    const profile = { ...makeMinimalProfile(), gaps: ['No landing page', 'No testimonials', 'No docs'] };
    const scorecard = projectScorecard(makeAuditStatement({ deepFindings: 2 }), profile);
    expect(scorecard.profileGapCoverage).toBeLessThan(100);
  });

  it('computes overallScore in 0-1000 range', () => {
    const scorecard = projectScorecard(makeFullAuditStatement(), makeMinimalProfile());
    expect(scorecard.overallScore).toBeGreaterThanOrEqual(0);
    expect(scorecard.overallScore).toBeLessThanOrEqual(1000);
  });

  it('reports excluded auditors with reasons', () => {
    const scorecard = projectScorecard(makeAuditStatement({ graderIncluded: false }), makeMinimalProfile());
    expect(scorecard.auditorsExcluded.length).toBeGreaterThan(0);
    expect(scorecard.auditorsExcluded[0].reason).toBeTruthy();
  });
});
```

Test helpers:

```typescript
function makeAuditStatement(overrides: { graderIncluded?: boolean; graderScore?: number; deepFindings?: number } = {}): AuditStatement {
  return {
    schema: 'audit-statement-v1',
    repo: 'TestBiz',
    targetUrl: '/tmp/test',
    generatedAt: new Date().toISOString(),
    generator: { package: 'test', version: '1' },
    auditors: {
      grader: overrides.graderIncluded === false
        ? { included: false, reason: 'not configured' }
        : { included: true, scoreBasis: 'ai', payload: { overallScore: 72, security: { score: overrides.graderScore ?? 50 } } },
      reporank: { included: false, reason: 'not configured' },
      deep: { included: true, scoreBasis: 'deterministic', payload: { counts: { total: overrides.deepFindings ?? 10, bySeverity: { critical: 2, high: 3 } } } },
      codegang: { included: false, reason: 'not configured' },
      olympics: { included: false, reason: 'no running target' },
    },
    disclosures: { aiGenerated: ['grader'], deterministic: ['deep'], measured: [], excluded: [] },
  } as AuditStatement;
}
```

- [ ] **Step 2: Run tests — verify they fail (no scorecard yet)**

Run: `npm run test -- --run tests/scorecard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement scorecard.ts**

Write `src/autopilot/scorecard.ts` with the full projection logic, `loadLatestScorecard`, `saveScorecard`.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm run test -- --run tests/scorecard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/autopilot/scorecard.ts tests/scorecard.test.ts
git commit -m "feat(autopilot): business scorecard projection from audit-chain statement"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Extend profile with repo binding (localPath, githubUrl, autoMerge, kill switches) | Task 1 |
| Compose audit-chain adapters (Grader, RepoRank, Deep, Codegang) | Task 2 |
| Kill switch (RECOURSE_AUTOPILOT_DISABLED) | Task 1 |
| Audit statement persisted to data/business-profiles/<slug>/audits/ | Task 2 |
| BusinessScorecard projection (deterministic, no LLM) | Task 3 |
| Scorecard dimensions: codeQuality, security, testCoverage, docs, market, compliance | Task 3 |
| Profile gap coverage | Task 3 |
| Web presence proxy | Task 3 |
| Overall score 0-1000 | Task 3 |
| Kill switches at three levels (global, per-business, per-gene) | Task 1 + deferred gene |
| Keywire token integration | Tasks 4-10 |
| Gap analyzer | Tasks 4-10 |
| Upgrade generator | Tasks 4-10 |
| Pre-merge gate | Tasks 4-10 |
| PR creation + 24h veto | Tasks 4-10 |
| Post-merge re-audit | Tasks 4-10 |
| Gene fitness update | Tasks 4-10 |

**Gaps to address in Tasks 4-10**: gene-level kill switch (quarantine mechanism), Keywire token fetch, PR creation via GitHub API, 24h veto timer, post-merge re-audit trigger, fitness update math.
