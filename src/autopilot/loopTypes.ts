/**
 * loopTypes.ts — canonical shared types for the recursive business audit loop.
 *
 * Every module in the autopilot loop imports its cross-module contracts from
 * here so that modules can be implemented (and type-checked) independently:
 *
 *   businessProfile.ts  — human-authored profile + repo binding (separate file)
 *   auditRunner.ts      — produces AuditStatement
 *   scorecard.ts        — projects AuditStatement -> BusinessScorecard
 *   gapAnalyzer.ts      — scorecard + profile -> UpgradeQueue
 *   upgradeGenerator.ts — gap -> UpgradeProposal (tier A/B/C)
 *   preMergeGate.ts     — proposal -> GateResult (sandbox/lint/typecheck/test)
 *   keywireClient.ts    — Keywire -> GitHub token
 *   gitHubClient.ts     — GitHub REST wrapper (PR create/merge/veto)
 *   vetoScheduler.ts    — PRState lifecycle (24h veto window)
 *   fitnessLoop.ts      — pre/post scorecards -> FitnessDelta (learner ledger)
 *   loopStateMachine.ts — orchestrates the full loop
 *
 * Provenance honesty (mirrors @overlay365/audit-chain):
 *   - every auditor section states where its numbers came from
 *   - excluded auditors appear with included:false + an honest reason
 *   - the score is a projection over real auditor payloads; no LLM here
 */

import { z } from 'zod';

// ============================================================================
// Auditor statement types (compatible with audit-chain `audit-statement-v1`)
// ============================================================================

export const STATEMENT_SCHEMA = 'audit-statement-v1' as const;

export const AuditorId = z.enum(['grader', 'reporank', 'codegang', 'deep', 'olympics']);
export type AuditorIdT = z.infer<typeof AuditorId>;

export const AUDITOR_IDS: readonly AuditorIdT[] = ['grader', 'reporank', 'codegang', 'deep', 'olympics'] as const;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const AuditorSection = z.object({
  included: z.boolean(),
  reason: z.string().optional(),
  scoreBasis: z.string().optional(),
  payload: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type AuditorSectionT = z.infer<typeof AuditorSection>;

export type AuditorResults = Partial<Record<AuditorIdT, AuditorSectionT>>;

export const AuditStatement = z.object({
  schema: z.literal(STATEMENT_SCHEMA),
  repo: z.string(),
  targetUrl: z.string(),
  generatedAt: z.string().datetime(),
  generator: z.object({ package: z.string(), version: z.string() }),
  auditors: z.record(z.string(), AuditorSection),
  disclosures: z.object({
    aiGenerated: z.array(z.string()),
    deterministic: z.array(z.string()),
    measured: z.array(z.string()),
    excluded: z.array(z.object({ auditor: z.string(), reason: z.string() })),
  }),
});
export type AuditStatementT = z.infer<typeof AuditStatement>;

// ============================================================================
// Business scorecard — the deterministic projection Recourse reasons over
// ============================================================================

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
  valuationEstimate: z.number().min(0).max(1_000_000_000),

  profileGapCoverage: z.number().min(0).max(100),
  webPresence: z.number().min(0).max(100),

  overallScore: z.number().min(0).max(1000),
  gradeCategory: z.string(),

  findingsCount: z.number().int().min(0),
  criticalFindings: z.number().int().min(0),
  highFindings: z.number().int().min(0),
});
export type BusinessScorecardT = z.infer<typeof BusinessScorecard>;

// ============================================================================
// Gaps & upgrade queue
// ============================================================================

export const GapWeight = z.object({
  auditSignal: z.number().min(0).max(1).default(0.4),
  profileSignal: z.number().min(0).max(1).default(0.3),
  fixability: z.number().min(0).max(1).default(0.2),
  risk: z.number().min(0).max(1).default(0.1),
});
export type GapWeightT = z.infer<typeof GapWeight>;

export const DEFAULT_GAP_WEIGHTS: GapWeightT = {
  auditSignal: 0.4,
  profileSignal: 0.3,
  fixability: 0.2,
  risk: 0.1,
};

export const QualityTierValue = z.enum(['A', 'B', 'C']);
export type QualityTierValueT = z.infer<typeof QualityTierValue>;

export const Gap = z.object({
  id: z.string(),
  description: z.string(),
  source: z.enum(['audit', 'profile', 'both']),
  auditMentions: z.number().int().min(0).default(0),
  profileDeclared: z.boolean().default(false),
  fixability: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
  tier: QualityTierValue,
  affectedDimensions: z.array(z.string()).default([]),
  estimatedScoreDelta: z.number().default(0),
  priorityScore: z.number().min(0).max(1).default(0),
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

// ============================================================================
// Upgrade proposals
// ============================================================================

export const UpgradeFileAction = z.enum(['create', 'modify', 'delete']);
export type UpgradeFileActionT = z.infer<typeof UpgradeFileAction>;

export const UpgradeFile = z.object({
  path: z.string(),
  action: UpgradeFileAction,
  content: z.string().default(''),
});
export type UpgradeFileT = z.infer<typeof UpgradeFile>;

export const UpgradeProposal = z.object({
  id: z.string(),
  gapId: z.string(),
  tier: QualityTierValue,
  title: z.string(),
  description: z.string(),
  files: z.array(UpgradeFile),
  expectedScoreDelta: z.record(z.string(), z.number()).default({}),
  generatedAt: z.string().datetime(),
  markerFile: z.string().optional(),
  requiresSandboxVerify: z.boolean().default(false),
  passedSandbox: z.boolean().optional(),
  passedLint: z.boolean().optional(),
  passedTypecheck: z.boolean().optional(),
});
export type UpgradeProposalT = z.infer<typeof UpgradeProposal>;

// ============================================================================
// Pre-merge gate
// ============================================================================

export const CheckResult = z.object({
  name: z.string(),
  passed: z.boolean(),
  output: z.string(),
  durationMs: z.number().min(0).default(0),
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

// ============================================================================
// GitHub client contracts
// ============================================================================

export interface CreatePROpts {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
}

export interface PRComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
}

export interface GitHubClient {
  createBranch(owner: string, repo: string, fromBranch: string, toBranch: string): Promise<string>;
  createCommit(owner: string, repo: string, branch: string, files: UpgradeFileT[]): Promise<string>;
  createDraftPR(opts: CreatePROpts): Promise<number>;
  addLabel(owner: string, repo: string, prNumber: number, label: string): Promise<void>;
  getComments(owner: string, repo: string, prNumber: number): Promise<PRComment[]>;
  mergePR(owner: string, repo: string, prNumber: number): Promise<void>;
  closePR(owner: string, repo: string, prNumber: number): Promise<void>;
}

// ============================================================================
// Veto / PR lifecycle
// ============================================================================

export const PRState = z.object({
  prNumber: z.number(),
  owner: z.string(),
  repo: z.string(),
  branch: z.string(),
  proposalId: z.string(),
  openedAt: z.string().datetime(),
  vetoDeadline: z.string().datetime(),
  vetoReceived: z.boolean().default(false),
  merged: z.boolean().default(false),
  closed: z.boolean().default(false),
  mergeError: z.string().optional(),
});
export type PRStateT = z.infer<typeof PRState>;

// ============================================================================
// Fitness / learner loop
// ============================================================================

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

// ============================================================================
// Loop state machine
// ============================================================================

export const LoopStatus = z.enum([
  'idle',
  'auditing',
  'analyzing',
  'generating',
  'gating',
  'pr_open',
  'veto_wait',
  'merged',
  'vetoed',
  'error',
]);
export type LoopStatusT = z.infer<typeof LoopStatus>;

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
  profileSlug: string;
  scorecard: BusinessScorecardT | null;
  queue: UpgradeQueueT | null;
  currentProposal: UpgradeProposalT | null;
  prState: PRStateT | null;
}
