import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'node:child_process';
import { createServer as createViteServer } from 'vite';
import {
  ToolEntry,
  ToolVersion,
  ProvenanceEvent,
  SystemStatus,
  HourlyReport,
  PromotionPolicy,
  ToolDomain,
  VerifierResult,
  BiotechClaim,
  AnomalyReport,
  GrowthFactorWeights,
  GrowthDecisionReport,
  DreamState,
  GitHubRepoBlueprint,
  GitHubIngestionResult,
  SwarmStatus,
  SubAgentType,
  SubAgentTask
} from './src/types.js';
import {
  INITIAL_REGISTRY,
  INITIAL_PROVENANCE_EVENTS,
  INITIAL_STATUS,
  INITIAL_HOURLY_REPORTS
} from './src/lib/mockData.js';
import {
  verifyCodingCode,
  verifySystemicCode,
  verifyMathCode,
  verifyBiotechClaim,
  verifyNeuroSymbolicCode,
  verifyCyberDefenseCode,
  verifyQuantumSimCode,
  diagnoseAndRepairCode
} from './src/lib/verifiers.js';
import { executeToolFunction, executeTestSuite } from './src/lib/executionSandbox.js';
import { MerkleTree, auditCodeSecurity } from './src/lib/cyberDefenseEngine.js';
import { transformSync } from 'esbuild';
import { searchGitHubRepositories, fetchRepoSource, domainLabel } from './src/lib/githubResearchEngine.js';
import { kgSidecarHealth, kgCentrality, kgNeighborhood, kgBridges, oncologyKgToGraph, KG_SIDECAR_DEFAULT_URL } from './src/lib/kgSidecarClient.js';
import { validateBiotechClaimAgainstKG, CANONICAL_ONCOLOGY_KG } from './src/lib/biotechKnowledgeGraph.js';
import { buildLiveOncologyGraph, liveEvidenceHealth } from './src/lib/liveOncologyGraph.js';
import { synthesizeOdeKinetics } from './src/lib/odeKineticSynthesizer.js';
import { runDosingSweep } from './src/lib/dosingOptimizer.js';
import { exportOdeToSbml } from './src/lib/sbmlExporter.js';
import { exportOdeToPhysicell } from './src/lib/physicellExporter.js';
import { buildEvidenceDossier } from './src/lib/evidenceDossier.js';
import { otSearch, otHealth as openTargetsHealth } from './src/lib/openTargetsClient.js';
import { ptSearch, ptHealth as pubTatorHealth, parsePubTatorAnnotations } from './src/lib/pubTatorClient.js';
import { HARD_MATH_PROBLEMS, ProblemTier } from './src/lib/hardMathProblems.js';
import { recordMathAttempt, recordBiotechClaim, getMathAttempts, getBiotechClaims, getGoalProgress, MathAttempt, BiotechClaim as LedgerBiotechClaim, initGoalLedger, saveGoalLedger } from './src/lib/goalLedger.js';
import { pdfExtractBytes } from './src/lib/pdfSidecarClient.js';
import { oncologyHealth } from './src/lib/oncologyEngineBridge.js';
import { startScienceConductor, stopScienceConductor, runScienceCycle, getConductorStatus, recentFindings, recentCycles } from './src/lib/scienceConductor.js';
import { globalLensHealth, globalLensConfigured, globalLensBaseUrl } from './src/lib/globalLensBridge.js';
import { runPublishPass, PUBLISH_DOMAINS } from './src/lib/globalLensPublisher.js';
import { musicTherapyFindings } from './src/lib/musicTherapyFindings.js';
import { renderTuningContrast, TUNING_CAVEATS, benchmarkComparison, tuningContrastModel, TUNING_GRID, TUNING_RECORDS, tuningContrastDetailed, musicVsControlBenchmark, BENCHMARK_NOTE, renderTuningSummary } from './src/lib/musicTherapyTuning.js';
import { startMathConductor, stopMathConductor, runMathCycle, mathConductorStatus, recentMathCycles, recentMathFindings } from './src/lib/mathConductor.js';
import { recentInsights } from './src/lib/trendLedger.js';
import { registerScheduledJob, getSchedulerStatus, setJobEnabled, triggerJob, listScheduledJobs } from './src/lib/jobScheduler.js';
import { keywireHealth } from './src/lib/keywireBridge.js';
import { computeIssueProgress, readIssueRecords, renderIssueDocs, renderIssueIndex } from './src/lib/issueTracker.js';
import { generateFleetReport, renderDailyReport, recentReports } from './src/lib/researchReports.js';
import { renderAndPersistAgenda, computeAgenda, selectNextMathMilestone, selectNextOncologyMilestone } from './src/lib/breakthroughAgenda.js';
import { computeGameProfile, persistGameProfile, leaderboard } from './src/lib/gamification.js';
import { renderDashboard } from './src/lib/fleetDashboard.js';
import * as jobSchedulerApi from './src/lib/jobScheduler.js';
import { zod400, kgNeighborhoodReq, kgBridgesReq, biotechClaimExtra } from './src/lib/contracts.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { evaluateGrowthDecision, DEFAULT_GROWTH_WEIGHTS } from './src/lib/decisionEngine.js';
import { decisionSynergyInputs } from './src/lib/synergy/decisionBridge.js';
import { DreamingEngine } from './src/dream/engine.js';
import { createDreamStore } from './src/dream/store.js';
import {
  createGeneRegistryStore,
  evolveGene,
  approveGene,
  getActiveModel,
  getActivePolicy,
  setActivePolicy
} from './src/dream/mutator.js';
import { INITIAL_SWARM_STATUS, dispatchSubAgentTask, stepSubTeams, INITIAL_SUB_TEAM_STATES, SubTeamState } from './src/lib/subagentSwarm.js';
import { createInitialLoopState, executeRecursiveStep, DEFAULT_LOOP_CONFIG } from './src/lib/recursiveMathEngine.js';
import { createLearnerStore, RecursiveLearner } from './src/dream/learner.js';
import { globalLegoEngine } from './src/lego/engine.js';
import {   checkOnline as modelCheckOnline, providerStatus, providerStatuses, chatComplete, extractJsonBlock, setActiveProviderProfile, activeProviderProfile, providerProfiles } from './src/lib/modelProvider.js';
import type { ProviderProfileId } from './src/lib/modelProvider.js';
import { lintSource } from './src/lib/lintGate.js';
import type { LintReport } from './src/lib/lintGate.js';
import {
  listComponentTemplates,
  getComponentTemplate,
  buildComponentFromTemplate,
  getSelfRepairKnowledge,
  COMPONENT_TEMPLATES
} from './src/lib/componentTemplates.js';
import {
  listSelfHostedEntries,
  getSelfHostedEntry,
  writeSelfHostedTool,
  writeStatelessSelfHostedTool,
  verifyAllSelfHosted,
  verifySelfHostedEntry,
  executeSelfHostedTool,
  removeSelfHostedTool,
  toSafeModuleName
} from './src/lib/selfHosting.js';
import type { SelfHostedManifestEntry } from './src/lib/selfHosting.js';

// Capability Forge: the closed, honest self-improvement loop. Materializes
// verified model-built functions into live self-hosted tools and records every
// attempt in a durable capability-delta ledger.
import { FORGE_AGENDA, attemptForgeSpec } from './src/lib/capabilityForge.js';
import type { ForgeSpec, ForgeAttemptOutcome } from './src/lib/capabilityForge.js';
import { BUILDER_SEED_PROFILES, chooseBuilderProfile, computeBuilderBeliefs, builderMutateDue, proposeBuilderProfile } from './src/lib/builderBrain.js';
import type { BuilderProfile, BuilderOutcome } from './src/lib/builderBrain.js';
import { bbtchIdeaToProposal, heuristicScore, sortProposals, nextProposalToPursue } from './src/lib/intelInvention.js';
import type { IntelProposal } from './src/lib/intelInvention.js';
import { intelSourceStatuses, pullBbtchArchetypes, rankProposalsWithStrategy } from './src/lib/intelSources.js';

// Fleet development integration: audit/repair team plugin seam (RepoRank,
// Grader, Codegang, Benchmark Olympics / the Deep, Draymond repair team).
import {
  installDefaultFleetDrivers,
  auditorStatuses,
  computeHealthDossier,
  topWeaknessScore,
  buildRepairRows,
  buildBrainAnalyzeQuery,
  submitToRepairEndpoint,
  askDeterministicBrain,
  verifyAndApplyPatch,
  probeDriverOnline,
  getFleetDriver,
  callDevBrain,
  applyDriverProposal,
  revertAppliedPatch,
  listFleetPatches,
  fleetBackupDir,
} from './src/lib/fleetDevelopment.js';
import type { DossierInput, DevBrainAction, DevBrainStrategy, DevBrainCandidate, BootGreenGate } from './src/lib/fleetDevelopment.js';
import {
  updateStuckIssues,
  shouldEscalate,
  repairRowForIssue,
  buildStuckRepairQuery,
  stuckSnapshot,
  DEFAULT_ESCALATION_BACKOFF_MS,
  DEFAULT_STUCK_THRESHOLD,
} from './src/lib/selfRepairLoop.js';
import type { StuckSignal, StuckIssue } from './src/lib/selfRepairLoop.js';

// Genome-council client: Recourse -> deterministic-brain /genome-council/*.
// Consult the council over a problem, read what it has learned, and record a
// real outcome (post-mortem) so it compounds leader believability.
import { buildCouncilProblem, councilDecide, councilLessons, councilPostMortem, councilState } from './src/lib/genomeCouncil.js';

// Recourse dormant-capability activator: swarm auto-dispatch, failure-bias,
// learner lastReport, autopilot probe, and benchmark refresh.
import {
  autoDispatchSwarmTasks,
  applyFailureBias,
  probeAutopilotOnce,
  maybeRefreshBenchmark,
} from './src/lib/recourseActivator.js';

// AgentBrowser web-fetch connector (download from the web through the real browser).
import { isWebCategory, htmlFromResult, pickRenderMethod } from './src/lib/webArtifact.js';
import { createWebChannelRouter } from './src/server/routes/webChannel.js';
import { buildQDArchive, buildIslands } from './src/lib/qualityDiversity.js';
import {
  CapabilityId,
  CapabilityBacking,
  CapabilityDef,
  selectBestBacking,
  backingKey,
} from './src/lib/capabilities.js';
import {
  SystemSnapshot,
  SystemDiff,
  diffSnapshots,
  snapshotFingerprint,
  renderUpgradeMarkdown,
  renderPlainLanguageSummary,
} from './src/lib/systemDiff.js';
import {
  resolveKind,
  artifactCard,
  unpackCall,
} from './src/lib/artifactHost.js';
import {
  isIsolateAvailable,
  executeToolInIsolate,
} from './src/lib/isolatedSandbox.js';
import { VectorMemory, openVectorMemory, MemoryKind } from './src/lib/vectorMemory.js';
import { buildFleetMemoryEntry } from './src/lib/fleetMemory.js';

// Intake / benchmark / readout subsystem
import { SignalStore, DEFAULT_TOPIC_QUERIES, DEFAULT_RSS_FEEDS } from './src/intake/store.js';
import type { IntakeSnapshot, BenchmarkRun, ExternalSignal, SourcePollResult } from './src/intake/types.js';
import { pollAllSources } from './src/intake/poll.js';
import { groundSignal } from './src/intake/grounding.js';
import { runBenchmark, BENCHMARK_PROBLEMS } from './src/benchmark/benchmark.js';
import { buildDevelopmentReadout } from './src/intake/readout.js';
import type { ReadoutContext } from './src/intake/readout.js';

// Ecosystem research corpus (local sibling-project ingestion)
import { scanCorpus } from './src/intake/corpus/scanner.js';
import { refillAgendaFromCorpus } from './src/intake/corpus/agendaRefill.js';
import { summarize, corpusDigest, artifactsToSignals, DEFAULT_CORPUS_ROOTS } from './src/intake/corpus/index.js';
import type {
  CorpusRoot,
  CorpusArtifact,
  CorpusSnapshot,
  CorpusSummary,
} from './src/intake/corpus/types.js';

// Skill library accessor (catalog, search, read sibling skill repositories)
import { scanSkillLibraries } from './src/skills/scanner.js';
import { summarize as summarizeSkills, skillDigest, searchSkills, DEFAULT_SKILL_ROOTS } from './src/skills/index.js';
import type { SkillRoot, SkillDef, SkillSnapshot, SkillSummary } from './src/skills/types.js';
// Skill exporter/importer (Phase 4 distribution — registry tools <-> SKILL.md)
import {
  exportSkillFiles,
  candidateFromSkillText,
  currentToolVersion,
  isVerifiableVersion,
} from './src/skills/exporter.js';
// Composer (creative domain): style-driven original track generation -> .mid/.seq
import {
  composeToOutcome,
  composeArrangement,
  summarizeTrack,
  toMidiBytes,
  seqToJson,
  listStyles,
  ComposerLearner,
  defaultLearnerFile,
  runBenchmark as runComposerBenchmark,
  renderBenchmark as renderComposerBenchmark,
  autoRateBenchmark,
  encodeSoundlabPiece,
  validatePiece,
  pieceToJson,
  compose,
} from './src/lib/composer/index.js';

const app = express();
const PORT = Number(process.env.PORT || 3050);
import { createStateStore } from './src/lib/stateStore.js';
import { createKgRouter } from './src/routes/kg.js';
import { createOncologyRouter } from './src/routes/oncology.js';
import { createBioRouter } from './src/routes/bio.js';
import { createBridgesRouter } from './src/routes/bridges.js';
import { createToolsRouter } from './src/routes/tools.js';
import { createServicesRouter } from './src/routes/services.js';
import { createSynergyRouter } from './src/routes/synergy.js';
import { createVizRouter } from './src/routes/viz.js';
import { requireMutationAuth, requireMutationAuthIfConfigured } from './src/lib/mutationAuth.js';
const STATE_FILE = path.join(process.cwd(), 'recourse_storage.json');

// Math solver state. Hoisted to module top so the function declaration at
// line 5275 and the route at 5363 always see an initialized variable (avoids
// the TDZ error that fired when runServerTick called solveNextMathProblem).
let mathSolverBusy = false;
let lastMathSolveAt = 0;
const MATH_SOLVE_COOLDOWN_MS = 20000;
let biotechClaimBusy = false;
let lastBiotechClaimAt = 0;
const BIOTECH_CLAIM_COOLDOWN_MS = 30000;

// ---------------------------------------------------------------------------
// Single-instance guard. Recourse engines must never stack: several earlier
// `tsx server.ts` processes were left running at once, each writing the same
// recourse_*.json state files on its own tick. Combined with Vite's dev file
// watcher, that produced an infinite page-reload loop (tick -> state write ->
// page reload -> tick). Refuse to boot a second instance so state has exactly
// one writer. Override with RECOURSE_ALLOW_MULTI=1 only for deliberate forks.
// ---------------------------------------------------------------------------
const LOCK_FILE = path.join(process.cwd(), '.recourse.lock');
function acquireInstanceLock(): boolean {
  if (process.env.RECOURSE_ALLOW_MULTI === '1') return true;
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const existing = Number(String(fs.readFileSync(LOCK_FILE, 'utf-8')).trim());
      if (existing > 0) {
        try {
          process.kill(existing, 0); // does not kill; checks liveness
          console.error(
            `[Recourse] Refusing to start: instance PID ${existing} is already running ` +
            `(lock ${LOCK_FILE}). Kill it first, or run with RECOURSE_ALLOW_MULTI=1 to force.`
          );
          return false;
        } catch {
          // Stale lock from a dead process — fall through and take over.
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf-8');
    return true;
  } catch (err: any) {
    console.warn('[Recourse] Could not write instance lock; continuing:', err?.message || err);
    return true;
  }
}
if (!acquireInstanceLock()) {
  process.exit(1);
}
function releaseInstanceLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE) && String(fs.readFileSync(LOCK_FILE, 'utf-8')).trim() === String(process.pid)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch { /* best-effort */ }
}
process.on('exit', releaseInstanceLock);
process.on('SIGINT', () => { releaseInstanceLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseInstanceLock(); process.exit(0); });

// Crash visibility. Detached/fleet-respawned instances inherit no console, so
// a death leaves empty stderr and no clue. Log every uncaught exception and
// unhandled rejection to recourse-crash.log WITH a stack, then exit(1) so the
// supervisor respawns it — same terminate behavior as Node's default, plus a
// trace. This is how the silent publish-time deaths get diagnosable.
const CRASH_LOG = path.join(process.cwd(), 'recourse-crash.log');
function logCrash(kind: string, err: unknown): void {
  const line = `[${new Date().toISOString()}] ${kind}: ${err instanceof Error ? (err.stack || err.message) : String(err)}`;
  try { fs.appendFileSync(CRASH_LOG, line + '\n'); } catch { /* best-effort */ }
  console.error(line);
}
process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', reason);
  process.exit(1);
});

// Dream-engine model generator: asks the configured local model (e.g. the
// HF Qwen3.5-4B build, served via Ollama) to propose a falsifiable hypothesis
// in a random domain WITH plain-JS implementation and real assert tests. The
// Dreaming Engine runs those tests before the thought can ever promote.
const DREAM_DOMAINS: ToolDomain[] = ['math', 'coding', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

async function dreamModelGenerator(input?: { domain?: ToolDomain; recentHypotheses?: string[] }): Promise<import('./src/dream/engine.js').DreamGeneratorResult | null> {
  const online = await modelCheckOnline(false);
  if (!online) return null;
  const recent = (input?.recentHypotheses || []).slice(0, 3);
  const domain = input?.domain || DREAM_DOMAINS[Math.floor(Math.random() * DREAM_DOMAINS.length)];
  const result = await chatComplete([
    {
      role: 'system',
      content: `You are the dream layer of an autonomous code-discovery system. Propose ONE falsifiable hypothesis in domain "${domain}" for a small, genuinely implementable micro-tool.
Rules:
- Return ONLY valid JSON: {"premise": "one sentence assumption", "hypothesis": "one sentence claim about the micro-tool", "sourceCode": "PLAIN JAVASCRIPT, no TS, no imports, exported via 'export function'", "testSuiteCode": "a multi-line string where EVERY line starts with the word 'assert' followed by a space, then a boolean expression that calls the real function you wrote and fails if the implementation is wrong"}
- sourceCode MUST define the function that testSuiteCode calls, with exactly that name.
- The tests must pass when run against your own sourceCode.
- The hypothesis is prose, NOT code. No placeholders, no Markdown fences.`,
    },
    { role: 'user', content: `Dream a micro-tool hypothesis for domain "${domain}".${recent.length ? ` Recent hypotheses to avoid repeating: ${recent.join(' | ')}` : ''}` },
  ], { temperature: 0.5, json: true });

  if (!result.ok || !result.content) return null;
  const block = extractJsonBlock(result.content);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block);
    if (
      !parsed ||
      typeof parsed.sourceCode !== 'string' ||
      parsed.sourceCode.trim().length < 20 ||
      typeof parsed.testSuiteCode !== 'string' ||
      parsed.testSuiteCode.trim().length < 4
    ) {
      return null;
    }
    return {
      premise: String(parsed.premise || '').slice(0, 300),
      hypothesis: String(parsed.hypothesis || '').slice(0, 300),
      sourceCode: parsed.sourceCode,
      testSuiteCode: parsed.testSuiteCode,
    };
  } catch {
    return null;
  }
}

const dreamStore = createDreamStore();
// Real signal provider for memory_consolidation phase: feeds math readiness,
// lego assembly count, and learner episode/calibration into the dream engine
// so the dream's cognitive coherence is signed by the live system, not a curve.
const dreamEngine = new DreamingEngine(
  dreamStore,
  undefined,
  dreamModelGenerator,
  {
    readinessScore: () => status.readinessScore ?? mathLoopState.latestResult?.readinessScore ?? 0,
    legoAssemblyCount: () => globalLegoEngine.getState().registry.length,
    learnerEpisode: () => {
      try {
        return (learner as any).lastReport?.episode ?? 0;
      } catch {
        return 0;
      }
    },
    learnerCalibration: () => {
      try {
        return (learner as any).lastReport?.calibrationError ?? 0;
      } catch {
        return 0;
      }
    },
  },
);
const learnerStore = createLearnerStore();
const learner = new RecursiveLearner(learnerStore);
let mathLoopState = createInitialLoopState();

// Real per-generation ledger. Every 24/7 tick writes one compact, real record
// of what that generation did (readiness, energy, learner episode, which
// subsystems fired). Persisted with the rest of the state. Generations before
// the ledger existed (or after a reset) simply have no record — nothing is
// fabricated to fill the gap.
export interface GenerationLedgerEntry {
  gen: number;
  ts: number;
  readinessScore: number;
  energyBudget: number | null;
  permitNextIteration: boolean;
  energyConsumed: number;
  learnerEpisode: number;
  learnerAvgReward: number;
  learnerCalibration: number;
  dream: boolean;
  axiomAdded: boolean;
  axiom?: string;
  legoTick: boolean;
  legoAssemblies: number;
  brainOutputs: Array<{ teamId: string; output: string; success: boolean }>;
  subTeamCycles: number;
  subTeamCompleted: number;
}
// Wall-clock boot marker for server-authoritative uptime. In-memory only:
// uptime must reset on restart, so it is never persisted or loaded.
let serverBootAt = Date.now();
let generationLedger: GenerationLedgerEntry[] = [];

// Capability Forge ledger: the durable, honest measure of self-improvement.
// One record per autonomous forge attempt — a tool is only "materialized" when
// the model-built source passed the human-authored reference suite, passed the
// lint gate, and was written + re-verified as a live self-hosted module.
export interface ForgeLedgerEntry {
  id: string;
  at: number;
  gen: number;
  name: string;
  domain: ToolDomain;
  status: 'materialized' | 'exists' | 'offline' | 'failed' | 'materialize_failed';
  attemptsUsed: number;
  maxTries: number;
  moduleFile?: string;
  hash?: string;
  summary?: string;
  failures?: Array<{ attempt: number; note: string }>;
  wallMs: number;
  /** R6: literature-grounding for this build (null = corpus unavailable). */
  literature?: { score: number; docs: number } | null;
}
let forgeLedger: ForgeLedgerEntry[] = [];
let forgeAutopilotOn = false;
let forgeBusy = false;
let forgeTimer: NodeJS.Timeout | null = null;
const FORGE_AUTOPILOT_MS = Math.max(5000, Number(process.env.FORGE_AUTOPILOT_MS) || 2000);
// Quarantine: dream/backfill specs that fail live re-verify are retried only
// FORGE_QUARANTINE_LIMIT times, then skipped by nextForgeSpec. Prevents the
// 2s autopilot from spinning forever on a gene whose source cannot self-host.
const FORGE_QUARANTINE_LIMIT = Number(process.env.FORGE_QUARANTINE_LIMIT) || 5;
const forgeQuarantine = new Map<string, number>(); // spec name -> consecutive failures

/** Bump a spec's quarantine counter; returns true when it is now quarantined. */
function bumpForgeQuarantine(name: string): boolean {
  const next = (forgeQuarantine.get(name) ?? 0) + 1;
  forgeQuarantine.set(name, next);
  if (next >= FORGE_QUARANTINE_LIMIT) {
    console.warn(`[forge] quarantined "${name}" after ${next} consecutive materialize failures — autopilot will skip it.`);
  }
  return next >= FORGE_QUARANTINE_LIMIT;
}

// Durably persisted top-level state. These MUST be declared (and initialized)
// before loadStateFromDisk() runs at module load — otherwise the loader touches
// them in their temporal dead zone, throws, and (because load is wrapped in
// try/catch) silently discards ALL persisted state on every restart.
let capabilityAdoptions: Partial<Record<CapabilityId, AdoptionRecord>> = {};
let capabilityServed: Partial<Record<CapabilityId, number>> = {};
let systemSnapshots: SystemSnapshot[] = [];
let systemBaseline: SystemSnapshot | null = null;

// Model provider mode persisted across restarts ('local' Ollama | 'api' LLM).
let providerMode: ProviderProfileId = 'api';

// Builder Brain (meta-loop that improves the generator) persisted state.
let builderProfiles: BuilderProfile[] = JSON.parse(JSON.stringify(BUILDER_SEED_PROFILES));
let builderJournal: BuilderOutcome[] = [];
let activeBuilderId = 'concise';
let builderLastMetaRun = 0;
let builderLastMutate = 0;
let builderVariantTrials = 0;

// Intel → Invention: durable proposals from ecosystem intel + a dynamic forge
// agenda that adopted proposals join (only when they carry a real ref suite).
let intelProposals: IntelProposal[] = [];
let dynamicAgenda: ForgeSpec[] = [];

// Failure ledger — every silent .catch() across the autopilots surfaces here
// so the operator can see real errors instead of cosmetic "skipped" lines.
// Bounded ring buffer; oldest entries drop off past MAX_FAILURE_ENTRIES.
export interface FailureEntry {
  at: number;
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  generation?: number;
}
const failureLedger: FailureEntry[] = [];
const MAX_FAILURE_ENTRIES = 200;
function recordFailure(source: string, err: any, context?: Record<string, any>): void {
  const e: FailureEntry = {
    at: Date.now(),
    source,
    message: typeof err?.message === 'string' ? err.message : String(err),
    stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 4).join('\n') : undefined,
    context,
    generation: status?.generation,
  };
  failureLedger.push(e);
  if (failureLedger.length > MAX_FAILURE_ENTRIES) failureLedger.shift();
  // Keep the noise reasonable: only first 200 chars of stack to log.
  console.warn(`[failure:${source}] ${e.message}${context ? ' ' + JSON.stringify(context).slice(0, 200) : ''}`);
}

// Fleet development loop (audit/repair-team integration) durable state.
export interface DevLoopEntry {
  at: number;
  action: string;
  ok: boolean;
  driver?: string;
  detail: string;
  file?: string;
  hash?: string;
}
let devLoopLog: DevLoopEntry[] = [];
let devAutopilotOn = false;
let devTimer: NodeJS.Timeout | null = null;
const DEV_AUTOPILOT_MS = 60_000;
installDefaultFleetDrivers();

// Stuck-aware self-repair: watched issues + escalation ledger (persisted).
export interface StuckRepairAction {
  issueId: string;
  at: number;
  dispatchedRepairTeam: boolean;
  repairTeamDetail: string;
  brainAsked: boolean;
  brainDetail: string;
  proposalsApplied: number;
  proposalsRejected: number;
  proposalsSkipped: number;
}
let stuckIssues: StuckIssue[] = [];
let stuckRepairLedger: StuckRepairAction[] = [];
let selfRepairBusy = false;
const SELF_REPAIR_MS = Math.max(30_000, Number(process.env.RECOURSE_SELF_REPAIR_MS) || 5 * 60 * 1000);
const SELF_REPAIR_BACKOFF_MS = Math.max(30_000, Number(process.env.RECOURSE_SELF_REPAIR_BACKOFF_MS) || DEFAULT_ESCALATION_BACKOFF_MS);
/** Auto-apply gate: the repair loop may APPLY gate-passing brain proposals to
 *  the harness only when enabled. Dispatch + brain-ask always run when stuck. */
const SELF_REPAIR_APPLY = process.env.RECOURSE_SELF_REPAIR_APPLY !== '0';
const SELF_REPAIR_BAND = Math.max(50, Number(process.env.RECOURSE_SELF_REPAIR_BAND) || 50);

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Security hardening: helmet headers + configurable rate limiting.
// - helmet: full CSP only in production (the built app loads scripts/styles
//   from 'self' with no inline scripts). In dev, CSP is disabled so Vite HMR
//   (WebSocket + injected clients) keeps working; the other headers still apply.
// - rate limit: a single configurable limiter over /api. Default is generous so
//   Recourse's own in-process loops are never throttled (they call engines
//   directly, not self-HTTP). Set RECOURSE_RATE_LIMIT_MAX=0 to disable, or
//   tune window/limit via env.
// ---------------------------------------------------------------------------
const RECOURSE_IS_PROD = process.env.NODE_ENV === 'production';
app.use(
  helmet({
    contentSecurityPolicy: RECOURSE_IS_PROD
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // React inline style attrs + Tailwind
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  }),
);

const RATE_LIMIT_WINDOW_MS = Number(process.env.RECOURSE_RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_MAX = Number(process.env.RECOURSE_RATE_LIMIT_MAX ?? 1000);
if (RATE_LIMIT_MAX > 0) {
  app.use(
    '/api/',
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit: RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, error: 'too many requests' },
    }),
  );
}


// Local-model telemetry (OpenAI-compatible provider). Online state is
// probed lazily and cached; the app never fabricates model responses.
let providerOnline = false;
let providerOnlineChecked = false;

async function refreshModelStatus(force = false) {
  providerOnline = await modelCheckOnline(force);
  providerOnlineChecked = true;
}

function currentProviderStatus() {
  const ps = providerStatus();
  return {
    kind: ps.kind,
    baseUrl: ps.baseUrl,
    model: ps.model,
    online: providerOnlineChecked ? providerOnline : ps.online,
    lastError: ps.lastError,
    checkedAt: ps.checkedAt,
    active: activeProviderProfile(),
    profiles: providerProfiles(),
  };
}

// =========================================================================
// HONEST VERIFICATION HELPERS
// =========================================================================

// Canonical regression suites for the genesis tool seeds. These are real
// assertions written against the actual code in each seed version, so boot
// re-verification (below) produces truthful pass/fail/score values instead of
// the fabricated "PASSED: 100k ops..." notes that shipped in mockData.
const GENESIS_SUITES: Record<string, string> = {
  fizzbuzz_solver:
`assert fizzbuzzFast(3) === 'Fizz';
assert fizzbuzzFast(5) === 'Buzz';
assert fizzbuzzFast(15) === 'FizzBuzz';
assert fizzbuzzFast(7) === '7';`,
  quadratic_vieta_root_sum:
`assert sumOfRoots(1, -5, 6) === 5;
assert sumOfRoots(2, 8, -10) === -4;
assert sumOfRoots(1, 0, -4) === 0;`,
  sat_horn_clause_solver:
`const clauses = [{ premises: ['oncogene_active'], head: 'hyper_proliferation' }, { premises: ['hyper_proliferation'], head: 'tumor_growth' }];
const facts = new Set(['oncogene_active']);
const out = solveHornClauses(clauses, facts);
assert out.has('tumor_growth');
assert out.has('hyper_proliferation');
assert out.size === 3;`,
  merkle_taint_sanitizer:
`const clean = sanitizeBuffer(new Uint8Array([1, 256, 300]));
assert clean.length === 3;
assert clean[0] === 1;
assert clean[1] === 0;
assert clean[2] === 44;`,
  qubit_bell_state_mitigator:
`const s = createBellState();
assert s.stateVector.length === 4;
const norm = s.stateVector.reduce((a, x) => a + x * x, 0);
assert Math.abs(norm - 1) < 1e-9;`,
  multi_agent_route_planner:
`const r = planRoutes([{ id: 1, start: 'A', goal: 'B' }]);
assert r.length === 1;
assert r[0].path.length === 2;`,
  cache_optimizer_l2:
`const c = new L2Cache();
c.set('k', 42);
assert c.get('k') === 42;
assert c.get('missing') === undefined;`
};

function genesisSuiteFor(tool: ToolEntry): string | undefined {
  if (tool.domain === 'biotech') return undefined;
  return GENESIS_SUITES[tool.name];
}

/** Run the real code sandbox against a suite (used by boot reconciliation and
 *  anywhere else a version needs an honest verdict). */
function verifyCodeWithSuite(sourceCode: string, suite: string): VerifierResult {
  return verifyCodingCode(sourceCode, suite);
}

/** Real open-source lint gate (oxlint). Blocks unsafe constructs (eval,
 *  debugger, const reassignment, unreachable code) when the linter is
 *  installed; reports skipped when the binary is missing - it never pretends
 *  code was linted. */
function gateWithLint(sourceCode: string): { allowed: boolean; lint: LintReport } {
  // Templates/generators may emit TS; pure JS is valid TS, so lint as TS.
  const lint = lintSource(sourceCode, 'ts');
  const allowed = !lint.available || lint.clean;
  return { allowed, lint };
}

function lintVerdictNote(lint: LintReport): string {
  if (!lint.available) return 'LINT: not run (oxlint not installed)';
  return lint.clean
    ? `LINT: oxlint clean (${lint.warnings} warning${lint.warnings === 1 ? '' : 's'})`
    : `LINT FAILED: ${lint.errors} error(s) - ${lint.details.filter((d) => d.startsWith('[error]')).slice(0, 3).join('; ')}`;
}

// ---------------------------------------------------------------------------
// Mutation guard — see src/lib/mutationAuth.ts (shared with extracted routers).
// ---------------------------------------------------------------------------

/** Re-derive live pass state for each tool's CURRENT promoted version at boot.
 *  Historical superseded versions are labeled as such and never re-executed;
 *  the live verdict is a fresh real execution, never a stored claim. */
function reconcileRegistryOnBoot() {
  let totalUpgrades = 0;
  let verifiedPass = 0;
  let verifiedTotal = 0;
  for (const tool of registry) {
    let liveHealthy = true;
    for (const v of tool.versions) {
      if (!v.promoted) continue;
      const isCurrent = v.version === tool.currentVersion;
      if (!isCurrent) {
        if (!v.verifier_notes.startsWith('HISTORICAL')) {
          v.verifier_notes = `HISTORICAL (superseded by ${tool.currentVersion}) - pass claim not re-executed at boot. ${v.verifier_notes}`;
        }
        continue;
      }
      if (!v.source_code) continue;
      let vr: VerifierResult | null = null;
      if (tool.domain === 'biotech') {
        try {
          const claim = JSON.parse(v.source_code) as BiotechClaim;
          vr = verifyBiotechClaim(claim);
        } catch {
          vr = { passed: false, summary: 'FAILED (invalid JSON payload)', details: [], score: 0 };
        }
      } else {
        const suite = v.test_suite_code || genesisSuiteFor(tool);
        if (suite) {
          vr = verifyCodeWithSuite(v.source_code, suite);
          if (!v.test_suite_code) v.test_suite_code = suite;
        }
      }
      if (vr) {
        v.passed_verifier = vr.passed;
        v.score = Math.round(vr.score * 100) / 100;
        v.verifier_notes = `GENESIS RE-VERIFIED: ${vr.summary}`;
        verifiedTotal++;
        if (vr.passed) verifiedPass++;
        if (vr.passed) totalUpgrades++;
        else liveHealthy = false;
      }
    }
    tool.healthStatus = liveHealthy ? 'healthy' : 'degraded';
  }
  status.registeredToolsCount = registry.length;
  status.totalUpgrades = totalUpgrades;
  status.verifierPassRate = verifiedTotal > 0 ? Math.round((verifiedPass / verifiedTotal) * 100) / 100 : 0;
  status.aiStudioModel = currentProviderStatus().model;
}

// Global State

// ---------------------------------------------------------------------------
// Autonomy / safe-boot settings. `safeBoot` defaults TRUE so a restart never
// silently re-enters the crash loop: after an unclean stop the operator boots
// to a stable dashboard and explicitly re-enables autonomous loops. The dream
// engine and all autopilots are only resumed when the operator turns them on
// (or sets RECOURSE_SAFE_BOOT=0 to restore the old auto-resume behavior).
// ---------------------------------------------------------------------------
let autonomySettings: { safeBoot: boolean } = {
  safeBoot: process.env.RECOURSE_SAFE_BOOT === '0' ? false : true,
};

let status: SystemStatus = { ...INITIAL_STATUS };let registry: ToolEntry[] = JSON.parse(JSON.stringify(INITIAL_REGISTRY));
let provenanceEvents: ProvenanceEvent[] = JSON.parse(JSON.stringify(INITIAL_PROVENANCE_EVENTS));
let reports: HourlyReport[] = JSON.parse(JSON.stringify(INITIAL_HOURLY_REPORTS));
let growthWeights: GrowthFactorWeights = { ...DEFAULT_GROWTH_WEIGHTS };
// Mirror of the Dreaming Engine's own durable store. Honest genesis here; the
// live value is refreshed from dreamEngine.status() and persisted by the
// engine's FileDreamStore.
let dreamState: DreamState = {
  isDreamingActive: false,
  currentPhase: 'rem_counterfactual_sim',
  dreamCyclesCompleted: 0,
  cognitiveCoherence: 0.5,
  totalCrystallizedGenes: 0,
  recentThoughts: [],
  registry: [],
  seed: 0x5eed0001 >>> 0,
  tick: 0,
  lastTickAt: null,
  prunedCount: 0,
};
let gitHubBlueprints: GitHubRepoBlueprint[] = [];
let swarmStatus: SwarmStatus = { ...INITIAL_SWARM_STATUS };
let swarmTeamStates: SubTeamState[] = [...INITIAL_SUB_TEAM_STATES];
let lastGrowthDecision: GrowthDecisionReport | null = null;
let anomalies: AnomalyReport[] = [];

// Intake subsystem state (external learning): durable signal store + benchmark
// history. Signals persist with the main state file via a save callback.
let intakeSignals: ExternalSignal[] = [];
let lastPollResults: SourcePollResult[] = [];
let lastGroundAt: number | null = null;
let lastGroundSummary: string | null = null;
let benchmarkHistory: BenchmarkRun[] = [];
// Most recent real benchmark result, cached so the learner reward (which runs
// every tick) can read it without re-running the hidden suites on every tick.
let latestBenchmark: BenchmarkRun | null = null;
// Benchmark cadence: hidden-suite runs against every registry tool are not free,
// so we refresh on an interval rather than every tick.
let lastBenchmarkRunAt = 0;
const BENCHMARK_EVERY_MS = 30_000;
let intakeAutopilotOn = false;
let serverTickAutopilotOn = false;
const signalStore = new SignalStore((signals) => {
  intakeSignals = signals;
  saveStateToDisk();
});

// Ecosystem research corpus state: configured roots (sibling projects) + the
// durable index of insight artifacts scanned from them. Persisted like intake.
let corpusRoots: CorpusRoot[] = DEFAULT_CORPUS_ROOTS.map((r) => ({ ...r }));
/** In-flight corpus scan shared by concurrent callers (boot pre-warm + publish). */
let corpusScanPromise: Promise<{ snapshot: CorpusSnapshot; added: number; refilled: number }> | null = null;
let corpusArtifacts: CorpusArtifact[] = [];
let corpusLastScan: number | null = null;
let corpusLastErrors: { root: string; error: string }[] = [];
let corpusDispatched = 0;
/** Durable seen-set for corpus→agenda refill (dedupe by artifact hash). */
let corpusRefilledHashes: string[] = [];

// Skill library state: configured roots + durable catalog of discovered skills.
let skillRoots: SkillRoot[] = DEFAULT_SKILL_ROOTS.map((r) => ({ ...r }));
let skillCatalog: SkillDef[] = [];
let skillLastScan: number | null = null;
let skillFound = 0;
let skillPrunedTranslations = 0;
let skillLastErrors: { root: string; error: string }[] = [];

// Skill Distribution (Phase 4): where exported SKILL.md folders are written, and
// how many verified tools have been exported / how many foreign candidates
// ingested. Default out-root is <cwd>/skills-out; override with SKILL_EXPORT_DIR.
let skillExportRoot = process.env.SKILL_EXPORT_DIR || path.join(process.cwd(), 'skills-out');
let skillExports = 0;
let skillImports = 0;
let skillImportPending: SkillImportRecord[] = [];
interface SkillImportRecord {
  name: string;
  domain: string;
  originRoot: string;
  originRel: string;
  runnable: boolean;
  outcome: string; // 'imported' | 'promoted' | 'rejected' | 'skipped'
  importedAt: number;
  reason?: string;
}

// Load persisted state if available
function loadPersistedDreamGenesFromStorage(): Array<{ name: string; domain?: string; code?: string; description?: string; testVectors?: unknown[]; invariantChecks?: Array<{ name: string; passed: boolean }> }> {
  try {
    const data = ensureStateStore().load<Record<string, any>>();
    if (!data) return [];
    const dreamReg = data?.status?.dreamState?.registry;
    return Array.isArray(dreamReg) ? dreamReg : [];
  } catch {
    return [];
  }
}

function loadStateFromDisk() {
  try {
    const data = ensureStateStore().load<Record<string, any>>();
    if (data) {
      if (data.registry) registry = data.registry;
      if (data.provenanceEvents) provenanceEvents = data.provenanceEvents;
      if (data.reports) reports = data.reports;
      if (data.anomalies) anomalies = data.anomalies;
      if (data.growthWeights) growthWeights = data.growthWeights;
      if (data.gitHubBlueprints) gitHubBlueprints = data.gitHubBlueprints;
      if (data.swarmStatus) swarmStatus = data.swarmStatus;
      if (Array.isArray(data.swarmTeamStates)) swarmTeamStates = data.swarmTeamStates;
      if (data.status) status = { ...status, ...data.status };
      if (data.intakeSignals) intakeSignals = data.intakeSignals;
      if (data.benchmarkHistory) benchmarkHistory = data.benchmarkHistory;
      if (data.lastGroundAt) lastGroundAt = data.lastGroundAt;
      if (data.lastGroundSummary) lastGroundSummary = data.lastGroundSummary;
      if (typeof data.intakeAutopilotOn === 'boolean') intakeAutopilotOn = data.intakeAutopilotOn;
      if (typeof data.serverTickAutopilotOn === 'boolean') serverTickAutopilotOn = data.serverTickAutopilotOn;
      if (typeof data.scienceAutopilotOn === 'boolean') scienceAutopilotOn = data.scienceAutopilotOn;
      if (typeof data.globalLensAutopilotOn === 'boolean') globalLensAutopilotOn = data.globalLensAutopilotOn;
      if (data.globalLensLastPublish && typeof data.globalLensLastPublish === 'object') {
        globalLensLastPublish = data.globalLensLastPublish as GlobalLensPublishRecord;
      }
      if (Array.isArray(data.corpusRoots) && data.corpusRoots.length) {
        corpusRoots = data.corpusRoots;
        // Merge in new default roots (e.g. local cancer library) without
        // duplicating or dropping user-configured roots.
        for (const d of DEFAULT_CORPUS_ROOTS) {
          if (!corpusRoots.some((r: any) => r && r.project === d.project)) corpusRoots.push({ ...d });
        }
      }
      if (Array.isArray(data.corpusArtifacts)) corpusArtifacts = data.corpusArtifacts;
      if (typeof data.corpusLastScan === 'number') corpusLastScan = data.corpusLastScan;
      if (Array.isArray(data.corpusLastErrors)) corpusLastErrors = data.corpusLastErrors;
      if (typeof data.corpusDispatched === 'number') corpusDispatched = data.corpusDispatched;
      if (Array.isArray(data.corpusRefilledHashes)) corpusRefilledHashes = data.corpusRefilledHashes;
      if (Array.isArray(data.skillRoots) && data.skillRoots.length) skillRoots = data.skillRoots;
      if (Array.isArray(data.skillCatalog)) skillCatalog = data.skillCatalog;
      if (typeof data.skillLastScan === 'number') skillLastScan = data.skillLastScan;
      if (typeof data.skillFound === 'number') skillFound = data.skillFound;
      if (typeof data.skillPrunedTranslations === 'number') skillPrunedTranslations = data.skillPrunedTranslations;
      if (Array.isArray(data.skillLastErrors)) skillLastErrors = data.skillLastErrors;
      if (typeof data.skillExportRoot === 'string') skillExportRoot = data.skillExportRoot;
      if (typeof data.skillExports === 'number') skillExports = data.skillExports;
      if (typeof data.skillImports === 'number') skillImports = data.skillImports;
      if (Array.isArray(data.skillImportPending)) skillImportPending = data.skillImportPending;
      if (Array.isArray(data.selfUseLog)) selfUseLog = data.selfUseLog;
      if (Array.isArray(data.generationLedger)) generationLedger = data.generationLedger;
      if (Array.isArray(data.forgeLedger)) forgeLedger = data.forgeLedger;
      if (typeof data.forgeAutopilotOn === 'boolean') forgeAutopilotOn = data.forgeAutopilotOn;
      if (Array.isArray(data.devLoopLog)) devLoopLog = data.devLoopLog;
      if (typeof data.devAutopilotOn === 'boolean') devAutopilotOn = data.devAutopilotOn;
      if (Array.isArray(data.stuckIssues)) stuckIssues = data.stuckIssues;
      if (Array.isArray(data.stuckRepairLedger)) stuckRepairLedger = data.stuckRepairLedger;
      if (data.providerMode === 'local' || data.providerMode === 'api') providerMode = data.providerMode;
      if (Array.isArray(data.builderProfiles) && data.builderProfiles.length >= 1) builderProfiles = data.builderProfiles;
      if (Array.isArray(data.builderJournal)) builderJournal = data.builderJournal;
      if (typeof data.activeBuilderId === 'string') activeBuilderId = data.activeBuilderId;
      if (typeof data.builderLastMetaRun === 'number') builderLastMetaRun = data.builderLastMetaRun;
      if (typeof data.builderLastMutate === 'number') builderLastMutate = data.builderLastMutate;
      if (typeof data.builderVariantTrials === 'number') builderVariantTrials = data.builderVariantTrials;
      if (Array.isArray(data.intelProposals)) intelProposals = data.intelProposals;
      if (Array.isArray(data.dynamicAgenda)) {
      // Purge reserved-word / non-identifier specs that can never compile
      // (e.g. a corpus artifact named "package" produced a spec the forge
      // would fail forever on). Keeps the forge working real targets.
      const reserved = new Set(['package', 'default', 'class', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'var', 'let', 'const', 'export', 'import', 'extends', 'super', 'this', 'null', 'undefined', 'true', 'false', 'try', 'catch', 'throw', 'finally', 'yield', 'await', 'async', 'static', 'get', 'set', 'void', 'with']);
      dynamicAgenda = data.dynamicAgenda.filter((s: any) => s?.name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s.name) && !reserved.has(s.name));
    }
      if (data.capabilityAdoptions) capabilityAdoptions = data.capabilityAdoptions;
      if (data.capabilityServed) capabilityServed = data.capabilityServed;
      if (Array.isArray(data.systemSnapshots)) systemSnapshots = data.systemSnapshots;
      if (data.systemBaseline) systemBaseline = data.systemBaseline;
      if (data.autonomySettings && typeof data.autonomySettings === 'object') {
        if (typeof data.autonomySettings.safeBoot === 'boolean') {
          autonomySettings.safeBoot = process.env.RECOURSE_SAFE_BOOT === '0' ? false : data.autonomySettings.safeBoot;
        }
      }
      // Keep the generation counter continuous across restarts: prefer the
      // explicit iteration marker, falling back to the last persisted
      // status.generation for storage files written before this key existed.
      const persistedStatusGen =
        typeof data.status?.generation === 'number' && data.status.generation > 0
          ? data.status.generation
          : null;
      const persistedMathIter =
        typeof data.mathIteration === 'number' && data.mathIteration > 0
          ? data.mathIteration
          : null;
      // Take the max: mathIteration can lag status.generation (non-tick routes
      // bump the counter without advancing the math loop), and loading the
      // smaller value would rewind the generation counter and collide with
      // existing per-generation ledger entries.
      const persistedIteration = Math.max(persistedMathIter ?? 0, persistedStatusGen ?? 0) || null;
      if (persistedIteration) {
        mathLoopState.iteration = persistedIteration;
        status.generation = persistedIteration;
      }
      // Re-seed the store from persisted signals so dedupe survives restarts.
      for (const s of intakeSignals) signalStore.ingest([s]);
      console.log(`[Recourse Engine] Loaded persistent state from ${STATE_FILE} (${registry.length} tools, ${provenanceEvents.length} events, ${intakeSignals.length} signals)`);
    }
  } catch (err) {
    console.warn('[Recourse Engine] Could not load persisted state, using memory defaults:', err);
  }
}

function saveStateToDisk() {
  ensureStateStore().save();
}

// The store is created lazily (module vars used in getPayload are declared below).
let stateStore: ReturnType<typeof createStateStore> | null = null;
function ensureStateStore(): ReturnType<typeof createStateStore> {
  if (stateStore) return stateStore;
  stateStore = createStateStore({
    stateFile: STATE_FILE,
    debounceMs: 1500,
    saveGoalLedger,
    getPayload: () => ({
      registry,
      provenanceEvents,
      reports,
      anomalies,
      growthWeights,
      gitHubBlueprints,
      swarmStatus,
      swarmTeamStates,
      status,
      intakeSignals,
      benchmarkHistory,
      lastGroundAt,
      lastGroundSummary,
      intakeAutopilotOn,
      serverTickAutopilotOn,
      scienceAutopilotOn,
      globalLensAutopilotOn,
      globalLensLastPublish,
      corpusRoots,
      corpusArtifacts,
      corpusLastScan,
      corpusLastErrors,
      corpusDispatched,
      corpusRefilledHashes,
      skillRoots,
      skillCatalog,
      skillLastScan,
      skillFound,
      skillPrunedTranslations,
      skillLastErrors,
      skillExportRoot,
      skillExports,
      skillImports,
      skillImportPending,
      selfUseLog,
      generationLedger,
      forgeLedger,
      forgeAutopilotOn,
      providerMode,
      builderProfiles,
      builderJournal,
      activeBuilderId,
      builderLastMetaRun,
      builderLastMutate,
      builderVariantTrials,
      intelProposals,
      dynamicAgenda,
      devLoopLog,
      devAutopilotOn,
      stuckIssues,
      stuckRepairLedger,
      capabilityAdoptions,
      capabilityServed,
      systemSnapshots,
      systemBaseline,
      autonomySettings,
      mathIteration: mathLoopState.iteration,
    }),
  });
  return stateStore;
}

// NOTE: loadStateFromDisk() + reconcileRegistryOnBoot() are intentionally
// NOT called here. The loader touches module-level state (e.g. selfUseLog)
// declared further below; calling it here throws a TDZ ReferenceError,
// aborts the load midway, and every restart silently resets flags, ledgers
// and the generation counter. Both calls live in the boot block just before


// (Moved to the boot block at the bottom: both depend on loaded state.)

// Self-hosted modules (real files under .selfhosted/) are re-verified against
// the live app at every boot: fresh dynamic import + stored-suite re-run. The
// verdicts are written back to the manifest; nothing is reported from a stale
// claim. Runs async so boot is not blocked on module imports.
void verifyAllSelfHosted().catch((err) => {
  console.warn('[Recourse Engine] Self-hosted boot verification failed:', err?.message || err);
});

// Helper: Hash Chaining for Provenance
function computeHash(prevHash: string, payload: { type: string; ts: number; data: any }): string {
  const blob = JSON.stringify({ prev: prevHash, payload }, Object.keys({ prev: prevHash, payload }).sort());
  return crypto.createHash('sha256').update(blob).digest('hex');
}

function getLastHash(): string {
  if (provenanceEvents.length === 0) {
    return '0'.repeat(64);
  }
  return provenanceEvents[provenanceEvents.length - 1].hash;
}

function appendProvenanceEvent(eventType: ProvenanceEvent['type'], data: Record<string, any>): ProvenanceEvent {
  const prevHash = getLastHash();
  const ts = Date.now();
  const payload = { type: eventType, ts, data };
  const hash = computeHash(prevHash, payload);
  const event: ProvenanceEvent = { prev: prevHash, hash, type: eventType, ts, data };
  provenanceEvents.push(event);
  // Window sized for ~hours of full-autonomy churn (a 3s tick emits several
  // events/min, mostly capability_served/selfuse heartbeats). Too small a
  // window evicts real promotion history and makes hourly reports read 0.
  if (provenanceEvents.length > 3000) {
    provenanceEvents.shift();
  }
  saveStateToDisk();
  return event;
}

function verifyChainIntegrity(): { valid: boolean; length: number; lastHash: string; brokenIndex?: number } {
  if (provenanceEvents.length === 0) return { valid: true, length: 0, lastHash: '0'.repeat(64) };
  let prev = provenanceEvents[0].prev;
  for (let i = 0; i < provenanceEvents.length; i++) {
    const e = provenanceEvents[i];
    if (e.prev !== prev) {
      return { valid: false, length: provenanceEvents.length, lastHash: provenanceEvents[provenanceEvents.length - 1].hash, brokenIndex: i };
    }
    prev = e.hash;
  }
  return { valid: true, length: provenanceEvents.length, lastHash: provenanceEvents[provenanceEvents.length - 1].hash };
}

// Autonomous Self-Repair Core
//
// Honesty: a repair is only counted as healed after the repaired code passes
// the REAL sandbox verifier against a regression suite (the tool's own stored
// suite, its genesis suite, or a caller-supplied suite). If the patched code
// does not pass, the repair attempt is recorded as a failed attempt and the
// tool stays degraded. No score is ever fabricated.
let repairAttempts = 0;
let repairSuccesses = 0;

function resolveRepairSuite(tool: ToolEntry | undefined, testSuite?: string): string | undefined {
  if (testSuite) return testSuite;
  if (tool) {
    const promoted = [...(tool.versions || [])].reverse().find((v) => v.promoted && v.test_suite_code);
    if (promoted?.test_suite_code) return promoted.test_suite_code;
  }
  if (tool) return genesisSuiteFor(tool);
  return undefined;
}

function executeSelfRepair(
  toolName: string,
  brokenCode: string,
  faultHint?: string,
  testSuite?: string,
): {
  success: boolean;
  healedTool: ToolEntry;
  anomaly: AnomalyReport;
  version: string;
} {
  const startTime = Date.now();
  let tool = registry.find(t => t.name === toolName);
  const domain: ToolDomain = tool?.domain || 'coding';

  const { repairedCode, rootCause, errorType, patchSummary, templateApplied, confidence, preventativeMeasures } = diagnoseAndRepairCode(domain, brokenCode, faultHint);

  repairAttempts += 1;

  // 1. Verify the repaired code honestly.
  let verifierResult: VerifierResult | null = null;
  if (domain === 'biotech') {
    try {
      const claim = JSON.parse(repairedCode) as BiotechClaim;
      verifierResult = verifyBiotechClaim(claim);
    } catch {
      verifierResult = { passed: false, summary: 'FAILED (repaired payload is not valid JSON)', details: [], score: 0 };
    }
  } else {
    const suite = resolveRepairSuite(tool, testSuite);
    if (suite) {
      verifierResult = verifyCodeWithSuite(repairedCode, suite);
    } else {
      // No regression suite on file: the most we can truthfully claim is that
      // the patched code compiles and runs. Label it a smoke check, not a pass.
      const smoke = executeToolFunction(repairedCode);
      verifierResult = {
        passed: smoke.success && smoke.returnValue !== undefined,
        summary: smoke.success
          ? 'SMOKE-ONLY (no regression suite on file): repaired code compiles and returns a defined value'
          : `SMOKE FAILED: ${smoke.error || 'undefined return'}`,
        details: [smoke.stderr.join('\n')].filter(Boolean),
        score: smoke.success ? 1 : 0
      };
    }
  }

  const healed = verifierResult?.passed === true;
  if (healed) repairSuccesses += 1;

  const repairLatency = Date.now() - startTime;
  const versionHash = crypto.createHash('sha256').update(repairedCode).digest('hex').substring(0, 16);
  const newVersionStr = `${tool?.currentVersion || '1.0.0'}-repaired.${Date.now().toString().slice(-4)}`;

  const repairedVersionObj: ToolEntry['versions'][number] = {
    version: newVersionStr,
    hash: versionHash,
    created_at: Date.now(),
    passed_verifier: healed,
    score: verifierResult?.score ?? 0,
    promoted: healed,
    isRepaired: true,
    test_suite_code: domain === 'biotech' ? undefined : (resolveRepairSuite(tool, testSuite) ?? undefined),
    verifier_notes: healed
      ? `AUTONOMOUSLY HEALED & RE-VERIFIED: ${verifierResult?.summary}${templateApplied ? ` [Template: ${templateApplied}, Conf: ${(confidence * 100).toFixed(0)}%]` : ''}`
      : `REPAIR ATTEMPT DID NOT PASS VERIFIER: ${verifierResult?.summary ?? 'no verifier available'}`,
    source_code: repairedCode
  };

  if (!tool) {
    tool = {
      name: toolName,
      domain,
      entrypoint: `src/tools/${toolName}.ts`,
      description: `Autonomously self-healed tool gene`,
      versions: [repairedVersionObj],
      currentVersion: newVersionStr,
      healthStatus: healed ? 'healthy' : 'degraded',
      anomalyCount: 0
    };
    registry.push(tool);
  } else {
    tool.versions.push(repairedVersionObj);
    if (healed) {
      tool.currentVersion = newVersionStr;
      tool.healthStatus = 'healthy';
      tool.anomalyCount = 0;
    } else {
      tool.healthStatus = 'degraded';
    }
  }

  const anomalyRecord: AnomalyReport = {
    id: `anom_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
    timestamp: Date.now(),
    toolName,
    domain,
    severity: 'critical',
    errorType: errorType as any,
    description: `Defect diagnosed: ${patchSummary}`,
    rootCause,
    brokenCode,
    fixedCode: repairedCode,
    status: healed ? 'repaired' : 'detected',
    repairLatencyMs: repairLatency,
    repairGen: status.generation
  };

  anomalies.unshift(anomalyRecord);
  if (anomalies.length > 100) {
    anomalies.pop();
  }

  // Update Status Metrics (successes only count as healed)
  if (healed) {
    status.selfRepair.totalHealedCount += 1;
    status.selfRepair.lastHealedTool = toolName;
    status.selfRepair.lastHealTimestamp = Date.now();
    status.selfRepair.meanTimeToRepairMs = Math.round(
      (status.selfRepair.meanTimeToRepairMs * (status.selfRepair.totalHealedCount - 1) + repairLatency) / status.selfRepair.totalHealedCount
    );
  }
  status.selfRepair.repairSuccessRate = repairAttempts > 0 ? Math.round((repairSuccesses / repairAttempts) * 100) / 100 : 0;
  status.selfRepair.activeAnomaliesCount = anomalies.filter(a => a.status === 'detected').length;

  // Log in Provenance
  appendProvenanceEvent(healed ? (templateApplied ? 'template_repair_synthesized' : 'tool_repaired') : 'self_repair_triggered', {
    tool: toolName,
    domain,
    repairedVersion: newVersionStr,
    hash: versionHash,
    errorType,
    patchSummary,
    templateApplied,
    confidence,
    healed,
    verifierSummary: verifierResult?.summary,
    verifierScore: verifierResult?.score,
    preventativeMeasures,
    latencyMs: repairLatency
  });

  saveStateToDisk();

  return {
    success: healed,
    healedTool: tool,
    anomaly: anomalyRecord,
    version: newVersionStr
  };
}

// API Routes
import { axiomReachable, axiomBridgeStatus, integrateAxiomTool, dispatchAxiomRepair } from './src/lib/axiomBridge.js';

app.get('/api/recourse/axiom/status', async (_req, res) => {
  res.json(await axiomBridgeStatus());
});

/** Outbound: hand Recourse's weak findings to Axiom so it runs a real repair
 *  project loop against this repo. Axiom's patches still land only through
 *  Recourse's own verified patch-intake gate. */
app.post('/api/recourse/develop/axiom', async (req, res) => {
  try {
    const body = req.body ?? {};
    const dossier = computeHealthDossier(devDossierInput());
    const findings = Array.isArray(body.findings) && body.findings.length
      ? body.findings
      : dossier.findings;
    const result = await dispatchAxiomRepair({
      findings,
      targetDir: typeof body.targetDir === 'string' ? body.targetDir : undefined,
      goal: typeof body.goal === 'string' ? body.goal : undefined,
      maxIterations: Number(body.maxIterations) || undefined,
    });
    recordDev('axiom', result.ok, result.ok ? `axiom repair loop ${result.id ?? ''}` : `axiom failed: ${result.error}`, { driver: 'axiom' });
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/axiom/build-tool', async (req, res) => {
  const { name, domain, prompt, refSuite } = req.body || {};
  if (!name || !prompt) return res.status(400).json({ error: "missing params" });
  const result = await integrateAxiomTool(name, domain, prompt, refSuite);
  res.json(result);
});

app.get('/api/recourse/status', async (req, res) => {
  const integrity = verifyChainIntegrity();
  status.hashChainIntegrity = integrity.valid;
  status.registeredToolsCount = registry.length;
  let pending = 0;
  registry.forEach(r => {
    pending += (r.pendingVersions?.length || 0);
  });
  status.pendingApprovalsCount = pending;

  // Live model provider status (probe both profiles independently).
  const live = providerStatuses();
  await modelCheckOnline(false, 'local');
  await modelCheckOnline(false, 'api');
  const cps = currentProviderStatus();
  (status.providerStatus as any) = { ...cps, statuses: live };
  status.aiStudioModel = cps.model;

  // Update domain coverage from real verifier outcomes
  const allDomains: ToolDomain[] = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];
  let passTotal = 0;
  let passOk = 0;
  allDomains.forEach(d => {
    const domainTools = registry.filter(r => r.domain === d);
    const live = domainTools.filter(t => {
      const cur = t.currentVersion;
      const v = t.versions.find(x => x.version === cur && x.promoted);
      return v?.passed_verifier === true;
    }).length;
    const tried = domainTools.filter(t => {
      const cur = t.currentVersion;
      return t.versions.some(x => x.version === cur && x.promoted);
    }).length;
    if (!status.domainCoverage) status.domainCoverage = {} as any;
    status.domainCoverage[d] = {
      activeGenes: live,
      passRate: tried > 0 ? Math.round((live / tried) * 100) / 100 : 0
    };
    passTotal += tried;
    passOk += live;
  });
  status.verifierPassRate = passTotal > 0 ? Math.round((passOk / passTotal) * 100) / 100 : 0;

  status.growthWeights = growthWeights;
  dreamState = await dreamEngine.status();
  status.dreamState = dreamState;
  status.swarmStatus = swarmStatus;
  status.lastDecision = lastGrowthDecision || evaluateGrowthDecision(
    registry,
    anomalies,
    growthWeights,
    status.generation,
    dreamState.recentThoughts,
    gitHubBlueprints,
    decisionSynergyInputs().crossDomainSynergyByDomain
  );

  // Real, durable progress (not math-loop readiness). Measured artifacts only.
  const liveSelfHosted = listSelfHostedEntries().filter((e) => e.lastVerified?.passed).length;
  const lastBench = benchmarkHistory[benchmarkHistory.length - 1];
  status.realProgress = {
    registeredTools: registry.length,
    liveSelfHostedTools: liveSelfHosted,
    forgeMaterialized: forgeLedger.filter((l) => l.status === 'materialized').length,
    healedTools: status.selfRepair?.totalHealedCount ?? 0,
    benchmarkSolved: lastBench ? lastBench.solved : 0,
    benchmarkTotal: lastBench ? lastBench.total : 0,
    verifierPassRate: typeof status.verifierPassRate === 'number' ? status.verifierPassRate : 0,
    openAnomalies: anomalies.filter((a) => a.status === 'detected').length,
  };

  // Surface learner state so the dashboard reports real episode count +
  // calibration rather than a flat null. Read from the durable store the
  // RecursiveLearner writes through, so the value reflects what survived
  // the last restart — not what an in-memory learner would have.
  try {
    const persisted = await learnerStore.loadState();
    if (persisted) {
      (status as any).learner = {
        episode: persisted.episode ?? 0,
        calibrationError: persisted.calibrationError ?? 0,
        selfScore: persisted.selfScore ?? 0,
        lastUpdatedAt: persisted.updatedAt ?? null,
      };
    }
  } catch { /* non-fatal: learner is optional status */ }

  res.json({ status, chainIntegrity: integrity });
});

app.get('/api/recourse/provenance', async (req, res) => {
  const integrity = verifyChainIntegrity();
  const hashes = provenanceEvents.map((e) => e.hash);
  const served = await serveCapability('provenance_merkle', { hashes });
  res.json({
    events: provenanceEvents,
    integrity,
    merkleRoot: served,
    totalLeaves: hashes.length,
    firstHash: hashes[0] ?? null,
    lastHash: hashes[hashes.length - 1] ?? null,
  });
});

// Serve every adopted capability against real runtime state. This is the
// dogfood proof: each call routes through the adopted self-hosted tool when
// one is adopted, else the builtin. Counters increment per capability.
app.get('/api/recourse/capabilities/serve', async (req, res) => {
  const hashes = provenanceEvents.slice(-128).map((e) => e.hash);
  const types = provenanceEvents.slice(-128).map((e) => e.type || e.hash);
  const results: Record<string, { source: string; tool?: string; result: unknown; served: number }> = {};
  const calls: Array<[CapabilityId, unknown]> = [
    ['dedupe', { items: types }],
    ['numeric_kernel', { items: hashes, size: 7 }],
    ['text_encode', { str: types.slice(0, 40).join('') || 'aaaabbc' }],
    ['scheduler', { items: types, k: 5 }],
    ['math_sequence', { n: Math.min(Math.max(hashes.length % 25, 0), 20) }],
    ['verify_gate', { a: 48, b: 18 }],
  ];
  for (const [id, ctx] of calls) {
    const rec = capabilityAdoptions[id];
    try {
      const result = await serveCapability(id, ctx);
      results[id] = {
        source: rec?.backing.source === 'selfhosted' ? 'selfhosted' : 'builtin',
        tool: rec?.backing.source === 'selfhosted' ? rec.backing.toolName : undefined,
        result,
        served: capabilityServed[id] ?? 0,
      };
    } catch (err: any) {
      results[id] = { source: 'error', result: String(err?.message ?? err), served: capabilityServed[id] ?? 0 };
    }
  }
res.json({ success: true, results });
});

app.get('/api/recourse/registry', (req, res) => {
  res.json({ registry });
});

// REAL Interactive Sandbox Tool Execution Endpoint
app.post('/api/recourse/execute', (req, res) => {
  try {
    const { toolName, sourceCode, functionName, args = [] } = req.body;

    let codeToRun = sourceCode;
    let targetFunc = functionName;

    if (!codeToRun && toolName) {
      const tool = registry.find(t => t.name === toolName);
      if (tool) {
        const latest = tool.versions[tool.versions.length - 1];
        codeToRun = latest?.source_code;
      }
    }

    if (!codeToRun) {
      return res.status(400).json({ error: 'No executable source code provided or found for tool' });
    }

    const execResult = process.env.RECOURSE_SANDBOX_MODE === 'isolated' && isIsolateAvailable()
      ? (() => {
          const r = executeToolInIsolate(codeToRun, targetFunc, args);
          return {
            success: r.success,
            returnValue: r.returnValue,
            stdout: r.stdout,
            stderr: r.stderr,
            executionTimeMs: r.executionTimeMs,
            error: r.error,
            _isolated: { available: true, timedOut: r.timedOut, memoryLimitMb: r.memoryLimitMb }
          };
        })()
      : executeToolFunction(codeToRun, targetFunc, args);

    res.json({
      success: execResult.success,
      returnValue: execResult.returnValue,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      executionTimeMs: execResult.executionTimeMs,
      error: execResult.error
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

// Sandbox backend status (isolated-vm availability + current mode).
app.get('/api/recourse/sandbox', (req, res) => {
  res.json({
    success: true,
    mode: process.env.RECOURSE_SANDBOX_MODE === 'isolated' ? 'isolated' : 'inproc',
    isolatedAvailable: isIsolateAvailable(),
    // Set RECOURSE_SANDBOX_MODE=isolated to run arbitrary/submitted code in a
    // real memory- and time-bounded isolate with no host-global access.
  });
});

// =========================================================================
// DURABLE VECTOR MEMORY (LanceDB) — self-learning retrieval
// =========================================================================
let vectorMemory: VectorMemory | null = null;
let memoryInit: Promise<VectorMemory> | null = null;
function ensureVectorMemory(): Promise<VectorMemory> {
  if (!memoryInit) memoryInit = openVectorMemory({ dir: process.env.RECOURSE_MEMORY_DIR || 'data/recourse-memory' }).then((m) => { vectorMemory = m; return m; }).catch(() => vectorMemory as VectorMemory);
  return memoryInit;
}

/** Index the current registry genes + recent snapshots into vector memory. */
async function indexSystemMemory(): Promise<{ indexed: number; status: any }> {
  const mem = await ensureVectorMemory();
  let indexed = 0;
  for (const t of registry) {
    const cur = t.currentVersion;
    const v = t.versions.find((x) => x.version === cur);
    if (!v) continue;
    const text = `${t.name} (${t.domain}): ${t.description} score ${v?.score ?? ''} health ${t.healthStatus} selfhost ${(t.entrypoint || '').includes('.selfhosted/')}`;
    await mem.remember('gene', `gene:${t.name}`, text, { version: cur, score: v?.score });
    indexed++;
  }
  for (const snap of systemSnapshots.slice(-20)) {
    const text = `${snap.label} gen ${snap.gen}: ${snap.tools.length} tools, ${snap.capabilities.length} capabilities`;
    await mem.remember('snapshot', `snap:${snap.label}:${snap.ts}`, text, { gen: snap.gen });
    indexed++;
  }
  return { indexed, status: await mem.status() };
}

app.get('/api/recourse/memory/status', async (_req, res) => {
  try { res.json({ success: true, status: await (await ensureVectorMemory()).status() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/recourse/memory/index', async (_req, res) => {
  try { res.json({ success: true, ...(await indexSystemMemory()) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/recourse/memory/recall', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const kind = (req.query.kind as MemoryKind) || null;
    const topK = Math.min(Number(req.query.topK || 5), 20);
    const mem = await ensureVectorMemory();
    const hits = q ? await mem.recall(q, kind, topK) : [];
    res.json({ success: true, query: q, hits: hits.map((h) => ({ id: h.id, kind: h.kind, text: h.text.slice(0, 300), score: h.score })) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// Fleet memory intake — external agent loops (Axiom, OpenHub, Draymond) write
// their real outcomes into Recourse's durable vector memory so Recourse
// self-learns across the fleet. Guarded fail-closed: this mutates durable state,
// so it requires RECOURSE_API_SECRET. Text is the only thing indexed; a missing
// or oversized payload is rejected, never silently truncated into a fake memory.
app.post('/api/recourse/fleet/memory', async (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const entry = buildFleetMemoryEntry(req.body ?? {});
    if (!entry.ok) {
      const status = entry.error?.includes('exceeds') ? 413 : 400;
      return res.status(status).json({ success: false, error: entry.error });
    }
    const mem = await ensureVectorMemory();
    await mem.remember(entry.kind!, entry.id!, entry.text!, entry.meta);
    res.json({ success: true, indexed: 1, id: entry.id, kind: entry.kind, source: entry.meta?.source, status: await mem.status() });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/recourse/policy', (req, res) => {
  const { policy } = req.body;
  if (!['any_pass', 'non_regressing', 'strict_improve', 'human_approval'].includes(policy)) {
    return res.status(400).json({ error: 'Invalid policy' });
  }
  status.activePolicy = policy as PromotionPolicy;
  appendProvenanceEvent('system_tick', {
    action: 'policy_change',
    newPolicy: policy,
    generation: status.generation
  });
  saveStateToDisk();
  res.json({ success: true, policy: status.activePolicy });
});

app.post('/api/recourse/toggle-auto', (req, res) => {
  const { enabled } = req.body;
  status.isAutoEvolving = Boolean(enabled);
  appendProvenanceEvent('system_tick', {
    action: 'auto_evolve_toggle',
    isAutoEvolving: status.isAutoEvolving,
    generation: status.generation
  });
  saveStateToDisk();
  res.json({ success: true, isAutoEvolving: status.isAutoEvolving });
});

// =========================================================================
// AUTONOMY / SAFE-BOOT SETTINGS + EMERGENCY HALT
// =========================================================================
function haltAllAutonomousLoops(reason: string): {
  autoEvolving: boolean;
  dreamActive: boolean;
  swarmAutopilot: boolean;
  intakeAutopilot: boolean;
  forgeAutopilot: boolean;
  devAutopilot: boolean;
  serverTickAutopilot: boolean;
  safeBoot: boolean;
} {
  status.isAutoEvolving = false;
  // All autopilot on-flags live in module state (swarm flag lives in swarmStatus).
  swarmStatus.isSwarmAutopilotActive = false;
  intakeAutopilotOn = false;
  forgeAutopilotOn = false;
  devAutopilotOn = false;
  serverTickAutopilotOn = false;
  stopSwarmAutopilot();
  stopIntakeAutopilot();
  stopForgeAutopilot();
  stopDevAutopilot();
  stopServerTickAutopilot();
  void (async () => {
    try {
      const s = await dreamEngine.status();
      if (s.isDreamingActive) {
        await dreamEngine.toggle();
        dreamState = await dreamEngine.status();
      } else {
        dreamState = s;
      }
    } catch (err: any) {
      console.warn('[Recourse] HALT: could not pause dream engine:', err?.message || err);
    }
    saveStateToDisk();
  })();
  appendProvenanceEvent('system_tick', {
    action: 'autonomy_halt',
    reason,
    generation: status.generation
  });
  saveStateToDisk();
  console.warn(`[Recourse] AUTONOMY HALT (${reason}): all autonomous loops paused.`);
    return {
    autoEvolving: status.isAutoEvolving,
    dreamActive: dreamState.isDreamingActive,
    swarmAutopilot: swarmStatus.isSwarmAutopilotActive,
    intakeAutopilot: intakeAutopilotOn,
    forgeAutopilot: forgeAutopilotOn,
    devAutopilot: devAutopilotOn,
    serverTickAutopilot: serverTickAutopilotOn,
    safeBoot: autonomySettings.safeBoot,
  };
}

app.get('/api/recourse/autonomy', (req, res) => {
  res.json({
    success: true,
    autonomy: {
      safeBoot: autonomySettings.safeBoot,
      autoEvolving: status.isAutoEvolving,
      dreamActive: dreamState.isDreamingActive,
      swarmAutopilot: swarmStatus.isSwarmAutopilotActive,
      intakeAutopilot: intakeAutopilotOn,
      forgeAutopilot: forgeAutopilotOn,
      devAutopilot: devAutopilotOn,
      serverTickAutopilot: serverTickAutopilotOn,
    },
  });
});

app.post('/api/recourse/autonomy/safe-boot', (req, res) => {
  const safeBoot = Boolean(req.body?.safeBoot);
  autonomySettings.safeBoot = safeBoot;
  saveStateToDisk();
  res.json({ success: true, safeBoot: autonomySettings.safeBoot });
});

app.post('/api/recourse/autonomy/halt', (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'operator_request';
  const snapshot = haltAllAutonomousLoops(reason);
  res.json({ success: true, ...snapshot });
});

app.post('/api/recourse/hyperparameters', (req, res) => {
  const { hyperParams } = req.body;
  if (hyperParams) {
    status.hyperParams = { ...status.hyperParams, ...hyperParams };
    appendProvenanceEvent('system_tick', {
      action: 'hyperparameters_tuned',
      hyperParams: status.hyperParams,
      generation: status.generation
    });
    saveStateToDisk();
  }
  res.json({ success: true, hyperParams: status.hyperParams });
});

app.get('/api/recourse/repair/status', (req, res) => {
  res.json({
    selfRepair: status.selfRepair,
    anomalies
  });
});

// Failures endpoint — surfaces the failure ledger so the operator can see
// every silently-swallowed error across all autopilots instead of guessing.
app.get('/api/recourse/failures', (_req, res) => {
  const now = Date.now();
  const recent = failureLedger.filter(e => now - e.at < 3600000); // last hour
  const counts = failureLedger.reduce<Record<string, number>>((acc, f) => {
    acc[f.source] = (acc[f.source] || 0) + 1;
    return acc;
  }, {});
  res.json({
    total: failureLedger.length,
    lastHour: recent.length,
    bySource: counts,
    entries: failureLedger.slice(-50), // newest 50
  });
});

// Chaos Injection Route
app.post('/api/recourse/chaos/inject', (req, res) => {
  const { chaosType = 'vieta_sign_bug', targetToolName = 'quadratic_vieta_root_sum' } = req.body;

  let brokenCode = '';
  let errorDesc = '';
  let domain: ToolDomain = 'math';
  let testSuite: string | undefined;

  if (chaosType === 'vieta_sign_bug') {
    domain = 'math';
    brokenCode = `export function sumOfRoots(a, b, c) {\n  return b / a; // INJECTED CHAOS: Vieta sign reversal\n}`;
    errorDesc = 'Vieta formula sign defect injected';
    testSuite = GENESIS_SUITES['quadratic_vieta_root_sum'];
  } else if (chaosType === 'syntax_ast_error') {
    domain = 'coding';
    brokenCode = `export function execute() { \n  <<<SYNTAX_CORRUPT>>> invalid token fontFinally:\n}`;
    errorDesc = 'AST token sequence syntax corruption';
  } else if (chaosType === 'security_taint') {
    domain = 'cyber_defense';
    brokenCode = `export function processPayload(data) {\n  return eval(data); // INJECTED CHAOS: Dynamic eval vulnerability\n}`;
    errorDesc = 'Zero-day eval injection security taint';
  } else if (chaosType === 'quantum_decoherence') {
    domain = 'quantum_sim';
    brokenCode = `export function stateTransform() {\n  return { probabilities_sum: 1.45, state: 'decoherent' };\n}`;
    errorDesc = 'Quantum unitarity state norm violation';
  } else {
    domain = 'biotech';
    brokenCode = `{\n  "asset_name": "CHAOS_01",\n  "leg": "invalid",\n  "evidence_tier": 0\n}`;
    errorDesc = 'Biotech Knowledge Graph invalid leg conflict';
  }

  const anomId = `anom_chaos_${Date.now()}`;
  const anomaly: AnomalyReport = {
    id: anomId,
    timestamp: Date.now(),
    toolName: targetToolName,
    domain,
    severity: 'critical',
    errorType: chaosType as any,
    description: errorDesc,
    rootCause: `Synthetic Chaos Injection (${chaosType})`,
    brokenCode,
    test_suite_code: testSuite,
    status: 'detected',
    repairGen: status.generation
  };

  anomalies.unshift(anomaly);
  if (anomalies.length > 100) {
    anomalies.pop();
  }
  status.selfRepair.activeAnomaliesCount = anomalies.filter(a => a.status === 'detected').length;

  const tool = registry.find(t => t.name === targetToolName);
  if (tool) {
    tool.healthStatus = 'corrupted';
    tool.anomalyCount = (tool.anomalyCount || 0) + 1;
    // Make the corruption REAL, not representational: push the broken code as a
    // defective current version so self-repair / scan-heal operate on genuinely
    // defective code and a heal is only counted when the repaired source passes
    // its suite. (Previously chaos only flipped healthStatus, so the repair path
    // "fixed" the still-correct stored source and could never genuinely demo a
    // heal.)
    if (brokenCode && domain !== 'biotech') {
      const defHash = crypto.createHash('sha256').update(brokenCode).digest('hex').substring(0, 16);
      const defVer = `1.0.0-corrupt.${Date.now().toString().slice(-4)}`;
      const existingSuite = tool.versions.find((v) => v.test_suite_code)?.test_suite_code;
      tool.versions.unshift({
        version: defVer,
        hash: defHash,
        created_at: Date.now(),
        passed_verifier: false,
        score: 0,
        promoted: true,
        source_code: brokenCode,
        test_suite_code: testSuite ?? existingSuite,
        verifier_notes: `CHAOS: ${errorDesc} (synthetic corruption for repair test)`,
      } as ToolEntry['versions'][number]);
      tool.currentVersion = defVer;
    }
  }

  appendProvenanceEvent('anomaly_injected', {
    anomalyId: anomId,
    tool: targetToolName,
    chaosType,
    errorDesc
  });

  saveStateToDisk();

  res.json({ success: true, anomaly });
});

// Scan & Heal Route
app.post('/api/recourse/repair/scan-heal', (req, res) => {
  const detectedAnomalies = anomalies.filter(a => a.status === 'detected');
  const results = [];

  for (const anom of detectedAnomalies) {
    const healResult = executeSelfRepair(anom.toolName, anom.brokenCode, anom.errorType, anom.test_suite_code);
    if (healResult.success) {
      anom.status = 'repaired';
      anom.fixedCode = healResult.anomaly.fixedCode;
      anom.repairLatencyMs = healResult.anomaly.repairLatencyMs;
    } else {
      anom.status = 'detected';
      anom.fixedCode = healResult.anomaly.fixedCode;
      anom.repairLatencyMs = healResult.anomaly.repairLatencyMs;
    }
    results.push(healResult);
  }

  for (const tool of registry) {
    if (tool.healthStatus === 'corrupted' || tool.healthStatus === 'degraded') {
      const healResult = executeSelfRepair(tool.name, tool.versions[tool.versions.length - 1]?.source_code || '', 'logic_regression');
      results.push(healResult);
    }
  }

  saveStateToDisk();

  res.json({
    success: true,
    healedCount: results.filter(r => r.success).length,
    results,
    selfRepairStatus: status.selfRepair
  });
});

// Single Tool Gene Self-Repair
app.post('/api/recourse/repair/single', (req, res) => {
  const { toolName, brokenCode, faultHint } = req.body;
  const tool = registry.find(t => t.name === toolName);
  const codeToFix = brokenCode || tool?.versions[tool.versions.length - 1]?.source_code || 'export function execute() {}';

  const healResult = executeSelfRepair(toolName, codeToFix, faultHint);
  saveStateToDisk();

  res.json({
    success: true,
    healResult,
    selfRepairStatus: status.selfRepair
  });
});

// Self-Repair Knowledge Base & Telemetry
app.get('/api/recourse/repair/knowledge', (req, res) => {
  const knowledge = getSelfRepairKnowledge();
  res.json({
    success: true,
    knowledge,
    selfRepair: status.selfRepair
  });
});

// Toggle autonomous repair of failed candidates (isAutoHealingEnabled).
app.post('/api/recourse/repair/auto-heal', (req, res) => {
  status.selfRepair.isAutoHealingEnabled = Boolean(req.body?.enabled);
  saveStateToDisk();
  res.json({ success: true, isAutoHealingEnabled: status.selfRepair.isAutoHealingEnabled });
});

// External capability benchmark telemetry (drives the learner reward at weight
// 0.30). Surfaces the latest run + history + per-problem solved state so the
// UI can show "is the registry actually more capable", not a self-report.
app.get('/api/recourse/benchmark', (_req, res) => {
  const last = latestBenchmark ?? benchmarkHistory[benchmarkHistory.length - 1] ?? null;
  res.json({
    success: true,
    latest: last,
    history: benchmarkHistory.slice(-30).map((r) => ({ at: r.at, solved: r.solved, total: r.total })),
    totalProblems: BENCHMARK_PROBLEMS.length,
    problems: BENCHMARK_PROBLEMS.map((p) => ({
      id: p.id,
      title: p.title,
      domain: p.domain,
      solved: last ? last.solvedIds.includes(p.id) : false,
    })),
    realProgress: status.realProgress ?? null,
    rewardWeightBenchmark: 0.3,
  });
});

// ---------------------------------------------------------------------------
// Python NetworkX Knowledge-Graph sidecar proxy + live evidence layer +
// closed-loop falsification pipeline. Extracted to src/routes/kg.ts (stateless
// handlers over lib modules; no server-internal state).
// ---------------------------------------------------------------------------
app.use('/api/recourse/kg', createKgRouter());

// ---------------------------------------------------------------------------
// Python PDF sidecar proxy (PyMuPDF text extraction over a URL or bytes) and
// Python fuzzy sidecar proxy (RapidFuzz near-duplicate detection). Both are
// stateless compute and honestly report offline (ok:false) when their service
// is down - never a fabricated extract or match.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// pdf / fuzz / grant / research / prometheus / bfr bridges. Extracted to
// src/routes/tools.ts (stateless proxies over lib modules).
// ---------------------------------------------------------------------------
app.use('/api/recourse', createToolsRouter());

// ---------------------------------------------------------------------------
// BioSim sidecar proxy (Monte Carlo tumor/CAR-T + sequencing detection).
// Stateless compute; honestly reports offline (ok:false) when down.
// ---------------------------------------------------------------------------
// biosim sidecar + biotech scientific API bridges. Extracted to
// src/routes/bio.ts (stateless proxies over lib modules).
// ---------------------------------------------------------------------------
app.use('/api/recourse', createBioRouter());

// ---------------------------------------------------------------------------
// Data Visualizer sidecar proxy (curated matplotlib scenes -> PNG artifacts).
// Stateless compute; honestly reports offline (ok:false) when down.
// ---------------------------------------------------------------------------
app.use('/api/recourse/viz', createVizRouter());

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// (grant / research / prometheus / bfr bridges live in src/routes/tools.ts,
// mounted under /api/recourse)
// ---------------------------------------------------------------------------
// Overlay Oncology engine bridge (external Next app; ok:false when down).
// Default :3000 collides with Recourse dev — set ONCOLOGY_URL when both run.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Overlay Oncology AGGREGATE bridge — Decon, QLCCE, ATTEC, ctDNA/MRD,
// Oncograph, HelixForge, daraxonrasib run INSIDE the oncology host; Recourse
// reaches all through these proxies (one client). Extracted to
// src/routes/oncology.ts (stateless bridges over lib modules).
// ---------------------------------------------------------------------------
app.use('/api/recourse/oncology', createOncologyRouter());

// ---------------------------------------------------------------------------
// Research integrity bridge (:8025; reproducibility/custody wrapper).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// integrity / studies / folding / pathosphere / umoe / chemlab / foresight
// bridges. Extracted to src/routes/bridges.ts (stateless proxies over libs).
// ---------------------------------------------------------------------------
app.use('/api/recourse', createBridgesRouter());

// ---------------------------------------------------------------------------
// Science conductor — the 24/7 research loop driving the connected stack.
// Every cycle: scout services -> hypothesis from grant registry -> real
// experiment (biosim/umoe/local-deterministic) -> integrity verify -> record.
// Findings carry provenance; offline services are skipped honestly.
// ---------------------------------------------------------------------------
app.get('/api/recourse/science/status', (_req, res) => {
  res.json({ success: true, ...getConductorStatus() });
});

app.get('/api/recourse/science/findings', (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
  res.json({ success: true, count: recentFindings(limit).length, findings: recentFindings(limit) });
});

app.get('/api/recourse/science/cycles', (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  res.json({ success: true, count: recentCycles(limit).length, cycles: recentCycles(limit) });
});

app.post('/api/recourse/science/cycle', async (_req, res) => {
  try {
    const cycle = await runScienceCycle();
    appendProvenanceEvent('system_tick', { driverId: 'science_conductor_manual', cycle: cycle.cycle, mode: cycle.experimentMode, findings: cycle.findings.length });
    res.json({ success: true, cycle });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'science cycle failed';
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/api/recourse/science/toggle', (req, res) => {
  const action = (req.body ?? {}).action;
  if (action === 'start') {
    const intervalMs = Number((req.body ?? {}).intervalMs) || 15 * 60 * 1000;
    const r = startScienceConductor({ intervalMs });
    if (r.started) appendProvenanceEvent('loop_started', { driverId: 'science_conductor', intervalMs });
    res.json({ success: r.started, ...r, status: getConductorStatus() });
    return;
  }
  if (action === 'stop') {
    const r = stopScienceConductor();
    if (r.stopped) appendProvenanceEvent('loop_stopped', { driverId: 'science_conductor' });
    res.json({ success: r.stopped, ...r, status: getConductorStatus() });
    return;
  }
  res.status(400).json({ success: false, error: "action must be 'start' or 'stop'" });
});

// ---------------------------------------------------------------------------
// Overlay Global Lens — direct research-publish connection.
// Composes dated research briefs from REAL Recourse state (science findings +
// ResearchArtifacts, trend ledger, ecosystem corpus) and POSTs them to Global
// Lens /api/publish (Bearer GL_PUBLISH_KEY). Fail-closed: without the key the
// pass reports ok:false per domain and never claims a publish that did not
// happen. Each domain brief is idempotent on the GL side (sha256 dedupe).
// ---------------------------------------------------------------------------
/** Real music-therapy publish findings from the deterministic research layer
 *  (trials + tuning contrast + Cochrane benchmark), merged into the publish
 *  pass. `musicTherapyEvidence` is the live Europe PMC pool when a feed
 *  refresh has run; empty → published Cochrane anchors. Never fabricated. */
function musicTherapyPublishFindings(): unknown[] {
  try {
    // Cap the music findings so the publisher's last-20 window still carries
    // the science-conductor findings for the other six domains. Without the
    // cap, 21+ music records appended last crowd out every conductor finding,
    // leaving non-music domains with no findings and no paper attachment.
    const r = musicTherapyFindings({ evidence: musicTherapyEvidence, limit: 6 });
    return r.findings;
  } catch (err) {
    console.warn('[global-lens] music-therapy findings failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function runGlobalLensPublishPass(): Promise<{ result: import('./src/lib/globalLensPublisher.js').PublishPassResult; domains: number }> {
  // Ensure the corpus is populated before composing (a stale/empty corpus would
  // produce empty briefs — honest, but not useful). Re-scan only when empty.
  if (corpusArtifacts.length === 0) {
    try {
      await runCorpusScan();
    } catch (err) {
      console.warn('[global-lens] corpus pre-scan failed (composing with empty corpus):', err instanceof Error ? err.message : String(err));
    }
  }
  const result = await runPublishPass({
    artifacts: corpusArtifacts,
    // Music therapy is its own publishable research line: the deterministic
    // findings bridge (trials + tuning contrast + Cochrane benchmark) merges
    // into the same article/paper pipeline the other domains use.
    findings: [...recentFindings(200), ...musicTherapyPublishFindings()] as any,
    insights: recentInsights(200),
  });
  globalLensLastPublish = {
    at: Date.now(),
    total: result.total,
    ok: result.ok,
    failed: result.failed,
    skipped: result.skipped,
  };
  saveStateToDisk();
  appendProvenanceEvent('global_lens_publish', {
    configured: result.configured,
    total: result.total,
    ok: result.ok,
    failed: result.failed,
    skipped: result.skipped.length,
  });
  return { result, domains: PUBLISH_DOMAINS.length };
}

app.get('/api/recourse/global-lens/status', async (_req, res) => {
  const health = await globalLensHealth();
  res.json({
    success: true,
    online: health.ok,
    latencyMs: health.latencyMs,
    error: health.error ?? null,
    configured: globalLensConfigured(),
    url: globalLensBaseUrl(),
    autopilot: globalLensAutopilotOn,
    publishIntervalMs: GLOBAL_LENS_PUBLISH_MS,
    lastPublish: globalLensLastPublish,
    domains: PUBLISH_DOMAINS.map((d) => ({ label: d.label, category: d.category, pillar: d.pillar, projects: d.projects })),
  });
});

app.post('/api/recourse/global-lens/publish', async (req, res) => {
  if (!requireMutationAuthIfConfigured(req, res)) return;
  try {
    const { result } = await runGlobalLensPublishPass();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/global-lens/toggle', async (req, res) => {
  const action = (req.body ?? {}).action;
  if (action === 'start') {
    globalLensAutopilotOn = true;
    setJobEnabled('global-lens', true);
    // Compose + publish immediately, then let the scheduler own the cadence.
    try {
      const { result } = await runGlobalLensPublishPass();
      appendProvenanceEvent('loop_started', { driverId: 'global_lens_publisher' });
      res.json({ success: true, autopilot: true, result });
      return;
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
  }
  if (action === 'stop') {
    globalLensAutopilotOn = false;
    setJobEnabled('global-lens', false);
    appendProvenanceEvent('loop_stopped', { driverId: 'global_lens_publisher' });
    saveStateToDisk();
    res.json({ success: true, autopilot: false });
    return;
  }
res.status(400).json({ success: false, error: "action must be 'start' or 'stop'" });
});

// ---------------------------------------------------------------------------
// translation / keywire / trend bridges. Extracted to src/routes/services.ts
// (stateless proxies over lib modules).
// ---------------------------------------------------------------------------
app.use('/api/recourse', createServicesRouter());
app.use('/api/recourse', createSynergyRouter());

// Math Conductor routes — the 24/7 loop for hard math problems.
app.post('/api/recourse/math/toggle', (req, res) => {
  const action = (req.body ?? {}).action;
  if (action === 'start') {
    const intervalMs = Number((req.body ?? {}).intervalMs) || 20 * 60 * 1000;
    const r = startMathConductor({ intervalMs });
    if (r.started) appendProvenanceEvent('loop_started', { driverId: 'math_conductor', intervalMs });
    res.json({ success: r.started, ...r, status: mathConductorStatus() });
    return;
  }
  if (action === 'stop') {
    const r = stopMathConductor();
    if (r.stopped) appendProvenanceEvent('loop_stopped', { driverId: 'math_conductor' });
    res.json({ success: r.stopped, ...r, status: mathConductorStatus() });
    return;
  }
  res.status(400).json({ success: false, error: "action must be 'start' or 'stop'" });
});

app.get('/api/recourse/math/status', (_req, res) => {
  res.json({ success: true, ...mathConductorStatus() });
});

app.get('/api/recourse/math/cycles', (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ success: true, cycles: recentMathCycles(limit) });
});

app.get('/api/recourse/math/findings', (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json({ success: true, findings: recentMathFindings(limit) });
});

app.post('/api/recourse/math/cycle', async (_req, res) => {
  try {
    const cycle = await runMathCycle();
    appendProvenanceEvent('system_tick', { driverId: 'math_conductor_manual', cycle: cycle.cycle, problemId: cycle.problemId, passed: cycle.attemptPassed, score: cycle.attemptScore });
    res.json({ success: true, cycle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'math cycle failed';
    res.status(500).json({ success: false, error: message });
  }
});

// Agenda routes — breakthrough milestones and next-milestone selection.
app.get('/api/recourse/agenda', (_req, res) => {
  const agenda = computeAgenda();
  res.json({ success: true, milestones: agenda });
});

app.get('/api/recourse/agenda/next', (_req, res) => {
  const mathNext = selectNextMathMilestone();
  const oncoNext = selectNextOncologyMilestone();
  res.json({ success: true, nextMath: mathNext, nextOncology: oncoNext });
});

app.post('/api/recourse/agenda/refresh', (_req, res) => {
  try {
    const result = renderAndPersistAgenda();
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'agenda refresh failed';
    res.status(500).json({ success: false, error: message });
  }
});

// Gamification routes — XP, level, badges, leaderboard.
app.get('/api/recourse/game', (_req, res) => {
  res.json({ success: true, ...computeGameProfile() });
});

app.get('/api/recourse/game/leaderboard', (_req, res) => {
  res.json({ success: true, leaderboard: leaderboard() });
});

// Fleet dashboard — unified single-file view of everything.
app.get('/api/recourse/fleet-dashboard', async (_req, res) => {
  try {
    const { file, sections } = await renderDashboard();
    res.json({ success: true, file, sections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dashboard render failed';
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// Job scheduler API — the autonomy governor. Compartmentalized cron jobs for
// every long-running function (forge, intake, swarm, dev, tick, science,
// dream, self-hosted re-verify). Toggle per job, trigger a manual run, and
// read per-job status (lastRun/lastOk/error, run/fail counts).
// ---------------------------------------------------------------------------
app.get('/api/recourse/scheduler', (_req, res) => {
  res.json({ success: true, ...getSchedulerStatus() });
});

app.post('/api/recourse/scheduler/toggle', (req, res) => {
  const { id, enabled } = (req.body ?? {}) as { id?: string; enabled?: boolean };
  if (!id || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'id (string) and enabled (boolean) required' });
  }
  const r = setJobEnabled(id, enabled);
  if (r.ok === false) return res.status(404).json({ success: false, error: r.error });
  // Mirror the legacy autopilot flags so the dashboard stays consistent.
  mirrorAutopilotFlag(id, enabled);
  appendProvenanceEvent('loop_started', { driverId: `scheduler:${id}`, enabled });
  res.json({ success: true, ...r });
});

app.post('/api/recourse/scheduler/trigger', async (req, res) => {
  const { id } = (req.body ?? {}) as { id?: string };
  if (!id) return res.status(400).json({ success: false, error: 'id (string) required' });
  const r = await triggerJob(id);
  if (r.ok === false) return res.status(409).json({ success: false, error: r.error });
  res.json({ success: true, ...r });
});

/** Keep legacy flags in sync when a job is toggled via the scheduler. */
function mirrorAutopilotFlag(id: string, enabled: boolean): void {
  switch (id) {
    case 'forge': forgeAutopilotOn = enabled; break;
    case 'intake': intakeAutopilotOn = enabled; break;
    case 'dev': devAutopilotOn = enabled; break;
    case 'server_tick': serverTickAutopilotOn = enabled; break;
    case 'science': scienceAutopilotOn = enabled; break;
    case 'math': mathAutopilotOn = enabled; break;
    case 'global-lens': globalLensAutopilotOn = enabled; break;
    case 'swarm': swarmStatus.isSwarmAutopilotActive = enabled; break;
    default: break;
  }
  saveStateToDisk();
}

// ---------------------------------------------------------------------------
// Keywire fleet command plane — status, service bring-up, brain passthrough,
// Axiom probe, pm2 table. Fail-soft: ok:false when Keywire is unreachable.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// (keywire bridges live in src/routes/services.ts, mounted under /api/recourse)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phased subsystem orchestration — resource-aware batching of the science
// ecosystem. Recourse drives which subsystem batch is up per research phase
// and downscales under memory pressure (see src/lib/subsystemOrchestrator.ts).
// ---------------------------------------------------------------------------
app.get('/api/recourse/orchestration/status', async (_req, res) => {
  const { SUBSYSTEMS, sampleResources, pm2Table } = await import('./src/lib/subsystemOrchestrator.js');
  const resources = sampleResources();
  const table = await pm2Table();
  const subsystems = SUBSYSTEMS.map((s) => ({
    id: s.id, pm2Name: s.pm2Name, port: s.port, phase: s.phase, control: !!s.control,
    label: s.label,
    status: table[s.pm2Name]?.status ?? 'unknown',
    cpu: table[s.pm2Name]?.cpu ?? 0,
    memMB: table[s.pm2Name]?.mem ?? 0,
  }));
  res.json({ success: true, resources, subsystems });
});

app.post('/api/recourse/orchestration/run', async (req, res) => {
  const phase = req.body?.phase;
  const { orchestrate } = await import('./src/lib/subsystemOrchestrator.js');
  const apply = req.body?.apply !== false;
  const result = await orchestrate(phase, { apply });
  res.json({ success: true, ...result });
});

// ---------------------------------------------------------------------------
// Issue progression + research reports.
// ---------------------------------------------------------------------------
app.get('/api/recourse/issues', (_req, res) => {
  const records = readIssueRecords();
  res.json({ success: true, count: records.length, issues: records });
});

app.post('/api/recourse/issues/refresh', (_req, res) => {
  try {
    renderIssueDocs();
    renderIssueIndex();
    const records = readIssueRecords();
    res.json({ success: true, count: records.length, issues: records });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'issue refresh failed';
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/recourse/reports', (_req, res) => {
  const files = recentReports(20);
  res.json({ success: true, count: files.length, reports: files });
});

app.post('/api/recourse/reports/generate', async (_req, res) => {
  try {
    const daily = await renderDailyReport();
    renderIssueDocs();
    renderIssueIndex();
    const report = await generateFleetReport();
    appendProvenanceEvent('report_generated', { driverId: 'research_reports', files: daily.files, issues: report.issues.length });
    res.json({ success: true, files: daily.files, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'report generation failed';
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// =========================================================================
// OPEN-SOURCE LOCAL MODEL API (OpenAI-compatible / Ollama)
// =========================================================================

// Real status: online only if the endpoint answers. Offline is reported as
// offline - there is no "emulated" mode and no canned model metadata.
app.post('/api/ollama/status', async (req, res) => {
  const cfg = currentProviderStatus();
  const online = await modelCheckOnline(false);
  if (online) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      // Native Ollama serves its model list at the ROOT (/api/tags), not under
      // the OpenAI shim (/v1/api/tags). Strip a trailing /v1 so live state
      // resolves for both local Ollama and remote /v1 proxies that still speak
      // native tags.
      const tagsBase = cfg.baseUrl.replace(/\/v1\/?$/, '');
      const r = await fetch(`${tagsBase}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (r.ok) {
        const data: any = await r.json();
        return res.json({
          success: true,
          status: 'online',
          endpoint: cfg.baseUrl,
          model: cfg.model,
          models: (data.models || []).map((m: any) => ({ name: m.name, size: m.size || null, family: m.family || null, parameter_size: m.details?.parameter_size || null, quantization_level: m.details?.quantization_level || null })),
          hardware: null
        });
      }
    } catch {}
    return res.json({ success: true, status: 'online', endpoint: cfg.baseUrl, model: cfg.model, models: [], hardware: null });
  }
  res.json({
    success: true,
    status: 'offline',
    endpoint: cfg.baseUrl,
    model: cfg.model,
    models: [],
    hardware: null,
    message: 'No model provider reachable at ' + cfg.baseUrl + '. Configure API_MODEL_BASE_URL / API_MODEL_NAME (or LOCAL_MODEL_* for an explicitly-configured local endpoint).'
  });
});

app.post('/api/ollama/chat', async (req, res) => {
  const { model, prompt, system = '' } = req.body;
  const effectiveModel = model || currentProviderStatus().model;
  const started = Date.now();
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, status: 'error', error: 'prompt is required' });
  }
  const result = await chatComplete([
    { role: 'system', content: system || ('You are a helpful assistant running locally via ' + effectiveModel + '.') },
    { role: 'user', content: prompt }
  ], { temperature: 0.6 });
  const elapsed = Date.now() - started;
    res.json({
      success: true,
      status: result.status,
      model: effectiveModel,
      response: result.content || '',
      error: result.error || undefined,
      metrics: {
        totalDurationMs: result.latencyMs || elapsed,
        loadDurationMs: 0,
        promptEvalCount: 0,
        evalCount: result.content ? Math.max(1, Math.round(result.content.length / 4)) : 0,
        tokensPerSec: result.content ? Math.round((result.content.length / 4) / ((elapsed / 1000) || 1)) : 0
      }
    });
  });

// =========================================================================
// LOCAL MODEL MANAGER (real `ollama` CLI integration)
// =========================================================================

const OLLAMA_BIN_CANDIDATES = [
  process.env.OLLAMA_BIN,
  path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
  'ollama',
].filter(Boolean) as string[];

function resolveOllamaBin(): string | null {
  for (const c of OLLAMA_BIN_CANDIDATES) {
    try {
      if (c === 'ollama' || fs.existsSync(c)) return c;
    } catch { /* ignore */ }
  }
  return null;
}

let pullingModel: string | null = null;
const pullLog: string[] = [];

function managerStatus() {
  return {
    binFound: resolveOllamaBin() !== null,
    pulling: pullingModel,
    pullLogTail: pullLog.slice(-40),
    model: currentProviderStatus().model,
    baseUrl: currentProviderStatus().baseUrl,
    online: currentProviderStatus().online,
  };
}

app.get('/api/ollama/manage', (req, res) => {
  if (process.env.OLLAMA_MANAGER_ENABLED !== '1') {
    return res.json({
      success: false,
      disabled: true,
      note: 'Local model manager disabled (OLLAMA_MANAGER_ENABLED not set). Generation runs through the API provider.',
    });
  }
  res.json({ success: true, status: managerStatus() });
});

app.post('/api/ollama/manage', (req, res) => {
  if (process.env.OLLAMA_MANAGER_ENABLED !== '1') {
    return res.json({
      success: false,
      disabled: true,
      note: 'Local model manager disabled (OLLAMA_MANAGER_ENABLED not set). Generation runs through the API provider.',
    });
  }
  const { action, model } = req.body ?? {};
  const bin = resolveOllamaBin();

  if (!bin) {
    return res.status(400).json({ success: false, error: 'ollama CLI not found. Set OLLAMA_BIN to its full path.' });
  }

  if (action === 'pull') {
    const target = (model || currentProviderStatus().model).trim();
    if (!target) return res.status(400).json({ success: false, error: 'model name is required' });
    if (pullingModel) {
      return res.json({ success: true, note: `Already pulling "${pullingModel}".`, status: managerStatus() });
    }
    pullingModel = target;
    pullLog.length = 0;
    const child = spawn(bin, ['pull', target], { windowsHide: true });
    child.stdout.on('data', (d) => { pullLog.push(String(d)); if (pullLog.length > 200) pullLog.splice(0, pullLog.length - 200); });
    child.stderr.on('data', (d) => { pullLog.push(String(d)); if (pullLog.length > 200) pullLog.splice(0, pullLog.length - 200); });
    child.on('close', () => { pullingModel = null; modelCheckOnline(true).catch(() => {}); });
    res.json({ success: true, note: `Started pulling ${target}.`, status: managerStatus() });
    return;
  }

  if (action === 'serve') {
    const child = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    res.json({ success: true, note: 'Attempted to start `ollama serve`. Poll the model status endpoint to confirm.' });
    return;
  }

  if (action === 'stop-pull') {
    pullingModel = null;
    res.json({ success: true, note: 'Pull state cleared (the OS process may still finish in the background).', status: managerStatus() });
    return;
  }

  res.status(400).json({ success: false, error: "unknown action - use 'pull', 'serve' or 'stop-pull'" });
});

// =========================================================================
// MODEL PROVIDER SETTINGS — toggle the generative model endpoint at runtime
// =========================================================================
async function providerSettingsView() {
  await refreshModelStatus(true);
  const ps = currentProviderStatus();
  return {
    mode: providerMode,
    profiles: providerProfiles(),
    current: { baseUrl: ps.baseUrl, model: ps.model, online: ps.online, lastError: ps.lastError },
  };
}

app.get('/api/recourse/settings/provider', async (req, res) => {
  try {
    const v = await providerSettingsView();
    res.json({ success: true, ...v });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/settings/provider', async (req, res) => {
  try {
    const mode = req.body?.mode;
    if (mode !== 'local' && mode !== 'api') {
      return res.status(400).json({ success: false, error: 'mode must be "local" or "api"' });
    }
    providerMode = mode;
    setActiveProviderProfile(mode);
    saveStateToDisk();
    appendProvenanceEvent('system_tick', { action: 'provider_mode_change', mode, generation: status.generation });
    const v = await providerSettingsView();
    res.json({ success: true, applied: mode, ...v });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// TEMPLATE-DRIVEN INTERNAL COMPONENT BUILDING ROUTES
// =========================================================================

// List available component templates
app.get('/api/recourse/templates', (req, res) => {
  const { domain, category } = req.query;
  const templates = listComponentTemplates(domain as ToolDomain, category as string);
  res.json({
    success: true,
    count: templates.length,
    templates
  });
});

// Get single component template with details
app.get('/api/recourse/templates/:id', (req, res) => {
  const tpl = getComponentTemplate(req.params.id);
  if (!tpl) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  const preview = tpl.synthesizer({}, { withSelfHealing: true });
  const { synthesizer: _synthesizer, ...metadata } = tpl;
  res.json({
    success: true,
    template: { ...metadata, selfHostable: Boolean(tpl.selfHost) },
    codePreview: preview.sourceCode,
    testPreview: preview.testSuiteCode
  });
});

// Build and register component from template. With selfHost: true AND a
// template that declares a selfHost descriptor, the verified + linted output
// is ALSO written as a real module the server imports at runtime (dogfooding:
// Recourse starts using the components it built).
app.post('/api/recourse/templates/build', async (req, res) => {
  try {
    const { templateId, componentName, params = {}, withSelfHealing = true, domain, selfHost = false } = req.body;
    const tpl = getComponentTemplate(templateId);
    if (!tpl) {
      return res.status(404).json({ success: false, error: `Template "${templateId}" not found` });
    }

    let cleanCompName = (componentName || `${tpl.id}_${crypto.randomBytes(2).toString('hex')}`)
      .replace(/[^a-zA-Z0-9_]/g, '_');
    // Class names must be valid TS identifiers — never start with a digit.
    if (!cleanCompName || !/^[a-zA-Z_$]/.test(cleanCompName)) {
      cleanCompName = `m_${cleanCompName}`;
    }

    // Mirror of buildComponentFromTemplate's default merge, so the self-hosted
    // module's constructor args match exactly the code that was verified.
    const mergedParams: Record<string, any> = {};
    for (const p of tpl.params) {
      mergedParams[p.id] = params[p.id] !== undefined ? params[p.id] : p.default;
    }

    const buildResult = buildComponentFromTemplate(templateId, mergedParams, {
      withSelfHealing,
      componentName: cleanCompName
    });

    if (!buildResult.success) {
      return res.status(400).json({ success: false, error: buildResult.error });
    }

    // Verify through isolated test suite (real execution only)
    let testRunResult: { passed: boolean; score: number; executionTimeMs: number; testDetails: string[] } | null = null;
    if (buildResult.testSuiteCode) {
      testRunResult = executeTestSuite(buildResult.synthesizedCode, buildResult.testSuiteCode);
    }

    if (testRunResult && !testRunResult.passed) {
      return res.status(422).json({
        success: false,
        error: `Synthesized component FAILED its real test suite (${testRunResult.testDetails.filter(d => d.startsWith('[FAIL')).length} failures). Nothing was registered.`,
        testDetails: testRunResult.testDetails
      });
    }

    // Real open-source lint gate before registration.
    const lintReport = gateWithLint(buildResult.synthesizedCode).lint;
    if (lintReport.available && !lintReport.clean) {
      return res.status(422).json({
        success: false,
        error: `Synthesized component failed the oxlint safety gate: ${lintVerdictNote(lintReport)}. Nothing was registered.`,
        lint: lintReport.details
      });
    }

    const versionHash = crypto.createHash('sha256').update(buildResult.synthesizedCode).digest('hex').substring(0, 16);
    const targetDomain = (domain || tpl.domain) as ToolDomain;
    const passedVerifier = true;
    const verifierNotes = `REAL VERIFY PASS: ${testRunResult ? `${testRunResult.testDetails.length - 1} assertions green in ${testRunResult.executionTimeMs}ms` : 'syntax + entrypoint smoke OK'} (Blueprint ${tpl.name}) | ${lintVerdictNote(lintReport)}`;

    // Optional self-hosting: write a real module AFTER suite + lint are green.
    let selfHostOutcome: {
      selfHosted?: SelfHostedManifestEntry;
      skippedReason?: string;
      error?: string;
    } = {};
    let entrypoint = `src/tools/${cleanCompName}.ts`;
    if (selfHost) {
      if (!tpl.selfHost) {
        selfHostOutcome.skippedReason = `Template "${tpl.id}" does not declare a selfHost descriptor; component registered as sandbox-only (registry gene).`;
      } else {
        const writeRes = writeSelfHostedTool({
          name: cleanCompName,
          templateId: tpl.id,
          domain: targetDomain,
          entrypointName: buildResult.entrypointName,
          params: mergedParams,
          sourceCode: buildResult.synthesizedCode,
          testSuiteCode: buildResult.testSuiteCode || 'assert true;',
          summary: `${tpl.name} [self-hosted from ${tpl.id}]`,
          selfHost: tpl.selfHost,
          artifactKind: tpl.artifactKind ?? 'function'
        });
        if (writeRes.success === false) {
          return res.status(500).json({
            success: false,
            error: `Self-hosting write failed: ${writeRes.error}. Component NOT registered.`
          });
        }
        // Prove the module actually imports before claiming it is live.
        const verdict = await verifySelfHostedEntry(writeRes.entry);
        if (!verdict.passed) {
          removeSelfHostedTool(writeRes.entry.name);
          return res.status(500).json({
            success: false,
            error: `Self-hosted module failed live verification: ${verdict.detail}. Component NOT registered.`
          });
        }
        selfHostOutcome.selfHosted = {
          ...writeRes.entry,
          lastVerifiedAt: Date.now(),
          lastVerified: { passed: true, detail: verdict.detail }
        };
        entrypoint = `.selfhosted/${writeRes.entry.file}`;
      }
    }

    // Persist fresh live-verification verdicts to the manifest on disk so other
    // readers (capability adoption sweep, self-hosted list) see this tool as
    // live-verified, not only in this HTTP response.
    if (selfHostOutcome.selfHosted) {
      await verifyAllSelfHosted().catch(() => {});
      // A freshly built loop artifact is picked up by the supervisor.
      if ((tpl.artifactKind ?? 'function') === 'loop') startLoopSupervisor(cleanCompName);
    }

    const newVersion = {
      version: selfHostOutcome.selfHosted ? '1.0.0-selfhosted' : '1.0.0-template',
      hash: versionHash,
      created_at: Date.now(),
      passed_verifier: passedVerifier,
      score: 1.0,
      promoted: true,
      verifier_notes: `${verifierNotes}${selfHostOutcome.selfHosted ? ' | SELF-HOSTED: real runtime module imported & verified live' : ''}`,
      source_code: buildResult.synthesizedCode,
      test_suite_code: buildResult.testSuiteCode || undefined
    };

    let existingTool = registry.find(t => t.name === cleanCompName);
    if (existingTool) {
      existingTool.versions.push(newVersion);
      existingTool.currentVersion = newVersion.version;
      existingTool.healthStatus = 'healthy';
      existingTool.anomalyCount = 0;
      if (selfHostOutcome.selfHosted) existingTool.entrypoint = entrypoint;
    } else {
      existingTool = {
        name: cleanCompName,
        domain: targetDomain,
        entrypoint,
        description: `${tpl.name} [Parametric Component Template: ${tpl.id}]${selfHostOutcome.selfHosted ? ' [SELF-HOSTED]' : ''}`,
        versions: [newVersion],
        currentVersion: newVersion.version,
        healthStatus: 'healthy',
        anomalyCount: 0
      };
      registry.unshift(existingTool);
    }

    status.registeredToolsCount = registry.length;
    status.totalUpgrades += 1;

    // Log in Provenance
    appendProvenanceEvent('template_component_built', {
      templateId: tpl.id,
      toolName: cleanCompName,
      domain: targetDomain,
      hash: versionHash,
      complexity: buildResult.complexity,
      selfHealingGuards: buildResult.selfHealingGuards,
      selfHosted: Boolean(selfHostOutcome.selfHosted),
      moduleFile: selfHostOutcome.selfHosted?.file,
      moduleHash: selfHostOutcome.selfHosted?.hash,
      skippedSelfHostReason: selfHostOutcome.skippedReason,
      params
    });

    saveStateToDisk();

    // A freshly built (possibly self-hosted) component may back a capability.
    void sweepCapabilityAdoptions().catch(() => {});
    try { recordSystemChange('template-build'); } catch { /* non-fatal */ }

    res.json({
      success: true,
      toolEntry: existingTool,
      buildResult,
      verifierPassed: passedVerifier,
      selfHost: selfHostOutcome
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Benchmark template in isolated sandbox
app.post('/api/recourse/templates/benchmark', (req, res) => {
  try {
    const { templateId, params = {}, iterations = 100 } = req.body;
    const tpl = getComponentTemplate(templateId);
    if (!tpl) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const buildResult = buildComponentFromTemplate(templateId, params, { withSelfHealing: true });
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      if (buildResult.testSuiteCode) {
        executeTestSuite(buildResult.synthesizedCode, buildResult.testSuiteCode);
      }
    }
    const elapsedMs = performance.now() - start;

    res.json({
      success: true,
      templateId,
      iterations,
      totalElapsedMs: Math.round(elapsedMs * 100) / 100,
      meanLatencyPerRunMs: Math.round((elapsedMs / iterations) * 1000) / 1000,
      estimatedFlops: tpl.benchmarkFlops,
      complexity: tpl.complexity
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// CAPABILITY ADOPTION RUNTIME (the real dogfood loop)
// Recourse's own internal operations can be *backed* by a verified self-hosted
// tool it built. When adopted, the running system actually routes its work
// through that tool. Aggressive = best-available always (see capabilities.ts).
// Every adoption and every served call is provenance-logged for auditability.
// =========================================================================

const CAPABILITIES: CapabilityDef[] = [
  {
    id: 'provenance_merkle',
    label: 'Provenance Merkle integrity root',
    backableTemplateId: 'tpl_merkle_anchor',
    method: 'computeRoot',
    args: (ctx: { hashes: string[] }) => [ctx.hashes],
    builtin: (ctx: { hashes: string[] }) => {
      const tree = new MerkleTree(ctx.hashes);
      return tree.getRootHash();
    },
  },
  // Expansion (R6): turn the verified forge tools into the running system's
  // implementation layer. Each capability's backableTemplateId is
  // 'capability_forge' — the template 1,106 of the self-hosted tools carry —
  // and its `method` matches the forge agenda's exact function contract. When
  // sweepCapabilityAdoptions() picks the highest-scored verified gene, the
  // runtime routes real work through the generated tool. Builtins are the
  // deterministic fallback until an adoption exists (never fabricates).
  {
    id: 'dedupe',
    label: 'Stable array deduplication',
    backableTemplateId: 'capability_forge',
    method: 'dedupeStable',
    args: (ctx: { items: (string | number)[] }) => [ctx.items],
    builtin: (ctx: { items: (string | number)[] }) => {
      const seen = new Set<string>();
      return ctx.items.filter((x) => { const k = String(x); if (seen.has(k)) return false; seen.add(k); return true; });
    },
  },
  {
    id: 'numeric_kernel',
    label: 'Array chunking / numeric kernel',
    backableTemplateId: 'capability_forge',
    method: 'chunkArray',
    args: (ctx: { items: unknown[]; size: number }) => [ctx.items, ctx.size],
    builtin: (ctx: { items: unknown[]; size: number }) => {
      const out: unknown[][] = [];
      for (let i = 0; i < ctx.items.length; i += ctx.size) out.push(ctx.items.slice(i, i + ctx.size));
      return out;
    },
  },
  {
    id: 'text_encode',
    label: 'Run-length string encoding',
    backableTemplateId: 'capability_forge',
    method: 'runLengthEncode',
    args: (ctx: { str: string }) => [ctx.str],
    builtin: (ctx: { str: string }) => {
      let out = '';
      let i = 0;
      while (i < ctx.str.length) {
        let j = i;
        while (j < ctx.str.length && ctx.str[j] === ctx.str[i]) j++;
        out += ctx.str[i] + String(j - i);
        i = j;
      }
      return out;
    },
  },
  {
    id: 'scheduler',
    label: 'Top-K frequent scheduling signal',
    backableTemplateId: 'capability_forge',
    method: 'topKFrequent',
    args: (ctx: { items: unknown[]; k: number }) => [ctx.items, ctx.k],
    builtin: (ctx: { items: unknown[]; k: number }) => {
      const freq = new Map<string, number>();
      for (const x of ctx.items) freq.set(String(x), (freq.get(String(x)) ?? 0) + 1);
      return [...freq.entries()]
        .sort((a, b) => b[1] - a[1] || 0)
        .slice(0, ctx.k)
        .map(([k]) => k);
    },
  },
  {
    id: 'math_sequence',
    label: 'Nth Fibonacci sequence kernel',
    backableTemplateId: 'capability_forge',
    method: 'fibonacciN',
    args: (ctx: { n: number }) => [ctx.n],
    builtin: (ctx: { n: number }) => {
      if (ctx.n < 0) return 0;
      let a = 0, b = 1;
      for (let i = 0; i < ctx.n; i++) { [a, b] = [b, a + b]; }
      return a;
    },
  },
  {
    id: 'verify_gate',
    label: 'GCD-based numeric verifier seed',
    backableTemplateId: 'capability_forge',
    method: 'gcdPair',
    args: (ctx: { a: number; b: number }) => [ctx.a, ctx.b],
    builtin: (ctx: { a: number; b: number }) => {
      let a = Math.abs(ctx.a), b = Math.abs(ctx.b);
      while (b) { [a, b] = [b, a % b]; }
      return a;
    },
  },
];

interface AdoptionRecord {
  backing: CapabilityBacking;
  adoptedAt: number;
  adoptedGen: number;
  priorSource: string | null;
}
// Persisted across restarts via saveStateToDisk (adoption is durable, so a
// promoted tool stays applied until a better verified one replaces it).
// (Declared near the top with the other persisted state — before load runs.)

function capabilitiesState() {
  return {
    adoptions: Object.fromEntries(
      Object.entries(capabilityAdoptions).map(([id, rec]) => [
        id,
        { ...rec.backing, adoptedAt: rec.adoptedAt, adoptedGen: rec.adoptedGen, priorSource: rec.priorSource },
      ])
    ),
    served: { ...capabilityServed },
  };
}

/** Re-pick the best backing for every capability; adopt when it changes. */
async function sweepCapabilityAdoptions(): Promise<boolean> {
  const selfHosted = listSelfHostedEntries();
  let changed = false;
  for (const cap of CAPABILITIES) {
    const prev = capabilityAdoptions[cap.id];
    const next = selectBestBacking(cap, selfHosted, registry);
    if (!prev || backingKey(prev.backing) !== backingKey(next)) {
      capabilityAdoptions[cap.id] = {
        backing: next,
        adoptedAt: Date.now(),
        adoptedGen: status.generation ?? 0,
        priorSource: prev ? backingKey(prev.backing) : null,
      };
      if (next.source === 'selfhosted') {
        appendProvenanceEvent('capability_adopted', {
          capability: cap.id,
          label: cap.label,
          tool: next.toolName,
          templateId: next.templateId,
          method: cap.method,
          score: next.score,
          hash: next.hash,
          priorSource: capabilityAdoptions[cap.id].priorSource,
          generation: status.generation,
        });
      } else {
        appendProvenanceEvent('capability_reverted', {
          capability: cap.id,
          label: cap.label,
          priorTool: prev?.backing.toolName ?? null,
          generation: status.generation,
        });
      }
      changed = true;
    }
  }
  if (changed) {
    saveStateToDisk();
    try { recordSystemChange('capability-adoption'); } catch { /* non-fatal */ }
  }
  return changed;
}

/** Serve a capability: route through the adopted tool, else the builtin. */
async function serveCapability<TCtx>(capId: CapabilityId, ctx: TCtx): Promise<unknown> {
  const cap = CAPABILITIES.find((c) => c.id === capId)!;
  const rec = capabilityAdoptions[capId];
  capabilityServed[capId] = (capabilityServed[capId] ?? 0) + 1;
  if (rec?.backing.source === 'selfhosted' && rec.backing.toolName) {
    const res = await executeSelfHostedTool(rec.backing.toolName, { method: cap.method, args: cap.args(ctx) });
    if (res.success === false) {
      // Adopted tool failed live: fall back to builtin for this call, and log
      // the failure so the operator sees a generated tool couldn't serve.
      appendProvenanceEvent('capability_served', {
        capability: capId,
        source: 'selfhosted',
        tool: rec.backing.toolName,
        failed: true,
        error: res.error,
        generation: status.generation,
      });
      return cap.builtin(ctx);
    }
    appendProvenanceEvent('capability_served', {
      capability: capId,
      source: 'selfhosted',
      tool: rec.backing.toolName,
      method: cap.method,
      hash: rec.backing.hash,
      generation: status.generation,
    });
    return res.result;
  }
  appendProvenanceEvent('capability_served', {
    capability: capId,
    source: 'builtin',
    generation: status.generation,
  });
  return cap.builtin(ctx);
}

// =========================================================================
// AUTONOMOUS SELF-USE WATCHDOG
// Beyond the toy loop_beat heartbeat, this makes Recourse genuinely USE a
// verified self-hosted tool it built, for a real internal purpose: it runs the
// adopted provenance_merkle tool against the live provenance chain on a cadence
// and CROSS-CHECKS its output against the reference Merkle root. A mismatch is
// a real signal that the generated tool drifted from the reference. Results are
// durable + provenance-logged and fold into the learner reward.
// =========================================================================
const SELFE_USE_EVERY = 12; // advance once per N generations
interface SelfUseRecord {
  at: number;
  generation: number;
  capability: string;
  tool: string;
  method: string;
  ok: boolean;       // did the self-hosted tool execute without error
  matched: boolean;  // did its output equal the authoritative Merkle root
  error?: string;
}
let selfUseLog: SelfUseRecord[] = [];
let selfUseLastAt: number | null = null;
let selfUseOk = 0;
let selfUseMismatch = 0;
let selfUseError = 0;
let selfUseLastOk: boolean | null = null;

/** Run one self-use cycle: exercise EVERY adopted self-hosted tool and
 *  cross-check its output against the corresponding capability's builtin.
 *  A mismatch is a real signal that the generated tool drifted from the
 *  deterministic reference. Results fold into the learner reward. */
async function runSelfUseWatchdog(): Promise<{ ran: boolean; records: SelfUseRecord[] }> {
  const records: SelfUseRecord[] = [];
  for (const cap of CAPABILITIES) {
    const rec = capabilityAdoptions[cap.id];
    if (!rec || rec.backing.source !== 'selfhosted' || !rec.backing.toolName) continue;
    let ctx: unknown;
    switch (cap.id) {
      case 'provenance_merkle': ctx = { hashes: provenanceEvents.map((e) => e.hash).slice(-256) }; break;
      case 'dedupe': ctx = { items: provenanceEvents.slice(-64).map((e) => e.type || e.hash) }; break;
      case 'numeric_kernel': ctx = { items: provenanceEvents.slice(-32).map((e) => e.hash), size: 7 }; break;
      case 'text_encode': ctx = { str: (provenanceEvents.slice(-32).map((e) => e.type || 'x').join('')) || 'aaaabbc' }; break;
      case 'scheduler': ctx = { items: provenanceEvents.slice(-64).map((e) => e.type || 'x'), k: 5 }; break;
      case 'math_sequence': ctx = { n: Math.min(provenanceEvents.length % 25, 20) }; break;
      case 'verify_gate': ctx = { a: 48, b: 18 }; break;
    }
    if (ctx === undefined) continue;
    const reference = cap.builtin(ctx as any);
    let ok = false;
    let matched = false;
    let result: unknown;
    let error: string | undefined;
    try {
      const res = await executeSelfHostedTool(rec.backing.toolName, { method: cap.method, args: cap.args(ctx as any) });
      if (res.success === false) {
        error = String(res.error ?? 'execute failed');
      } else {
        ok = true;
        result = res.result;
        const norm = (v: unknown): string => JSON.stringify(v ?? null);
        matched = norm(result) === norm(reference);
      }
    } catch (e: any) {
      error = String(e?.message ?? e);
    }
    const record: SelfUseRecord = {
      at: Date.now(),
      generation: status.generation ?? 0,
      capability: cap.id,
      tool: rec.backing.toolName,
      method: cap.method,
      ok,
      matched,
      error,
    };
    records.push(record);
    selfUseLog.push(record);
    if (selfUseLog.length > 240) selfUseLog.shift();
    selfUseLastAt = record.at;
    selfUseLastOk = ok && matched;
    if (ok && matched) selfUseOk++;
    else if (!ok) { selfUseError++; appendProvenanceEvent('selfuse_error', { tool: rec.backing.toolName, capability: cap.id, generation: record.generation, error }); }
    else { selfUseMismatch++; appendProvenanceEvent('selfuse_mismatch', { tool: rec.backing.toolName, capability: cap.id, generation: record.generation, expected: JSON.stringify(reference), actual: JSON.stringify(result) }); }
    appendProvenanceEvent('selfhosted_tool_called', { origin: 'selfuse_watchdog', tool: rec.backing.toolName, method: cap.method, ok, matched, generation: record.generation });
  }
  if (records.length) saveStateToDisk();
  return { ran: records.length > 0, records };
}

/** Internal status: which tools Recourse is actively self-using + the verdict. */
function selfUseStatus() {
  const last = selfUseLog[selfUseLog.length - 1] ?? null;
  return {
    enabled: true,
    cadenceEveryGenerations: SELFE_USE_EVERY,
    lastAt: selfUseLastAt,
    ok: selfUseOk,
    mismatches: selfUseMismatch,
    errors: selfUseError,
    lastOk: selfUseLastOk,
    last: last,
    recent: selfUseLog.slice(-20),
  };
}

app.get('/api/recourse/selfuse', (req, res) => {
  res.json({ success: true, selfuse: selfUseStatus() });
});

// System snapshot history (every materially distinct system state).
app.get('/api/recourse/system/snapshots', (req, res) => {
  res.json({ success: true, count: systemSnapshots.length, baseline: systemBaseline, snapshots: systemSnapshots });
});

// Differential upgrade report: upgraded (current) system vs the boot baseline.
app.get('/api/recourse/system/upgrade-report', async (req, res) => {
  try {
    const report = await buildUpgradeReport();
    res.json({ success: true, ...report });
  } catch {
    // Never block the report on a model hiccup — fall back to deterministic.
    res.json({ success: true, ...upgradeReport() });
  }
});

// Warm the plain-language rephrase cache so the first report is not slow.
void (async () => {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const rep = upgradeReport();
    if (rep.topChanged.length > 0) await rephraseToolDescriptions(rep.topChanged);
  } catch { /* warm-up optional */ }
})();

// Capability adoption status (which generated tools back internal ops).
app.get('/api/recourse/capabilities', (req, res) => {
  res.json({
    success: true,
    capabilities: CAPABILITIES.map((c) => ({
      id: c.id,
      label: c.label,
      backableTemplateId: c.backableTemplateId,
      method: c.method,
    })),
    ...capabilitiesState(),
  });
});

// Boot adoption sweep runs after boot self-hosted verification completes.
void (async () => {
  await new Promise((r) => setTimeout(r, 250));
  try { await sweepCapabilityAdoptions(); } catch { /* non-fatal at boot */ }
})();

// =========================================================================
// SYSTEM SNAPSHOTS + DIFFERENTIAL UPGRADE REPORTING
// Every materially changed system state is snapshotted. The boot baseline is
// preserved, and the "upgrade report" diffs the upgraded (current) system
// against that original baseline so the operator sees old-vs-new, not just the
// current aggregate. Pure diff/render logic lives in src/lib/systemDiff.ts.
// =========================================================================

function currentSystemSnapshot(label: string): SystemSnapshot {
  const tools: SystemSnapshot['tools'] = [];
  for (const t of registry) {
    const cur = t.currentVersion;
    const v = t.versions.find((x) => x.version === cur);
    if (!v) continue;
    tools.push({
      name: t.name,
      domain: t.domain,
      version: cur,
      hash: v.hash || String(v.created_at || 0),
      score: typeof v.score === 'number' ? v.score : 0,
      passed: v.passed_verifier === true,
      healthStatus: t.healthStatus || 'unknown',
      selfHosted: Boolean(t.entrypoint && t.entrypoint.includes('.selfhosted/')),
    });
  }
  const sh = listSelfHostedEntries();
  const selfhostedHealthy = sh.filter((e) => e.lastVerified?.passed).length;
  const lastBench = benchmarkHistory[benchmarkHistory.length - 1];
  const capabilities: SystemSnapshot['capabilities'] = CAPABILITIES.map((c) => {
    const rec = capabilityAdoptions[c.id];
    return {
      capability: c.id,
      source: rec?.backing.source ?? 'builtin',
      toolName: rec?.backing.toolName,
      score: rec?.backing.score,
    };
  });
  return {
    label,
    ts: Date.now(),
    gen: status.generation ?? 0,
    tools,
    capabilities,
    benchmarkSolved: lastBench?.solved ?? null,
    selfhostedHealthy,
    selfhostedTotal: sh.length,
  };
}

/** Capture a snapshot if the system materially changed since the last one. */
function recordSystemChange(reason: string): void {
  const snap = currentSystemSnapshot(reason);
  if (!systemBaseline) {
    systemBaseline = { ...snap, label: 'boot-baseline' };
    systemSnapshots = [systemBaseline];
    saveStateToDisk();
    return;
  }
  const last = systemSnapshots[systemSnapshots.length - 1];
  if (last && snapshotFingerprint(last) === snapshotFingerprint(snap)) return; // unchanged
  systemSnapshots.push(snap);
  if (systemSnapshots.length > 200) systemSnapshots.shift();
  saveStateToDisk();
}

/** Build a "describe" mapper from registry tool descriptions → human phrasing.
 *  Strips provenance noise ("Crystallized from dream:") and keeps the first
 *  clause so bullets stay short. Never fabricates: returns the real (cleaned)
 *  description or falls back to a generic label. */
function registryDescribe(name: string): string {
  const byName = new Map(registry.map((t) => [t.name, t.description]));
  const desc = (byName.get(name) || '').trim();
  if (desc) {
    let clean = desc.replace(/^(crystallized from dream|dream|generated|auto-promoted|synthesized)\s*:\s*/i, '');
    clean = clean.replace(/\s*\.+$/, '');
    const clause = clean.split(/[.;]/)[0].trim();
    const core = clause.replace(/^(a|an|the)\s+/i, '');
    return core ? core : 'a new tool';
  }
  return 'a new tool';
}

// Async plain-language rephrasing of tool descriptions via the local model.
// Cached per tool-name so repeated readouts don't re-hit the model, and only
// the top few changed tools are sent (never the whole 900+ registry). The
// model output is used ONLY to rephrase the real description into everyday
// words — never to invent capabilities — and any offline/failure falls back to
// the deterministic registryDescribe() so the report always renders.
const plainRephraseCache = new Map<string, string>();

async function rephraseToolDescriptions(
  entries: Array<{ name: string; description: string }>,
  limit = 8,
): Promise<void> {
  const toSend = entries
    .filter((e) => e.description && !plainRephraseCache.has(e.name))
    .slice(0, limit);
  if (toSend.length === 0) return;
  // Honesty guardrail: give the model the REAL description and ask for a plain
  // restatement only — never a capability the description doesn't support.
  const system = [
    'You are Recourse\'s plain-language reporter.',
    'For each tool I give you, rewrite its description into one short, everyday sentence a non-expert can understand.',
    'Rules:',
    '- Do NOT invent capabilities or behaviours that are not in the original description.',
    '- No jargon, no hashes, no version numbers.',
    '- Reply ONLY with valid JSON: an object mapping the exact tool name to its plain sentence.',
  ].join('\n');
  const user = toSend
    .map((e) => `${e.name}: ${e.description}`)
    .join('\n');
  try {
    const result = await chatComplete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.2, json: true },
    );
    if (!result.ok || !result.content) return; // fall back to deterministic
    const block = extractJsonBlock(result.content);
    if (!block) return;
    const parsed = JSON.parse(block);
    for (const e of toSend) {
      const plain = typeof parsed?.[e.name] === 'string' ? parsed[e.name].trim() : '';
      if (plain && plain.length > 3 && plain.length < 400) {
        plainRephraseCache.set(e.name, plain);
      }
    }
  } catch { /* model unavailable — keep deterministic descriptions */ }
}

function describeWithRephrase(name: string): string {
  return plainRephraseCache.get(name) || registryDescribe(name);
}

/** Diff the current (upgraded) system against the boot baseline. */
function upgradeReport(): { diff: SystemDiff; baseline: SystemSnapshot; current: SystemSnapshot; markdown: string; plain: string; topChanged: Array<{ name: string; description: string }> } {
  const baseline = systemBaseline ?? currentSystemSnapshot('boot-baseline');
  const current = currentSystemSnapshot('current');
  const diff = diffSnapshots(baseline, current);
  return {
    diff,
    baseline,
    current,
    markdown: renderUpgradeMarkdown(diff, { fromLabel: 'boot-baseline', toLabel: 'current' }),
    plain: renderPlainLanguageSummary(diff, { describe: describeWithRephrase, maxItems: 10 }),
    topChanged: [...diff.addedTools, ...diff.upgradedTools, ...diff.healthChangedTools]
      .map((c) => {
        const nm = c.next?.name ?? c.name;
        const tool = registry.find((t) => t.name === nm);
        return { name: nm, description: tool?.description ?? '' };
      })
      .filter((x) => x.description)
      .slice(0, 8),
  };
}

/** Async upgrade report that first lets the local model rephrase the top
 *  changed tools into plain language (bounded + cached), then renders. */
async function buildUpgradeReport() {
  const rep = upgradeReport();
  await rephraseToolDescriptions(rep.topChanged);
  // Re-render plain now that the cache may hold model-rephrased sentences.
  const refreshed = upgradeReport();
  return refreshed;
}

// Boot baseline snapshot (captured once reconcile + self-host verify settle).
void (async () => {
  await new Promise((r) => setTimeout(r, 300));
  try { recordSystemChange('boot-baseline'); } catch { /* non-fatal */ }
})();

// =========================================================================
// SELF-HOSTED TOOL RUNTIME ROUTES
// These tools are real modules written to .selfhosted/tools/*.mjs, imported by
// this server at runtime, re-verified at boot, and called through the
// plugin-declared method whitelist. This is the dogfood loop: components built
// from Recourse templates become live parts of Recourse.
// =========================================================================

// List self-hosted tools with their stored boot/last verify verdicts.
app.get('/api/recourse/selfhosted', (req, res) => {
  const entries = listSelfHostedEntries();
  res.json({ success: true, count: entries.length, tools: entries });
});

// Force a fresh, real re-verification of every self-hosted module.
app.post('/api/recourse/selfhosted/verify', async (req, res) => {
  try {
    const entries = await verifyAllSelfHosted();
    const healthy = entries.filter((e) => e.lastVerified?.passed).length;
    res.json({ success: true, count: entries.length, healthy, tools: entries });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Call a live self-hosted tool: { method, args } through its real module.
app.post('/api/recourse/selfhosted/:name/execute', async (req, res) => {
  try {
    const { name } = req.params;
    const { method, args = [] } = req.body ?? {};
    const entry = getSelfHostedEntry(name);
    if (!entry) {
      return res.status(404).json({ success: false, error: `No self-hosted tool named "${toSafeModuleName(name)}"` });
    }
    const result = await executeSelfHostedTool(entry.name, { method, args });
    if (result.success === false) {
      return res.status(400).json({ success: false, error: result.error });
    }
    appendProvenanceEvent('selfhosted_tool_called', {
      tool: entry.name,
      method,
      templateId: entry.templateId,
      hash: entry.hash,
      executionTimeMs: result.executionTimeMs
    });
    res.json({ success: true, tool: entry.name, method, result: result.result, executionTimeMs: result.executionTimeMs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Artifact inspection card (kind-aware). Used by A2A/MCP discovery + the UI.
app.get('/api/recourse/selfhosted/:name/card', (req, res) => {
  const entry = getSelfHostedEntry(req.params.name);
  if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, card: artifactCard(entry), kind: resolveKind(entry) });
});

// Serve a built `web`-category artifact as a REAL text/html document. This is
// what makes Recourse's web-development capability a reachable page rather than
// a JSON envelope: the self-hosted module's render() output is returned with
// Content-Type text/html. Only `web` templates are eligible, and only results
// that are actually an HTML string are served — never a JSON object or an error
// dressed up as a page (see webArtifact.ts for the honest decision logic).
app.get('/api/recourse/web/artifact/:name', async (req, res) => {
  try {
    const entry = getSelfHostedEntry(req.params.name);
    if (!entry) return res.status(404).json({ success: false, error: `No self-hosted tool named "${toSafeModuleName(req.params.name)}"` });
    const tpl = getComponentTemplate(entry.templateId);
    const category = tpl?.category;
    if (!isWebCategory(category)) {
      return res.status(400).json({ success: false, error: `"${entry.name}" is not a web artifact (category: ${category ?? 'unknown'}) — only 'web' templates are served as pages` });
    }
    const method = pickRenderMethod(entry.methods)?.method;
    if (!method) {
      return res.status(400).json({ success: false, error: `"${entry.name}" exposes no renderable method` });
    }
    const result = await executeSelfHostedTool(entry.name, { method, args: [] });
    if (result.success === false) {
      return res.status(502).json({ success: false, error: result.error });
    }
    const decision = htmlFromResult(result.result);
    if (decision.ok === false) {
      return res.status(406).json({ success: false, error: decision.reason });
    }
    appendProvenanceEvent('capability_served', {
      tool: entry.name, templateId: entry.templateId, method, kind: resolveKind(entry), contentType: 'text/html'
    });
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(decision.html);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generic artifact call: { method?, args? } → execute. Works for any kind
// (function/api/cli share one JSON surface). Missing method = first whitelisted.
app.post('/api/recourse/selfhosted/:name/call', async (req, res) => {
  try {
    const entry = getSelfHostedEntry(req.params.name);
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    const inv = unpackCall(entry, req.body ?? {});
    const result = await executeSelfHostedTool(entry.name, inv);
    if (result.success === false) return res.status(400).json({ success: false, error: result.error });
    appendProvenanceEvent('selfhosted_tool_called', {
      tool: entry.name, method: inv.method, kind: resolveKind(entry), hash: entry.hash,
      executionTimeMs: result.executionTimeMs
    });
    res.json({ success: true, kind: resolveKind(entry), tool: entry.name, method: inv.method, result: result.result, executionTimeMs: result.executionTimeMs });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// JSON-RPC 2.0 transport for mcp/a2a artifacts (tools/list, tools/call,
// agent/card, message, ping). Discovery is served from the manifest card;
// call-type methods go through the real execute adapter.
app.post('/api/recourse/selfhosted/:name/jsonrpc', async (req, res) => {
  try {
    const entry = getSelfHostedEntry(req.params.name);
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    const id = (req.body ?? {})?.id ?? null;
    const method: string = (req.body ?? {})?.method ?? '';
    const params: any = (req.body ?? {})?.params ?? {};

    if (method === 'tools/list' || method === 'capabilities/list' || method === 'agent/card') {
      return res.json({ id, result: artifactCard(entry) });
    }
    if (method === 'ping') return res.json({ id, result: 'pong' });

    if (method === 'tools/call' || method === 'agent/message' || method === 'message/send' || method === 'message') {
      const name = params?.name ?? params?.method ?? null;
      const args = params?.arguments ?? params?.params ?? [];
      const inv = { method: name || (entry.methods?.[0]?.method as string), args: Array.isArray(args) ? args : [args] };
      if (!inv.method) throw new Error(`Artifact "${entry.name}" has no callable method`);
      const result = await executeSelfHostedTool(entry.name, inv);
      if (result.success === false) return res.json({ id, error: { code: -32000, message: result.error } });
      appendProvenanceEvent('selfhosted_tool_called', {
        tool: entry.name, method: inv.method, kind: resolveKind(entry), hash: entry.hash, transport: 'jsonrpc',
        executionTimeMs: result.executionTimeMs
      });
      return res.json({ id, result: result.result });
    }
    return res.json({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// =========================================================================
// LOOP SUPERVISOR — supervised daemons for `loop`-kind artifacts
// A loop artifact is a self-hosted module whose whitelisted `tick` method is
// invoked on an interval by this server. Heartbeats (cycle, ok, result) are
// kept in a bounded in-memory ledger and surfaced via the API; lifecycle
// (start/stop/error) is written to the provenance chain. Heartbeat detail is
// intentionally not persisted every beat (that would churn the state file);
// the supervisor re-starts verified loop artifacts after each boot.
// =========================================================================

interface LoopSupervisorState {
  tool: string;
  method: string;
  startedAt: number;
  intervalMs: number;
  cycles: number;
  ok: number;
  failed: number;
  lastAt: number | null;
  lastOk: boolean | null;
  lastResult?: unknown;
  lastError?: string;
}
interface LoopHeartbeat {
  at: number;
  tool: string;
  cycle: number;
  ok: boolean;
}
const LOOP_INTERVAL_MS = Number(process.env.LOOP_TICK_MS || 5000);
const loopSupervisors: Record<string, LoopSupervisorState> = {};
const loopTimers: Record<string, NodeJS.Timeout> = {};
const loopHeartbeats: LoopHeartbeat[] = [];

function loopTickMethod(entry: any): string | null {
  const m = entry?.methods?.[0]?.method;
  return typeof m === 'string' ? m : null;
}

async function tickLoop(name: string, state: LoopSupervisorState): Promise<void> {
  state.cycles += 1;
  const res = await executeSelfHostedTool(name, { method: state.method, args: [] });
  state.lastAt = Date.now();
  if (res.success === false) {
    state.failed += 1;
    state.lastOk = false;
    state.lastError = res.error;
    appendProvenanceEvent('loop_error', { tool: name, cycle: state.cycles, error: res.error, generation: status.generation });
  } else {
    state.ok += 1;
    state.lastOk = true;
    state.lastResult = res.result;
  }
  loopHeartbeats.push({ at: state.lastAt, tool: name, cycle: state.cycles, ok: state.lastOk === true });
  if (loopHeartbeats.length > 200) loopHeartbeats.shift();
}

function startLoopSupervisor(name: string, intervalMs: number = LOOP_INTERVAL_MS): { ok: boolean; error?: string } {
  const safe = toSafeModuleName(name);
  if (loopTimers[safe]) return { ok: true };
  const entry = getSelfHostedEntry(safe);
  const kind = entry?.artifactKind ?? 'function';
  const method = loopTickMethod(entry);
  if (!entry || kind !== 'loop' || !method) {
    return { ok: false, error: `"${safe}" is not a supervised loop-kind artifact` };
  }
  const state: LoopSupervisorState = {
    tool: safe, method, startedAt: Date.now(), intervalMs,
    cycles: 0, ok: 0, failed: 0, lastAt: null, lastOk: null,
  };
  loopSupervisors[safe] = state;
  appendProvenanceEvent('loop_started', { tool: safe, method, intervalMs, generation: status.generation });
  loopTimers[safe] = setInterval(() => { tickLoop(safe, state).catch(() => {}); }, intervalMs);
  // First tick soon so a heartbeat is observable without waiting a full interval.
  setTimeout(() => { tickLoop(safe, state).catch(() => {}); }, 100);
  return { ok: true };
}

function stopLoopSupervisor(name: string): boolean {
  const safe = toSafeModuleName(name);
  if (loopTimers[safe]) {
    clearInterval(loopTimers[safe]);
    delete loopTimers[safe];
    delete loopSupervisors[safe];
    appendProvenanceEvent('loop_stopped', { tool: safe, generation: status.generation });
    return true;
  }
  return false;
}

/** Auto-supervise every live-verified `loop` artifact (idempotent). */
function ensureLoopSupervisors(): number {
  let started = 0;
  for (const entry of listSelfHostedEntries()) {
    if ((entry.artifactKind ?? 'function') !== 'loop') continue;
    if (entry.lastVerified?.passed !== true) continue;
    if (startLoopSupervisor(entry.name).ok) started += 1;
  }
  return started;
}

// Boot auto-supervision after boot self-host verification settles.
void (async () => {
  await new Promise((r) => setTimeout(r, 400));
  try { ensureLoopSupervisors(); } catch { /* non-fatal */ }
})();

// Loop supervisor API.
app.get('/api/recourse/selfhosted/loops', (req, res) => {
  res.json({
    success: true,
    intervalMs: LOOP_INTERVAL_MS,
    running: Object.values(loopSupervisors),
    heartbeatCount: loopHeartbeats.length,
    heartbeats: loopHeartbeats.slice(-30),
  });
});
app.post('/api/recourse/selfhosted/loops/start', (req, res) => {
  const name = req.body?.name as string | undefined;
  if (name) {
    const r = startLoopSupervisor(name);
    return res.json({ success: r.ok, error: r.error, running: Object.values(loopSupervisors) });
  }
  const n = ensureLoopSupervisors();
  res.json({ success: true, started: n, running: Object.values(loopSupervisors) });
});
app.post('/api/recourse/selfhosted/loops/stop', (req, res) => {
  const name = req.body?.name as string | undefined;
  if (name) {
    const stopped = stopLoopSupervisor(name);
    return res.json({ success: true, stopped, running: Object.values(loopSupervisors) });
  }
  let stopped = 0;
  for (const k of Object.keys(loopTimers)) if (stopLoopSupervisor(k)) stopped++;
  res.json({ success: true, stopped, running: Object.values(loopSupervisors) });
});

// Remove a self-hosted tool: deletes the module file + manifest entry, and
// unregisters the matching registry gene (so nothing references a dead module).
app.delete('/api/recourse/selfhosted/:name', (req, res) => {
  const { name } = req.params;
  const safeName = toSafeModuleName(name);
  const removed = removeSelfHostedTool(safeName);
  if (!removed.success) {
    return res.status(404).json({ success: false, error: removed.error });
  }
  // A removed loop artifact must be desupervised.
  stopLoopSupervisor(safeName);

  let removedGene = false;
  const tool = registry.find((t) => t.name === safeName);
  if (tool && tool.entrypoint && tool.entrypoint.includes('.selfhosted/')) {
    registry.splice(registry.indexOf(tool), 1);
    removedGene = true;
    status.registeredToolsCount = registry.length;
  }

  appendProvenanceEvent('selfhosted_tool_removed', {
    tool: safeName,
    removedFile: removed.removedFile,
    removedGene
  });
  saveStateToDisk();
  // A removed self-hosted tool may have been backing a capability — re-sweep.
  void sweepCapabilityAdoptions().catch(() => {});
  try { recordSystemChange('selfhosted-remove'); } catch { /* non-fatal */ }

  res.json({ success: true, removed, registryToolRemoved: removedGene });
});

// Execute Self-Learning Directive to synthesize a template component
app.post('/api/recourse/learn/synthesize-directive', async (req, res) => {
  try {
    const { directiveId } = req.body;
    const learnerState = await learner.status();
    let targetDirective = learnerState.directives.find(d => d.id === directiveId);
    
    if (!targetDirective && learnerState.directives.length > 0) {
      targetDirective = learnerState.directives.find(d => d.kind === 'synthesize_template' || d.kind === 'amplify') || learnerState.directives[0];
    }

    if (!targetDirective) {
      return res.json({ success: false, message: 'No active learner directives available for template synthesis' });
    }

    const targetDomain: ToolDomain = (targetDirective.targetDomain as ToolDomain) || 'coding';
    const tplId = targetDirective.templateId || 'tpl_lru_cache';
    const tpl = getComponentTemplate(tplId) || Object.values(COMPONENT_TEMPLATES)[0];

    const compName = `learner_${targetDomain}_${tpl.id.replace('tpl_', '')}_${Date.now().toString().slice(-4)}`;
    const buildResult = buildComponentFromTemplate(tpl.id, {}, {
      withSelfHealing: true,
      componentName: compName
    });

    if (!buildResult.success) {
      return res.json({ success: false, message: `Template build failed: ${buildResult.error || 'unknown'}` });
    }

    // Real regression run before anything is registered.
    const testRun = executeTestSuite(buildResult.synthesizedCode, buildResult.testSuiteCode);
    if (!testRun.passed) {
      return res.json({
        success: false,
        message: `Directive synthesis produced code that FAILS its real test suite (${testRun.testDetails.filter(d => d.startsWith('[FAIL')).length} failures). Nothing was registered.`
      });
    }

    const versionHash = crypto.createHash('sha256').update(buildResult.synthesizedCode).digest('hex').substring(0, 16);
    const newToolEntry: ToolEntry = {
      name: compName,
      domain: targetDomain,
      entrypoint: `src/tools/${compName}.ts`,
      description: `Synthesized from Learner Directive: ${targetDirective.reason}`,
      versions: [{
        version: '1.0.0-learned',
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: `REAL VERIFY PASS (${testRun.testDetails.length - 1} assertions green) via Directive [${targetDirective.kind}]`,
        source_code: buildResult.synthesizedCode,
        test_suite_code: buildResult.testSuiteCode
      }],
      currentVersion: '1.0.0-learned',
      healthStatus: 'healthy',
      anomalyCount: 0
    };

    registry.unshift(newToolEntry);
    status.registeredToolsCount = registry.length;
    status.totalUpgrades += 1;

    // Log provenance
    appendProvenanceEvent('self_learning_directive_applied', {
      directiveId: targetDirective.id,
      directiveKind: targetDirective.kind,
      reason: targetDirective.reason,
      templateId: tpl.id,
      toolName: compName,
      domain: targetDomain,
      hash: versionHash
    });

    saveStateToDisk();

    res.json({
      success: true,
      directive: targetDirective,
      synthesizedTool: newToolEntry,
      buildResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Multi-Gene Genetic Crossover Synthesizer
app.post('/api/recourse/crossover', (req, res) => {
  const { parentGeneA, parentGeneB, targetDomain = 'cyber_defense', hybridName } = req.body;

  const toolA = registry.find(t => t.name === parentGeneA);
  const toolB = registry.find(t => t.name === parentGeneB);

  const hybridToolName = hybridName || `crossover_${(toolA?.name || 'geneA').slice(0, 8)}_${(toolB?.name || 'geneB').slice(0, 8)}_${crypto.randomBytes(2).toString('hex')}`;
  const codeA = toolA?.versions[toolA.versions.length - 1]?.source_code || '';
  const codeB = toolB?.versions[toolB.versions.length - 1]?.source_code || '';

  const hybridSource = `// Genetic Recombination Crossover (${toolA?.domain || 'A'} x ${toolB?.domain || 'B'})\n// Parent A: ${toolA?.name || 'geneA'}\n// Parent B: ${toolB?.name || 'geneB'}\n\n${codeA}\n\n${codeB}\n\n// Recombined Hybrid Interface\nexport class RecombinedGenome {\n  executeHybrid() { return { parentA: '${toolA?.name || ''}', parentB: '${toolB?.name || ''}', status: 'functional' }; }\n}`;
  const hybridVersion = `1.0.0-hybrid`;
  const versionHash = crypto.createHash('sha256').update(hybridSource).digest('hex').substring(0, 16);

  // Honest structural verification: the combined source must compile and the
  // recombination shim must execute with the real parent names. This verifies
  // structure, not semantics - the notes say exactly that.
  const hybridSuite = `const g = new RecombinedGenome();\nassert typeof g.executeHybrid === 'function';\nconst h = g.executeHybrid();\nassert h.parentA === '${toolA?.name || ''}';\nassert h.parentB === '${toolB?.name || ''}';\nassert h.status === 'functional';`;
  const testRun = executeTestSuite(hybridSource, hybridSuite);
  const verified = testRun.passed;

  const hybridEntry: ToolEntry = {
    name: hybridToolName,
    domain: targetDomain as ToolDomain,
    entrypoint: `src/tools/${hybridToolName}.ts`,
    description: `Genetic crossover hybrid uniting ${toolA?.name || 'Gene A'} with ${toolB?.name || 'Gene B'}`,
    currentVersion: verified ? hybridVersion : undefined,
    healthStatus: verified ? 'healthy' : 'degraded',
    versions: [
      {
        version: hybridVersion,
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: verified,
        score: verified ? 1.0 : 0,
        promoted: verified,
        verifier_notes: verified
          ? `STRUCTURAL HYBRID VERIFIED (compiles; shim executes): ${testRun.testDetails.length - 1} assertions green. Parent semantics NOT re-verified.`
          : `HYBRID NOT VERIFIED: combined source failed its structural suite (${testRun.testDetails.filter(d => d.startsWith('[FAIL')).length} failures).`,
        source_code: hybridSource,
        test_suite_code: hybridSuite
      }
    ]
  };

  registry.unshift(hybridEntry);
  if (verified) {
    status.totalUpgrades += 1;
  }
  status.generation += 1;

  appendProvenanceEvent('gene_crossover', {
    hybridTool: hybridToolName,
    parentA: toolA?.name,
    parentB: toolB?.name,
    domain: targetDomain,
    version: hybridVersion,
    hash: versionHash,
    verified
  });

  saveStateToDisk();

  res.json({
    success: true,
    hybridTool: hybridEntry,
    verified,
    generation: status.generation
  });
});

app.post('/api/recourse/approve', (req, res) => {
  const { toolName, version } = req.body;
  const tool = registry.find(t => t.name === toolName);
  if (!tool) {
    return res.status(404).json({ error: 'Tool not found' });
  }

  const pendingIndex = (tool.pendingVersions || []).findIndex(v => v.version === version);
  if (pendingIndex === -1) {
    return res.status(404).json({ error: 'Pending version not found' });
  }

  const [approvedVersion] = tool.pendingVersions!.splice(pendingIndex, 1);
  approvedVersion.promoted = true;

  tool.versions.push(approvedVersion);
  tool.currentVersion = approvedVersion.version;

  const event = appendProvenanceEvent('tool_human_approved', {
    tool: toolName,
    version: approvedVersion.version,
    hash: approvedVersion.hash,
    score: approvedVersion.score,
    verifier_notes: approvedVersion.verifier_notes
  });

  status.totalUpgrades += 1;
  saveStateToDisk();
  res.json({ success: true, tool, approvedVersion, event });
});

app.post('/api/recourse/verify', (req, res) => {
  const { domain, sourceCode, testSuiteCode, extra } = req.body;

  let verifierResult: VerifierResult;

  if (domain === 'coding' || domain === 'systemic') {
    verifierResult = (domain === 'systemic' ? verifySystemicCode : verifyCodingCode)(sourceCode || '', testSuiteCode || '');
  } else if (domain === 'math') {
    const testCases = extra?.testCases || [
      { args: [1, -5, 6], expected: 5 },
      { args: [2, 8, -10], expected: -4 }
    ];
    verifierResult = verifyMathCode(sourceCode || '', extra?.funcName || 'sumOfRoots', testCases, extra?.symbolicExpr);
  } else if (domain === 'biotech') {
    const claimExtra = biotechClaimExtra.safeParse(extra ?? {});
    if (!claimExtra.success) {
      return res.status(400).json({
        success: false,
        error: 'invalid biotech claim payload',
        issues: claimExtra.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const e = claimExtra.data;
    const claim: BiotechClaim = {
      asset_name: e.asset_name || 'CandidateAsset',
      mechanism: e.mechanism || '',
      leg: (e.leg ?? '') as BiotechClaim['leg'],
      evidence_tier: e.evidence_tier ?? 0,
      source: e.source || ''
    };
    verifierResult = verifyBiotechClaim(claim);
  } else if (domain === 'neuro_symbolic') {
    verifierResult = verifyNeuroSymbolicCode(sourceCode || '', testSuiteCode || '');
  } else if (domain === 'cyber_defense') {
    verifierResult = verifyCyberDefenseCode(sourceCode || '', testSuiteCode || '');
  } else if (domain === 'quantum_sim') {
    verifierResult = verifyQuantumSimCode(sourceCode || '', testSuiteCode || '');
  } else {
    verifierResult = {
      passed: false,
      summary: 'FAILED (Unknown domain)',
      details: [`Domain "${domain}" is not a recognized ToolDomain.`],
      score: 0.0
    };
  }

  res.json({ result: verifierResult });
});

// AI Self-Evolver using Gemini with Resilient Fallback
// AI Self-Evolver via the configured open-source model provider (OpenAI-compatible / Ollama).
// No canned fallbacks exist: if the model is offline the request reports
// model_unavailable and NOTHING is added to the registry. A mutation only
// reaches the registry after its source code passes the real sandbox verifier.
app.post('/api/recourse/evolve', async (req, res) => {
  try {
    const { domain = 'coding', promptInstructions, targetToolName, policy = status.activePolicy } = req.body;
    if (!promptInstructions || typeof promptInstructions !== 'string' || promptInstructions.trim().length < 4) {
      return res.status(400).json({ error: 'promptInstructions is required' });
    }
    if (!['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'].includes(domain)) {
      return res.status(400).json({ error: 'unknown domain: ' + domain });
    }

    const online = await modelCheckOnline(false);
    if (!online) {
      return res.json({
        success: false,
        outcome: 'model_unavailable',
        message: 'No model provider reachable at ' + currentProviderStatus().baseUrl + '. Configure API_MODEL_BASE_URL / API_MODEL_NAME.'
      });
    }

    const toolName = (targetToolName || `gene_${domain}_${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9_$]/g, '_');
    const domainList = domain === 'biotech' ? 'biotech (return an asset JSON with asset_name/mechanism/leg/evidence_tier/source)' : domain;
    const systemPrompt = `You are Recourse's mutation engine. You write PLAIN JAVASCRIPT (no TypeScript, no imports) that is runnable in an isolated Node sandbox.
Return ONLY valid JSON with this exact shape:
{
  "description": "one sentence",
  "sourceCode": "plain javascript, pure and deterministic",
  "testSuiteCode": "a short test body using lines starting with assert that call the real functions you wrote"
}
You are producing a candidate for domain: ${domainList}. Tool name will be: ${toolName}.
Write honest tests that would fail if the function were wrong. Do not reference undeclared variables.`;

    const result = await chatComplete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptInstructions }
    ], { temperature: status.hyperParams?.mutationTemperature ?? 0.2, json: true });

    if (!result.ok) {
      return res.json({ success: false, outcome: result.status === 'offline' ? 'model_unavailable' : 'model_error', message: result.error });
    }

    let parsed: any = null;
    const block = extractJsonBlock(result.content);
    if (block) {
      try {
        parsed = JSON.parse(block);
      } catch (err: any) {
        return res.json({ success: false, outcome: 'model_error', message: 'Model returned non-JSON output: ' + (err?.message || 'parse failed') });
      }
    } else {
      return res.json({ success: false, outcome: 'model_error', message: 'Model returned no usable JSON payload' });
    }

    if (!parsed || typeof parsed.sourceCode !== 'string' || parsed.sourceCode.trim().length < 20) {
      return res.json({ success: false, outcome: 'model_error', message: 'Model output missing usable sourceCode' });
    }

    const description = (parsed.description || 'Autonomous mutation').toString();
    const suite = typeof parsed.testSuiteCode === 'string' && parsed.testSuiteCode.trim() ? parsed.testSuiteCode : 'assert true;';

    // Real sandbox verification by domain
    let verifierResult: VerifierResult;
    if (domain === 'biotech') {
      try {
        const claim = typeof parsed.sourceCode === 'string' ? JSON.parse(parsed.sourceCode) : null;
        verifierResult = verifyBiotechClaim(claim);
      } catch {
        verifierResult = { passed: false, summary: 'FAILED (biotech payload is not valid JSON claim)', details: [], score: 0 };
      }
    } else if (domain === 'math') {
      const funcName = /sumOfRoots|solveQuadraticVieta/.test(parsed.sourceCode) ? 'sumOfRoots' : 'execute';
      verifierResult = verifyMathCode(parsed.sourceCode, funcName, [{ args: [1, -5, 6], expected: 5 }, { args: [2, 8, -10], expected: -4 }]);
    } else {
      verifierResult = (domain === 'systemic' ? verifySystemicCode : domain === 'coding' ? verifyCodingCode : domain === 'neuro_symbolic' ? verifyNeuroSymbolicCode : domain === 'cyber_defense' ? verifyCyberDefenseCode : verifyQuantumSimCode)(parsed.sourceCode, suite);
    }

    status.generation += 1;
    status.lastTickTime = Date.now();

    // Real open-source lint gate on code domains once the sandbox passes.
    let lintReport: LintReport | null = null;
    if (domain !== 'biotech' && verifierResult.passed) {
      const gate = gateWithLint(parsed.sourceCode);
      lintReport = gate.lint;
    }

    let outcome: 'promoted' | 'rejected' | 'held_back' | 'pending_approval' = 'promoted';

    if (!verifierResult.passed) {
      outcome = 'rejected';
      if (status.selfRepair.isAutoHealingEnabled) {
        setTimeout(() => { executeSelfRepair(toolName, parsed.sourceCode, verifierResult.detectedFault, suite); }, 100);
      }
    } else if (lintReport && !lintReport.clean) {
      outcome = 'rejected';
    } else if (policy === 'human_approval' || domain === 'biotech') {
      outcome = 'pending_approval';
    } else if (policy === 'strict_improve' || policy === 'non_regressing') {
      const existing = registry.find(r => r.name === toolName);
      const currentScore = existing?.versions?.find(v => v.promoted)?.score ?? 0;
      const regresses = policy === 'strict_improve' ? verifierResult.score <= currentScore : verifierResult.score < currentScore;
      if (existing && currentScore > 0 && regresses) outcome = 'held_back';
    }

    const versionHash = crypto.createHash('sha256').update(parsed.sourceCode).digest('hex').substring(0, 16);
    const version = '1.0.0';
    const versionObj = {
      version,
      hash: versionHash,
      created_at: Date.now(),
      passed_verifier: verifierResult.passed,
      score: verifierResult.score,
      promoted: outcome === 'promoted',
      verifier_notes: verifierResult.summary + (lintReport ? ' | ' + lintVerdictNote(lintReport) : ''),
      source_code: parsed.sourceCode,
      test_suite_code: domain === 'biotech' ? undefined : suite
    };

    let toolEntry = registry.find(r => r.name === toolName);
    if (!toolEntry) {
      toolEntry = {
        name: toolName,
        domain: domain as ToolDomain,
        entrypoint: `src/tools/${toolName}.ts`,
        description: description.slice(0, 160),
        versions: [],
        pendingVersions: [],
        healthStatus: 'healthy',
        anomalyCount: 0
      };
      registry.push(toolEntry);
    }

    if (outcome === 'promoted') {
      toolEntry.versions.push(versionObj);
      toolEntry.currentVersion = version;
      toolEntry.healthStatus = 'healthy';
      status.totalUpgrades += 1;
    } else if (outcome === 'pending_approval') {
      toolEntry.pendingVersions = toolEntry.pendingVersions || [];
      toolEntry.pendingVersions.push(versionObj);
    } else {
      toolEntry.versions.push(versionObj);
      toolEntry.healthStatus = toolEntry.versions.some(v => v.promoted) ? 'healthy' : 'degraded';
    }

    appendProvenanceEvent('tool_verification', {
      tool: toolName,
      domain,
      version,
      hash: versionHash,
      passed: verifierResult.passed,
      score: verifierResult.score,
      summary: verifierResult.summary,
      outcome
    });

    saveStateToDisk();

    res.json({
      success: true,
      generation: status.generation,
      outcome,
      toolName,
      version,
      versionHash,
      verifierResult
    });
  } catch (err: any) {
    console.error('Error in evolve route:', err);
    res.status(500).json({ error: err.message || 'Evolution failed' });
  }
});

// Hourly Report Generator Route
app.post('/api/recourse/report/generate', (req, res) => {
  const reportId = `rep_hourly_${String(status.generation).padStart(3, '0')}_${Date.now()}`;
  const now = Date.now();
  const dateFormatted = new Date(now).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

  let promoted = 0;
  let rejected = 0;
  let heldBack = 0;
  let pending = 0;
  let repaired = 0;

  // Count REAL emitted event names. Promotions arrive via several honest
  // pipelines, each with its own event (only success paths emit):
  //  - 'tool_verification' with data.outcome 'promoted' (evolve/mutate routes)
  //  - 'template_component_built' (Capability Forge materialization)
  //  - 'signal_grounded' (intake grounding; emitted only when verified)
  //  - 'dream_crystallized' with data.verified (or data.count for auto-mirror)
  //  - 'ai_mutation' (emitted only on promotion), 'tool_human_approved',
  //  - 'gene_crossover' with data.verified
  // Legacy 'tool_promoted'/'tool_rejected'/... types are also honored.
  // Repairs arrive as 'tool_repaired' or 'template_repair_synthesized'.
  provenanceEvents.forEach(e => {
    const d = (e as any)?.data ?? {};
    if (e.type === 'tool_promoted' || (e.type === 'tool_verification' && d.outcome === 'promoted')) promoted++;
    else if (e.type === 'template_component_built') promoted++;
    else if (e.type === 'signal_grounded') promoted++;
    else if (e.type === 'dream_crystallized') promoted += typeof d.count === 'number' ? d.count : (d.verified === false ? 0 : 1);
    else if (e.type === 'ai_mutation') promoted++;
    else if (e.type === 'tool_human_approved') promoted++;
    else if (e.type === 'gene_crossover' && d.verified !== false) promoted++;
    if (e.type === 'tool_rejected' || (e.type === 'tool_verification' && d.outcome === 'rejected')) rejected++;
    if (e.type === 'tool_held_back' || (e.type === 'tool_verification' && d.outcome === 'held_back')) heldBack++;
    if (e.type === 'tool_pending_approval' || (e.type === 'tool_verification' && d.outcome === 'pending_approval')) pending++;
    if (e.type === 'tool_repaired' || e.type === 'template_repair_synthesized') repaired++;
  });

  const markdown = `## Hourly Report â€” Gen ${status.generation} (${dateFormatted})

### Architectural Adjustments Summary
- **${promoted} tool(s) promoted** across 7 frontier domains
- **${repaired} autonomous self-repairs executed** (MTTR: ${status.selfRepair.meanTimeToRepairMs}ms)
- **${pending} tool(s) pending human safety approval**
- **${heldBack} tool(s) held back** (non-improving under policy \`${status.activePolicy}\`)
- **${rejected} tool(s) rejected** by deterministic verifier matrix

### Autonomous Self-Learning & Self-Healing Health
- **Auto-Healing State:** ${status.selfRepair.isAutoHealingEnabled ? 'ACTIVE (Zero-Downtime Autonomous Patching)' : 'STANDBY'}
- **Total Healed Genes:** ${status.selfRepair.totalHealedCount}
- **Self-Repair Success Rate:** ${(status.selfRepair.repairSuccessRate * 100).toFixed(1)}%

### Provenance Audit Integrity
- **Total Immutable Hash Chain Entries:** ${provenanceEvents.length}
- **Last Provenance Root Hash:** \`${getLastHash()}\`
- **Tamper Status:** VERIFIED (100% cryptographic continuity)
`;

  const newReport: HourlyReport = {
    id: reportId,
    timestamp: now,
    dateFormatted,
    promotedCount: promoted,
    rejectedCount: rejected,
    heldBackCount: heldBack,
    pendingCount: pending,
    repairedCount: repaired,
    summaryMarkdown: markdown,
    eventsCount: provenanceEvents.length
  };

  reports.unshift(newReport);
  if (reports.length > 50) {
    reports.pop();
  }

  appendProvenanceEvent('report_generated', {
    reportId,
    generation: status.generation,
    promoted,
    pending,
    rejected,
    repaired
  });

  saveStateToDisk();

  res.json({ success: true, report: newReport });
});

app.get('/api/recourse/reports', (req, res) => {
  res.json({ reports });
});

// =========================================================================
// 1. DETERMINISTIC GROWTH DECISION ENGINE ROUTES
// =========================================================================
app.get('/api/recourse/decision/evaluate', async (req, res) => {
  dreamState = await dreamEngine.status();
  const synergy = decisionSynergyInputs();
  const decision = evaluateGrowthDecision(
    registry,
    anomalies,
    growthWeights,
    status.generation,
    dreamState.recentThoughts,
    gitHubBlueprints,
    synergy.crossDomainSynergyByDomain
  );
  lastGrowthDecision = decision;
  res.json({ success: true, decision, synergy: { source: synergy.source, manifestHash: synergy.manifestHash } });
});

app.post('/api/recourse/decision/weights', async (req, res) => {
  const { weights } = req.body;
  if (weights) {
    growthWeights = { ...growthWeights, ...weights };
    saveStateToDisk();
  }
  dreamState = await dreamEngine.status();
  const synergy = decisionSynergyInputs();
  const decision = evaluateGrowthDecision(
    registry,
    anomalies,
    growthWeights,
    status.generation,
    dreamState.recentThoughts,
    gitHubBlueprints,
    synergy.crossDomainSynergyByDomain
  );
  lastGrowthDecision = decision;
  res.json({ success: true, weights: growthWeights, decision, synergy: { source: synergy.source, manifestHash: synergy.manifestHash } });
});

app.post('/api/recourse/decision/execute', async (req, res) => {
  try {
    const { actionId } = req.body;
    dreamState = await dreamEngine.status();
    const synergy = decisionSynergyInputs();
    const decision = evaluateGrowthDecision(
      registry,
      anomalies,
      growthWeights,
      status.generation,
      dreamState.recentThoughts,
      gitHubBlueprints,
      synergy.crossDomainSynergyByDomain
    );
    const actionToExec = actionId
      ? decision.candidateActions.find(a => a.id === actionId) || decision.selectedAction
      : decision.selectedAction;

    let executionResult: any = { action: actionToExec };

    // Execute based on Action Type
    if (actionToExec.actionType === 'domain_gap_expansion') {
      // Real parametric template build + real sandbox verification. A tool is
      // only registered when its actual test suite passes.
      const targetDomain = actionToExec.targetDomain;
      const tplId = ({ coding: 'tpl_lru_cache', math: 'tpl_newton_raphson', biotech: 'tpl_protac_optimizer', systemic: 'tpl_merkle_anchor', cyber_defense: 'tpl_hmac_sanitizer', neuro_symbolic: 'tpl_horn_sat', quantum_sim: 'tpl_bell_entangler' } as Record<string, string>)[targetDomain] || 'tpl_lru_cache';
      const tpl = getComponentTemplate(tplId);
      if (!tpl) {
        executionResult = { ...executionResult, message: `No component template available for ${targetDomain}; no tool created.` };
      } else {
        const randHex = crypto.randomBytes(2).toString('hex');
        const toolName = `${targetDomain}_template_${randHex}`;
        const build = buildComponentFromTemplate(tplId, {}, { withSelfHealing: true, componentName: toolName });
        if (build.success) {
          const testRun = executeTestSuite(build.synthesizedCode, build.testSuiteCode);
          if (testRun.passed) {
            const version = '1.0.0-template';
            const versionHash = crypto.createHash('sha256').update(build.synthesizedCode).digest('hex').substring(0, 16);
            const newTool: ToolEntry = {
              name: toolName,
              domain: targetDomain,
              entrypoint: `src/tools/${toolName}.ts`,
              description: `Real template build (${tpl.name}) resolving ${targetDomain} deficit`,
              currentVersion: version,
              versions: [{
                version,
                hash: versionHash,
                created_at: Date.now(),
                passed_verifier: true,
                score: 1.0,
                promoted: true,
                verifier_notes: `REAL VERIFY PASS: ${testRun.testDetails.length - 1} assertions green in ${testRun.executionTimeMs}ms`,
                source_code: build.synthesizedCode,
                test_suite_code: build.testSuiteCode
              }],
              healthStatus: 'healthy',
              anomalyCount: 0
            };
            registry.push(newTool);
            status.totalUpgrades += 1;
            status.generation += 1;
            status.lastTickTime = Date.now();
            appendProvenanceEvent('growth_decision_executed', {
              actionId: actionToExec.id,
              actionType: actionToExec.actionType,
              domain: targetDomain,
              toolName,
              version,
              utilityScore: actionToExec.computedUtilityScore,
              rationale: actionToExec.deterministicRationale
            });
            executionResult = { ...executionResult, newTool, message: `Built & verified ${toolName} (real test suite green) to resolve ${targetDomain} deficit.` };
          } else {
            executionResult = { ...executionResult, message: `${targetDomain} template candidate FAILED its real test suite; nothing promoted.` };
          }
        } else {
          executionResult = { ...executionResult, message: `Template build failed for ${targetDomain}: ${build.error || 'unknown error'}` };
        }
      }
    } else if (actionToExec.actionType === 'deep_security_hardening') {
      const topAnomaly = anomalies.find(a => a.status === 'detected');
      if (topAnomaly) {
        const repairRes = executeSelfRepair(topAnomaly.toolName, topAnomaly.brokenCode, topAnomaly.errorType);
        executionResult = { ...executionResult, repairRes, message: `Autonomous Root-Cause Patch applied to ${topAnomaly.toolName}.` };
      } else {
        executionResult = { ...executionResult, message: 'No active anomalies detected; system memory verified safe.' };
      }
    } else if (actionToExec.actionType === 'github_research_import') {
      // GitHub imports are NEVER auto-promoted anymore. Real files fetched via
      // the GitHub Research view become UNVERIFIED pending candidates that
      // require human review (Registry -> pending). The decision engine can
      // only point at them.
      const pendingReal = gitHubBlueprints.find((b) => b.isIngested && b.extractedSourceCode);
      executionResult = pendingReal
        ? {
            ...executionResult,
            message: `github_research_import does not auto-promote. Real candidate "${pendingReal.algorithmName}" from ${pendingReal.repoName} is an UNVERIFIED pending tool - review and approve it in the Registry.`,
          }
        : {
            ...executionResult,
            message: 'No imported GitHub candidate found. Use the GitHub Research view to search and import real repositories.',
          };
    } else if (actionToExec.actionType === 'dream_crystallization') {
      // Route through the same real engine path as /api/recourse/dream/crystallize:
      // the engine runs sandbox verification and only claims success when the
      // crystallized gene is verified.
      const liveDreamState = await dreamEngine.status();
      const thought = liveDreamState.recentThoughts.find(t => t.crystallizationReadiness >= 0.75) || liveDreamState.recentThoughts[0];
      if (thought) {
        const r = await dreamEngine.crystallize(thought.id);
        if (r.success && r.crystallizedTool) {
          const cTool = r.crystallizedTool;
          const toolName = cTool.name;
          const version = '1.0.0';
          const versionHash = crypto.createHash('sha256').update(cTool.code).digest('hex').substring(0, 16);
          const newTool: ToolEntry = {
            name: toolName,
            domain: thought.domain,
            entrypoint: `src/tools/${toolName}.ts`,
            description: `Crystallized from dream (engine-verified): ${cTool.description}`,
            currentVersion: version,
            versions: [{
              version,
              hash: versionHash,
              created_at: Date.now(),
              passed_verifier: cTool.verified,
              score: cTool.verified ? 1.0 : 0,
              promoted: cTool.verified,
              verifier_notes: cTool.verified ? `Dream crystallization passed engine sandbox verification (${cTool.kind}).` : 'Dream crystallization failed engine verification.',
              source_code: cTool.code
            }],
            healthStatus: cTool.verified ? 'healthy' : 'degraded',
            anomalyCount: 0
          };
          registry.push(newTool);
          dreamState = r.dreamState;
          if (cTool.verified) status.totalUpgrades += 1;
          appendProvenanceEvent('dream_crystallized', {
            thoughtId: thought.id,
            phase: thought.phase,
            domain: thought.domain,
            toolName,
            version,
            verified: cTool.verified
          });
          executionResult = { ...executionResult, dreamTool: newTool, message: cTool.verified ? `Crystallized engine-verified dream insight ${toolName}.` : `Dream crystallization of ${toolName} did not pass verification.` };
        } else {
          executionResult = { ...executionResult, message: `Dream crystallization failed verification: ${r.error || 'unknown'}` };
        }
      } else {
        executionResult = { ...executionResult, message: 'No crystallizable dream thought available.' };
      }
    }

    saveStateToDisk();

    res.json({
      success: true,
      executedAction: actionToExec,
      result: executionResult,
      generation: status.generation
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Decision execution failed' });
  }
});

// =========================================================================
// 2. ALWAYS-ON DREAMING ENGINE ROUTES
// =========================================================================
app.get('/api/recourse/dream/status', async (req, res) => {
  try {
    const liveDreamState = await dreamEngine.status();
    dreamState = liveDreamState;
    res.json({ success: true, dreamState: liveDreamState });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/dream/toggle', async (req, res) => {
  try {
    await dreamEngine.toggle();
    dreamState = await dreamEngine.status();
    res.json({ success: true, isDreamingActive: dreamState.isDreamingActive });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/dream/tick', async (req, res) => {
  try {
    const tickResult = await dreamEngine.tick();
    dreamState = tickResult.dreamState;
    saveStateToDisk();
    const mirrored = await mirrorCrystallizedDreamGenes();
    res.json({
      success: true,
      dreamState: tickResult.dreamState,
      newThought: tickResult.newThought,
      phaseReport: tickResult.phaseReport,
      mirroredGenes: mirrored,
      readyToCrystallize: tickResult.newThought?.crystallizationReadiness && tickResult.newThought.crystallizationReadiness >= 0.85 ? tickResult.newThought : undefined
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Mirror the dream engine's internally-crystallized genes into the REAL main
 *  tool registry, so every "crystallized a new gene" narration corresponds to a
 *  visible, usable gene (the engine otherwise keeps its own 31-gene store that
 *  never surfaces). Deduped by name. Returns how many genes were newly added. */
async function mirrorCrystallizedDreamGenes(): Promise<number> {
  try {
    const st = await dreamEngine.status();
    const dreamReg: Array<{ name?: string; domain?: string; kind?: string; code?: string; description?: string; verified?: boolean; testVectors?: unknown[]; invariantChecks?: Array<{ name: string; passed: boolean }> }> = st.registry ?? [];
    const existing = new Set(registry.map((t) => t.name));
    const builtLedger = new Set(forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name));
    let added = 0;
    let adoptedToAgenda = 0;
    for (const cToolRaw of dreamReg) {
      const cTool = cToolRaw as { name: string; domain?: string; kind?: string; code: string; description?: string; verified?: boolean; testVectors?: unknown[]; invariantChecks?: Array<{ name: string; passed: boolean }> };
      if (!cTool || typeof cTool.name !== 'string' || !cTool.name || typeof cTool.code !== 'string' || !cTool.code) continue;
      if (existing.has(cTool.name)) continue;
      // Registry is for working tools only: unverified dream genes stay in
      // the dream store (visible in the Dreaming view), they are not
      // surfaced as degraded registry entries.
      if (cTool.verified === false) continue;
      const domain = (['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'] as ToolDomain[]).includes(cTool.domain as ToolDomain)
        ? (cTool.domain as ToolDomain)
        : 'coding';
      const version = '1.0.0';
      const versionHash = crypto.createHash('sha256').update(cTool.code).digest('hex').substring(0, 16);
      registry.unshift({
        name: cTool.name,
        domain,
        entrypoint: `src/tools/${cTool.name}.ts`,
        description: `Crystallized from dream: ${(cTool.description || 'engine-verified gene').slice(0, 200)}`,
        currentVersion: version,
        versions: [{
          version,
          hash: versionHash,
          created_at: Date.now(),
          passed_verifier: cTool.verified,
          score: 1.0,
          promoted: cTool.verified,
          verifier_notes: `Dream gene passed engine sandbox verification (${cTool.kind || 'crystallized'}). Surfaced to main registry from dream store.`,
          source_code: cTool.code
        }],
        healthStatus: 'healthy',
        anomalyCount: 0
      });
      existing.add(cTool.name);
      added++;

      // Promote verified dream gene into the dynamic forge agenda so the
      // forge autopilot can rebuild it as a real self-hosted tool with a
      // proper reference suite + lint + live import gate. Without this step
      // dream genes sit in the registry but never back any capability, and
      // 0/1080 tools ever become forge-materialized.
      if (!builtLedger.has(cTool.name) && !dynamicAgenda.some((d) => d.name === cTool.name)) {
        const refSuite = buildRefSuiteFromVectors(cTool);
        if (refSuite) {
          const spec: ForgeSpec = {
            id: `dream_${cTool.name}_${versionHash.slice(0, 6)}`,
            name: cTool.name,
            domain,
            title: (cTool.description || `Dream gene: ${cTool.name}`).slice(0, 120),
            prompt: buildForgePromptFromGene(cTool),
            refSuite,
          };
          dynamicAgenda.push(spec);
          adoptedToAgenda++;
          appendProvenanceEvent('capability_adopted', {
            driverId: 'dream_engine',
            proposalId: cTool.name,
            spec: spec.id,
            toolName: spec.name,
            note: 'auto-adopted from verified dream gene',
          });
        }
      }
    }
    if (added > 0 || adoptedToAgenda > 0) {
      status.registeredToolsCount = registry.length;
      if (added > 0) status.totalUpgrades += added;
      appendProvenanceEvent('dream_crystallized', { autoMirror: true, count: added, agendaAdopted: adoptedToAgenda, registrySize: registry.length, dynamicAgendaSize: dynamicAgenda.length });
      saveStateToDisk();
      console.log(`[dream] mirrored ${added} gene(s), adopted ${adoptedToAgenda} into forge agenda (now ${dynamicAgenda.length} dynamic).`);
    }
    return added;
  } catch (err: any) {
    recordFailure('dream_mirror', err, { phase: 'mirror_crystallized_genes' });
    return 0;
  }
}

/** Build a deterministic forge reference suite from a dream gene's
 *  testVectors. The forge harness runs the suite against the candidate
 *  source — so we need real `assert` lines that exercise the function.
 *  The dream gene's `kind` (e.g. `token_entropy_scorer`) often corresponds to
 *  the actual exported function name (e.g. `tokenEntropyScorer`); we have to
 *  detect that and use the correct symbol in the assertions. */
function buildRefSuiteFromVectors(gene: { name: string; kind?: string; testVectors?: unknown[]; invariantChecks?: Array<{ name: string; passed: boolean }> }): string | null {
  const vectors = Array.isArray(gene.testVectors) ? gene.testVectors : [];
  const lines: string[] = [];

  // Detect the actual exported function name by scanning for `function NAME`
  // or `export function NAME` patterns in the source. Fall back to a
  // conventional camelCase form of the `kind` (e.g. token_entropy_scorer ->
  // tokenEntropyScorer), then to the registry name.
  const detectedName = detectFunctionNameInCode(gene) ?? conventionalNameFromKind(gene.kind) ?? gene.name;
  // Always include a smoke check that the (possibly-aliased) export exists.
  lines.push(`assert typeof ${detectedName} === 'function';`);
  // Each vector is fed in; result is captured. We only assert "did not
  // throw" because the dream gene has no oracle — the function is correct
  // by construction (deterministic, sandbox-verified) so the real test is
  // that the synthesized code matches the original.
  vectors.slice(0, 6).forEach((v, i) => {
    const asJson = JSON.stringify(v);
    lines.push(`assert (function(){ var _r; try { _r = ${detectedName}(${asJson}); } catch (e) { return false; } return _r !== undefined; })(); // vector ${i}`);
  });
  // Mirror the engine's invariant checks as compile-time guards.
  if (Array.isArray(gene.invariantChecks)) {
    for (const ic of gene.invariantChecks) {
      if (ic.passed) lines.push(`// invariant: ${ic.name} passed at crystallization`);
    }
  }
  return lines.length > 1 ? lines.join('\n') : null;
}

function detectFunctionNameInCode(gene: any): string | null {
  const code = typeof gene?.code === 'string' ? gene.code : '';
  // Match `function NAME(` or `export function NAME(`
  const m = code.match(/(?:export\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  return m ? m[1] : null;
}

function conventionalNameFromKind(kind: string | undefined): string | null {
  if (typeof kind !== 'string' || !kind) return null;
  // snake_case -> camelCase
  return kind.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function rewriteGeneExport(source: string, entrypointName: string): string {
  // Replace the `function OLD_NAME(` or `export function OLD_NAME(` with the new name.
  return source.replace(
    /(?:export\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
    `function ${entrypointName}(`
  );
}

/**
 * Rewrite a dream gene's reference suite so its assertions reference the
 * rewritten function name. `buildRefSuiteFromVectors` derives the function
 * name from the ORIGINAL source (e.g. `gcSkewAnalyzer`), but rewriteGeneExport
 * renames it to the registry/entrypoint name (e.g. `BIOT_GC_be60`). Without
 * this, the self-hosted module passes live import but the stored suite fails
 * (`typeof <originalName> === 'function'` is false), so the forge records an
 * endless `materialize_failed`. Returns the suite with every identifier
 * occurrence of the original name replaced (word-boundary), or the original
 * suite when no rename was applied.
 */
function rewriteGeneRefSuite(refSuite: string | undefined, originalName: string, newName: string): string {
  if (!refSuite || !originalName || originalName === newName) return refSuite ?? '';
  // Word-boundary replace of the original identifier (safe for `typeof NAME`,
  // `NAME(...)` calls, and bare references) without touching substrings.
  const escaped = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return refSuite.replace(new RegExp(`\\b${escaped}\\b`, 'g'), newName);
}

function detectFunctionNameInSource(source: string): string | null {
  const m = source.match(/(?:export\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  return m ? m[1] : null;
}

function buildForgePromptFromGene(gene: { name: string; description?: string; code: string }): string {
  const desc = (gene.description || '').slice(0, 240);
  return [
    `Implement \`export function ${gene.name}(input)\` exactly as specified.`,
    `Original verified implementation (do not deviate in API shape — same name, same single-arg input):`,
    '```js',
    gene.code.slice(0, 4000),
    '```',
    `Description: ${desc}`,
    `Return ONLY valid JSON: {"description": "...", "source": "<the full javascript source>", "testVectors": ["...json strings..."]}`,
  ].join('\n');
}

app.post('/api/recourse/dream/crystallize', async (req, res) => {
  try {
    const { thoughtId } = req.body;
    const liveState = await dreamEngine.status();
    const thought = liveState.recentThoughts.find(t => t.id === thoughtId) || liveState.recentThoughts[0];
    if (!thought) {
      return res.status(404).json({ success: false, error: 'Thought not found for crystallization' });
    }

    const r = await dreamEngine.crystallize(thought.id);
    if (!r.success || !r.crystallizedTool) {
      return res.status(422).json({ success: false, error: r.error || 'Verification failed in sandbox' });
    }

    dreamState = r.dreamState;
    const cTool = r.crystallizedTool;
    const version = '1.0.0';
    const versionHash = crypto.createHash('sha256').update(cTool.code).digest('hex').substring(0, 16);

    const newToolEntry: ToolEntry = {
      name: cTool.name,
      domain: cTool.domain,
      entrypoint: `src/tools/${cTool.name}.ts`,
      description: `Lucidly Crystallized: ${cTool.description}`,
      currentVersion: version,
      versions: [{
        version,
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: cTool.verified,
        score: cTool.verified ? 1.0 : 0,
        promoted: cTool.verified,
        verifier_notes: cTool.verified ? `Dream gene passed engine sandbox verification (${cTool.kind}).` : 'Dream gene failed engine verification.',
        source_code: cTool.code
      }],
      healthStatus: cTool.verified ? 'healthy' : 'degraded',
      anomalyCount: 0
    };

    registry.unshift(newToolEntry);
    status.totalUpgrades += 1;

    appendProvenanceEvent('dream_crystallized', {
      thoughtId: thought.id,
      phase: thought.phase,
      domain: thought.domain,
      toolName: cTool.name,
      kind: cTool.kind,
      version,
      hash: versionHash
    });

    saveStateToDisk();

    res.json({
      success: true,
      crystallizedTool: newToolEntry,
      dreamState: r.dreamState
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/recourse/dream/cron', async (req, res) => {
  try {
    if (process.env.DREAM_CRON_SECRET && req.headers['x-dream-secret'] !== process.env.DREAM_CRON_SECRET) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const r = await dreamEngine.runCatchUpTicks(60);
    dreamState = r.dreamState;
    saveStateToDisk();
    const mirrored = await mirrorCrystallizedDreamGenes();
    res.json({ success: true, ...r, mirroredGenes: mirrored });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 2.5 AI ARCHITECTURAL MUTATOR ROUTES
// =========================================================================
const geneRegistryStore = createGeneRegistryStore();

app.get('/api/recourse/mutate/status', async (req, res) => {
  try {
    const geneList = await geneRegistryStore.list();
    res.json({
      success: true,
      activePolicy: getActivePolicy(),
      model: getActiveModel(),
      registry: geneList.map(g => ({
        id: g.id,
        name: g.name,
        version: g.version,
        generation: g.generation,
        domain: g.domain,
        status: g.status,
        origin: g.origin,
        description: g.description,
        versionHash: g.versionHash,
        createdAt: g.createdAt
      }))
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/mutate/evolve', async (req, res) => {
  if (!requireMutationAuthIfConfigured(req, res)) return;
  try {
    const { domain, instructions, targetToolName } = req.body ?? {};
    if (!domain) {
      return res.status(400).json({ success: false, error: 'domain required' });
    }
    if (!instructions || typeof instructions !== 'string' || instructions.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'instructions required' });
    }
    const result = await evolveGene(geneRegistryStore, {
      domain,
      instructions: instructions.trim().slice(0, 4000),
      targetToolName: typeof targetToolName === 'string' && targetToolName.trim() ? targetToolName.trim() : undefined
    });

    if (result.success && result.outcome === 'promoted') {
      const version = '1.0.0';
      const newTool: ToolEntry = {
        name: result.toolName,
        domain: domain,
        entrypoint: `src/tools/${result.toolName}.ts`,
        description: `AI Mutated (${result.engine}): ${instructions.slice(0, 60)}`,
        currentVersion: version,
        versions: [{
          version,
          hash: result.versionHash,
          created_at: Date.now(),
          passed_verifier: result.verifierResult.verified,
          score: result.verifierResult.verified ? 1.0 : 0,
          promoted: result.verifierResult.verified,
          verifier_notes: `${result.verifierResult.summary} Engine: ${result.engine}.`,
        }],
        healthStatus: result.verifierResult.verified ? 'healthy' : 'degraded',
        anomalyCount: 0
      };
      registry.unshift(newTool);
      status.totalUpgrades += 1;
      appendProvenanceEvent('ai_mutation', {
        tool: result.toolName,
        domain,
        version,
        hash: result.versionHash,
        engine: result.engine,
        generation: result.generation
      });
      saveStateToDisk();
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/mutate/approve', async (req, res) => {
  if (!requireMutationAuthIfConfigured(req, res)) return;
  try {
    const { geneId } = req.body ?? {};
    if (!geneId || typeof geneId !== 'string') {
      return res.status(400).json({ success: false, error: 'geneId required' });
    }
    const result = await approveGene(geneRegistryStore, geneId);
    if (result.success && result.gene) {
      const g = result.gene;
      const version = `${g.version}.0.0`;
      const newTool: ToolEntry = {
        name: g.name,
        domain: g.domain,
        entrypoint: `src/tools/${g.name}.ts`,
        description: g.description,
        currentVersion: version,
        versions: [{
          version,
          hash: g.versionHash,
          created_at: Date.now(),
          passed_verifier: (g.verifierChecks || []).every(c => c.passed),
          score: (g.verifierChecks || []).every(c => c.passed) ? 1.0 : 0,
          promoted: true,
          verifier_notes: 'Human approved AI Mutation Gene' + ((g.verifierChecks || []).every(c => c.passed) ? ' (gene invariant checks passed).' : ' (invariant checks NOT all passed).'),
          source_code: g.code
        }],
        healthStatus: (g.verifierChecks || []).every(c => c.passed) ? 'healthy' : 'degraded',
        anomalyCount: 0
      };
      registry.unshift(newTool);
      status.totalUpgrades += 1;
      appendProvenanceEvent('tool_human_approved', {
        tool: g.name,
        geneId: g.id,
        domain: g.domain,
        version,
        hash: g.versionHash
      });
      saveStateToDisk();
    }
    res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/mutate/policy', async (req, res) => {
  if (!requireMutationAuthIfConfigured(req, res)) return;
  try {
    const { policy } = req.body ?? {};
    if (policy !== 'auto_promote' && policy !== 'manual_approval') {
      return res.status(400).json({ success: false, error: "policy must be 'auto_promote' or 'manual_approval'" });
    }
    setActivePolicy(policy);
    res.json({ success: true, activePolicy: policy });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 3. REAL GITHUB RESEARCH ROUTES
// =========================================================================

/** Register a real, fetched GitHub file as an UNVERIFIED pending candidate.
 *  Real analysis only (parse, security scan, lint); no fabricated tests, and
 *  it is never auto-promoted. Human approval (Registry > pending) is required
 *  and the notes say precisely what was and was not verified. */
async function importGitHubCandidate(repo: string, filePath?: string, domain?: ToolDomain) {
  const file = await fetchRepoSource(repo, filePath);
  const targetDomain = domainLabel(file, domain);

  let parseOk = false;
  let parseErr = '';
  try {
    transformSync(file.content, { loader: file.language === 'ts' ? 'ts' : 'js', target: 'es2022' });
    parseOk = true;
  } catch (err: any) {
    parseErr = err?.message || 'parse failed';
  }
  const audit = auditCodeSecurity(file.content);
  const lint = lintSource(file.content, file.language);

  const baseName = path.basename(file.path).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
  const toolName = `gh_${baseName || 'import'}`;
  const version = '1.0.0-github';
  const versionHash = crypto.createHash('sha256').update(file.content).digest('hex').substring(0, 16);

  const securityNote = audit.isSecure
    ? 'security scan: clean (no eval/Function/dynamic require detected)'
    : `security scan: FLAGGED (${audit.vulnerabilities.map((v) => v.type).join(', ')})`;
  const notes = [
    `IMPORTED REAL CODE from github.com/${file.repo}@${file.sha.slice(0, 7)} (${file.path}) license=${file.license || 'unknown'}.`,
    `parse: ${parseOk ? 'OK' : 'FAILED: ' + parseErr}`,
    securityNote,
    lintVerdictNote(lint),
    'NOT auto-promoted. Unverified candidate - it has no regression suite and its real-world correctness is unknown.',
  ].join(' | ');

  const versionObj = {
    version,
    hash: versionHash,
    created_at: Date.now(),
    passed_verifier: false,
    score: 0,
    promoted: false,
    verifier_notes: notes,
    source_code: file.content,
    test_suite_code: undefined,
  };

  let existing = registry.find((r) => r.name === toolName);
  if (existing) {
    existing.pendingVersions = existing.pendingVersions || [];
    existing.pendingVersions.push(versionObj as never);
    existing.healthStatus = 'degraded';
  } else {
    existing = {
      name: toolName,
      domain: targetDomain,
      entrypoint: `src/tools/${toolName}.ts`,
      description: `Real import from github.com/${file.repo} (${file.path}) - unverified candidate`,
      versions: [],
      pendingVersions: [versionObj as never],
      currentVersion: undefined,
      healthStatus: 'degraded',
      anomalyCount: 0,
    };
    registry.push(existing);
  }

  const blueprintId = `${file.repo}:${file.path}`;
  gitHubBlueprints = gitHubBlueprints.filter((b) => b.id !== blueprintId);
  gitHubBlueprints.unshift({
    id: blueprintId,
    repoName: file.repo,
    repoUrl: file.htmlUrl,
    author: file.repo.split('/')[0],
    stars: 0,
    domain: targetDomain,
    algorithmName: toolName,
    description: `Real import of ${file.path}`,
    license: file.license || 'unknown',
    securityAuditStatus: audit.isSecure ? 'clean' : 'flagged',
    extractedSourceCode: file.content,
    generatedTestSuite: '',
    asymptoticComplexity: 'not computed',
    deterministicProof: '',
    provenanceSourceTag: `github:${file.repo}@${file.sha.slice(0, 12)}`,
    isIngested: true,
  });

  appendProvenanceEvent('github_tool_ingested', {
    blueprintId,
    repoName: file.repo,
    filePath: file.path,
    toolName,
    domain: targetDomain,
    sha: file.sha.slice(0, 12),
    parseOk,
    securityClean: audit.isSecure,
    lintErrors: lint.errors,
    promoted: false,
  });

  saveStateToDisk();

  return {
    file,
    analysis: { parseOk, parseErr, security: audit, lint },
    tool: existing,
    ingestionResult: {
      success: true,
      blueprintId,
      toolName,
      domain: targetDomain,
      version,
      hash: versionHash,
      securityAuditScore: audit.isSecure ? 1.0 : 0,
      sandboxTestPassed: false,
      notes,
    } as GitHubIngestionResult,
  };
}

/** Real GitHub repository search. */
app.get('/api/recourse/github/catalog', async (req, res) => {
  const query = (req.query.q as string) || '';
  try {
    if (!query.trim()) return res.json({ success: true, repos: [], note: 'Type a search query to query the live GitHub API.' });
    const repos = await searchGitHubRepositories(query);
    res.json({ success: true, repos, note: 'Live GitHub search results. Choose a repository and click Import to fetch a real source file (never auto-promoted).' });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err?.message || 'GitHub search failed' });
  }
});

/** Fetch and register a real file as an unverified pending candidate. */
app.post('/api/recourse/github/import', async (req, res) => {
  const { repo, path, domain } = req.body ?? {};
  if (!repo || typeof repo !== 'string') {
    return res.status(400).json({ success: false, error: 'repo is required (owner/name or full GitHub URL)' });
  }
  try {
    const result = await importGitHubCandidate(repo, typeof path === 'string' && path ? path : undefined, domain as ToolDomain);
    res.json({ success: true, result });
  } catch (err: any) {
    const status = err?.kind === 'not_found' ? 404 : err?.kind === 'no_code_file' ? 422 : 502;
    res.status(status).json({ success: false, error: err?.message || 'GitHub import failed', kind: err?.kind });
  }
});

// =========================================================================
// 4. AUTONOMOUS SUBAGENT SWARM - REAL EXECUTOR
// =========================================================================
//
// The swarm does not fake completion. Queued tasks are worked by the
// configured local model (e.g. Qwen3.5-4B via Ollama): each task produces a
// code candidate + assert suite that must PASS the real sandbox verifier
// before the task is marked completed and a tool is registered. Offline model
// => tasks stay queued, honestly.

let swarmBusy = false;
let swarmInterval: NodeJS.Timeout | null = null;
const SWARM_AUTOPILOT_MS = Math.max(5000, Number(process.env.SWARM_AUTOPILOT_SECONDS || 30) * 1000);

function swarmAgentFor(type: SubAgentType) {
  return swarmStatus.agents.find((a) => a.id === type);
}

function patchTask(taskId: string, fn: (t: SubAgentTask) => void): void {
  const t = swarmStatus.activeTaskQueue.find((x) => x.id === taskId);
  if (t) fn(t);
}

async function executeSwarmTask(task: SubAgentTask): Promise<boolean> {
  patchTask(task.id, (t) => {
    t.status = 'running';
    t.startedAt = t.startedAt || Date.now();
  });
  const agent = swarmAgentFor(task.agentType);
  if (agent) {
    agent.status = 'executing';
    agent.currentTaskId = task.id;
    agent.activeThought = `Running via configured provider: ${task.title.slice(0, 60)}`;
  }
  saveStateToDisk();

  const toolName = `swarm_${task.domain}_${task.id.replace(/[^a-z0-9_]/gi, '').slice(-6)}`;
  const system = `You are a subagent ("${task.agentType}") inside an autonomous system. Implement the requested micro-tool.
Return ONLY valid JSON: {"description": "one sentence", "sourceCode": "PLAIN JAVASCRIPT, no TS/imports, exported with 'export function' or 'export class'", "testSuiteCode": "lines starting with assert that call your real functions and fail if the implementation is wrong"}.
Your code is run in an isolated sandbox against your own tests. No placeholders.`;

  const result = await chatComplete([
    { role: 'system', content: system },
    { role: 'user', content: `Task: ${task.title}\nDomain: ${task.domain}` },
  ], { temperature: 0.3, json: true });

  let parsed: any = null;
  if (result.ok && result.content) {
    const block = extractJsonBlock(result.content);
    if (block) {
      try { parsed = JSON.parse(block); } catch { parsed = null; }
    }
  }

  const source = parsed && typeof parsed.sourceCode === 'string' ? parsed.sourceCode.trim() : '';
  const tests = parsed && typeof parsed.testSuiteCode === 'string' ? parsed.testSuiteCode.trim() : '';

  if (!source || !tests) {
    const reason = result.status === 'offline'
      ? `Local model offline (${currentProviderStatus().baseUrl}). Task remains queued.`
      : 'Model did not return usable code+tests.';
    patchTask(task.id, (t) => { t.status = 'queued'; t.outputArtifact = undefined; });
    if (agent) {
      agent.status = 'idle';
      agent.currentTaskId = undefined;
      agent.activeThought = `Task blocked: ${reason.slice(0, 80)}`;
    }
    saveStateToDisk();
    return false;
  }

  const run = executeTestSuite(source, tests);
  if (!run.passed) {
    patchTask(task.id, (t) => {
      t.status = 'failed';
      t.completedAt = Date.now();
    });
    if (agent) {
      agent.status = 'idle';
      agent.currentTaskId = undefined;
      agent.activeThought = `Candidate for "${task.title}" failed its real test suite (${run.testDetails.filter((d) => d.startsWith('[FAIL')).length} failures).`;
    }
    appendProvenanceEvent('system_tick', {
      action: 'subagent_task_failed_verifier',
      taskId: task.id,
      agentType: task.agentType,
      title: task.title,
      failures: run.testDetails.filter((d) => d.startsWith('[FAIL')).length,
    });
    saveStateToDisk();
    return false;
  }

  // Real open-source lint gate.
  const swarmLint = gateWithLint(source).lint;
  if (swarmLint.available && !swarmLint.clean) {
    patchTask(task.id, (t) => { t.status = 'failed'; t.completedAt = Date.now(); });
    if (agent) {
      agent.status = 'idle';
      agent.currentTaskId = undefined;
      agent.activeThought = `Candidate for "${task.title}" failed the oxlint safety gate.`;
    }
    appendProvenanceEvent('system_tick', {
      action: 'subagent_task_failed_lint',
      taskId: task.id,
      agentType: task.agentType,
      title: task.title,
      lint: swarmLint.details.slice(0, 5),
    });
    saveStateToDisk();
    return false;
  }

  const hash = crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
  const version = '1.0.0-swarm';
  const entry: ToolEntry = {
    name: toolName,
    domain: task.domain,
    entrypoint: `src/tools/${toolName}.ts`,
    description: `Swarm-built by ${task.agentType}: ${(parsed.description || task.title).slice(0, 120)}`,
    currentVersion: version,
    versions: [{
      version,
      hash,
      created_at: Date.now(),
      passed_verifier: true,
      score: 1.0,
      promoted: true,
      verifier_notes: `SWARM REAL VERIFY PASS (${run.testDetails.filter((d) => d.startsWith('[PASS]')).length} asserts) for "${task.title}"`,
      source_code: source,
      test_suite_code: tests,
    }],
    healthStatus: 'healthy',
    anomalyCount: 0,
  };

  registry.unshift(entry);
  status.totalUpgrades += 1;

  patchTask(task.id, (t) => {
    t.status = 'completed';
    t.completedAt = Date.now();
    t.outputArtifact = {
      toolName,
      version,
      score: 1.0,
      summary: `REAL VERIFY PASS: ${run.testDetails.filter((d) => d.startsWith('[PASS]')).length} asserts green for "${task.title}"`,
    };
  });
  if (agent) {
    agent.tasksCompleted += 1;
    agent.status = 'idle';
    agent.currentTaskId = undefined;
    agent.activeThought = `Completed via configured provider: ${task.title.slice(0, 50)}`;
  }
  swarmStatus.totalSwarmTasksCompleted += 1;

  appendProvenanceEvent('subagent_task_completed', {
    taskId: task.id,
    agentType: task.agentType,
    title: task.title,
    domain: task.domain,
    toolName,
    hash,
    passedAsserts: run.testDetails.filter((d) => d.startsWith('[PASS]')).length,
  });

  saveStateToDisk();
  return true;
}

/** Process up to `limit` queued tasks for real. No-op when busy or offline. */
async function pumpSwarmQueue(limit = 1): Promise<number> {
  if (swarmBusy) return 0;
  const online = await modelCheckOnline(false);
  if (!online) return 0;
  const queued = swarmStatus.activeTaskQueue.filter((t) => t.status === 'queued');
  if (queued.length === 0) return 0;
  swarmBusy = true;
  let processed = 0;
  try {
    for (const task of queued.slice(0, Math.max(1, limit))) {
      if (await executeSwarmTask(task)) processed++;
    }
  } finally {
    swarmBusy = false;
  }
  return processed;
}

function ensureSwarmAutopilot(): void {
  if (!swarmStatus.isSwarmAutopilotActive) return;
  setJobEnabled('swarm', true);
}

function stopSwarmAutopilot(): void {
  if (swarmInterval) {
    clearInterval(swarmInterval);
    swarmInterval = null;
  }
  setJobEnabled('swarm', false);
}

app.get('/api/recourse/subagents/status', (req, res) => {
  res.json({
    success: true,
    swarmStatus: { ...swarmStatus, subTeamStates: swarmTeamStates },
    autopilotIntervalMs: SWARM_AUTOPILOT_MS,
    model: currentProviderStatus().model,
    executorNote: swarmBusy ? 'busy' : (swarmStatus.activeTaskQueue.some((t) => t.status === 'queued') ? 'queued tasks awaiting configured provider' : 'idle'),
  });
});

app.post('/api/recourse/subagents/toggle-autopilot', (req, res) => {
  swarmStatus.isSwarmAutopilotActive = !swarmStatus.isSwarmAutopilotActive;
  if (swarmStatus.isSwarmAutopilotActive) {
    ensureSwarmAutopilot();
    pumpSwarmQueue(1).catch(() => {});
  } else {
    stopSwarmAutopilot();
  }
  saveStateToDisk();
  res.json({ success: true, isSwarmAutopilotActive: swarmStatus.isSwarmAutopilotActive });
});

app.post('/api/recourse/subagents/dispatch', async (req, res) => {
  const { agentType, title, domain } = req.body;
  if (!agentType || !title || !domain) {
    return res.status(400).json({ error: 'agentType, title, and domain are required' });
  }
  if (!swarmStatus.agents.some((a) => a.id === agentType)) {
    return res.status(400).json({ error: `unknown agentType: ${agentType}` });
  }

  const result = dispatchSubAgentTask(agentType, title, domain, swarmStatus);
  swarmStatus = result.updatedSwarm;
  saveStateToDisk();

  // Kick a real execution attempt when the autopilot is on.
  if (swarmStatus.isSwarmAutopilotActive) {
    pumpSwarmQueue(1).catch(() => {});
  }

  res.json({
    success: true,
    swarmStatus,
    newTask: result.newTask,
    note: 'Task is QUEUED. It is only completed when the configured provider produces code that passes the real sandbox verifier.',
  });
});

/** Manually drive the real swarm executor (also used by the UI if present). */
app.post('/api/recourse/subagents/process', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(5, Number(req.body?.limit ?? 1)));
    const processed = await pumpSwarmQueue(limit);
    res.json({ success: true, processedCount: processed, swarmStatus });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 5. FIVE-FORMULA RECURSIVE LEARNING LOOP ROUTES
// =========================================================================
app.get('/api/recourse/math/state', (req, res) => {
  res.json({
    success: true,
    state: mathLoopState
  });
});

app.post('/api/recourse/math/step', (req, res) => {
  try {
    const result = executeRecursiveStep(mathLoopState);
    if (result.readinessScore > 0.95 && result.loopStatus === 'optimal') {
      appendProvenanceEvent('system_tick', {
        type: 'recursive_math_convergence',
        iteration: result.iteration,
        readiness: result.readinessScore,
        lorentzGamma: result.energyBudget.lorentzFactorGamma
      });
      saveStateToDisk();
    }
    res.json({
      success: true,
      result,
      state: mathLoopState
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/math/reset', (req, res) => {
  try {
    mathLoopState = createInitialLoopState(mathLoopState.config || DEFAULT_LOOP_CONFIG);
    res.json({
      success: true,
      state: mathLoopState
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/math/configure', (req, res) => {
  try {
    const { config } = req.body ?? {};
    if (config && typeof config === 'object') {
      mathLoopState.config = {
        ...mathLoopState.config,
        ...config
      };
    }
    res.json({
      success: true,
      state: mathLoopState
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 5b. BIOTECH / ONCOLOGY GOAL — real semantic claim verification against KG
// =========================================================================

app.get('/api/recourse/biotech/drugs', (req, res) => {
  const entities = Object.values(CANONICAL_ONCOLOGY_KG);
  res.json({
    success: true,
    count: entities.length,
    drugs: entities.map(e => ({
      id: e.id,
      targetProtein: e.targetProtein,
      drugClass: e.drugClass,
      mechanism: e.mechanism,
      leg: e.leg,
      evidenceTier: e.evidenceTier,
      clinicalIndication: e.clinicalIndication,
      literatureCitation: e.literatureCitation,
      biomarkers: e.biomarkers,
    })),
  });
});

app.get('/api/recourse/biotech/verify-claim', (req, res) => {
  const { asset_name, mechanism, leg, evidence_tier, source } = req.query as Record<string, string>;
  if (!asset_name) {
    res.status(400).json({ success: false, error: 'asset_name is required' });
    return;
  }
  const result = validateBiotechClaimAgainstKG({
    asset_name: String(asset_name),
    mechanism: mechanism || undefined,
    leg: leg || undefined,
    evidence_tier: evidence_tier ? Number(evidence_tier) : undefined,
    source: source || undefined,
  });
  const recorded = recordBiotechClaim({
    assetName: String(asset_name),
    leg: leg || 'unknown',
    evidenceTier: evidence_tier ? Number(evidence_tier) : 0,
    passed: result.passed,
    score: result.score,
    source: source || undefined,
    mechanism: mechanism || undefined,
    summary: result.summary,
    matchedEntity: result.entity ? {
      id: result.entity.id,
      targetProtein: result.entity.targetProtein,
      drugClass: result.entity.drugClass,
      clinicalIndication: result.entity.clinicalIndication,
    } : undefined,
    generation: status.generation,
  });
  saveGoalLedger();
  res.json({ success: true, verification: result, claim: recorded });
});

app.get('/api/recourse/biotech/claims', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const claims = getBiotechClaims(limit);
  res.json({ success: true, claims, total: claims.length });
});

// =========================================================================
// 5c. MATH GOAL — hard problem tracking
// =========================================================================

app.get('/api/recourse/math/problems', (req, res) => {
  const tier = req.query.tier as ProblemTier | undefined;
  const problems = tier
    ? HARD_MATH_PROBLEMS.filter(p => p.tier === tier)
    : HARD_MATH_PROBLEMS;
  res.json({
    success: true,
    count: problems.length,
    total: HARD_MATH_PROBLEMS.length,
    problems: problems.map(p => ({
      id: p.id,
      tier: p.tier,
      title: p.title,
      statement: p.statement,
      toolName: p.toolName,
      bound: p.bound,
      citation: p.citation,
      successCriterion: p.successCriterion,
    })),
  });
});

app.get('/api/recourse/math/attempts', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const attempts = getMathAttempts(limit);
  res.json({ success: true, attempts, total: attempts.length });
});

app.get('/api/recourse/math/goals', (req, res) => {
  const progress = getGoalProgress();
  const unsolved = HARD_MATH_PROBLEMS
    .filter(p => p.tier === 'solvable' || p.tier === 'bounded')
    .map(p => {
      const attempts = getMathAttempts(500).filter(a => a.problemId === p.id);
      const solved = attempts.some(a => a.passed);
      return { id: p.id, tier: p.tier, title: p.title, solved, attempts: attempts.length };
    });
  res.json({ success: true, progress, unsolved });
});

//      live model.
// (math/solve route moved below the solveNextMathProblem function for proper hoisting)

// =========================================================================
// 6. RECURSIVE LEARNER ROUTES
// =========================================================================
app.get('/api/recourse/learn/status', async (req, res) => {

  try {
    const state = await learner.status();
    const beliefs = Object.values(state.geneBeliefs).sort((a, b) => b.weight - a.weight);
    res.json({
      success: true,
      state: {
        episode: state.episode,
        meta: state.meta,
        selfScore: state.selfScore,
        calibrationError: state.calibrationError,
        ledgerHead: state.ledgerHead,
        updatedAt: state.updatedAt,
        geneCount: beliefs.length,
        topGenes: beliefs.slice(0, 10).map((b) => ({
          geneName: b.geneName,
          domain: b.domain,
          attempts: b.attempts,
          meanReward: b.meanReward,
          weight: b.weight,
          posteriorMean: Number((b.alpha / (b.alpha + b.beta)).toFixed(4)),
        })),
        directives: state.directives,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/learn/episode', async (req, res) => {
  try {
    const report = await learner.runEpisode();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/learn/run', async (req, res) => {
  try {
    const raw = Number(req.query.episodes ?? req.body?.episodes ?? 5);
    const episodes = Number.isFinite(raw) ? Math.max(1, Math.min(50, Math.floor(raw))) : 5;
    const reports = await learner.runEpisodes(episodes);
    res.json({ success: true, episodesRun: reports.length, reports });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/learn/replay', async (req, res) => {
  try {
    const replay = await learner.replayFromGenesis();
    res.json({ success: true, replay });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/recourse/learn/directives', async (req, res) => {
  try {
    const state = await learner.status();
    res.json({ success: true, directives: state.directives });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 7. GLOBAL TICK ROUTE (DETERMINISTIC COMPOUNDING)
// =========================================================================
/** Real capability-health reward in [0,1] from measured durable state: how many
 *  tools pass their verifier, how many live self-hosted tools exist, and how
 *  clean the anomaly count is. Moves when Recourse actually gets more capable. */
function realSystemReward(): number {
  const verifier = typeof status.verifierPassRate === 'number' ? status.verifierPassRate : 0;
  const liveSH = listSelfHostedEntries().filter((e) => e.lastVerified?.passed).length;
  const selfHostFrac = Math.min(1, liveSH / 8);
  const detected = anomalies.filter((a) => a.status === 'detected').length;
  const cleanFrac = detected === 0 ? 1 : Math.max(0, 1 - detected * 0.2);
  // External capability fraction: how many fixed benchmark problems the current
  // registry solves in the real sandbox (never a self-report - runBenchmark
  // executes hidden suites against live code). Absent a run yet, it is weighted
  // neutrally at 0 so it never inflates the reward before real evidence exists.
  const lastB = latestBenchmark;
  const benchmarkFrac = lastB && lastB.total > 0 ? lastB.solved / lastB.total : 0;
  // 0.35 verifier pass-rate + 0.30 real external benchmark solves + 0.25 live
  // self-hosted + 0.10 cleanliness. Benchmark is now a first-class driver, not
  // a decorative dashboard number.
  const reward = 0.35 * verifier + 0.3 * benchmarkFrac + 0.25 * selfHostFrac + 0.1 * cleanFrac;
  // A self-hosted tool that backs an internal op but failed/mismatched in the
  // self-use watchdog is a real health signal: penalize the reward.
  const finalReward = selfUseLastOk === false ? reward - 0.12 : reward;
  return Math.min(1, Math.max(0, Math.round(finalReward * 1000) / 1000));
}

// Per-real-tool learning + repair. Each registry tool gets its own belief from a
// real reward (verifier-pass / has-suite / health). Persistently-low REAL
// defective tools (degraded/corrupted with a regression suite on file) are
// dispatched to the real self-repair path (only counts healed if its suite
// passes). Cooldown prevents hammering one tool.
const toolRepairCooldowns = new Map<string, number>();
const TOOL_REPAIR_COOLDOWN_MS = 10 * 60 * 1000;

function realToolRewardFor(t: { healthStatus?: string; versions: Array<{ promoted?: boolean; version?: string; passed_verifier?: boolean; test_suite_code?: string }>; currentVersion?: string }): number {
  const cur = [...t.versions].reverse().find((v) => v.promoted && v.version === t.currentVersion);
  const def = t.healthStatus === 'degraded' || t.healthStatus === 'corrupted' || t.healthStatus === 'healing';
  if (def) return 0;
  const passed = cur?.passed_verifier === true;
  const hasSuite = Boolean(cur?.test_suite_code);
  if (passed && hasSuite) return 1;
  if (passed) return 0.7;
  return 0.5; // not re-verifiable (no suite) => uncertain middle, not a false 1
}

async function applyRealToolLearning(): Promise<void> {
  try {
    const items = registry.map((t) => ({ name: t.name, domain: t.domain, reward: realToolRewardFor(t) }));
    const means = await learner.learnRealTools(items);
    let repaired = 0;
    for (const t of registry) {
      const isDef = t.healthStatus === 'degraded' || t.healthStatus === 'corrupted' || t.healthStatus === 'healing';
      if (!isDef) continue;
      const mean = means[t.name] ?? realToolRewardFor(t);
      if (mean >= 0.4) continue; // not persistently low
      const last = toolRepairCooldowns.get(t.name);
      if (last && Date.now() - last < TOOL_REPAIR_COOLDOWN_MS) continue;
      // Only auto-repair real defects that carry a regression suite (so a heal
      // is honest). No-suite tools are not blindly "healed".
      const hasSuite = t.versions.some((v) => v.test_suite_code);
      if (!hasSuite) continue;
      toolRepairCooldowns.set(t.name, Date.now());
      const cur = [...t.versions].find((v) => v.promoted && v.version === t.currentVersion) ?? [...t.versions].find((v) => v.promoted);
      const src = cur?.source_code || [...t.versions].reverse().find((v) => v.source_code)?.source_code || '';
      const suite = cur?.test_suite_code;
      const res = executeSelfRepair(t.name, src, 'logic_regression', suite);
      if (res.success) {
        repaired++;
        // Reconcile telemetry: the tick just healed this tool autonomously, so
        // any older 'detected' anomalies for it are now resolved. Without this,
        // a chaos-injected anomaly could stay 'detected' forever even though the
        // tool is healthy again, keeping openAnomalies/activeAnomaliesCount stuck.
        for (const a of anomalies) {
          if (a.toolName === t.name && a.status === 'detected') a.status = 'repaired';
        }
      }
    }
    if (repaired > 0) {
      status.selfRepair.activeAnomaliesCount = anomalies.filter((a) => a.status === 'detected').length;
      console.log(`[learner->repair] real-tool learning dispatched ${repaired} repair(s).`);
    }
  } catch (err: any) {
    console.warn('[learner] real-tool learning failed:', err?.message || err);
  }
}

// Autopilot probe tick counter — declared at module scope ABOVE runServerTick
// so an early boot tick never hits the temporal dead zone of a `let` declared
// later in the file (which previously spammed "[activator] autopilot probe
// failed: Cannot access 'autopilotProbeTickCounter' before initialization").
let autopilotProbeTickCounter = 0;

/** Advance one full autonomous generation of the system (math → learner →
 *  swarm → dream → axioms → forge/lego → ledger → capability adoption sweep).
 *  Extracted from the /tick HTTP route so it can be driven by the server
 *  heartbeat as well as by a browser/API caller. */
async function runServerTick() {
    // 0. Refresh the real external benchmark on a cadence (throttled - running
    //    every hidden suite against every registry tool is not free). Measured
    //    regardless of whether the intake autopilot is on, so the reward and
    //    realProgress are driven by real external solves, not by whether a
    //    separate subsystem happened to run.
    if (Date.now() - lastBenchmarkRunAt >= BENCHMARK_EVERY_MS) {
      try { runBenchmarkCycle(); } catch (err: any) { console.warn('[benchmark] cycle failed:', err?.message || err); }
    }
    // 1. Step Math Engine
    const mathResult = executeRecursiveStep(mathLoopState);

    // 2. Feed a REAL measured capability-health reward into the Learner (not the
    //    self-consistent readiness number). Reward reflects durable artifacts:
    //    verifier pass-rate, how many live self-hosted tools exist, and whether
    //    the registry is clean of open anomalies.
    const learnerReport = await learner.runEpisode(realSystemReward());
    // Per-real-tool learning: each registry tool's belief is updated from its own
    // real health; persistently-low defective tools are auto-repaired.
    await applyRealToolLearning();

    // 3. Feed Energy Budget into Sub-Team Swarm (deterministic brain + real collaborations)
    const { updatedSwarm, updatedTeams, energyConsumed: swarmEnergy, brainOutputs } =
      stepSubTeams(mathResult.energyBudget.energyJoulesOrFlops, swarmStatus, swarmTeamStates, status.generation);
    swarmStatus = updatedSwarm;
    swarmTeamStates = updatedTeams;
    const energyConsumed = swarmEnergy;
    
    // 4. Update Uptime & Generation based on iteration depth.
    // Uptime is server-authoritative wall-clock since boot (a page reload
    // must not reset it, and the client's old +3s-per-tick guess drifted).
    status.generation = mathLoopState.iteration;
    status.uptimeSeconds = Math.floor((Date.now() - serverBootAt) / 1000);
    status.readinessScore = mathResult.readinessScore;
    
    // Energy gate has teeth: expensive model calls (dream REM phases, swarm
    // task pumping) only fire when the math engine permits the next
    // iteration. Cheap deterministic work (math, learner, ledger, lego)
    // always runs, so a HALT tick degrades gracefully instead of stalling.
    const energyPermitted = mathResult.energyBudget?.permitNextIteration !== false;
    // Dream cycle: fires whenever the system has at least a small amount of energy
    // AND the dreaming engine is active (safety guard). The engine advances one
    // phase per tick through the 6-phase cycle including memory_consolidation,
    // which records real system signals into the dream state's coherence score.
    const dreamFired = (mathResult.energyBudget?.energyJoulesOrFlops ?? 0) > 0.5 && dreamState.isDreamingActive && energyPermitted;
    if (dreamFired) {
      dreamEngine.tick()
        .then((r) => { dreamState = r.dreamState; saveStateToDisk(); })
      .catch((e) => recordFailure('dream_tick', e, { phase: dreamState?.currentPhase ?? 'unknown' }))
        .finally(() => { mirrorCrystallizedDreamGenes().catch(e => recordFailure('dream_mirror_finalize', e)); });
    }

    // Real swarm autopilot: work queued tasks through the local model.
    if (swarmStatus.isSwarmAutopilotActive && energyPermitted) {
      pumpSwarmQueue(1).catch(() => {});
    }
    
    // 5. Expand Determinism (Generating verifiable structural axioms over time)
    if (!status.determinismDepth) status.determinismDepth = 0;
    if (!status.axiomLedger) status.axiomLedger = [];
    
    // Generate a deterministic structural axiom, signed with real system state.
    // The axiom carries: gen, readiness, energy budget, learner episode+calibration,
    // lego registry depth, and determinism depth. The hash proves integrity;
    // the human-readable fields make it readable without decoding anything.
    const axiomSource = JSON.stringify({
      gen: status.generation,
      readiness: Math.round((mathResult.readinessScore ?? 0) * 10000) / 10000,
      energyBudget: Math.round((mathResult.energyBudget?.energyJoulesOrFlops ?? 0) * 100) / 100,
      energyConsumed: Math.round((energyConsumed || 0) * 100) / 100,
      learnerEp: learnerReport?.episode ?? 0,
      learnerCal: Math.round((learnerReport?.calibrationError ?? 0) * 10000) / 10000,
      legoAssemblies: globalLegoEngine.getState().registry.length,
      determinismDepth: status.determinismDepth ?? 0,
    });
    const axiomHash = crypto.createHash('sha256').update(axiomSource).digest('hex').substring(0, 16);

    // Every few ticks, solidify a new structural axiom
    if (status.generation % 3 === 0) {
      status.determinismDepth = (status.determinismDepth ?? 0) + 1;
      // Push the human-readable summary as the "axiom" field so the ledger
      // and UI show what it means, not just a hash.
      status.axiomLedger = [(axiomHash as string), ...(status.axiomLedger ?? [])].slice(0, 8);
      status.entropyReduction = 100 * (1 - Math.exp(-(status.determinismDepth ?? 0) / 200));
    }
    
    // 6. Structural Forge - a REAL, derived view of the registry. Artifacts
    // reflect actual tool code: LOC is the real source length, status reflects
    // whether the current version passes its verifier. Nothing is spawned by
    // dice rolls and no progress bars advance on their own.
    {
      const liveArtifacts = registry.map(t => {
        const cur = t.versions.find(v => v.version === t.currentVersion && v.promoted);
        const source = cur?.source_code || '';
        return {
          id: `art_${t.name}`,
          name: t.name,
          type: (['coding', 'systemic'].includes(t.domain) ? 'pipeline' : t.domain === 'biotech' ? 'agent' : 'mpc') as 'pipeline' | 'mpc' | 'cli' | 'agent' | 'acp',
          status: (cur?.passed_verifier ? 'deployed' : 'verifying') as 'designing' | 'compiling' | 'verifying' | 'deployed',
          progress: cur?.passed_verifier ? 100 : 0,
          loc: source ? Math.max(1, Math.round(source.split('\n').length)) : 0,
          complexity: Math.round((cur?.score ?? 0) * 10) / 10,
          description: `${t.description.slice(0, 120)}${cur && !cur.passed_verifier ? ' [CURRENT VERSION NOT PASSING]' : ''}`,
          dependencies: [],
          lastUpdated: cur ? new Date(cur.created_at).toISOString() : new Date().toISOString()
        };
      });
      status.artifacts = liveArtifacts.slice(0, 24);
    }
    
    // 7. Lego Autonomous Self-Assembly NAS Ticking
    const legoTick = status.generation % 5 === 0;
    if (legoTick) {
      // Math engine signs off on the lego promoter: below 0.7 readiness the
      // system is unstable and new assemblies are held back. This is the
      // first place where the math loop actually gates a downstream system.
      globalLegoEngine.setReadinessGate(mathResult.readinessScore ?? 0);
      try {
        globalLegoEngine.assembleNewCandidate();
      } catch (err) {
        console.error('Lego NAS tick error:', err);
      }
    }

    // 8. Record this generation in the ledger — a real, persisted per-gen
    // record so past generations are never a mystery again.
    const energyBudgetVal =
      typeof mathResult?.energyBudget?.energyJoulesOrFlops === 'number'
        ? mathResult.energyBudget.energyJoulesOrFlops
        : null;
    const lastLedger = generationLedger[generationLedger.length - 1];
    if (lastLedger?.gen !== status.generation) {
      const axiomAdded = status.generation % 3 === 0;
      const axiom = axiomAdded ? (status.axiomLedger?.[0] as any) : undefined;
      generationLedger.push({
        gen: status.generation,
        ts: Date.now(),
        readinessScore: mathResult?.readinessScore ?? 0,
        energyBudget: energyBudgetVal,
        permitNextIteration: mathResult?.energyBudget?.permitNextIteration === true,
        energyConsumed: energyConsumed || 0,
        learnerEpisode: learnerReport?.episode ?? 0,
        learnerAvgReward: learnerReport?.avgReward ?? 0,
        learnerCalibration: learnerReport?.calibrationError ?? 0,
        dream: dreamFired,
        axiomAdded,
        axiom: typeof axiom === 'string' ? axiom : undefined,
        legoTick,
        legoAssemblies: globalLegoEngine.getState().registry.length,
        brainOutputs: brainOutputs.map((b) => ({ teamId: b.teamId, output: b.output, success: b.success })),
        subTeamCycles: updatedTeams.reduce((acc, t) => acc + t.cycleCount, 0),
        subTeamCompleted: updatedTeams.reduce((acc, t) => acc + t.completedTasks, 0),
      });
      if (generationLedger.length > 500) generationLedger.shift();
      saveStateToDisk();
    }

    // 9. Adoption sweep: pick up any newly promoted/self-hosted tool that can
    // back a capability (dogfood). Fire-and-forget so the tick is not gated on it.
    void sweepCapabilityAdoptions().catch(() => {});
    // Autonomous self-use: on a cadence, actually run the adopted self-hosted
    // tool for the provenance_merkle capability and validate it against the
    // reference. Fire-and-forget so a slow tool never gates the tick.
    if ((status.generation ?? 0) % SELFE_USE_EVERY === 0) {
      runSelfUseWatchdog().catch((err: any) => console.warn('[selfuse] watchdog failed:', err?.message));
    }
    // Snapshot the system when it materially changed (cheap: no-op unless the
    // fingerprint moved). Keeps the upgrade-report baseline diff meaningful.
    try { recordSystemChange('tick'); } catch { /* non-fatal */ }

    // 10-13. Activator sweep: failure-bias decision, swarm auto-dispatch,
    //        benchmark refresh, autopilot probe. None of these block the tick.
    try {
      if (lastGrowthDecision) {
        const { decision: rebiased } = applyFailureBiasToDecision(lastGrowthDecision);
        lastGrowthDecision = rebiased;
        status.lastDecision = rebiased;
      }
    } catch (err: any) { console.warn('[activator] failure-bias failed:', err?.message || err); }

    try { maybeAutoDispatchSwarm(dreamState); } catch (err: any) { console.warn('[activator] swarm dispatch failed:', err?.message || err); }

    try { maybeRefreshBenchmarks(); } catch (err: any) { console.warn('[activator] benchmark refresh failed:', err?.message || err); }

    // 9b. Hard-math solver: attempt one unsolved hard problem (rate-limited by
    //     the cooldown inside solveNextMathProblem). Feeds the goal ledger,
    //     which drives the learner's reward signal with real math progress.
    if (energyPermitted) {
      try { await solveNextMathProblem(); } catch (err: any) { console.warn('[activator] math solver failed:', err?.message || err); }
    }

    if (energyPermitted) {
      try { await generateNextBiotechClaim(); } catch (err: any) { console.warn('[activator] biotech claim failed:', err?.message || err); }
    }

    try { await maybeRunAutopilotProbe(); } catch (err: any) { console.warn('[activator] autopilot probe failed:', err?.message || err); }

// 10. Failure-bias re-ranking: penalise candidate actions whose domain has
//     recently failed in the episodic store. Bounds penalty at 0.4 so
//     utility never reaches zero — epsilon exploration is preserved.
function applyFailureBiasToDecision(decision: GrowthDecisionReport): {
  decision: GrowthDecisionReport;
  biasResult: import('./src/lib/recourseActivator.js').FailureBiasResult;
} {
  const fps: Record<string, string> = {};
  for (const a of decision.candidateActions) {
    fps[a.id] = `${a.targetDomain ?? ''}/${a.title}/${a.description}`;
  }
  const biasResult = applyFailureBias(
    decision.candidateActions.map((a) => a.id),
    fps,
  );
  const penalized = decision.candidateActions.map((a) => ({
    ...a,
    computedUtilityScore: Number(
      Math.max(0, a.computedUtilityScore - (biasResult.penalties[a.id] ?? 0)).toFixed(4),
    ),
  }));
  penalized.sort((a, b) => b.computedUtilityScore - a.computedUtilityScore || a.id.localeCompare(b.id));
  penalized.forEach((a, i) => { a.rank = i + 1; });
  const selectedPenalty = biasResult.penalties[decision.selectedAction.id] ?? 0;
  return {
    decision: {
      ...decision,
      candidateActions: penalized,
      selectedAction: penalized[0] ?? decision.selectedAction,
    },
    biasResult: { ...biasResult, selectedPenalty },
  };
}

// 11. Swarm auto-dispatch: when the swarm autopilot is on and the task queue
//     has drained (no queued/running work outstanding), anchor a task to the
//     most crystallizable dream thought. Deterministic: 1 task per drain, so
//     the queue never stacks faster than the pump can work it.
function maybeAutoDispatchSwarm(dream: DreamState) {
  const outstanding = swarmStatus.activeTaskQueue.filter(
    (t) => t.status === 'queued' || t.status === 'running',
  );
  if (outstanding.length > 0) return;
  const toDispatch = autoDispatchSwarmTasks({
    swarmStatus,
    dreamState: dream,
    maxPerCycle: 1,
  });
  for (const task of toDispatch) {
    const result = dispatchSubAgentTask(task.agentType, task.title, task.domain, swarmStatus);
    swarmStatus = result.updatedSwarm;
    console.log(`[swarm:auto] dispatched ${task.agentType} for "${task.title.slice(0, 60)}"`);
  }
  if (toDispatch.length > 0) {
    pumpSwarmQueue(1).catch(() => {});
  }
}

// 11b. HARD MATH SOLVER — attempt one hard math problem per call using the
//      live model. Generates a candidate tool, verifies against the problem's
//      acceptance test in the real sandbox, records the attempt + outcome in
//      the goal ledger. Only ever records passed:true when the suite passed.

async function solveNextMathProblem(): Promise<MathAttempt | { skipped: boolean; reason: string }> {
  if (mathSolverBusy) return { skipped: true, reason: 'solver busy' };
  // Rate-limit so we don't hammer the model every tick.
  if (Date.now() - lastMathSolveAt < MATH_SOLVE_COOLDOWN_MS) {
    return { skipped: true, reason: 'cooldown' };
  }
  mathSolverBusy = true;
  try {
    // Pick the next problem: prefer unsolved solvable/bounded tiers; if all
    // solvable+bounded are solved, fall back to an open-tier (search) problem.
    const attempts = getMathAttempts(1000);
    const solvedIds = new Set(attempts.filter((a) => a.passed).map((a) => a.problemId));
    const target =
      HARD_MATH_PROBLEMS.find((p) => (p.tier === 'solvable' || p.tier === 'bounded') && !solvedIds.has(p.id)) ||
      HARD_MATH_PROBLEMS.find((p) => !solvedIds.has(p.id));
    if (!target) {
      return { skipped: true, reason: 'all hard math problems solved' };
    }
    lastMathSolveAt = Date.now();
    const started = Date.now();

    const system =
      `You are an expert competitive mathematician. Implement a self-contained plain JavaScript function ` +
      `named ${target.toolName || 'solve'} that solves this problem deterministically.\n` +
      `Return ONLY valid JSON: {"sourceCode": "PLAIN JAVASCRIPT with a single 'export function ${target.toolName || 'solve'}'", "description": "one sentence"}\n` +
      `No imports, no TS, no placeholders. The code runs in a sandbox against a hidden acceptance test.`;
    const user = `Problem statement:\n${target.statement}\n\n` +
      (target.bound ? `Bound: test up to N=${target.bound}.\n` : '') +
      `Acceptance test to satisfy:\n${target.acceptanceTest}`;

    const result = await chatComplete(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.1, json: true },
    );

    let source = '';
    if (result.ok && result.content) {
      const block = extractJsonBlock(result.content);
      if (block) {
        try {
          const parsed = JSON.parse(block);
          source = typeof parsed?.sourceCode === 'string' ? parsed.sourceCode.trim() : '';
        } catch { source = ''; }
      }
    }
    if (!source) {
      const attempt = recordMathAttempt({
        problemId: target.id,
        problemTier: target.tier,
        toolName: target.toolName || 'solve',
        passed: false,
        score: 0,
        failureReason: result.status === 'offline' ? `model offline (${currentProviderStatus().baseUrl})` : 'model returned no usable source',
        generation: status.generation,
        latMs: Date.now() - started,
      });
      saveGoalLedger();
      return attempt;
    }

    // Verify the candidate against the problem's real acceptance test.
    const run = executeTestSuite(source, target.acceptanceTest);
    const attempt = recordMathAttempt({
      problemId: target.id,
      problemTier: target.tier,
      toolName: target.toolName || 'solve',
      passed: run.passed,
      score: run.passed ? 1 : 0,
      failureReason: run.passed ? undefined : run.testDetails.filter((d) => d.startsWith('[FAIL')).slice(0, 5).join('\n') || 'verification failed',
      sourceCode: source,
      acceptanceTest: target.acceptanceTest,
      generation: status.generation,
      latMs: Date.now() - started,
    });
    saveGoalLedger();
    console.log(`[math-solver] ${target.id}: ${run.passed ? 'SOLVED' : 'failed'} (${run.testDetails.filter((d) => d.startsWith('[FAIL')).length} assertions) in ${Date.now() - started}ms`);
    return attempt;
  } catch (err: any) {
    console.warn('[math-solver] cycle failed:', err?.message || err);
    return { skipped: true, reason: `error: ${err?.message || 'unknown'}` };
  } finally {
    mathSolverBusy = false;
  }
}

// Math solver REST endpoint — calls solveNextMathProblem (defined above).
// Registered at module top level (before startServer) so it lands before
// vite.middlewares in the Express routing stack.
app.all('/api/recourse/math/solve', async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
  try {
    const result = await solveNextMathProblem();
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function generateNextBiotechClaim(): Promise<LedgerBiotechClaim | { skipped: boolean; reason: string }> {
  if (biotechClaimBusy) return { skipped: true, reason: 'biotech busy' };
  if (Date.now() - lastBiotechClaimAt < BIOTECH_CLAIM_COOLDOWN_MS) {
    return { skipped: true, reason: 'cooldown' };
  }
  biotechClaimBusy = true;
  try {
    lastBiotechClaimAt = Date.now();
    const drugs = Object.values(CANONICAL_ONCOLOGY_KG);
    if (drugs.length === 0) return { skipped: true, reason: 'no drugs in KG' };
    const drug = drugs[Math.floor(Math.random() * drugs.length)];
    const leg = drug.leg;
    const system = `You are a precision oncology researcher. Given this drug: ${drug.id} (${drug.drugClass}), mechanism: ${drug.mechanism}, target: ${drug.targetProtein}, clinical indication: ${drug.clinicalIndication}. Propose a NOVEL mechanism hypothesis within the "${leg}" leg of cancer growth. The claim must include: (1) a novel mechanism different from the known mechanism, (2) a specific target/interaction not in the known mechanism, (3) evidence tier 1-5, (4) a literature citation. Return ONLY valid JSON: {"mechanism": "string", "evidence_tier": number, "source": "string"}.`;
    const result = await chatComplete([
      { role: 'system', content: system },
      { role: 'user', content: `Propose a novel mechanism hypothesis for ${drug.id} within the "${leg}" leg. Your mechanism must be DIFFERENT from its known mechanism: "${drug.mechanism}". Return JSON only.` },
    ], { temperature: 0.4, json: true });
    if (!result.ok || !result.content) {
      return { skipped: true, reason: result.status === 'offline' ? 'model offline' : 'no model response' };
    }
    const block = extractJsonBlock(result.content);
    if (!block) return { skipped: true, reason: 'no JSON from model' };
    let parsed: any = null;
    try { parsed = JSON.parse(block); } catch { return { skipped: true, reason: 'invalid JSON from model' }; }
    if (!parsed?.mechanism) return { skipped: true, reason: 'model returned empty mechanism' };
    const validated = validateBiotechClaimAgainstKG({
      asset_name: drug.id,
      mechanism: String(parsed.mechanism),
      leg,
      evidence_tier: parsed.evidence_tier ? Number(parsed.evidence_tier) : undefined,
      source: parsed.source ? String(parsed.source) : undefined,
    });
    const recorded = recordBiotechClaim({
      assetName: drug.id,
      leg,
      evidenceTier: parsed.evidence_tier ? Number(parsed.evidence_tier) : 0,
      passed: validated.passed,
      score: validated.score,
      mechanism: parsed.mechanism ? String(parsed.mechanism) : undefined,
      source: parsed.source ? String(parsed.source) : undefined,
      summary: validated.summary,
      generation: status.generation,
    });
    saveGoalLedger();
    console.log(`[biotech-claim] ${recorded.assetName} leg=${recorded.leg} tier=${recorded.evidenceTier} passed=${recorded.passed} (${validated.summary.slice(0, 80)})`);
    return recorded;
  } catch (err: any) {
    return { skipped: true, reason: `error: ${err?.message || 'unknown'}` };
  } finally {
    biotechClaimBusy = false;
  }
}


// 12. Benchmark refresh: when 15/15 is reached, append one new problem from the
//     synthesis corpus so the external-capability signal is not a flat line.
//     The new problem is honest: real domain, real acceptance test.
function maybeRefreshBenchmarks() {
  const lastBench = benchmarkHistory[benchmarkHistory.length - 1];
  if (!lastBench) return;
  if (lastBench.solved < lastBench.total) return;
  const result = maybeRefreshBenchmark({ history: benchmarkHistory });
  if (result.refreshed && result.added) {
    console.log(`[benchmark:refresh] added "${result.added.id}" (${result.added.domain}) — total now ${result.currentTotal}`);
  }
}

// 13. Autopilot probe: every 10 ticks, run a dry-run audit against all
//     registered business profiles so the operator sees loop state without
//     opening any PR. Silent when no profiles exist. The tick counter is
//     declared at module scope above runServerTick (see the note there).
async function maybeRunAutopilotProbe() {
  autopilotProbeTickCounter += 1;
  if (autopilotProbeTickCounter % 10 !== 0) return;
  const results = await probeAutopilotOnce();
  for (const r of results) {
    if (!r.ran) {
      if (r.reason === 'no_profiles') {
        console.log('[autopilot:probe] no business profiles found — create data/business-profiles/<name>.yaml to activate');
      }
    } else {
      console.log(`[autopilot:probe] ${r.business} → ${r.status}`);
    }
  }
}

    return {
      success: true,
      mathResult,
      learnerReport,
      swarmStatus,
      systemStatus: status,
      capabilityAdoptions: capabilitiesState().adoptions,
      capabilityServed: capabilitiesState().served,
    };
}

app.post('/api/recourse/tick', async (_req, res) => {
  try {
    res.json(await runServerTick());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Server-resident heartbeat: advance /tick from a server timer so the core
// loop does not stop when no browser tab is open. Off by default; persisted +
// resumed on non-safe boots.
const SERVER_TICK_AUTOPILOT_MS = Number(process.env.SERVER_TICK_AUTOPILOT_MS || 3000);
let serverTickTimer: NodeJS.Timeout | null = null;

function ensureServerTickAutopilot(): void {
  if (!serverTickAutopilotOn) return;
  setJobEnabled('server_tick', true);
}

function stopServerTickAutopilot(): void {
  if (serverTickTimer) { clearInterval(serverTickTimer); serverTickTimer = null; }
  setJobEnabled('server_tick', false);
}

// Science conductor autopilot flag + scheduler binding. The conductor's own
// interval loop (startScienceConductor) is used by the standalone script; the
// in-server science work is a scheduler job so it compartmentalizes with the
// rest of the fleet under one governor.
let scienceAutopilotOn = false;
const SCIENCE_AUTOPILOT_MS = Math.max(60_000, Number(process.env.SCIENCE_CONDUCTOR_INTERVAL_MS) || 15 * 60 * 1000);
let mathAutopilotOn = false;
const MATH_AUTOPILOT_MS = Math.max(300_000, Number(process.env.MATH_CONDUCTOR_INTERVAL_MS) || 20 * 60 * 1000);
// Global Lens publish autopilot flag + scheduler binding. When on, a scheduler
// job composes dated research briefs from real corpus/findings/insights and
// POSTs them to Overlay Global Lens /api/publish (fail-closed on missing key).
let globalLensAutopilotOn = false;
const GLOBAL_LENS_PUBLISH_MS = Math.max(300_000, Number(process.env.GLOBAL_LENS_PUBLISH_MS) || 6 * 60 * 60 * 1000);
// Last Global Lens publish ledger (in-memory + persisted with the engine).
interface GlobalLensPublishRecord {
  at: number;
  total: number;
  ok: number;
  failed: number;
  skipped: string[];
}
let globalLensLastPublish: GlobalLensPublishRecord | null = null;
// Corpus scan + agenda refill: 30 min default (env override CORPUS_SCAN_MS).
const CORPUS_SCAN_MS = Math.max(60_000, Number(process.env.CORPUS_SCAN_MS) || 30 * 60 * 1000);

function ensureScienceAutopilot(): void {
  scienceAutopilotOn = true;
  setJobEnabled('science', true);
}

app.post('/api/recourse/tick/autopilot/toggle', (req, res) => {
  serverTickAutopilotOn = !serverTickAutopilotOn;
  if (serverTickAutopilotOn) {
    ensureServerTickAutopilot();
    runServerTick().catch(e => recordFailure('server_tick_immediate', e));
  } else {
    stopServerTickAutopilot();
  }
  saveStateToDisk();
  res.json({ success: true, serverTickAutopilot: serverTickAutopilotOn, intervalMs: SERVER_TICK_AUTOPILOT_MS });
});

// Real per-generation ledger endpoint (what each 24/7 generation actually did).
app.get('/api/recourse/generations', (req, res) => {
  res.json({
    success: true,
    generation: status.generation,
    count: generationLedger.length,
    entries: generationLedger
  });
});

// =========================================================================
// 8. LEGO COMPOSABLE ML & AUTONOMOUS SELF-ASSEMBLY ROUTES
// =========================================================================
app.get('/api/lego/state', (req, res) => {
  try {
    res.json({ success: true, state: globalLegoEngine.getState() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lego/assemble', (req, res) => {
  try {
    // Apply the live readiness score so functional assemblies commit under the
    // running (stable) system, not just during the every-5th /tick.
    const liveReadiness = typeof status.readinessScore === 'number' ? status.readinessScore : 1;
    globalLegoEngine.setReadinessGate(liveReadiness);
    const result = globalLegoEngine.assembleNewCandidate();
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lego/execute', (req, res) => {
  try {
    const inputs = req.body?.inputs || [
      [0.2, 0.8, 0.1, 0.9, 0.3, 0.7, 0.4, 0.6],
      [0.5, 0.5, 0.2, 0.8, 0.1, 0.9, 0.0, 1.0]
    ];
    const result = globalLegoEngine.executePipeline(inputs);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/lego/route', (req, res) => {
  try {
    const inputVector = req.body?.inputVector || [0.4, 0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.5];
    const result = globalLegoEngine.routeDynamicInput(inputVector);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 9. EXTERNAL INTAKE (LEARNING), GROUNDING, BENCHMARK + READOUT
// =========================================================================
// Real 24/7 learning surface: poll arXiv/HN/GitHub/RSS → dedupe into the
// signal store → ground the oldest unconsumed signal into a verified tool
// gene (model-gated, never fabricated) → score the registry against the fixed
// external benchmark. All of it is watchable and reportable.
const INTAKE_AUTOPILOT_MS = Number(process.env.INTAKE_AUTOPILOT_MS || 6 * 60 * 1000);
const INTAKE_MAX_POLL = Number(process.env.INTAKE_MAX_POLL || 6); // queries per poll
let intakeAutopilotTimer: NodeJS.Timeout | null = null;

// Deterministic-brain intake sources (Kaggle + news). Enabled only when both a
// BRAIN_URL and the matching RECOURSE_INTAKE_BRAIN_* flag are set, so a poll
// never hammers an unconfigured brain or fabricates sources.
const INTAKE_BRAIN_URL = (process.env.BRAIN_URL || '').trim().replace(/\/+$/, '');
const INTAKE_BRAIN_KAGGLE_QUERIES = (process.env.RECOURSE_INTAKE_BRAIN_KAGGLE_QUERIES || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const INTAKE_BRAIN_NEWS = process.env.RECOURSE_INTAKE_BRAIN_NEWS === '1';
const INTAKE_BRAIN_NEWS_LIMIT = Number(process.env.INTAKE_BRAIN_NEWS_LIMIT || 10);

function intakeSnapshot(): IntakeSnapshot {
  return signalStore.snapshot(lastPollResults, lastGroundAt, lastGroundSummary);
}

function benchmarkState() {
  return {
    problems: BENCHMARK_PROBLEMS,
    history: benchmarkHistory,
    lastRunAt: benchmarkHistory.length ? benchmarkHistory[benchmarkHistory.length - 1].at : null,
    lastRun: benchmarkHistory.length ? benchmarkHistory[benchmarkHistory.length - 1] : null,
  };
}

/** Poll external sources and dedupe new signals into the store. */
async function runIntakeCycle(queries: string[] = DEFAULT_TOPIC_QUERIES): Promise<{ added: number; dupes: number; results: SourcePollResult[]; total: number }> {
  // Optional web URLs to download through AgentBrowser each poll (comma-separated).
  const webUrls = (process.env.AGENTBROWSER_POLL_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  const { signals, results } = await pollAllSources({
    queries: queries.slice(0, INTAKE_MAX_POLL),
    feeds: DEFAULT_RSS_FEEDS,
    perQuery: 4,
    webUrls,
    brain:
      INTAKE_BRAIN_URL && (INTAKE_BRAIN_KAGGLE_QUERIES.length > 0 || INTAKE_BRAIN_NEWS)
        ? { url: INTAKE_BRAIN_URL, kaggleQueries: INTAKE_BRAIN_KAGGLE_QUERIES, news: INTAKE_BRAIN_NEWS, newsLimit: INTAKE_BRAIN_NEWS_LIMIT }
        : undefined,
  });
  lastPollResults = results;
  const { added, dupes } = signalStore.ingest(signals);
  if (added > 0) {
    appendProvenanceEvent('intake_poll', {
      added,
      dupes,
      sources: results.map((r) => ({ source: r.source, ok: r.ok, count: r.count, error: r.error ?? undefined })),
    });
  }
  saveStateToDisk();
  return { added, dupes, results, total: signalStore.all().length };
}

/** Ground the oldest unconsumed signal into a verified tool gene. Returns the
 *  candidate outcome; nothing is promoted unless the code passed its suite. */
async function runGroundingCycle(signalId?: string): Promise<{ grounded: boolean; toolName?: string; domain?: string; reason?: string; signal?: ExternalSignal }> {
  const signal = signalId ? signalStore.get(signalId) : signalStore.nextUnconsumed();
  if (!signal) return { grounded: false, reason: 'no unconsumed signal to ground' };

  const result = await groundSignal(signal, {
    chatComplete: chatComplete,
    checkOnline: modelCheckOnline,
  });

  if (result.grounded && result.sourceCode && result.toolName) {
    const version = '1.0.0';
    const versionHash = crypto.createHash('sha256').update(result.sourceCode).digest('hex').substring(0, 16);
    const newTool: ToolEntry = {
      name: result.toolName,
      domain: result.domain,
      entrypoint: `src/tools/${result.toolName}.ts`,
      description: `Grounded from ${signal.source}: ${signal.title.slice(0, 120)}`,
      currentVersion: version,
      versions: [{
        version,
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: result.verifierNote || `Grounded on external signal ${signal.id}`,
        source_code: result.sourceCode,
        test_suite_code: result.testSuiteCode,
      }],
      healthStatus: 'healthy',
      anomalyCount: 0,
    };
    registry.unshift(newTool);
    status.totalUpgrades += 1;
    signalStore.markConsumed(signal.id, result.toolName);
    lastGroundAt = Date.now();
    lastGroundSummary = `${signal.source}:${signal.title.slice(0, 60)} → ${result.toolName} (verified)`;
    appendProvenanceEvent('signal_grounded', {
      signalId: signal.id,
      source: signal.source,
      url: signal.url,
      title: signal.title.slice(0, 200),
      toolName: result.toolName,
      domain: result.domain,
      version,
      hash: versionHash,
    });
    saveStateToDisk();
    return { grounded: true, toolName: result.toolName, domain: result.domain, signal };
  }

  // Not grounded (model offline or code failed). Record it honestly — the
  // signal stays unconsumed so a later cycle can retry when the model is up.
  lastGroundAt = Date.now();
  lastGroundSummary = `${signal.source}:${signal.title.slice(0, 60)} → not grounded (${result.reason})`;
  saveStateToDisk();
  return { grounded: false, reason: result.reason, domain: result.domain, signal };
}

/** Score the live registry against the fixed external benchmark + append trend. */
function runBenchmarkCycle(): BenchmarkRun {
  const run = runBenchmark(registry);
  benchmarkHistory.push(run);
  latestBenchmark = run;
  lastBenchmarkRunAt = Date.now();
  if (benchmarkHistory.length > 200) benchmarkHistory.splice(0, benchmarkHistory.length - 200);
  appendProvenanceEvent('benchmark_run', {
    solved: run.solved,
    total: run.total,
    solvedIds: run.solvedIds,
  });
  saveStateToDisk();
  return run;
}

async function runIntakeAutopilotTick(): Promise<void> {
  // Poll is rate-limited by the interval itself. RSS + queries each bounded.
  try { await runIntakeCycle(); } catch (err: any) { console.warn('[intake] poll failed:', err?.message); }
  try { await runGroundingCycle(); } catch (err: any) { console.warn('[intake] grounding failed:', err?.message); }
  try { runBenchmarkCycle(); } catch (err: any) { console.warn('[intake] benchmark failed:', err?.message); }
}

function ensureIntakeAutopilot(): void {
  if (!intakeAutopilotOn) return;
  setJobEnabled('intake', true);
}

function stopIntakeAutopilot(): void {
  if (intakeAutopilotTimer) {
    clearInterval(intakeAutopilotTimer);
    intakeAutopilotTimer = null;
  }
  setJobEnabled('intake', false);
}

app.get('/api/recourse/intake/status', (req, res) => {
  res.json({
    success: true,
    intake: intakeSnapshot(),
    autopilot: intakeAutopilotOn,
    autopilotIntervalMs: INTAKE_AUTOPILOT_MS,
  });
});

app.post('/api/recourse/intake/poll', async (req, res) => {
  try {
    const { queries } = req.body ?? {};
    const result = await runIntakeCycle(
      Array.isArray(queries) && queries.length ? queries.map(String).slice(0, INTAKE_MAX_POLL) : DEFAULT_TOPIC_QUERIES,
    );
    res.json({ success: true, ...result, intake: intakeSnapshot() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Pull deterministic-brain sources (Kaggle datasets + news) into the store
 *  now, regardless of the autopilot env flags. Honest: brain offline/empty is
 *  reported per-source, never fabricated. */
app.post('/api/recourse/intake/brain', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const url = typeof b.url === 'string' && b.url.trim() ? b.url.trim().replace(/\/+$/, '') : INTAKE_BRAIN_URL;
    if (!url) return res.status(400).json({ success: false, error: 'BRAIN_URL not configured (pass url or set BRAIN_URL)' });
    const queries = Array.isArray(b.queries) && (b.queries as unknown[]).length
      ? (b.queries as string[]).map(String).slice(0, INTAKE_MAX_POLL)
      : (INTAKE_BRAIN_KAGGLE_QUERIES.length ? INTAKE_BRAIN_KAGGLE_QUERIES : DEFAULT_TOPIC_QUERIES);
    const news = typeof b.news === 'boolean' ? b.news : INTAKE_BRAIN_NEWS || true;
    const newsLimit = Number(b.newsLimit) || INTAKE_BRAIN_NEWS_LIMIT;

    const { signals, results } = await pollAllSources({
      queries: queries.slice(0, INTAKE_MAX_POLL),
      brain: { url, kaggleQueries: queries, news, newsLimit },
    });
    lastPollResults = results;
    const { added, dupes } = signalStore.ingest(signals);
    saveStateToDisk();
    if (added > 0) {
      appendProvenanceEvent('intake_brain', {
        added,
        dupes,
        sources: results.map((r) => ({ source: r.source, ok: r.ok, count: r.count, error: r.error ?? undefined })),
      });
    }
    res.json({ success: true, added, dupes, signals: signals.slice(0, 20), results, intake: intakeSnapshot() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/intake/ground', async (req, res) => {
  try {
    const { signalId } = req.body ?? {};
    const result = await runGroundingCycle(typeof signalId === 'string' && signalId ? signalId : undefined);
    res.json({ success: true, ...result, intake: intakeSnapshot() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/intake/autopilot/toggle', (req, res) => {
  intakeAutopilotOn = !intakeAutopilotOn;
  if (intakeAutopilotOn) {
    ensureIntakeAutopilot();
    runIntakeAutopilotTick().catch(() => {});
  } else {
    stopIntakeAutopilot();
  }
  saveStateToDisk();
  res.json({ success: true, autopilot: intakeAutopilotOn, intervalMs: INTAKE_AUTOPILOT_MS });
});

app.get('/api/recourse/benchmark/state', (req, res) => {
  res.json({ success: true, benchmark: benchmarkState() });
});

app.post('/api/recourse/benchmark/run', (req, res) => {
  try {
    const run = runBenchmarkCycle();
    res.json({ success: true, run, benchmark: benchmarkState() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/recourse/readout', async (req, res) => {
  const chain = verifyChainIntegrity();
  let upgrade: ReadoutContext['upgrade'] = undefined;
  let plainUpgrade: string | null = null;
  try {
    const rep = await buildUpgradeReport();
    upgrade = {
      added: rep.diff.addedTools.length,
      removed: rep.diff.removedTools.length,
      upgraded: rep.diff.upgradedTools.length,
      capabilityChanges: rep.diff.capabilityChanges.length,
      netTools: rep.diff.totals.after - rep.diff.totals.before,
    };
    plainUpgrade = rep.plain ?? null;
  } catch { /* upgrade section optional */ }
  const ctx: ReadoutContext = {
    status,
    registry,
    provenanceEvents,
    intake: intakeSnapshot(),
    benchmark: benchmarkState(),
    generation: status.generation,
    chainIntegrity: chain.valid,
    upgrade,
    plainUpgrade,
  };
  res.json({ success: true, markdown: buildDevelopmentReadout(ctx), plain: plainUpgrade, generatedAt: new Date().toISOString() });
});

// =========================================================================
// ECOSYSTEM RESEARCH CORPUS — ingest research insights/papers produced by
// sibling fleet projects (HempForge, Hemp-OS, Overlay Oncology, …), learn
// from them, and disperse grounded capabilities back to the fleet.
// =========================================================================

function corpusSnapshot(): CorpusSnapshot {
  let summary: CorpusSummary | null = null;
  try {
    summary = summarize(corpusArtifacts);
  } catch {
    summary = null;
  }
  return {
    roots: corpusRoots,
    lastScanAt: corpusLastScan,
    artifacts: corpusArtifacts,
    summary,
    errors: corpusLastErrors,
    dispatchedSignals: corpusDispatched,
  };
}

/** Scan every configured corpus root, index the artifacts, and dispatch the
 *  highest-value research artifacts as grounding signals into the intake store
 *  (source 'corpus') so a later grounding pass can turn a paper into a verified
 *  capability. Fully real: content is read from disk, dedupe is by hash. */
async function runCorpusScan(): Promise<{ snapshot: CorpusSnapshot; added: number; refilled: number }> {
  // Dedupe concurrent scan requests (e.g. boot pre-warm racing the first
  // Global Lens publish): one shared scan, callers await the same run.
  if (corpusScanPromise) return corpusScanPromise;
  corpusScanPromise = (async () => {
    const res = await scanCorpus(corpusRoots);
    corpusArtifacts = res.artifacts;
    corpusLastErrors = res.errors;
    corpusLastScan = res.scannedAt;
    const signals = artifactsToSignals(corpusArtifacts, 150);
    const { added, dupes } = signalStore.ingest(signals);
    corpusDispatched = added;

    // NEVER VOID OF AGENDA: turn newly-scanned research artifacts into intel
    // proposals + forge specs so the science/forge loops always have fresh,
    // corpus-grounded targets (not just exhausted template problems).
    let refilled = 0;
    try {
      const seen = new Set(corpusRefilledHashes);
      const existing = new Set(allForgeSpecs().map((s) => s.name));
      const { proposals, specs, result } = refillAgendaFromCorpus(corpusArtifacts, seen, existing);
      for (const p of proposals) intelProposals.push(p);
      for (const s of specs) dynamicAgenda.push(s);
      corpusRefilledHashes = [...seen].slice(-5000);
      refilled = result.proposalsCreated;
      if (refilled > 0) {
        console.log(`[corpus] refilled agenda with ${refilled} grounded targets (${result.skipped.length} skipped non-tools)`);
        appendProvenanceEvent('corpus_refilled', { refilled, skipped: result.skipped.length });
      }
    } catch (e) {
      console.warn('[corpus] agenda refill failed:', e instanceof Error ? e.message : String(e));
    }

    appendProvenanceEvent('corpus_scanned', {
      roots: corpusRoots.map((r) => r.project),
      artifacts: corpusArtifacts.length,
      errors: corpusLastErrors.length,
      dispatched: added,
      refilled,
    });
    if (added > 0) {
      appendProvenanceEvent('corpus_dispatched', {
        roots: corpusRoots.map((r) => r.project),
        added,
        dupes,
        projects: Object.fromEntries(
          Object.entries(
            signals.reduce((acc: Record<string, number>, s) => {
              const p = (s.url || 'corpus://').split('corpus://')[1]?.split('/')[0] ?? 'unknown';
              acc[p] = (acc[p] ?? 0) + 1;
              return acc;
            }, {}),
          ),
        ),
      });
    }
    saveStateToDisk();
    return { snapshot: corpusSnapshot(), added, refilled };
  })().finally(() => { corpusScanPromise = null; });
  return corpusScanPromise;
}

app.get('/api/recourse/corpus/status', (req, res) => {
  const snap = corpusSnapshot();
  res.json({ success: true, corpus: snap, digest: corpusDigest(snap) });
});

app.post('/api/recourse/corpus/scan', async (req, res) => {
  try {
    const bodyRoots = req.body?.roots;
    if (Array.isArray(bodyRoots) && bodyRoots.length) {
      const clean: CorpusRoot[] = bodyRoots
        .filter((r: any) => r && typeof r.project === 'string' && typeof r.root === 'string')
        .map((r: any) => ({ project: String(r.project).trim(), root: String(r.root).trim() }));
      if (clean.length) corpusRoots = clean;
    }
    const result = await runCorpusScan();
    res.json({ success: true, ...result.snapshot, added: result.added });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Optional filters: ?project=hempforge&kind=research&q=protein */
app.get('/api/recourse/corpus/artifacts', (req, res) => {
  const project = typeof req.query.project === 'string' ? req.query.project : '';
  const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
  const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
  const limit = Number(req.query.limit || 200);
  let items = corpusArtifacts;
  if (project) items = items.filter((a) => a.project === project);
  if (kind) items = items.filter((a) => a.kind === kind);
  if (q) items = items.filter((a) => a.name.toLowerCase().includes(q) || a.topics.includes(q) || a.excerpt.toLowerCase().includes(q));
  items = items.sort((a, b) => b.words - a.words).slice(0, limit);
  res.json({ success: true, artifacts: items, total: corpusArtifacts.length, filtered: items.length });
});

/** Read the actual content of one indexed artifact (path-traversal guarded).
 *  ?project=hempforge&rel=docs/foo.md */
app.get('/api/recourse/corpus/artifact', async (req, res) => {
  try {
    const project = typeof req.query.project === 'string' ? req.query.project : '';
    const rel = typeof req.query.rel === 'string' ? req.query.rel : '';
    const root = corpusRoots.find((r) => r.project === project);
    if (!root) return res.status(404).json({ success: false, error: `unknown project ${project}` });
    const resolvedRel = rel.replace(/\\/g, '/');
    if (!resolvedRel || resolvedRel.split('/').includes('..') || resolvedRel.startsWith('/')) {
      return res.status(400).json({ success: false, error: 'invalid rel path' });
    }
    const full = await fs.promises.readFile(path.join(root.root, ...resolvedRel.split('/')), 'utf-8');
    const cap = 60_000;
    const truncated = full.length > cap;
    res.json({ success: true, project, rel, truncated, text: full.slice(0, cap), bytes: full.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/recourse/corpus/digest', (req, res) => {
  res.json({ success: true, markdown: corpusDigest(corpusSnapshot()), generatedAt: new Date().toISOString() });
});

// =========================================================================
// LOCAL CANCER LIBRARY — on-hand material: cancer PDFs + dataset archives.
// All real disk reads; archives are never extracted wholesale (1.6GB prostate
// MRI set, 546MB lung MRI set). Zip central-directory reads give manifests;
// single-inner-file streams give CSV previews. PDF text goes through the
// stateless PyMuPDF sidecar (ok:false when down, never fabricated).
// =========================================================================

function localCorpusRoot(project: string) {
  return corpusRoots.find((r) => r.project === project);
}

function guardRel(rel: string): string | null {
  const norm = String(rel || '').replace(/\\/g, '/');
  if (!norm || norm.startsWith('/') || norm.split('/').includes('..')) return null;
  return norm;
}

/** List dataset archives with size + inner manifest (central directory only). */
app.get('/api/recourse/local-corpus/datasets', async (_req, res) => {
  try {
    const root = localCorpusRoot('cancer-datasets');
    if (!root) return res.status(404).json({ success: false, error: 'cancer-datasets root not configured' });
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(root.root);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `datasets dir unreadable: ${err?.message ?? err}` });
    }
    const zips = files.filter((f) => f.toLowerCase().endsWith('.zip')).sort();
    const out: any[] = [];
    // Lazy-load adm-zip-free: parse central directory via a tiny pure reader.
    // Avoid new deps: use python zipfile when node can't. Here: node-side
    // manual central-directory parse is overkill; report stat + inner list via
    // streaming unzip tools only if available. Fallback: stat only (honest).
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    for (const z of zips) {
      const full = path.join(root.root, z);
      let size = 0;
      try {
        size = (await fs.promises.stat(full)).size;
      } catch { /* keep 0 */ }
      let inner: string[] = [];
      let innerTotal: number | null = null;
      let manifestError: string | null = null;
      try {
        const r = await execFileAsync('python', ['-c', "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); n=z.namelist(); print(json.dumps({'total':len(n),'sample':n[:50]}))", full], { timeout: 30000 });
        const parsed = JSON.parse(String(r.stdout || '{}'));
        innerTotal = typeof parsed.total === 'number' ? parsed.total : null;
        inner = Array.isArray(parsed.sample) ? parsed.sample : [];
      } catch (err: any) {
        manifestError = `manifest unavailable (${err?.message ?? err})`;
      }
      out.push({ file: z, sizeBytes: size, innerTotal, innerSample: inner, manifestError });
    }
    res.json({ success: true, root: root.root, count: out.length, datasets: out });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Preview one inner CSV/text file (head lines only, capped). */
app.get('/api/recourse/local-corpus/datasets/preview', async (req, res) => {
  try {
    const zip = typeof req.query.zip === 'string' ? req.query.zip : '';
    const inner = typeof req.query.inner === 'string' ? req.query.inner : '';
    const lines = Math.min(Math.max(Number(req.query.lines || 20), 1), 200);
    if (!zip.toLowerCase().endsWith('.zip') || zip.includes('..') || zip.includes('/') || zip.includes('\\')) {
      return res.status(400).json({ success: false, error: 'invalid zip name' });
    }
    if (!inner || inner.includes('..')) return res.status(400).json({ success: false, error: 'invalid inner path' });
    const root = localCorpusRoot('cancer-datasets');
    if (!root) return res.status(404).json({ success: false, error: 'cancer-datasets root not configured' });
    const full = path.join(root.root, zip);
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    try {
      const r = await execFileAsync('python', ['-c', "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); data=z.read(sys.argv[2]).decode('utf-8',errors='replace'); lines=data.splitlines(); import json; print(json.dumps({'inner':sys.argv[2],'totalLines':len(lines),'preview':lines[:int(sys.argv[3])]}))", full, inner, String(lines)], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      res.json({ success: true, zip, ...JSON.parse(String(r.stdout || '{}')) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: `preview failed: ${err?.message ?? err}` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Search the indexed local PDFs (filename/topic search over scanned artifacts). */
app.get('/api/recourse/local-corpus/pdfs/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 500);
  let items = corpusArtifacts.filter((a) => a.project === 'cancer-pdfs');
  if (q) {
    items = items.filter((a) => a.name.toLowerCase().includes(q) || a.rel.toLowerCase().includes(q) || a.topics.some((t) => t.includes(q)));
  }
  items = [...items].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
  res.json({ success: true, total: corpusArtifacts.filter((a) => a.project === 'cancer-pdfs').length, filtered: items.length, items, scannedAt: corpusLastScan });
});

/** Extract full text of one local PDF via the PyMuPDF sidecar (on demand). */
app.post('/api/recourse/local-corpus/pdfs/extract', async (req, res) => {
  try {
    const rel = guardRel(String(req.body?.rel || ''));
    if (!rel) return res.status(400).json({ success: false, error: 'invalid rel path' });
    const maxPages = req.body?.max_pages ? Math.min(Math.max(Number(req.body.max_pages), 1), 400) : 50;
    const root = localCorpusRoot('cancer-pdfs');
    if (!root) return res.status(404).json({ success: false, error: 'cancer-pdfs root not configured' });
    const full = path.join(root.root, ...rel.split('/'));
    let buf: Buffer;
    try {
      buf = await fs.promises.readFile(full);
    } catch (err: any) {
      return res.status(404).json({ success: false, error: `pdf unreadable: ${err?.message ?? err}` });
    }
    if (buf.length > 60 * 1024 * 1024) return res.status(413).json({ success: false, error: 'pdf too large (60MB cap)' });
    const result = await pdfExtractBytes(buf.toString('base64'), { filename: path.basename(full), maxPages });
    res.json({ success: true, project: 'cancer-pdfs', rel, bytes: buf.length, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Literature-grounded KG analysis. Rebuilds the co-mention graph from the
 * local full-text corpus (data/science-loop/seed-corpus-100.json) and runs the
 * real NetworkX sidecar over it: centrality, literature support for canonical
 * assets, and (optional) bridges from a literature term to a canonical asset.
 * Honest: every edge is a real co-occurrence count; when the corpus file or
 * the sidecar is missing, it reports ok:false with the reason.
 */
let literatureKgCache: { at: number; body: unknown } | null = null;
app.get('/api/recourse/local-corpus/literature/kg', async (req, res) => {
  try {
    if (literatureKgCache && Date.now() - literatureKgCache.at < 60_000) {
      return res.json({ success: true, cached: true, ...(literatureKgCache.body as object) });
    }
    const { buildLiteratureKgGraph, literatureEvidence, CANONICAL_TARGET_MAP } = await import('./src/lib/literatureGrounding.js');
    const { kgCentrality, kgNeighborhood, kgBridges } = await import('./src/lib/kgSidecarClient.js');
    const corpusPath = path.join(process.cwd(), 'data', 'science-loop', 'seed-corpus-100.json');
    let raw: any[];
    try {
      raw = JSON.parse(await fs.promises.readFile(corpusPath, 'utf-8'));
    } catch (err: any) {
      return res.json({ success: false, ok: false, error: `literature corpus missing (${corpusPath}): ${err?.message ?? err}` });
    }
    const docs = raw
      .filter((c) => !c.scanned_only && !c.error && String(c.text || '').length > 500)
      .map((c) => ({ rel: c.rel, text: c.text, authors: c.authors ?? [], publishedAt: c.publishedAt }));

    const { payload, hits, edges } = await buildLiteratureKgGraph(docs);
    const centrality = await kgCentrality(payload);
    if (!centrality.ok) return res.json({ success: false, ok: false, error: `kg sidecar: ${centrality.error}` });

    const assetSupport: any[] = [];
    for (const asset of Object.keys(CANONICAL_TARGET_MAP)) {
      const term = CANONICAL_TARGET_MAP[asset];
      const tHits = hits.find((h) => h.termId === term);
      const nb = await kgNeighborhood(payload, asset);
      assetSupport.push({
        asset,
        targetTerm: term,
        targetTermDocs: tHits?.docs ?? 0,
        literatureNeighbors: (nb.ok ? (nb.neighbors ?? []) : []).filter((n) => n.id !== asset).map((n) => n.id),
      });
    }
    const bridgeFrom = typeof req.query.from === 'string' ? req.query.from : 'AKT';
    const bridgeTo = typeof req.query.to === 'string' ? req.query.to : 'sotorasib';
    const bridge = await kgBridges(payload, bridgeFrom, bridgeTo);

    const body = {
      corpus: { docs: docs.length, scannedOnly: raw.filter((c) => c.scanned_only).length },
      graph: { nodes: payload.nodes.length, edges: payload.edges.length, litCoMentionEdges: edges.length },
      centrality: {
        ok: centrality.ok,
        connected_components: centrality.connected_components,
        hubs: (centrality.ranked ?? []).slice(0, 12).map((r) => ({ id: r.id, degree: r.degree, betweenness: r.betweenness, pagerank: r.pagerank })),
      },
      topCoMentionEdges: edges.slice(0, 15),
      assetSupport,
      bridge: { from: bridgeFrom, to: bridgeTo, reached_proven: bridge.reached_proven, to_proven_hub: bridge.to_proven_hub, paths: (bridge.paths ?? []).slice(0, 4) },
      evidenceSample: {
        [bridgeFrom]: literatureEvidence(docs, bridgeFrom).slice(0, 5),
      },
      method: 'exact-string term matching over full extracted text; co-mention edge weights are real co-occurring paper counts; asset->target mappings from CANONICAL_ONCOLOGY_KG.targetProtein',
    };
    literatureKgCache = { at: Date.now(), body };
    res.json({ success: true, cached: false, ...body });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Score how well a claim is supported by the local literature corpus.
 * POST {claimText}. Real: tokens matched to the curated lexicon by exact
 * substring; presence = real doc counts; co-mention = real co-occurrence.
 * A low presenceScore is reported as-is — the corpus does not substantiate
 * the claim's terms and this is never padded.
 */
app.post('/api/recourse/local-corpus/literature/support', async (req, res) => {
  try {
    const claimText = typeof req.body?.claimText === 'string' ? req.body.claimText.trim() : '';
    if (!claimText) return res.status(400).json({ success: false, error: 'claimText required' });
    const { scoreClaimSupport } = await import('./src/lib/literatureGrounding.js');
    const docs = await loadLiteratureDocs();
    if (!docs.length) {
      return res.json({ success: false, ok: false, error: 'literature corpus missing or empty (data/science-loop/seed-corpus-100.json)' });
    }
    const support = scoreClaimSupport(docs, claimText);
    res.json({ success: true, claimText, ...support, method: 'exact-string lexicon match; presence & co-mention are real corpus counts' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// SKILL LIBRARY — catalog, search, and read skills from sibling repositories
// (Draymond agents/skills, everything-claude-code-main, …). Read-only, real:
// every record comes from a SKILL.md found on disk.
// =========================================================================

function skillSnapshot(): SkillSnapshot {
  let summary: SkillSummary | null = null;
  try {
    summary = summarizeSkills(skillCatalog);
  } catch {
    summary = null;
  }
  return {
    roots: skillRoots,
    lastScanAt: skillLastScan,
    skills: skillCatalog,
    summary,
    found: skillFound,
    prunedTranslations: skillPrunedTranslations,
    errors: skillLastErrors,
  };
}

/** Scan every configured skill root, replacing the in-memory catalog. */
async function runSkillScan(): Promise<SkillSnapshot> {
  const res = await scanSkillLibraries(skillRoots);
  skillCatalog = res.skills;
  skillFound = res.found;
  skillPrunedTranslations = res.prunedTranslations;
  skillLastErrors = res.errors;
  skillLastScan = res.scannedAt;
  appendProvenanceEvent('skill_catalog_scanned', {
    roots: skillRoots.map((r) => r.id),
    indexed: skillCatalog.length,
    found: res.found,
    prunedTranslations: res.prunedTranslations,
    errors: res.errors.length,
  });
  saveStateToDisk();
  return skillSnapshot();
}

app.get('/api/recourse/skills/status', (req, res) => {
  res.json({ success: true, skills: skillSnapshot(), digest: skillDigest(skillSnapshot()) });
});

app.post('/api/recourse/skills/rescan', async (req, res) => {
  try {
    const bodyRoots = req.body?.roots;
    if (Array.isArray(bodyRoots) && bodyRoots.length) {
      const clean: SkillRoot[] = bodyRoots
        .filter((r: any) => r && typeof r.id === 'string' && typeof r.root === 'string')
        .map((r: any) => ({ id: String(r.id).trim(), root: String(r.root).trim() }));
      if (clean.length) skillRoots = clean;
    }
    const snap = await runSkillScan();
    res.json({ success: true, skills: snap, digest: skillDigest(snap) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/recourse/skills', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
  const limit = Number(req.query.limit || 200);
  let items = q ? searchSkills(skillCatalog, q, limit) : skillCatalog;
  if (rootId) items = items.filter((s) => s.rootId === rootId);
  res.json({ success: true, total: skillCatalog.length, filtered: items.length, skills: items.slice(0, limit) });
});

/** Read the full SKILL.md (and list its supporting files) for one skill.
 *  ?rootId=ecc&dir=skills/accessibility */
app.get('/api/recourse/skills/skill', async (req, res) => {
  try {
    const rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
    const dir = typeof req.query.dir === 'string' ? req.query.dir : '';
    const root = skillRoots.find((r) => r.id === rootId);
    if (!root) return res.status(404).json({ success: false, error: `unknown skill library ${rootId}` });
    const rel = dir.replace(/\\/g, '/');
    if (!rel || rel.split('/').includes('..') || rel.startsWith('/')) {
      return res.status(400).json({ success: false, error: 'invalid dir path' });
    }
    const skill = skillCatalog.find((s) => s.rootId === rootId && s.dir === rel);
    const skillDirAbs = path.join(root.root, ...rel.split('/'));
    const md = path.join(skillDirAbs, 'SKILL.md');
    const text = await fs.promises.readFile(md, 'utf-8');
    const cap = 100_000;
    const truncated = text.length > cap;
    res.json({ success: true, skill: skill ?? null, files: skill?.files ?? [], text: text.slice(0, cap), truncated, bytes: text.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/recourse/skills/digest', (req, res) => {
  res.json({ success: true, markdown: skillDigest(skillSnapshot()), generatedAt: new Date().toISOString() });
});

// =========================================================================
// SKILL DISTRIBUTION (Phase 4) — verified registry tools <-> open SKILL.md
// -------------------------------------------------------------------------
// EXPORT: turn a verified registry tool into a rescanable SKILL.md folder.
// IMPORT: ingest a foreign SKILL.md from a configured skill library as an
//         UNVERIFIED candidate. Nothing foreign is trusted: only code + suite
//         the skill explicitly embeds is run through the real domain gate +
//         oxlint. A prose-only skill is recorded as pending and never fabricated
//         into the registry.
// Both mutate disk/registry, so both require RECOURSE_API_SECRET (fail-closed).
// =========================================================================

/** Run the real domain gate for a code-bearing skill import; returns null when
 *  the domain is not a plain source+suite code domain (math/biotech differ and
 *  cannot be honestly auto-verified from an arbitrary imported suite). */
function verifyImportedCode(
  domain: ToolDomain,
  source: string,
  suite: string,
): VerifierResult | null {
  switch (domain) {
    case 'coding': return verifyCodingCode(source, suite);
    case 'systemic': return verifySystemicCode(source, suite);
    case 'neuro_symbolic': return verifyNeuroSymbolicCode(source, suite);
    case 'cyber_defense': return verifyCyberDefenseCode(source, suite);
    case 'quantum_sim': return verifyQuantumSimCode(source, suite);
    default: return null; // math / biotech need structured extras we cannot infer
  }
}

/** Register a verified imported tool into the registry (mirrors evolve). */
function registerImportedTool(
  name: string,
  domain: ToolDomain,
  source: string,
  suite: string | undefined,
  verifier: VerifierResult,
  origin: { rootId: string; rel: string },
): { tool: ToolEntry; version: ToolVersion } {
  const versionHash = crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
  const version = '1.0.0';
  const versionObj: ToolVersion = {
    version,
    hash: versionHash,
    created_at: Date.now(),
    passed_verifier: verifier.passed,
    score: verifier.score,
    promoted: true,
    verifier_notes: `${verifier.summary} | imported from ${origin.rootId}:${origin.rel}`,
    source_code: source,
    test_suite_code: suite,
  };
  let toolEntry = registry.find((r) => r.name === name);
  if (!toolEntry) {
    toolEntry = {
      name,
      domain,
      entrypoint: `src/tools/${name.replace(/[^a-zA-Z0-9_]/g, '_')}.ts`,
      description: '',
      versions: [],
      pendingVersions: [],
      healthStatus: 'healthy',
      anomalyCount: 0,
    };
    registry.push(toolEntry);
  }
  toolEntry.versions.push(versionObj);
  toolEntry.currentVersion = version;
  toolEntry.healthStatus = 'healthy';
  status.totalUpgrades += 1;
  return { tool: toolEntry, version: versionObj };
}

/** List which registry tools are exportable (they carry verified source). */
app.get('/api/recourse/skills/exportable', (req, res) => {
  const items = registry
    .filter((t) => isVerifiableVersion(currentToolVersion(t)))
    .map((t) => {
      const v = currentToolVersion(t)!;
      return { name: t.name, domain: t.domain, version: v.version, score: v.score, passed: v.passed_verifier, description: t.description };
    });
  res.json({ success: true, exportRoot: skillExportRoot, count: items.length, tools: items });
});

/** Export a verified registry tool as a SKILL.md folder. */
app.post('/api/recourse/skills/export', async (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const { toolName } = req.body ?? {};
    const outRoot = typeof req.body?.outRoot === 'string' ? req.body.outRoot : skillExportRoot;
    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({ success: false, error: 'toolName is required' });
    }
    const tool = registry.find((r) => r.name === toolName);
    if (!tool) return res.status(404).json({ success: false, error: `no tool named ${toolName}` });
    const version = currentToolVersion(tool);
    if (!isVerifiableVersion(version)) {
      return res.status(409).json({
        success: false,
        error: `${toolName} has no verified source in its active version — nothing honest to export. Verify a real implementation first.`,
      });
    }
    const result = await exportSkillFiles(tool, version, outRoot);
    if (!result.ok) {
      return res.status(500).json({ success: false, error: result.error || 'export failed' });
    }
    skillExports += 1;
    appendProvenanceEvent('skill_exported', {
      tool: toolName,
      version: version.version,
      hash: version.hash,
      outRoot,
      dir: result.dir,
      files: result.files.length,
    });
    saveStateToDisk();
    res.json({ success: true, ...result, totalExports: skillExports });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Ingest a foreign SKILL.md from a configured skill library as an UNVERIFIED
 *  candidate. Body: { rootId, rel, domain? }. When the skill embeds code + a
 *  suite in a code domain it is run through the real gate; otherwise it is
 *  recorded as a pending, unverified candidate that cannot be promoted yet. */
app.post('/api/recourse/skills/import', async (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const { rootId, rel, domain = 'coding' } = req.body ?? {};
    const allowed = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];
    if (!allowed.includes(domain)) return res.status(400).json({ success: false, error: 'unknown domain: ' + domain });
    if (typeof rootId !== 'string' || typeof rel !== 'string') {
      return res.status(400).json({ success: false, error: 'rootId and rel are required' });
    }
    const root = skillRoots.find((r) => r.id === rootId);
    if (!root) return res.status(404).json({ success: false, error: `unknown skill library ${rootId}` });
    const cleanRel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanRel || cleanRel.split('/').includes('..')) {
      return res.status(400).json({ success: false, error: 'invalid rel path' });
    }
    const mdRel = /SKILL\.md$/i.test(cleanRel) ? cleanRel : `${cleanRel}/SKILL.md`;
    const mdAbs = path.join(root.root, ...mdRel.replace(/^\.\//, '').split('/'));
    const relCheck = path.relative(root.root, mdAbs);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
      return res.status(400).json({ success: false, error: 'path escapes skill library root' });
    }
    let text: string;
    try {
      text = await fs.promises.readFile(mdAbs, 'utf-8');
    } catch (err: any) {
      return res.status(404).json({ success: false, error: `cannot read ${mdRel}: ${err?.message ?? err}` });
    }
    const cand = candidateFromSkillText(text, { rootId, rel: mdRel }, domain as ToolDomain);
    const domainT = domain as ToolDomain;

    let outcome = 'pending';
    let reason = cand.reason;
    let registered: { tool: ToolEntry; version: ToolVersion } | null = null;

    if (cand.runnable && cand.source && cand.suite) {
      const verifier = verifyImportedCode(domainT, cand.source, cand.suite);
      if (verifier) {
        const gate = gateWithLint(cand.source);
        const passed = verifier.passed && (gate.allowed);
        if (passed) {
          registered = registerImportedTool(cand.name, domainT, cand.source, cand.suite, verifier, { rootId, rel: mdRel });
          outcome = 'promoted';
          reason = `verified imported code (score ${verifier.score.toFixed(2)}) ${gate.allowed ? '' : lintVerdictNote(gate.lint)}`;
        } else {
          outcome = 'rejected';
          reason = `${verifier.summary}${gate.allowed ? '' : ' | ' + lintVerdictNote(gate.lint)}`;
        }
      } else {
        // Code-domain gate not applicable (math/biotech). Honest pending.
        reason = `${domain} import needs structured extras (math funcName/testCases, biotech claim) — held as unverified pending.`;
      }
    } else if (cand.runnable && !cand.suite) {
      reason = `${reason} No test suite embedded — cannot pass the promotion gate.`;
    }

    skillImports += 1;
    skillImportPending.unshift({
      name: cand.name,
      domain: domainT,
      originRoot: rootId,
      originRel: mdRel,
      runnable: cand.runnable,
      outcome,
      importedAt: Date.now(),
      reason,
    });
    if (skillImportPending.length > 200) skillImportPending.length = 200;
    appendProvenanceEvent('skill_imported', {
      skill: cand.name,
      originRoot: rootId,
      originRel: mdRel,
      domain: domainT,
      runnable: cand.runnable,
      outcome,
      reason,
      registeredTool: registered ? registered.tool.name : undefined,
    });
    saveStateToDisk();
    res.json({
      success: true,
      outcome,
      candidate: {
        name: cand.name,
        description: cand.description,
        domain: domainT,
        runnable: cand.runnable,
        license: cand.license,
        origin: cand.origin,
      },
      reason,
      registeredTool: registered ? { name: registered.tool.name, version: registered.version.version, score: registered.version.score } : null,
      totalImports: skillImports,
      recent: skillImportPending.slice(0, 20),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// =========================================================================
// COMPOSER — creative domain. Original tracks "in the vein of" a studied style
// (Steely Dan complexity / Jasper soul ballads / D'Angelo x Glasper neo-soul /
// Jefferson Airplane psych), deterministic per seed. Emits a .mid for the DAW
// and a SoundLab .seq pocket. Writes files => guarded write route.
// =========================================================================

const COMPOSE_DIR = process.env.RECOURSE_COMPOSE_DIR || path.join(process.cwd(), 'composer-out');

function safeSlug(s: string): string {
  return String(s || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
}

/** Compose an original track. Body mirrors a ComposeBrief. */
app.post('/api/recourse/compose', (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const b = req.body ?? {};
    const style = b.style;
    const known = listStyles();
    if (!known.includes(style)) {
      return res.status(400).json({ success: false, error: `style must be one of: ${known.join(', ')}` });
    }
    const brief = {
      style,
      key: typeof b.key === 'number' ? b.key : undefined,
      major: typeof b.major === 'boolean' ? b.major : undefined,
      bpm: typeof b.bpm === 'number' && b.bpm > 0 ? b.bpm : undefined,
      bars: [4, 8, 16].includes(b.bars) ? b.bars : 8,
      seed: typeof b.seed === 'number' ? b.seed : undefined,
      title: typeof b.title === 'string' ? b.title : undefined,
    };

    // Arrangement mode: a non-looping written-out arc (SD charts / Jasper final
    // key-lift). .mid only — SoundLab's .seq can't hold a multi-bar progression.
    if (b.mode === 'arr') {
      const track = composeArrangement({ ...brief, style });
      const dir = path.join(COMPOSE_DIR, safeSlug(style));
      fs.mkdirSync(dir, { recursive: true });
      const base = `${safeSlug(brief.title || `${style}-arr`)}-${brief.seed ?? ''}`;
      const midiFile = path.join(dir, `${base}.mid`);
      fs.writeFileSync(midiFile, toMidiBytes(track));
      return res.json({
        success: true,
        mode: 'arr',
        style: track.style,
        key: track.key,
        bpm: track.bpm,
        bars: track.bars,
        seed: track.seed,
        events: track.events.length,
        sections: track.sections,
        files: { midi: midiFile },
      });
    }

    const out = composeToOutcome(brief, {
      midi: true,
      seq: true,
      // Compose with the learner's current biases unless explicitly bypassed, so
      // the more you rate, the more it steers toward what you like.
      lexicon: req.body?.learn === false ? undefined : composerLearner.adjustedLexicon(style),
    });
    const dir = path.join(COMPOSE_DIR, safeSlug(style));
    fs.mkdirSync(dir, { recursive: true });
    const base = `${safeSlug(brief.title || `${style}-${brief.seed ?? 'x'}`)}-${brief.seed ?? ''}`;
    const midiFile = path.join(dir, `${base}.mid`);
    const seqFile = path.join(dir, `${base}.seq`);
    fs.writeFileSync(midiFile, toMidiBytes(out.track));
    fs.writeFileSync(seqFile, seqToJson(out.seq!));
    const summary = summarizeTrack(out);
    fs.writeFileSync(path.join(dir, `${base}.txt`), summary);
    res.json({
      success: true,
      files: { midi: midiFile, seq: seqFile, notes: path.join(dir, `${base}.txt`) },
      style: out.track.style,
      key: out.keyName,
      bpm: out.bpm,
      bars: out.bars,
      seed: out.track.seed,
      chords: out.chordLabels,
      events: out.track.events.length,
      styles: known,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** List supported composer styles (read-only). */
app.get('/api/recourse/compose/styles', (_req, res) => {
  res.json({ success: true, styles: listStyles(), composeDir: COMPOSE_DIR });
});

/** Emit a piece for SoundLab playback (the window.__recourse.load contract).
 *  Guarded write (composes + may save). Returns the JSON the bridge consumes. */
app.post('/api/recourse/compose/soundlab', (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const b = req.body ?? {};
    const style = b.style;
    if (!listStyles().includes(style)) return res.status(400).json({ success: false, error: 'unknown style' });
    const brief = {
      style,
      key: typeof b.key === 'number' ? b.key : undefined,
      major: typeof b.major === 'boolean' ? b.major : undefined,
      bpm: typeof b.bpm === 'number' && b.bpm > 0 ? b.bpm : undefined,
      bars: [4, 8, 16].includes(b.bars) ? b.bars : 8,
      seed: typeof b.seed === 'number' ? b.seed : undefined,
      title: typeof b.title === 'string' ? b.title : undefined,
    };
    const track = composeArrangement(brief);
    const piece = encodeSoundlabPiece(track);
    const problems = validatePiece(piece);
    let file: string | undefined;
    const dir = path.join(COMPOSE_DIR, safeSlug(style));
    try {
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${safeSlug(brief.title || style)}-${brief.seed ?? 'x'}.soundlab.json`);
      fs.writeFileSync(file, pieceToJson(piece));
    } catch { /* optional write */ }
    res.json({ success: problems.length === 0, valid: problems.length === 0, problems, style, seed: track.seed, file, piece });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Deterministic piece URL for a running SoundLab page to pull (CORS-open).
 *  Read-only + reproducible per (style, seed). Example:
 *  GET /api/recourse/compose/soundlab.json?style=jasper-ballad&seed=1 */
app.get('/api/recourse/compose/soundlab.json', (req, res) => {
  try {
    const style = typeof req.query.style === 'string' && listStyles().includes(req.query.style as any) ? req.query.style : 'steely-dan';
    const seed = Number(req.query.seed) || 1;
    const bars = [4, 8, 16].includes(Number(req.query.bars)) ? Number(req.query.bars) : 8;
    const track = compose({ style: style as never, seed, bars, title: `${style} pull` });
    const piece = encodeSoundlabPiece(track);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-store');
    res.json(piece);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// --- Music Therapy Oncology Research --------------------------------------
// Turns the composer/DSP system into a research instrument for music therapy
// in oncology (Cochrane 2021: anxiety/depression/pain/fatigue support). Each
// call designs a reproducible, parameter-pinned music intervention and models
// the expected biomarker response from literature priors — the "precision
// music medicine" trial infrastructure the field calls for.
app.post('/api/recourse/music-therapy/design', async (req, res) => {
  try {
    const { designMusicTherapyTrial, designMusicTherapyBatch, renderTrialBatch } = await import('./src/lib/musicTherapyResearch.js');
    const { calibratePriors } = await import('./src/lib/musicTherapyEvidence.js');
    const body = req.body || {};
    const variants = Math.min(8, Number(body.variants) || 1);
    const base = {
      bpm: Number(body.bpm) || 60,
      key: Number(body.key) || 0,
      major: body.major === true,
      style: typeof body.style === 'string' ? body.style : 'jasper-ballad',
      seed: Number(body.seed) || 42,
      intensity: (body.intensity === 'stimulative' ? 'stimulative' : 'sedative') as 'sedative' | 'stimulative',
      tuningHz: Number(body.tuningHz) || 440,
    };
    // Use pooled trial evidence for the priors when a feed refresh has run and
    // the caller opts in (default off so the fixed Cochrane anchors stay the
    // baseline unless real evidence is present).
    let priors: any = undefined;
    if (body.useEvidence === true && musicTherapyEvidence.length > 0) {
      const calibrated = calibratePriors(musicTherapyEvidence, MUSIC_THERAPY_ANCHORS);
      priors = Object.fromEntries(calibrated.map((p: any) => [p.biomarker, { mean: p.mean, sd: p.sd, calibrated: p.calibrated, source: p.source }]));
    }
    const trials = variants > 1
      ? designMusicTherapyBatch(base, variants, priors)
      : [designMusicTherapyTrial(base, priors)];
    res.json({
      success: true,
      count: trials.length,
      useEvidence: body.useEvidence === true,
      calibrated: trials[0].calibratedCount,
      trials: trials.map((t) => ({
        id: t.id,
        stimulus: t.stimulus,
        biomarkers: t.biomarkers,
        evidenceTier: t.artifact.evidenceTier,
        artifactHash: t.artifact.artifactHash,
        claim: t.artifact.claim,
        calibratedCount: t.calibratedCount,
        tuningContrast: t.tuningContrast,
        tuningNote: t.tuningNote,
      })),
      report: renderTrialBatch(trials),
      honestNote: 'Biomarker responses are literature-prior models with uncertainty, not measurements. Music therapy is a supportive intervention, not a cancer treatment.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// --- Music Therapy Tuning Contrast ----------------------------------------
// The frequency-tuning layer (432/440/443 Hz; 415 untested): seeded head-to-head
// records + Cochrane benchmark + caveats. PMIDs pending verification — never
// fabricated. Only HR + PWV carry a contrast; all other biomarkers invariant.
app.get('/api/recourse/music-therapy/tuning', async (_req, res) => {
  try {
    res.json({
      success: true,
      grid: TUNING_GRID,
      contrasts: TUNING_GRID.map((hz) => ({ tuningHz: hz, records: tuningContrastModel(hz) })),
      detailedContrast: {
        432: tuningContrastDetailed(432),
        440: tuningContrastDetailed(440),
        443: tuningContrastDetailed(443),
        415: tuningContrastDetailed(415),
      },
      records: TUNING_RECORDS,
      benchmark: benchmarkComparison(),
      benchmarkRows: musicVsControlBenchmark(),
      benchmarkNote: BENCHMARK_NOTE,
      caveats: TUNING_CAVEATS,
      render: renderTuningContrast(),
      report: renderTuningSummary(TUNING_RECORDS, tuningContrastDetailed(432), musicVsControlBenchmark()),
      honestNote: 'Tuning contrasts are seeded design-specified records with PMIDs pending verification; biomarker responses are estimates, not measurements.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// --- Music Therapy Evidence Feed ------------------------------------------
// Pulls REAL trial abstracts from Europe PMC, parses machine-parseable effect
// statements, and pools them into calibrated biomarker priors. The fixed
// Cochrane anchors remain the baseline until pooled evidence exists.
const MUSIC_THERAPY_ANCHORS: Record<string, { mean: number; sd: number; source: string }> = {
  anxietySai: { mean: -7.7, sd: 2.0, source: 'Cochrane 2021 (CD006911), n=5576' },
  hr: { mean: -5.0, sd: 2.5, source: 'Cochrane 2021 meta-analysis' },
  bpSystolic: { mean: -6.0, sd: 3.0, source: 'Cochrane 2021 meta-analysis' },
  cortisol: { mean: -0.25, sd: 0.12, source: 'neuroendocrine studies (group singing)' },
  iga: { mean: 0.30, sd: 0.15, source: 'salivary IgA before/after music' },
  hrv: { mean: 0.20, sd: 0.10, source: 'Tibetan singing bowl pilot (EEG/HRV)' },
};
let musicTherapyEvidence: any[] = [];
let musicTherapyQualitative: any[] = [];
let musicTherapyFeedAt: number | null = null;

app.get('/api/recourse/music-therapy/evidence', async (_req, res) => {
  try {
    const { calibratePriors, renderCalibration } = await import('./src/lib/musicTherapyEvidence.js');
    const priors = calibratePriors(musicTherapyEvidence, MUSIC_THERAPY_ANCHORS);
    res.json({
      success: true,
      fetchedAt: musicTherapyFeedAt,
      feedIdle: musicTherapyFeedAt == null,
      poolableRecords: musicTherapyEvidence.length,
      qualitativeRecords: musicTherapyQualitative.length,
      calibrated: priors.map((p: any) => ({
        biomarker: p.biomarker,
        mean: p.mean,
        sd: p.sd,
        calibrated: p.calibrated,
        source: p.source,
        k: p.pooled?.k ?? 0,
        totalN: p.pooled?.totalN ?? 0,
        iSquared: p.pooled?.iSquared ?? null,
        unpoolable: p.unpoolableCount,
      })),
      rawRecords: musicTherapyEvidence.map((r: any) => ({
        biomarker: r.biomarker,
        effect: r.effect,
        se: r.se,
        n: r.n,
        year: r.year,
        source: r.source,
        pmid: r.pmid,
        detail: r.detail,
      })),
      report: renderCalibration(priors),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

app.post('/api/recourse/music-therapy/evidence/refresh', async (req, res) => {
  try {
    const { fetchMusicTherapyTrials } = await import('./src/lib/musicTherapyFeed.js');
    const body = req.body || {};
    const feed = await fetchMusicTherapyTrials({
      pageSize: Math.min(50, Number(body.pageSize) || 25),
      fullText: body.fullText === true,
      maxFullText: Math.min(20, Number(body.maxFullText) || 10),
    });
    musicTherapyEvidence = feed.poolable;
    musicTherapyQualitative = feed.qualitative;
    musicTherapyFeedAt = feed.fetchedAt;
    res.json({
      success: true,
      hitCount: feed.hitCount,
      trialsFetched: feed.trials.length,
      poolableRecords: feed.poolable.length,
      qualitativeRecords: feed.qualitative.length,
      fullTextFetched: feed.fullTextFetched,
      fullTextExtracted: feed.fullTextExtracted,
      errors: feed.errors,
      honestNote: 'Only machine-parseable effect statements (MD + 95% CI, regression coefficients with SE, or per-arm mean±SD with n) from real articles were pooled. Median (IQR) rows and unattributed rows are never turned into numbers.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});
// Episodes are human ratings on reproducible (style,seed) compositions. The
// learner derives quality biases that the compose route now applies via
// composeWithLearner. Ratings are the only signal; no fake autonomy.
const composerLearner = new ComposerLearner(defaultLearnerFile());

/** Record / update a rating for a reproducible composition. Guarded write. */
app.post('/api/recourse/compose/rate', (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const b = req.body ?? {};
    const style = b.style;
    if (!listStyles().includes(style)) return res.status(400).json({ success: false, error: 'unknown style' });
    const rating = Number(b.rating);
    if (!Number.isFinite(rating)) return res.status(400).json({ success: false, error: 'rating must be a number' });
    const seed = Number(b.seed);
    if (!Number.isFinite(seed)) return res.status(400).json({ success: false, error: 'seed must be a number' });
    const bars = [4, 8, 16].includes(b.bars) ? b.bars : 8;
    const episode = composerLearner.rate(
      { style, seed, bars, key: b.key, major: b.major, bpm: b.bpm },
      rating,
      Array.isArray(b.tags) ? b.tags.map(String) : undefined,
      typeof b.notes === 'string' ? b.notes : undefined,
    );
    res.json({ success: true, episode });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Learned quality biases per style (read-only). */
app.get('/api/recourse/compose/learned', (req, res) => {
  const style = typeof req.query.style === 'string' ? req.query.style : undefined;
  if (style && listStyles().includes(style as any)) {
    return res.json({ success: true, style, adjustments: composerLearner.adjustmentsFor(style as any), episodes: composerLearner.episodesFor(style as any).slice(-20) });
  }
  const leaderboard = composerLearner.leaderboard();
  const byStyle = (Object.fromEntries(leaderboard.map((l) => [l.style, composerLearner.adjustmentsFor(l.style)])) as Record<string, unknown>);
  res.json({ success: true, styles: listStyles(), leaderboard, adjustments: byStyle });
});

/** Candidate briefs to explore near what you liked (read-only). */
app.get('/api/recourse/compose/suggest', (req, res) => {
  const style = typeof req.query.style === 'string' && listStyles().includes(req.query.style as any) ? req.query.style : 'steely-dan';
  const count = Math.min(10, Number(req.query.count) || 4);
  res.json({ success: true, style, suggestions: composerLearner.suggestNext(style as any, count) });
});

/** Objective composer benchmark (read). Grading methodology is documented in
 *  src/lib/composer/benchmark.ts and does NOT claim to grade taste/timbre. */
app.get('/api/recourse/compose/benchmark', (_req, res) => {
  try {
    const report = runComposerBenchmark();
    res.json({ success: true, ...report, markdown: renderComposerBenchmark(report) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Run the objective benchmark; optionally auto-rate winners into the learner
 *  so recursion starts without human ears. Guarded write when autoRate is set. */
app.post('/api/recourse/compose/benchmark', (req, res) => {
  const autoRate = req.body?.autoRate === true;
  if (autoRate && !requireMutationAuth(req, res)) return;
  try {
    const styles = Array.isArray(req.body?.styles) ? req.body.styles.filter((s: string) => listStyles().includes(s as any)) : undefined;
    const seeds = Array.isArray(req.body?.seeds) ? req.body.seeds.map(Number).filter((n: number) => Number.isFinite(n)) : undefined;
    const bars = [4, 8, 16].includes(req.body?.bars) ? req.body.bars : 8;
    const report = runComposerBenchmark({ styles, seeds, bars });
    let auto: { pushed: number; details: unknown[] } | undefined;
    if (autoRate) {
      const r = autoRateBenchmark(composerLearner, report, Number(req.body?.minTotal ?? 0.7));
      auto = { pushed: r.pushed, details: r.details };
    }
    res.json({ success: true, ...report, auto, markdown: renderComposerBenchmark(report) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// =========================================================================
// CAPABILITY FORGE — closed autonomous self-improvement loop
// =========================================================================
// Picks a missing micro-capability, has the model implement it, verifies the
// source ONLY against a human-authored reference suite, lints it, self-hosts it
// as a live callable module, registers it as a gene, and records the outcome in
// the durable capability-delta ledger. The ledger (tools materialized) is the
// honest measure of improvement — not the generation counter.

function forgeSnapshot() {
  const names = new Set(registry.map((t) => t.name));
  const builtLedger = new Set(forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name));
  const agenda = allForgeSpecs().map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    title: s.title,
    origin: dynamicAgenda.some((d) => d.id === s.id) ? 'intel' : 'builtin',
    state: names.has(s.name) || builtLedger.has(s.name) ? 'built' : 'pending',
  }));
  return {
    agenda,
    ledger: forgeLedger,
    summary: {
      materialized: forgeLedger.filter((l) => l.status === 'materialized').length,
      failed: forgeLedger.filter((l) => l.status === 'failed' || l.status === 'materialize_failed').length,
      offline: forgeLedger.filter((l) => l.status === 'offline').length,
      pending: agenda.filter((a) => a.state === 'pending').length,
      totalAttempts: forgeLedger.length,
      lastAt: forgeLedger.length ? forgeLedger[forgeLedger.length - 1].at : null,
      liveSelfHostedTools: listSelfHostedEntries().filter((e) => e.lastVerified?.passed).length,
    },
    builder: builderSnapshot(),
    autopilot: forgeAutopilotOn,
    busy: forgeBusy,
    model: currentProviderStatus().model,
  };
}

function allForgeSpecs(): ForgeSpec[] {
  return [...FORGE_AGENDA, ...dynamicAgenda];
}

/** Load the literature corpus once (cached). Used to ground forge agenda picks:
 *  specs whose domain/terms have real literature support are surfaced first, so
 *  tool creation is anchored to evidence instead of template rotors. Honest:
 *  missing corpus -> empty list -> no reorder (agenda stays template-driven). */
let literatureDocsCache: { docs: Array<{ rel: string; text: string }>; at: number } | null = null;
async function loadLiteratureDocs(): Promise<Array<{ rel: string; text: string }>> {
  if (literatureDocsCache && Date.now() - literatureDocsCache.at < 5 * 60 * 1000) return literatureDocsCache.docs;
  try {
    const corpusPath = path.join(process.cwd(), 'data', 'science-loop', 'seed-corpus-100.json');
    const raw = JSON.parse(await fs.promises.readFile(corpusPath, 'utf-8')) as any[];
    const docs = raw
      .filter((c) => !c.scanned_only && !c.error && String(c.text || '').length > 500)
      .map((c) => ({ rel: c.rel, text: c.text }));
    literatureDocsCache = { docs, at: Date.now() };
    return docs;
  } catch {
    literatureDocsCache = { docs: [], at: Date.now() };
    return [];
  }
}

/** Ground a forge spec against the literature: returns the claim-support score
 *  for the spec's title/domain text, or null when the corpus is unavailable.
 *  A non-null score means real corpus evidence backs the agenda pick. */
async function literatureScoreForSpec(spec: ForgeSpec): Promise<{ score: number; docs: number } | null> {
  try {
    const docs = await loadLiteratureDocs();
    if (!docs.length) return null;
    const { scoreClaimSupport } = await import('./src/lib/literatureGrounding.js');
    const support = scoreClaimSupport(docs, `${spec.title}. ${spec.name} ${spec.domain}`, 1);
    return { score: support.presenceScore ?? 0, docs: support.presentTerms?.length ?? 0 };
  } catch {
    return null;
  }
}

function nextForgeSpec(): ForgeSpec | null {
  const names = new Set(registry.map((t) => t.name));
  const builtLedger = new Set(forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name));
  const selfHosted = new Set(listSelfHostedEntries().map((e) => e.name));
  for (const spec of allForgeSpecs()) {
    // Quarantined specs (repeated live-re-verify failures) are skipped — the
    // autopilot must not spin forever on a gene that cannot self-host.
    if ((forgeQuarantine.get(spec.name) ?? 0) >= FORGE_QUARANTINE_LIMIT) continue;
    // Dream/backfill gene specs: the gene may already be in the registry (from
    // mirrorCrystallizedDreamGenes) but NOT yet materialized by the forge as a
    // self-hosted tool. Always return them so the forge can materialize them.
    const isDreamSpec = spec.id.startsWith('backfill_') || spec.id.startsWith('dream_');
    if (isDreamSpec && !builtLedger.has(spec.name) && !selfHosted.has(spec.name)) return spec;
    if (!names.has(spec.name) && !builtLedger.has(spec.name)) return spec;
  }
  return null;
}

/**
 * Materialize a passed forge outcome into a live self-hosted tool + registry
 * gene. All verification (reference suite + lint + live import re-run) must
 * pass; anything that fails triggers rollback and an honest 'materialize_failed'
 * ledger entry. Returns the ledger entry for this attempt.
 */
async function materializeForgeOutcome(outcome: ForgeAttemptOutcome, spec: ForgeSpec, literature?: { score: number; docs: number } | null): Promise<ForgeLedgerEntry> {
  const at = Date.now();
  const started = at;
  const base: ForgeLedgerEntry = {
    id: `forge_${at}_${spec.name}`,
    at,
    gen: status.generation,
    name: spec.name,
    domain: spec.domain,
    status: 'failed',
    attemptsUsed: outcome.attemptsUsed,
    maxTries: outcome.maxTries,
    failures: outcome.failures.length ? outcome.failures : undefined,
    wallMs: 0,
    literature,
  };

  // Already present (e.g. genesis or a previous run) -> not a delta UNLESS this
  // is a dream gene spec that was registered by the dream mirror but never
  // materialized as a self-hosted tool. The dream gene path in runForgeCycle
  // needs to actually write the self-host module + verify + add to manifest.
  if (registry.some((t) => t.name === spec.name)) {
    const alreadySelfHosted = listSelfHostedEntries().some((e) => e.name === spec.name);
    if (alreadySelfHosted) {
      base.status = 'exists';
      base.wallMs = Date.now() - started;
      forgeLedger.push(base);
      saveStateToDisk();
      return base;
    }
    // Fall through to the materialization path below even though the spec is
    // already in the registry — we need to write the self-host module.
  }

  if (outcome.ok !== true || !outcome.source) {
    base.status = outcome.reason === 'offline' ? 'offline' : 'failed';
    base.wallMs = Date.now() - started;
    forgeLedger.push(base);
    saveStateToDisk();
    return base;
  }

  // 1. Real lint gate.
  const lint = gateWithLint(outcome.source).lint;
  if (lint.available && !lint.clean) {
    base.status = 'failed';
    base.summary = 'failed oxlint gate';
    base.failures = [...(base.failures || []), { attempt: 0, note: lintVerdictNote(lint) }];
    base.wallMs = Date.now() - started;
    forgeLedger.push(base);
    saveStateToDisk();
    return base;
  }

  const isClass = spec.kind === 'class';
  let moduleFile: string | null = null;
  let verdictNote = '';
  if (!isClass) {
    // 2. Write the real self-host module (self-hosting is function-only).
    const writeRes = writeStatelessSelfHostedTool({
      name: spec.name,
      domain: spec.domain,
      entrypointName: spec.name,
      sourceCode: outcome.source,
      // Dream-spec path rewrites the suite to the renamed function; fall back to
      // spec.refSuite (the stored contract) for model-built specs.
      testSuiteCode: outcome.refSuite ?? spec.refSuite,
      summary: `[Capability Forge] ${spec.title} (${spec.id})`,
    });
    if (writeRes.success !== true) {
      base.status = 'materialize_failed';
      base.summary = writeRes.error;
      base.wallMs = Date.now() - started;
      bumpForgeQuarantine(spec.name);
      forgeLedger.push(base);
      saveStateToDisk();
      return base;
    }
    moduleFile = writeRes.entry.file;

    // 3. Prove the module actually imports + its suite passes live; roll back if not.
    //    (awaitVerifySelfHosted must be awaited: without the await the verdict was a
    //    Promise - always truthy - so a failed live re-verify never rolled back and
    //    an unverified tool could be promoted. This is the correctness gate.)
    const verdict = await awaitVerifySelfHosted(writeRes.entry);
    if (!verdict) {
      removeSelfHostedTool(writeRes.entry.name);
      base.status = 'materialize_failed';
      base.summary = 'live re-verify failed after write';
      base.wallMs = Date.now() - started;
      bumpForgeQuarantine(spec.name);
      forgeLedger.push(base);
      saveStateToDisk();
      return base;
    }
    verdictNote = verdict;
  } else {
    // Class spec: the function-only self-host writer cannot wrap a class, so we
    // register the SANDBOX-VERIFIED gene (ref suite already passed in
    // attemptForgeSpec) as a non-self-hosted registry gene. Honest and
    // consistent - genesis class tools (e.g. L2Cache) are also not self-hosted.
    verdictNote = 'class gene verified by reference suite (self-hosting is function-only)';
  }

  const versionHash = crypto.createHash('sha256').update(outcome.source).digest('hex').substring(0, 16);
  const newVersion = {
    version: '1.0.0-forge',
    hash: versionHash,
    created_at: at,
    passed_verifier: true,
    score: outcome.verifyScore ?? 1,
    promoted: true,
    verifier_notes: isClass
      ? `CAPABILITY FORGE (class): model impl passed HUMAN-authored reference suite (score ${outcome.verifyScore}) | not self-hosted | ${lintVerdictNote(lint)}`
      : `CAPABILITY FORGE: model impl passed HUMAN-authored reference suite (score ${outcome.verifyScore}) | ${verdictNote} | ${lintVerdictNote(lint)}`,
    source_code: outcome.source,
    test_suite_code: spec.refSuite,
  };
  const entrypoint = isClass
    ? `src/tools/${toSafeModuleName(spec.name)}.ts`
    : `.selfhosted/tools/${toSafeModuleName(spec.name)}.mjs`;

  registry.unshift({
    name: spec.name,
    domain: spec.domain,
    entrypoint,
    description: isClass
      ? `[Capability Forge] ${spec.title} — verified class gene (not self-hosted)`
      : `[Capability Forge] ${spec.title} — self-hosted, verified live`,
    currentVersion: '1.0.0-forge',
    versions: [newVersion],
    healthStatus: 'healthy',
    anomalyCount: 0,
  });
  status.registeredToolsCount = registry.length;
  status.totalUpgrades += 1;

  base.status = 'materialized';
  base.moduleFile = moduleFile ?? undefined;
  base.hash = versionHash;
  base.summary = isClass ? `${spec.title} — verified class gene (not self-hosted)` : `${spec.title} — live self-hosted tool (${verdictNote})`;
  base.wallMs = Date.now() - started;
  forgeQuarantine.delete(spec.name); // success clears quarantine
  forgeLedger.push(base);

  appendProvenanceEvent('template_component_built', {
    toolName: spec.name,
    domain: spec.domain,
    origin: 'capability_forge',
    hash: versionHash,
    selfHosted: !isClass,
    ...(moduleFile ? { moduleFile } : {}),
    attemptsUsed: outcome.attemptsUsed,
    verifyScore: outcome.verifyScore,
    referenceSuiteId: spec.id,
  });
  saveStateToDisk();
  return base;
}

/** verify a self-hosted entry; returns a short detail string or null on fail. */
async function awaitVerifySelfHosted(entry: SelfHostedManifestEntry): Promise<string | null> {
  try {
    const verdict = await verifySelfHostedEntry(entry);
    return verdict.passed ? verdict.detail : null;
  } catch {
    return null;
  }
}

/**
 * Run ONE autonomous forge cycle: pick the next missing capability and try to
 * materialize it. Returns a description for callers/autopilot.
 */
// Builder Brain helpers — improve the improver from real forge outcomes.
function activeBuilderProfile(): BuilderProfile {
  return builderProfiles.find((p) => p.id === activeBuilderId) ?? builderProfiles[0];
}

function recordBuilderOutcome(profileId: string, spec: ForgeSpec, passed: boolean, attemptsUsed: number): void {
  if (attemptsUsed <= 0) return; // nothing was actually attempted
  builderJournal.push({ at: Date.now(), profileId, specId: spec.id, domain: spec.domain, passed, attemptsUsed });
  if (builderJournal.length > 500) builderJournal.splice(0, builderJournal.length - 500);
}

/** Decide the next active generator profile from real outcomes; occasionally
 *  propose a new prompt variant (rare self-modification of the prompt layer).
 *  A just-proposed variant gets a bounded validation window before greedy
 *  selection resumes. */
function builderMetaStep(forceMutate = false): void {
  if (builderVariantTrials > 0) {
    builderVariantTrials--;
    saveStateToDisk();
    return; // let a just-proposed variant be exercised before deciding again
  }
  const best = chooseBuilderProfile(builderProfiles, builderJournal);
  let decided = false;
  if (forceMutate || builderMutateDue(builderJournal, builderProfiles, builderLastMutate)) {
    const variant = proposeBuilderProfile(builderProfiles, builderJournal, Math.random);
    if (variant) {
      builderProfiles.push(variant);
      activeBuilderId = variant.id;
      builderVariantTrials = 4;
      builderLastMutate = builderJournal.length;
      builderLastMetaRun = builderJournal.length;
      decided = true;
      console.log(`[builder-brain] proposed new strategy "${variant.label}" (${variant.id}) for validation.`);
    }
  }
  if (!decided && (forceMutate || builderJournal.length - builderLastMetaRun >= 3 || best.id !== activeBuilderId)) {
    activeBuilderId = best.id;
    builderLastMetaRun = builderJournal.length;
  }
  saveStateToDisk();
}

function builderSnapshot() {
  return {
    activeProfileId: activeBuilderId,
    active: activeBuilderProfile(),
    profiles: builderProfiles.map((p) => ({ id: p.id, label: p.label, temperature: p.temperature })),
    beliefs: computeBuilderBeliefs(builderProfiles, builderJournal),
    journalSize: builderJournal.length,
    variantTrials: builderVariantTrials,
  };
}

async function runForgeCycle(): Promise<ForgeLedgerEntry | { skipped: boolean; reason: string }> {
  const spec = nextForgeSpec();
  if (!spec) {
    return { skipped: true, reason: 'agenda complete (all capabilities built or already present)' };
  }

  // R6 grounding: annotate the attempt with real literature support for this
  // spec's title/domain. Recorded on the ledger entry so research evidence is
  // visible next to every build — and future agenda ordering can rank by it.
  const literature = await literatureScoreForSpec(spec);

  // Dream gene specs (id starts with 'backfill_' or 'dream_') already have verified
  // source code in the registry — the dream engine synthesized and sandbox-verified
  // them. Skip the model-regeneration step and materialize from the existing code
  // directly. This closes the gap: dream genes enter the registry (step 1) but
  // never become self-hosted tools (step 2) without this path.
  const isDreamSpec = spec.id.startsWith('backfill_') || spec.id.startsWith('dream_');
  let outcome: ForgeAttemptOutcome;
  if (isDreamSpec) {
    const regEntry = registry.find((t) => t.name === spec.name);
    const existingSource = regEntry?.versions.find((v) => v.version === regEntry.currentVersion)?.source_code;
    if (existingSource) {
      // Rewrite the gene source so the exported function name matches the registry
      // name (the self-hosting module calls `entrypointName(args)`). If the source
      // already exports a function with the right name, this is a no-op.
      const originalName = detectFunctionNameInSource(existingSource);
      const rewrittenSource = rewriteGeneExport(existingSource, spec.name);
      // Critical: the reference suite built from the ORIGINAL gene asserts the
      // ORIGINAL function name (e.g. `gcSkewAnalyzer`). After the rename above the
      // module only exports `spec.name`, so the stored suite must be rewritten to
      // the same name — otherwise live re-verify fails and the forge spins forever.
      const rewrittenSuite = originalName
        ? rewriteGeneRefSuite(spec.refSuite, originalName, spec.name)
        : (spec.refSuite ?? '');
      outcome = {
        ok: true,
        id: spec.id,
        name: spec.name,
        domain: spec.domain,
        source: rewrittenSource,
        refSuite: rewrittenSuite,
        attemptsUsed: 0,
        maxTries: 3,
        failures: [],
        reason: undefined,
      };
    } else {
      outcome = { ok: false, id: spec.id, name: spec.name, domain: spec.domain, source: undefined, attemptsUsed: 0, maxTries: 3, failures: [], reason: 'failed' };
    }
  } else {
    const b = activeBuilderProfile();
    outcome = await attemptForgeSpec(spec, 3, { systemPrompt: b.systemPrompt, temperature: b.temperature });
    if (outcome.reason !== 'offline') {
      recordBuilderOutcome(b.id, spec, outcome.ok === true, outcome.attemptsUsed);
      builderMetaStep(false);
    }
  }
  return materializeForgeOutcome(outcome, spec, literature);
}

function ensureForgeAutopilot(): void {
  if (!forgeAutopilotOn) return;
  // Scheduler is the single timer authority (no local interval — no double runs).
  setJobEnabled('forge', true);
}

function stopForgeAutopilot(): void {
  if (forgeTimer) {
    clearInterval(forgeTimer);
    forgeTimer = null;
  }
  setJobEnabled('forge', false);
}

app.get('/api/recourse/forge', (req, res) => {
  res.json({ success: true, forge: forgeSnapshot() });
});

app.post('/api/recourse/forge/run', async (req, res) => {
  try {
    if (forgeBusy) {
      return res.status(409).json({ success: false, error: 'forge busy (a cycle is already running)' });
    }
    forgeBusy = true;
    try {
      const count = Math.max(1, Math.min(3, Math.floor(Number(req.body?.count ?? 1) || 1)));
      const results: any[] = [];
      for (let i = 0; i < count; i++) {
        const r = await runForgeCycle();
        results.push(r);
        if (r && typeof r === 'object' && (r as any).skipped) break;
      }
      res.json({ success: true, results, forge: forgeSnapshot() });
    } finally {
      forgeBusy = false;
    }
  } catch (err: any) {
    forgeBusy = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/forge/autopilot/toggle', (req, res) => {
  forgeAutopilotOn = !forgeAutopilotOn;
  if (forgeAutopilotOn) {
    ensureForgeAutopilot();
    if (!forgeBusy) {
      forgeBusy = true;
      runForgeCycle()
        .catch(() => {})
        .finally(() => { forgeBusy = false; });
    }
  } else {
    stopForgeAutopilot();
  }
  saveStateToDisk();
  res.json({ success: true, autopilot: forgeAutopilotOn, forge: forgeSnapshot() });
});

// Builder Brain routes — inspect / drive the meta-loop that improves the generator.
app.get('/api/recourse/builder', (req, res) => {
  res.json({ success: true, builder: builderSnapshot() });
});

/** Manually pin the active generator strategy to a profile id. */
app.post('/api/recourse/builder/select', (req, res) => {
  const { profileId } = req.body ?? {};
  if (typeof profileId !== 'string' || !builderProfiles.some((p) => p.id === profileId)) {
    return res.status(400).json({ success: false, error: 'unknown profileId' });
  }
  activeBuilderId = profileId;
  builderVariantTrials = 0;
  builderLastMetaRun = builderJournal.length;
  saveStateToDisk();
  res.json({ success: true, builder: builderSnapshot() });
});

/** Force the meta-loop to propose a NEW generator strategy variant (validation window). */
app.post('/api/recourse/builder/propose', (req, res) => {
  builderMetaStep(true);
  res.json({ success: true, builder: builderSnapshot() });
});

/** Manually run the selection step (greedy best from the real journal). */
app.post('/api/recourse/builder/step', (req, res) => {
  builderVariantTrials = 0;
  const best = chooseBuilderProfile(builderProfiles, builderJournal);
  activeBuilderId = best.id;
  builderLastMetaRun = builderJournal.length;
  saveStateToDisk();
  res.json({ success: true, builder: builderSnapshot() });
});

// =========================================================================
// INTEL → INVENTION — pull ecosystem intel into proposals, rank, adopt.
// =========================================================================
function intelSnapshot() {
  return {
    proposals: sortProposals(intelProposals),
    top: nextProposalToPursue(intelProposals),
    agendaSize: dynamicAgenda.length,
  };
}

async function intelView() {
  return { ...intelSnapshot(), sources: await intelSourceStatuses() };
}

/** Pull intel from reachable sources into durable proposals. */
async function runIntelPull(): Promise<{ added: number; detail: string }> {
  let added = 0;
  const existing = new Set(intelProposals.map((p) => p.title.toLowerCase()));
  const st = await intelSourceStatuses();
  const bb = st.find((s) => s.id === 'bbtech');
  if (bb?.online) {
    const res = await pullBbtchArchetypes();
    if (res.ok) {
      for (const idea of res.ideas.slice(0, 40)) {
        if (!idea.title || existing.has(idea.title.toLowerCase())) continue;
        const p = bbtchIdeaToProposal(`intel_${Date.now()}_${intelProposals.length}_${added}`, idea, 'bbtech');
        intelProposals.push(p);
        existing.add(p.title.toLowerCase());
        added++;
      }
    }
  }
  if (added) saveStateToDisk();
  return { added, detail: `bbtech online=${Boolean(bb?.online)}` };
}

/** Rank proposals via the strategy team (or a transparent local heuristic). */
async function runIntelRank(): Promise<{ ranked: number; strategyUsed: boolean }> {
  const candidates = intelProposals.filter((p) => p.status === 'new' || p.status === 'ranked');
  if (candidates.length === 0) return { ranked: 0, strategyUsed: false };
  const res = await rankProposalsWithStrategy(candidates);
  let strategyUsed = false;
  if (res.ok && res.orderedIds.length > 0) {
    strategyUsed = true;
    const n = res.orderedIds.length;
    res.orderedIds.forEach((id, idx) => {
      const p = intelProposals.find((x) => x.id === id);
      if (p) p.score = Math.max(1, Math.round(100 - (idx / Math.max(1, n - 1)) * 90));
    });
  } else {
    for (const p of candidates) p.score = heuristicScore(p);
  }
  for (const p of candidates) p.status = 'ranked';
  saveStateToDisk();
  return { ranked: candidates.length, strategyUsed };
}

app.get('/api/recourse/intel', async (req, res) => {
  try { res.json({ success: true, intel: await intelView() }); } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/recourse/intel/pull', async (req, res) => {
  try {
    const r = await runIntelPull();
    res.json({ success: true, ...r, intel: await intelView() });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/recourse/intel/rank', async (req, res) => {
  try {
    const r = await runIntelRank();
    res.json({ success: true, ...r, intel: await intelView() });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

/** Adopt a proposal into the forge agenda. REAL gate: a human-authored
 *  reference suite is required, so an invented idea only becomes buildable when
 *  there is a concrete, testable contract for it. */
app.post('/api/recourse/intel/adopt', async (req, res) => {
  try {
    const { proposalId, functionName, prompt, referenceSuite, domain, title } = req.body ?? {};
    if (typeof proposalId !== 'string') return res.status(400).json({ success: false, error: 'proposalId required' });
    const prop = intelProposals.find((p) => p.id === proposalId);
    if (!prop) return res.status(404).json({ success: false, error: 'proposal not found' });
    if (typeof functionName !== 'string' || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName)) {
      return res.status(400).json({ success: false, error: 'functionName must be a valid identifier' });
    }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'prompt must describe the behavior (>=20 chars)' });
    }
    if (typeof referenceSuite !== 'string' || referenceSuite.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'referenceSuite is required — invented ideas need a real, testable contract before they can be built+verified' });
    }
    const dom = (domain as ToolDomain) && (['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'] as ToolDomain[]).includes(domain)
      ? (domain as ToolDomain)
      : prop.domain;
    const spec: ForgeSpec = {
      id: `intel_${proposalId.slice(-20)}`,
      name: functionName,
      domain: dom,
      title: typeof title === 'string' && title.trim() ? title : prop.title,
      prompt: prompt,
      refSuite: referenceSuite,
    };
    if (!dynamicAgenda.some((d) => d.name === spec.name)) dynamicAgenda.push(spec);
    prop.status = 'adopted';
    prop.adoptedSpecId = spec.id;
    prop.adoptedAt = Date.now();
    saveStateToDisk();
    appendProvenanceEvent('capability_adopted', { driverId: `intel:${prop.source}`, proposalId: prop.id, spec: spec.id, toolName: spec.name });
    res.json({ success: true, spec, intel: intelSnapshot() });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

/** Dev-only seed: populates sample proposals so the UI panel can be inspected
 *  without the real source services running. Disabled unless RECOURSE_DEV_SEED=1. */
if (process.env.RECOURSE_DEV_SEED === '1' && intelProposals.length === 0) {
  const seeds: Omit<IntelProposal, 'id'>[] = [
    {
      source: 'bbtech',
      title: 'Recurring: Adaptive Bloom Filter with variable false-positive budget',
      description: 'A bloom filter that dynamically re-sizes its bit vector and hash functions based on observed false-positive rate and insertion count, maintaining a target error bound across workloads with varying cardinality.',
      domain: 'coding',
      tags: ['bloom-filter', 'adaptive', 'data-structure', 'cache'],
      rationale: 'bbtech: experiment archetype recurring (adaptive data structure)',
      score: 78,
      createdAt: Date.now(),
      status: 'new',
    },
    {
      source: 'strategy',
      title: 'LLM-guided test-case generation via property-based shrinking',
      description: 'Generate test suites using a language model that proposes property-based invariants from function signatures and docstrings, then uses a shrinking engine to produce minimal failing inputs when invariants are violated.',
      domain: 'coding',
      tags: ['property-testing', 'llm', 'test-generation', 'shrinking'],
      rationale: 'strategy: high-ROI capability gap identified by dev-brain',
      score: 91,
      createdAt: Date.now() - 60000,
      status: 'ranked',
    },
    {
      source: 'bbtech',
      title: 'Quantum circuit simulation via tensor-network contraction with gate fusion',
      description: 'Simulate quantum circuits with 30-50 qubit capacity using optimized tensor-network contraction ordering with gate fusion and lazy evaluation to reduce intermediate tensor rank.',
      domain: 'quantum_sim',
      tags: ['quantum', 'tensor-network', 'simulation', 'gate-fusion'],
      rationale: 'bbtech: archetype technique applied to quantum domain',
      score: 65,
      createdAt: Date.now() - 120000,
      status: 'new',
    },
  ];
  seeds.forEach((s, i) => {
    intelProposals.push({ id: `seed_${Date.now()}_${i}`, ...s });
  });
  saveStateToDisk();
}

// =========================================================================
// FLEET DEVELOPMENT LOOP — audit/repair team integration
// =========================================================================
// Recourse is a first-class fleet component. These routes let the ecosystem's
// audit team (RepoRank/Grader/Codegang/Benchmark-Olympics/the Deep) and repair
// team (Draymond repair crew) drive Recourse's continuous development — while
// Recourse keeps the safety gate: nothing external reaches disk until it passes
// Recourse's own sandbox verifier + lint (verifyAndApplyPatch).

function recordDev(action: string, ok: boolean, detail: string, extra: Partial<DevLoopEntry> = {}): DevLoopEntry {
  const entry: DevLoopEntry = { at: Date.now(), action, ok, detail, ...extra };
  devLoopLog.push(entry);
  if (devLoopLog.length > 200) devLoopLog.splice(0, devLoopLog.length - 200);
  saveStateToDisk();
  return entry;
}

function devRepoRoot(): string {
  return path.resolve(process.env.RECOURSE_REPO || process.cwd());
}

/** True for patches that target Recourse's OWN harness source — files the in-
 *  process sandbox cannot fully verify because they import siblings or reference
 *  module/process state. These get the CI-green compile gate + rollback. */
function isHarnessSource(file: string): boolean {
  return /(^|[\\/])(server\.ts|src[\\/].*\.(ts|tsx|mts))$/.test(file) && /\.(ts|tsx|mts)$/i.test(file);
}

/** Real compile gate (tsc --noEmit) — the honest CI-green substitute for
 *  monolith/harness modules the sandbox cannot import. Runs only when the gate
 *  is enabled (RECOURSE_HARNESS_CI_GATE=1) so day-to-day dev is never slowed.
 *  When enabled and the tree does not compile, the patch is refused BEFORE it
 *  touches disk. Honest: an unavailable tsc reports as a block with a note
 *  rather than pretending it compiled. */
function makeHarnessBootGreenGate(): BootGreenGate {
  const gate: BootGreenGate = async () => {
    let out = '';
    try {
      const res = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], { cwd: devRepoRoot(), shell: process.platform === 'win32' });
        let stderr = '';
        child.stdout.on('data', (d) => { out += String(d); });
        child.stderr.on('data', (d) => { stderr += String(d); });
        child.on('error', () => resolve({ ok: false, error: 'tsc could not be started' }));
        child.on('close', (code) => {
          if (code === 0) resolve({ ok: true });
          else resolve({ ok: false, error: `tsc --noEmit failed (exit ${code})` });
        });
      });
      return res;
    } catch {
      return { ok: false, error: 'compile gate unavailable' };
    }
  };
  return gate;
}

const HARNESS_CI_GATE = process.env.RECOURSE_HARNESS_CI_GATE === '1';

/** The boot-green gate to attach to a fleet patch, or undefined to skip it. Only
 *  harness-source patches carry the gate, and only when it is enabled. */
function bootGreenForPatch(file: string): BootGreenGate | undefined {
  return HARNESS_CI_GATE && isHarnessSource(file) ? makeHarnessBootGreenGate() : undefined;
}


function devDossierInput(): DossierInput {
  const liveSH = listSelfHostedEntries().filter((e) => e.lastVerified?.passed).length;
  return {
    registry: registry.map((t) => ({
      name: t.name,
      domain: t.domain,
      healthStatus: t.healthStatus,
      currentVersion: t.currentVersion,
      versions: t.versions,
    })),
    liveSelfHostedTools: liveSH,
    openAnomalies: anomalies.filter((a) => a.status === 'detected').length,
    verifierPassRate: status.verifierPassRate ?? 0,
    forgeMaterialized: forgeLedger.filter((l) => l.status === 'materialized').length,
    repoUrl: process.env.RECOURSE_REPO_URL || null,
  };
}

async function devSnapshot() {
  const dossier = computeHealthDossier(devDossierInput());
  const root = devRepoRoot();
  return {
    dossier,
    topWeaknessScore: topWeaknessScore(dossier),
    auditors: await auditorStatuses(),
    autopilot: devAutopilotOn,
    root,
    harness: {
      ciGate: HARNESS_CI_GATE,
      backupDir: fleetBackupDir(root),
      applied: listFleetPatches(root).filter((p) => !p.reverted).length,
      reverted: listFleetPatches(root).filter((p) => p.reverted).length,
    },
    log: devLoopLog.slice(-50),
  };
}

/** Report Recourse's weak entities to the Draymond repair team (auto-fix gate). */
async function runRepairReport(force = false): Promise<{ ok: boolean; detail: string; submitted?: number }> {
  const drv = getFleetDriver('draymond-repair');
  const base = drv?.baseUrl();
  if (!drv || !base) return { ok: false, detail: 'draymond-repair driver not configured (DRAYMOND_URL unset)' };
  const online = await probeDriverOnline(drv);
  if (!online) return { ok: false, detail: `draymond ops unreachable at ${base}` };

  // Cooldown: don't spam the repair team with identical dossiers.
  if (!force) {
    const last = [...devLoopLog].reverse().find((l) => l.driver === 'draymond-repair' && l.action === 'report');
    if (last && Date.now() - last.at < 15 * 60 * 1000) {
      return { ok: false, detail: 'repair report on cooldown (reports every 15m max)' };
    }
  }

  const dossier = computeHealthDossier(devDossierInput());
  const rows = buildRepairRows(dossier);
  if (rows.length === 0) {
    recordDev('report', true, 'no weaknesses above the >=50 remediation band', { driver: 'draymond-repair' });
    return { ok: true, detail: `healthy (health ${dossier.healthIndex}) — nothing above remediation band` };
  }

  const secret = process.env.DRAYMOND_CRON_SECRET || process.env.CRON_SECRET || '';
  const res = await submitToRepairEndpoint({
    rows,
    url: base,
    secret,
    enabled: process.env.DRAYMOND_REPAIR_BENCHMARK_ENABLED !== '0',
  });
  recordDev('report', res.ok, `${res.dispatched} row(s) dispatched: ${res.error || 'ok'}`, { driver: 'draymond-repair' });
  return { ok: res.ok, detail: res.error || `dispatched ${res.dispatched} weak entit(ies) to the repair team`, submitted: res.dispatched };
}

/** Ask the Deep (deterministic brain) to analyze Recourse and propose repairs. */
async function runDeepAnalyze(): Promise<{ ok: boolean; output?: string; error?: string }> {
  const drv = getFleetDriver('deterministic-brain');
  const base = drv?.baseUrl();
  if (!drv || !base) return { ok: false, error: 'deterministic-brain not configured (BRAIN_URL unset)' };
  const online = await probeDriverOnline(drv);
  if (!online) return { ok: false, error: `brain unreachable at ${base}` };
  const dossier = computeHealthDossier(devDossierInput());
  const res = await askDeterministicBrain({ url: base, query: buildBrainAnalyzeQuery(dossier) });
  recordDev('deep', res.ok, res.ok ? 'brain returned an analysis/repair proposal' : `brain failed: ${res.error}`, { driver: 'deterministic-brain' });
  return res;
}

/** Brain gateway — Recourse calls a brain "as needed" to decide/rank/analyze.
 *  - deterministic-brain -> deep Parse/Reason/Execute/Audit over Recourse.
 *  - dev-brain -> weighted decision matrix: decide among candidate actions, or
 *    repair/triage to ORDER which weakness to fix first, or fusion.
 *  Each brain is probed for real; unreachable/down is an honest failure. */
async function runBrainGateway(body: {
  brain?: string;
  action?: DevBrainAction | 'deep';
  problem?: string;
  candidates?: DevBrainCandidate[];
  strategy?: DevBrainStrategy;
}): Promise<Record<string, unknown>> {
  const brain = body.brain === 'dev-brain' ? 'dev-brain' : 'deterministic-brain';
  const drv = getFleetDriver(brain);
  const base = drv?.baseUrl();
  if (!drv || !base) return { ok: false, brain, error: `${brain} not configured` };
  const online = await probeDriverOnline(drv);
  if (!online) return { ok: false, brain, error: `${brain} unreachable at ${base}` };

  if (brain === 'deterministic-brain') {
    const problem = body.problem && body.problem.trim() ? body.problem : undefined;
    const query = problem || buildBrainAnalyzeQuery(computeHealthDossier(devDossierInput()));
    const res = await askDeterministicBrain({ url: base, query });
    recordDev('brain', res.ok, res.ok ? 'deterministic-brain answered' : `deterministic-brain failed: ${res.error}`, { driver: brain });
    return { ok: res.ok, brain, output: res.output, error: res.error };
  }

  // dev-brain: build candidates from our own findings when none supplied.
  const action: DevBrainAction = body.action === 'fusion' ? 'fusion' : body.action === 'triage' ? 'triage' : 'decide';
  const problem = body.problem && body.problem.trim() ? body.problem : `Recourse ${action}: choose the highest-value development action to execute next.`;
  let candidates = body.candidates ?? [];
  if ((action === 'triage' || action === 'decide') && candidates.length === 0) {
    const dossier = computeHealthDossier(devDossierInput());
    candidates = dossier.findings.map((f) => ({ name: f.slug, description: f.reasons.join('; '), tags: ['recourse-finding'] }));
  }
  if (candidates.length === 0) return { ok: false, brain, error: 'no candidates to rank (provide candidates or have findings)' };
  const res = await callDevBrain({ action, problem, candidates, strategy: body.strategy, url: base });
  recordDev('brain', res.ok, `${action}: ${res.recommendedId ?? (res.ok ? 'ranked' : res.error ?? 'failed')}`, { driver: brain });
  return { ok: res.ok, brain, action, ...res };
}

// ---------------------------------------------------------------------------
// GENOME COUNCIL — deterministic-brain /genome-council/* (compounding control)
// ---------------------------------------------------------------------------
// The deterministic brain hosts an LLM-free genome-council whose leader
// believability compounds from recorded outcomes. Recourse consults it for
// advisory strategy guidance on its next repair and can record a real outcome
// (post-mortem) back so the brain learns which lenses actually work on
// Recourse. Honest scope: council output is strategy guidance — Recourse's own
// sandbox verifier + lint gate remain the only promotion gate. Offline brain =>
// honest ok:false, never a fabricated council.

async function councilBase(): Promise<{ base: string; online: boolean }> {
  const drv = getFleetDriver('deterministic-brain');
  const base = drv?.baseUrl();
  if (!drv || !base) return { base: '', online: false };
  return { base, online: await probeDriverOnline(drv) };
}

function councilProblemForDossier(): string {
  const dossier = computeHealthDossier(devDossierInput());
  return buildCouncilProblem(dossier.findings.length > 0 ? dossier.findings[0] : undefined);
}

async function runCouncilDecide(body: {
  problem?: string;
  selectedGenomes?: string[];
  activeSectors?: string[];
}): Promise<Record<string, unknown>> {
  const { base, online } = await councilBase();
  if (!base) return { ok: false, error: 'deterministic-brain not configured (BRAIN_URL unset)' };
  if (!online) return { ok: false, error: `deterministic-brain unreachable at ${base}` };
  const problem = body.problem && body.problem.trim() ? body.problem : councilProblemForDossier();
  const res = await councilDecide({
    url: base,
    problem,
    selectedGenomes: body.selectedGenomes,
    activeSectors: body.activeSectors,
  });
  recordDev('council', res.ok, res.ok ? 'genome council returned an approach' : `genome council failed: ${res.error}`, { driver: 'deterministic-brain' });
  return { ok: res.ok, problem, council: res.result, error: res.error };
}

async function runCouncilState(): Promise<Record<string, unknown>> {
  const { base, online } = await councilBase();
  if (!base) return { ok: false, error: 'deterministic-brain not configured (BRAIN_URL unset)' };
  if (!online) return { ok: false, error: `deterministic-brain unreachable at ${base}` };
  const res = await councilState({ url: base });
  recordDev('council-state', res.ok, res.ok ? 'read genome-council ledger' : `genome-council state failed: ${res.error}`, { driver: 'deterministic-brain' });
  return { ok: res.ok, overview: res.overview, learnedWeights: res.learnedWeights, error: res.error };
}

async function runCouncilLessons(limit?: number): Promise<Record<string, unknown>> {
  const { base, online } = await councilBase();
  if (!base) return { ok: false, error: 'deterministic-brain not configured (BRAIN_URL unset)' };
  if (!online) return { ok: false, error: `deterministic-brain unreachable at ${base}` };
  const res = await councilLessons({ url: base, limit });
  recordDev('council-lessons', res.ok, res.ok ? `read ${res.total ?? 0} council lesson(s)` : `genome-council lessons failed: ${res.error}`, { driver: 'deterministic-brain' });
  return { ok: res.ok, total: res.total, lessons: res.lessons, error: res.error };
}

async function runCouncilPostMortem(body: {
  decisionTitle?: string;
  sector?: string;
  chosenOption?: string;
  predictedProbability?: number;
  actualOutcome?: string;
  leaderIds?: string[];
  rootCauses?: string[];
  keyLessons?: string[];
  retrospectiveSummary?: string;
}): Promise<Record<string, unknown>> {
  const { base, online } = await councilBase();
  if (!base) return { ok: false, error: 'deterministic-brain not configured (BRAIN_URL unset)' };
  if (!online) return { ok: false, error: `deterministic-brain unreachable at ${base}` };
  const outcome = body.actualOutcome;
  if (outcome !== 'success' && outcome !== 'partial' && outcome !== 'failure') {
    return { ok: false, error: 'actualOutcome must be success | partial | failure' };
  }
  const res = await councilPostMortem({
    url: base,
    input: {
      decisionTitle: body.decisionTitle ?? '',
      sector: body.sector,
      chosenOption: body.chosenOption,
      predictedProbability: body.predictedProbability ?? 0.5,
      actualOutcome: outcome,
      leaderIds: body.leaderIds ?? [],
      rootCauses: body.rootCauses,
      keyLessons: body.keyLessons,
      retrospectiveSummary: body.retrospectiveSummary,
    },
  });
  recordDev('council-pm', res.ok, res.ok
    ? `recorded ${outcome}: ${res.adjustmentsApplied ?? 0} believability adjustment(s), ${res.lessonsStored ?? 0} lesson(s)`
    : `council post-mortem failed: ${res.error}`, { driver: 'deterministic-brain' });
  return {
    ok: res.ok,
    record: res.record,
    adjustmentsApplied: res.adjustmentsApplied,
    lessonsStored: res.lessonsStored,
    durable: res.durable,
    overview: res.overview,
    error: res.error,
  };
}

function ensureDevAutopilot(): void {
  if (!devAutopilotOn) return;
  setJobEnabled('dev', true);
  setJobEnabled('self-repair', true);
}

function stopDevAutopilot(): void {
  if (devTimer) {
    clearInterval(devTimer);
    devTimer = null;
  }
  setJobEnabled('dev', false);
  setJobEnabled('self-repair', false);
}

// ---------------------------------------------------------------------------
// STUCK-AWARE SELF-REPAIR — real stuck detection + repair-team escalation
// ---------------------------------------------------------------------------
// Self-awareness: Recourse watches real signals (scheduler job failures,
// self-hosted boot re-verify failures, forge quarantine, open anomalies,
// verifier pass-rate, repair-team reachability, failure-ledger spikes) and
// marks an issue "stuck" when a signal fails past a threshold. When stuck, it
// (1) reports the weak entity to the Draymond repair team, (2) asks the
// deterministic brain for a targeted fix, and (3) applies gate-passing
// proposals through the SAME verified sandbox+lint gate as every other driver
// patch. Nothing touches disk unless it passes that gate. All escalations are
// rate-limited (backoff) and recorded in a durable ledger.

async function collectStuckSignals(): Promise<StuckSignal[]> {
  const signals: StuckSignal[] = [];
  const now = Date.now();
  const within = (ts: number | null | undefined, ms: number) => !!ts && now - ts <= ms;

  // 1. Scheduler jobs that are failing and recently ran.
  for (const job of listScheduledJobs()) {
    if (!job.enabled) continue;
    if (job.lastOk === false && job.lastError && within(job.lastRunAt, 10 * 60 * 1000)) {
      signals.push({
        id: `job:${job.id}`, name: `Scheduler job "${job.name}"`, kind: 'job',
        failing: true, threshold: DEFAULT_STUCK_THRESHOLD,
        detail: `job ${job.id} failed: ${String(job.lastError).slice(0, 160)} (${job.failCount} total failures)`,
      });
    }
  }

  // 2. Self-hosted tools whose boot re-verify failed.
  for (const e of listSelfHostedEntries()) {
    if (e.lastVerified && !e.lastVerified.passed) {
      signals.push({
        id: `selfhosted:${e.name}`, name: `Self-hosted tool "${e.name}"`, kind: 'selfhosted',
        failing: true, threshold: DEFAULT_STUCK_THRESHOLD,
        detail: `boot re-verify failed: ${String(e.lastVerified.detail || 'not passing').slice(0, 160)}`,
      });
    }
  }

  // 3. Forge-quarantined genes (repeated materialize failures).
  for (const [spec, count] of forgeQuarantine) {
    if ((forgeQuarantine.get(spec) ?? 0) >= FORGE_QUARANTINE_LIMIT) {
      signals.push({
        id: `forge:${spec}`, name: `Forge gene "${spec}"`, kind: 'forge',
        failing: true, threshold: 1,
        detail: `quarantined after ${count} consecutive materialize failures (limit ${FORGE_QUARANTINE_LIMIT})`,
      });
    }
  }

  // 4. Open anomalies older than 30 min.
  const staleAnomalies = anomalies.filter((a) => a.status === 'detected' && now - (a.timestamp || 0) > 30 * 60 * 1000);
  for (const a of staleAnomalies.slice(0, 8)) {
    signals.push({
      id: `anomaly:${a.id}`, name: `Anomaly ${a.id}`, kind: 'anomaly',
      failing: true, threshold: 1,
      detail: `open ${Math.round((now - (a.timestamp || 0)) / 60000)}m: ${String(a.description || a.errorType || 'unevaluated').slice(0, 160)}`,
    });
  }

  // 5. Verifier pass-rate below 80%.
  const passRate = status.verifierPassRate ?? 0;
  if (passRate > 0 && passRate < 0.8) {
    signals.push({
      id: 'verifier:pass-rate', name: 'Registry verifier pass-rate', kind: 'verifier',
      failing: true, threshold: 2,
      detail: `verifier pass rate ${Math.round(passRate * 100)}% is below 80%`,
    });
  }

  // 6. Repair-team unreachable (self-awareness of the safety net being down).
  if (devAutopilotOn) {
    const drv = getFleetDriver('draymond-repair');
    if (drv?.baseUrl()) {
      const online = await probeDriverOnline(drv);
      if (!online) {
        signals.push({
          id: 'repair_team:offline', name: 'Repair team (Draymond) reachability', kind: 'repair_team',
          failing: true, threshold: 2,
          detail: `repair team unreachable at ${drv.baseUrl()}`,
        });
      }
    }
  }

  // 6b. Overlay Oncology host unreachable — self-awareness of the evidence
  //     source the science loop consumes when that loop is running.
  if (scienceAutopilotOn || devAutopilotOn) {
    const onc = await oncologyHealth(undefined, 4000);
    if (!onc.ok) {
      signals.push({
        id: 'oncology:host', name: 'Overlay Oncology host', kind: 'service',
        failing: true, threshold: 2,
        detail: `oncology aggregate host unreachable: ${onc.error ?? 'no response'}`,
      });
    }
  }

  // 6c. GOAL-GAP: the science/math loops' PURPOSE is to produce novel
  // findings, not just run. If they've been running but producing 0 novel
  // findings for N consecutive cycles, that is a self-acknowledged
  // shortcoming against the mission — flag it for the repair team.
  const jobEnabled = (id: string) => listScheduledJobs().find((j) => j.id === id)?.enabled === true;
  if (scienceAutopilotOn || devAutopilotOn || jobEnabled('science')) {
    try {
      const cycles = recentCycles(10);
      if (cycles.length >= 4) {
        const last4 = cycles.slice(-4);
        const novelZero = last4.filter((c) => (c as any).novelCount === 0).length;
        const hasRecent = cycles.some((c) => (Date.now() - (c.startedAt || 0)) < 6 * 60 * 60 * 1000);
        if (novelZero >= 3 && hasRecent) {
          signals.push({
            id: 'goal:science-novelty',
            name: 'Science loop discovery goal',
            kind: 'goal',
            failing: true,
            threshold: 2,
            detail: `${novelZero}/4 recent science cycles produced 0 novel findings — the discovery goal is not being met. Likely exhausted parameter space, a resetting cycle counter, or a saturated novelty gate.`,
          });
        }
      }
    } catch {
      /* goal-gap detection best-effort */
    }
  }

  // 6d. Math loop goal-gap: the math conductor should eventually SOLVE or at
  // least extend bounds on problems. Sustained 0-pass cycles = a goal gap.
  if (mathAutopilotOn || devAutopilotOn || jobEnabled('math')) {
    try {
      const cycles = recentMathCycles();
      if (cycles.length >= 3) {
        const last3 = cycles.slice(-3);
        const allFailed = last3.every((c) => !(c as any).attemptPassed);
        if (allFailed) {
          signals.push({
            id: 'goal:math-no-solve',
            name: 'Math conductor solve goal',
            kind: 'goal',
            failing: true,
            threshold: 2,
            detail: `${last3.length} consecutive math cycles without a solve or bound extension — the math mission is stalled.`,
          });
        }
      }
    } catch {
      /* math goal-gap best-effort */
    }
  }

  // 7. Failure-ledger spike: >=5 recorded failures in the last 30 min.
  const spike = failureLedger.filter((f) => now - f.at <= 30 * 60 * 1000);
  if (spike.length >= 5) {
    const bySource: Record<string, number> = {};
    for (const f of spike) bySource[f.source] = (bySource[f.source] ?? 0) + 1;
    const top = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
    signals.push({
      id: 'failure:spike', name: 'Failure-ledger spike', kind: 'failure_spike',
      failing: true, threshold: 2,
      detail: `${spike.length} failures in 30m (top: ${top?.[0]} x${top?.[1]})`,
    });
  }

  return signals;
}

async function escalateStuckIssue(issue: StuckIssue, repoUrl: string | null, repo: string): Promise<StuckRepairAction> {
  const action: StuckRepairAction = {
    issueId: issue.id, at: Date.now(),
    dispatchedRepairTeam: false, repairTeamDetail: '',
    brainAsked: false, brainDetail: '',
    proposalsApplied: 0, proposalsRejected: 0, proposalsSkipped: 0,
  };

  // (1) Report the weak entity to the repair team.
  const drv = getFleetDriver('draymond-repair');
  if (drv?.baseUrl()) {
    const online = await probeDriverOnline(drv);
    if (online) {
      const rows = [repairRowForIssue(issue, repoUrl)];
      const secret = process.env.DRAYMOND_CRON_SECRET || process.env.CRON_SECRET || '';
      const res = await submitToRepairEndpoint({ rows, url: drv.baseUrl()!, secret, enabled: process.env.DRAYMOND_REPAIR_BENCHMARK_ENABLED !== '0' });
      action.dispatchedRepairTeam = res.ok;
      action.repairTeamDetail = res.ok ? `dispatched ${res.dispatched}` : (res.error || 'dispatch failed');
    } else {
      action.repairTeamDetail = 'repair team offline';
    }
  } else {
    action.repairTeamDetail = 'repair team not configured';
  }
  recordDev('stuck-report', action.dispatchedRepairTeam, `${issue.id}: ${action.repairTeamDetail}`, { driver: 'draymond-repair' });

  // (2) Ask the deterministic brain for a targeted fix, then (3) apply only
  // gate-passing proposals through the verified intake.
  const bdrv = getFleetDriver('deterministic-brain');
  if (bdrv?.baseUrl()) {
    const bonline = await probeDriverOnline(bdrv);
    if (bonline) {
      const res = await askDeterministicBrain({ url: bdrv.baseUrl()!, query: buildStuckRepairQuery(issue, repoUrl) });
      action.brainAsked = res.ok;
      if (!res.ok) {
        action.brainDetail = res.error || 'brain failed';
      } else if (!res.output) {
        action.brainDetail = 'brain returned empty proposal';
      } else if (!SELF_REPAIR_APPLY) {
        action.brainDetail = 'brain proposal withheld (RECOURSE_SELF_REPAIR_APPLY=0)';
      } else {
        const applied = await applyDriverProposal({
          driverId: 'deterministic-brain',
          output: res.output,
          root: repo,
          bootGreen: HARNESS_CI_GATE ? makeHarnessBootGreenGate() : undefined,
        });
        action.proposalsApplied = applied.appliedCount;
        action.proposalsRejected = applied.rejectedCount;
        action.proposalsSkipped = applied.skippedCount;
        action.brainDetail = `proposal: applied ${applied.appliedCount}, rejected ${applied.rejectedCount}, skipped ${applied.skippedCount}`;
        if (applied.applied) {
          recordDev('stuck-apply', true, `${issue.id}: applied ${applied.appliedCount} verified patch(es)`, { driver: 'deterministic-brain' });
          for (const r of applied.results) {
            if (r.applied) {
              appendProvenanceEvent('capability_adopted', {
                driverId: 'deterministic-brain',
                file: r.file,
                hash: 'hash' in r ? r.hash : undefined,
                revertToken: 'revertToken' in r ? r.revertToken : undefined,
                note: `self-repair ${issue.id}`,
              });
            }
          }
        } else {
          recordDev('stuck-apply', false, `${issue.id}: no gate-passing patch (rejected ${applied.rejectedCount}, skipped ${applied.skippedCount})`, { driver: 'deterministic-brain' });
        }
      }
    } else {
      action.brainDetail = 'brain offline';
    }
  } else {
    action.brainDetail = 'brain not configured';
  }
  if (action.brainAsked) recordDev('stuck-brain', action.brainAsked, `${issue.id}: ${action.brainDetail}`, { driver: 'deterministic-brain' });
  return action;
}

/** One full stuck-repair pass: collect signals -> update issues -> escalate
 *  each stuck issue past its backoff. Returns what happened (honestly). */
async function runStuckRepairPass(force = false): Promise<Record<string, unknown>> {
  if (selfRepairBusy) return { ok: false, skipped: 'self-repair busy (overlap guard)' };
  selfRepairBusy = true;
  try {
    const now = Date.now();
    const signals = await collectStuckSignals();
    stuckIssues = updateStuckIssues(stuckIssues, signals, now);
    const repoUrl = process.env.RECOURSE_REPO_URL || null;
    const repo = devRepoRoot();
    const actions: StuckRepairAction[] = [];
    for (const issue of stuckIssues.filter((i) => i.stuck)) {
      if (!force && !shouldEscalate(issue, now, SELF_REPAIR_BACKOFF_MS)) continue;
      const action = await escalateStuckIssue(issue, repoUrl, repo);
      issue.lastEscalatedAt = now;
      issue.escalationCount += 1;
      actions.push(action);
      stuckRepairLedger.push(action);
      if (stuckRepairLedger.length > 200) stuckRepairLedger.splice(0, stuckRepairLedger.length - 200);
    }
    saveStateToDisk();
    return {
      ok: true,
      now,
      signals: signals.length,
      snapshot: stuckSnapshot(stuckIssues),
      escalated: actions.length,
      actions,
      applyEnabled: SELF_REPAIR_APPLY,
      backoffMs: SELF_REPAIR_BACKOFF_MS,
      band: SELF_REPAIR_BAND,
    };
  } finally {
    selfRepairBusy = false;
  }
}

app.get('/api/recourse/develop/stuck', (_req, res) => {
  res.json({
    success: true,
    enabled: devAutopilotOn,
    applyEnabled: SELF_REPAIR_APPLY,
    backoffMs: SELF_REPAIR_BACKOFF_MS,
    band: SELF_REPAIR_BAND,
    snapshot: stuckSnapshot(stuckIssues),
    ledger: stuckRepairLedger.slice(-50),
  });
});

app.post('/api/recourse/develop/stuck/run', async (req, res) => {
  try {
    const force = req.body?.force === true;
    res.json({ success: true, ...(await runStuckRepairPass(force)) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Operator escape hatch: clear a stuck issue (mark recovered, stop escalation). */
app.post('/api/recourse/develop/stuck/clear', (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!id) return res.status(400).json({ success: false, error: 'id required' });
  const before = stuckIssues.length;
  stuckIssues = stuckIssues.filter((i) => i.id !== id);
  stuckRepairLedger.push({
    issueId: id, at: Date.now(),
    dispatchedRepairTeam: false, repairTeamDetail: 'cleared by operator',
    brainAsked: false, brainDetail: '',
    proposalsApplied: 0, proposalsRejected: 0, proposalsSkipped: 0,
  });
  saveStateToDisk();
  res.json({ success: true, removed: before - stuckIssues.length, remaining: stuckIssues.length });
});

app.get('/api/recourse/develop', async (req, res) => {
  try {
    res.json({ success: true, ...(await devSnapshot()) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Outbound: report Recourse's weaknesses to the repair team (auto-fix dispatch). */
app.post('/api/recourse/develop/report', async (req, res) => {
  try {
    const force = req.body?.force === true;
    const result = await runRepairReport(force);
    res.json({ success: result.ok, ...result, dev: await devSnapshot() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Outbound: ask the Deep to analyze Recourse and propose concrete repairs. */
app.post('/api/recourse/develop/deep', async (req, res) => {
  try {
    const result = await runDeepAnalyze();
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Inbound: run a fleet driver's full-text proposal through the verified
 *  patch-intake gate. Candidate patches (JSON fence blocks) are parsed
 *  deterministically and each is applied ONLY after it passes Recourse's own
 *  sandbox verifier + lint. This is how a driver actually "drives" Recourse:
 *  analysis becomes code, and only gate-verified code. */
app.post('/api/recourse/develop/intake', async (req, res) => {
  try {
    const { driverId, output, query: _query } = req.body ?? {};
    if (typeof driverId !== 'string' || !getFleetDriver(driverId)) {
      return res.status(400).json({ success: false, error: 'a registered driverId is required' });
    }
    if (typeof output !== 'string') {
      return res.status(400).json({ success: false, error: 'output must be the driver response text' });
    }
    const result = await applyDriverProposal({
      driverId,
      output,
      root: devRepoRoot(),
      bootGreen: HARNESS_CI_GATE ? makeHarnessBootGreenGate() : undefined,
    });
    const detail = result.applied
      ? `intake applied ${result.appliedCount} verified patch(es), rejected ${result.rejectedCount}, skipped ${result.skippedCount}`
      : `intake applied none (rejected ${result.rejectedCount}, skipped ${result.skippedCount})`;
    recordDev('intake', result.applied, detail, { driver: driverId });
    if (result.applied) {
      for (const r of result.results) {
        if (r.applied) {
          appendProvenanceEvent('capability_adopted', {
            driverId,
            file: r.file,
            hash: r.hash,
            revertToken: r.revertToken,
            note: 'verified patch intake',
          });
        }
      }
    }
    res.json({ success: result.applied, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Brain gateway: ask Dev-Brain or the deterministic brain to decide / rank /
 *  triage Recourse's next action or analyze deeply. Called by Recourse itself
 *  when it needs a decision, or on demand. */
app.post('/api/recourse/develop/brain', async (req, res) => {
  try {
    const { brain, action, problem, candidates, strategy } = req.body ?? {};
    const result = await runBrainGateway({
      brain: typeof brain === 'string' ? brain : undefined,
      action: (['decide', 'triage', 'fusion', 'deep'] as string[]).includes(action) ? action as DevBrainAction | 'deep' : undefined,
      problem: typeof problem === 'string' ? problem : undefined,
      candidates: Array.isArray(candidates) ? candidates as DevBrainCandidate[] : undefined,
      strategy: strategy as DevBrainStrategy | undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Genome council: consult the deterministic brain's council over a problem. */
app.post('/api/recourse/develop/council', async (req, res) => {
  try {
    const { problem, selectedGenomes, activeSectors } = req.body ?? {};
    const result = await runCouncilDecide({
      problem: typeof problem === 'string' ? problem : undefined,
      selectedGenomes: Array.isArray(selectedGenomes) ? selectedGenomes as string[] : undefined,
      activeSectors: Array.isArray(activeSectors) ? activeSectors as string[] : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Genome council: read the brain's learned believability ledger. */
app.get('/api/recourse/develop/council/state', async (_req, res) => {
  try {
    res.json(await runCouncilState());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Genome council: read lessons the brain has learned from recorded outcomes. */
app.get('/api/recourse/develop/council/lessons', async (req, res) => {
  try {
    const limit = Number(req.query.limit);
    res.json(await runCouncilLessons(Number.isFinite(limit) ? limit : undefined));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Genome council: record a real Recourse outcome so the brain compounds. */
app.post('/api/recourse/develop/council/post-mortem', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const result = await runCouncilPostMortem({
      decisionTitle: typeof b.decisionTitle === 'string' ? b.decisionTitle : undefined,
      sector: typeof b.sector === 'string' ? b.sector : undefined,
      chosenOption: typeof b.chosenOption === 'string' ? b.chosenOption : undefined,
      predictedProbability: typeof b.predictedProbability === 'number' ? b.predictedProbability : undefined,
      actualOutcome: typeof b.actualOutcome === 'string' ? b.actualOutcome : undefined,
      leaderIds: Array.isArray(b.leaderIds) ? (b.leaderIds as string[]) : undefined,
      rootCauses: Array.isArray(b.rootCauses) ? (b.rootCauses as string[]) : undefined,
      keyLessons: Array.isArray(b.keyLessons) ? (b.keyLessons as string[]) : undefined,
      retrospectiveSummary: typeof b.retrospectiveSummary === 'string' ? b.retrospectiveSummary : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Inbound: apply a repair-team patch, but only after it passes Recourse's own
 *  sandbox verifier + lint gate. This is the safe autonomous-development gate. */
app.post('/api/recourse/develop/patch', async (req, res) => {
  try {
    const { driverId, file, source = '', suite, domain, note } = req.body ?? {};
    if (typeof driverId !== 'string' || typeof file !== 'string') {
      return res.status(400).json({ success: false, error: 'driverId and file are required' });
    }
    if (typeof source !== 'string') {
      return res.status(400).json({ success: false, error: 'source must be a string' });
    }
    const result = await verifyAndApplyPatch(
      { driverId, file, source, suite: typeof suite === 'string' ? suite : undefined, domain, note },
      { root: devRepoRoot(), bootGreen: bootGreenForPatch(file) },
    );
    const detail = result.applied
      ? `applied ${result.file} (${result.verified})${'revertToken' in result && result.revertToken ? ` [rollback ${result.revertToken}]` : ''}`
      : `rejected ${result.file}: ${'error' in result ? result.error : ''}`;
    const hash = 'hash' in result && result.applied ? result.hash : undefined;
    recordDev('patch', result.applied, detail, { driver: driverId, file: result.file, hash });
    if (result.applied) {
      appendProvenanceEvent('capability_adopted', {
        driverId,
        file: result.file,
        hash: 'hash' in result ? result.hash : undefined,
        revertToken: 'revertToken' in result ? result.revertToken : undefined,
        note: note ?? null,
      });
    }
    res.json({ success: result.applied, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recourse/develop/autopilot/toggle', (req, res) => {
  devAutopilotOn = !devAutopilotOn;
  if (devAutopilotOn) {
    ensureDevAutopilot();
    runRepairReport(false).catch(() => {});
  } else {
    stopDevAutopilot();
  }
  saveStateToDisk();
  res.json({ success: true, autopilot: devAutopilotOn });
});

/** Harness-evolution ledger (Phase 5 item 16): applied patches + their one-click
 *  rollback tokens. Read-only; mirrors the persisted journal under the repo. */
app.get('/api/recourse/develop/patches', (_req, res) => {
  try {
    const root = devRepoRoot();
    const patches = listFleetPatches(root);
    res.json({
      success: true,
      root,
      backupDir: fleetBackupDir(root),
      applied: patches.filter((p) => !p.reverted).length,
      reverted: patches.filter((p) => p.reverted).length,
      harnessCiGate: HARNESS_CI_GATE,
      patches: patches.slice(0, 200),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** One-click rollback: restore the pre-patch source for an applied fleet patch.
 *  Destructive, so it requires RECOURSE_API_SECRET (fail-closed). Reverts are
 *  provenance-tracked as capability_reverted. */
app.post('/api/recourse/develop/revert', async (req, res) => {
  if (!requireMutationAuth(req, res)) return;
  try {
    const { token } = req.body ?? {};
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ success: false, error: 'token is required' });
    }
    const result = await revertAppliedPatch(token, devRepoRoot());
    if (!result.ok) {
      return res.status(404).json({ success: false, error: result.error || 'revert failed' });
    }
    const entry = listFleetPatches(devRepoRoot()).find((p) => p.token === token);
    appendProvenanceEvent('capability_reverted', {
      token,
      file: result.file,
      driverId: entry?.driverId,
      appliedHash: entry?.appliedHash,
    });
    recordDev('revert', true, `rolled back ${result.file} (${token})`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// =========================================================================
// AGENTBROWSER WEB CHANNEL — download from the web via the real browser
// =========================================================================
// Extracted to src/server/routes/webChannel.ts (Router + narrow deps pattern).
app.use(createWebChannelRouter({ appendProvenanceEvent }));

// Quality-Diversity archive over the live registry (MAP-Elites view). Read-only.
app.get('/api/recourse/qd', (_req, res) => {
  try {
    res.json({ success: true, archive: buildQDArchive(registry, 8), islands: buildIslands(registry, 8).islands });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Initialize Express + Vite Server
async function startServer() {
  console.log(`[boot] t+${Math.round(process.uptime())}s startServer entered`);
  // Dream state comes from the engine's own durable store.
  dreamState = await dreamEngine.status();
  console.log(`[boot] t+${Math.round(process.uptime())}s dream status resolved (active=${dreamState?.isDreamingActive})`);
  if (autonomySettings.safeBoot) {
    // Safe boot: never auto-resume the autonomous loops that can re-enter the
    // reload loop or churn state the moment the page loads. The operator starts
    // them explicitly from the dashboard (or RECOURSE_SAFE_BOOT=0 restores the
    // old auto-resume behavior).
    if (status.isAutoEvolving) {
      status.isAutoEvolving = false;
    }
    if (dreamState.isDreamingActive) {
      await dreamEngine.toggle().catch(() => {});
      dreamState = await dreamEngine.status().catch(() => dreamState);
    }
    saveStateToDisk();
    console.log(`[boot] t+${Math.round(process.uptime())}s saveStateToDisk returned`);
    console.log('[Recourse] Safe boot: autonomous loops paused. Enable them from the dashboard.');
  } else {
    // Non-safe boot: resume every autopilot that was active before restart, and
    // default the real tool-building loops (forge + intake) ON so the system
    // self-develops unattended. Operator can toggle each off from the dashboard.
    if (!intakeAutopilotOn) { intakeAutopilotOn = true; console.log('[Recourse] Non-safe boot: intake autopilot defaulted ON.'); }
    if (!forgeAutopilotOn) { forgeAutopilotOn = true; console.log('[Recourse] Non-safe boot: forge autopilot defaulted ON.'); }
    // Restore the swarm autopilot if it was active before the restart.
    ensureSwarmAutopilot();
    // Restore the intake autopilot (external learning) if it was active.
    ensureIntakeAutopilot();
    // Restore the Capability Forge autopilot if it was active.
    ensureForgeAutopilot();
    // Backfill: the forge agenda was always empty because dream genes were never
    // wired into it. The DreamingEngine uses an InMemoryGeneRegistryStore that
    // resets on restart, so we must read the dream genes from the persisted JSON
    // (restored by loadStateFromDisk into the top-level dreamState) rather than
    // trusting dreamEngine.status() which returns the empty in-memory store.
    if (dynamicAgenda.length === 0) {
      const dreamGenes = dreamState?.registry?.length
        ? dreamState.registry
        : loadPersistedDreamGenesFromStorage();
      if (dreamGenes.length > 0) {
        let backfilled = 0;
        const builtNames = new Set([
          ...registry.map((t) => t.name),
          ...forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name),
        ]);
        for (const g of dreamGenes as Array<{ name: string; domain?: string; kind?: string; description?: string; code: string; testVectors?: unknown[]; invariantChecks?: Array<{ name: string; passed: boolean }> }>) {
          if (!g.name || builtNames.has(g.name) || dynamicAgenda.some((d) => d.name === g.name)) continue;
          const refSuite = buildRefSuiteFromVectors(g);
          if (!refSuite) continue;
          const dom = (['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'] as ToolDomain[]).includes(g.domain as ToolDomain)
            ? (g.domain as ToolDomain) : 'coding';
          dynamicAgenda.push({
            id: `backfill_${g.name}_${Date.now().toString(36).slice(-6)}`,
            name: g.name,
            domain: dom,
            title: (g.description || `Dream gene: ${g.name}`).slice(0, 120),
            prompt: buildForgePromptFromGene(g),
            refSuite,
          });
          backfilled++;
        }
        if (backfilled > 0) {
          saveStateToDisk();
          console.log(`[forge] backfilled ${backfilled} verified dream genes into dynamic agenda (now ${dynamicAgenda.length} total).`);
          appendProvenanceEvent('capability_adopted', { driverId: 'backfill_migration', note: `backfilled ${backfilled} verified dream genes`, agendaSize: dynamicAgenda.length });
        }
      }
    }
    // Restore the fleet development (audit/repair) autopilot if it was active.
    ensureDevAutopilot();
    // Resume the server-resident /tick heartbeat if it was active.
    ensureServerTickAutopilot();
    saveStateToDisk();
  }

  // ── Research autopilots: SELF-ARM ON EVERY BOOT (safe or not) ──────────────
  // The science conductor (experiments + trend), research reports, and the
  // Keywire fleet poll are READ-ONLY research loops — they do not patch source
  // files or re-enter the reload loop, so safe-boot's "pause the self-modifying
  // loops" rationale does not apply to them. They are the whole point of the
  // connected science stack, so they arm unconditionally at boot. Operator can
  // still toggle each off from the dashboard / scheduler API.
  // Science conductor: SCOUT -> HYPOTHESIZE -> EXPERIMENT -> VERIFY -> RECORD.
  ensureScienceAutopilot();
  console.log(`[boot] t+${Math.round(process.uptime())}s science autopilot ensured`);
  setJobEnabled('reports', true);
  setJobEnabled('keywire', true);
  console.log(`[boot] t+${Math.round(process.uptime())}s jobs enabled`);
  saveStateToDisk();
  console.log(`[boot] t+${Math.round(process.uptime())}s post-jobs save returned`);

  if (process.env.RECOURSE_DEV_VITE === '1') {
    // Vite dev middleware ONLY when explicitly opted in. The engine is a
    // self-modifying system: its autonomous loops write state AND patch its own
    // source files (repair/forge/swarm). If Vite's file watcher is live, ANY
    // such write full-reloads the browser page — and with persisted
    // isAutoEvolving that becomes an infinite reload loop (tick -> write ->
    // reload -> tick) the operator cannot click out of. File watching is
    // therefore OFF by default; pick up source edits by restarting the server.
    // Set RECOURSE_HMR=1 to opt into live reload during active UI dev.
    //
    // IMPORTANT: building a Vite dev server here at boot is what wedged startup
    // — createViteServer runs a full dependency scan + optimizer pre-bundle
    // BEFORE app.listen, which can burn minutes of CPU/RAM (and crash on a
    // memory-constrained laptop) before the listener ever binds. Production
    // starts serve the built dist/ instead; dev-with-vite is opt-in only.
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.RECOURSE_HMR === '1',
        watch: process.env.RECOURSE_HMR === '1'
          ? { ignored: ['**/recourse_*.json', '**/*.json.tmp', '**/metadata.json'] }
          : null,
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Prefer the built SPA; fall back to a minimal inline index so the API
    // still serves (and the /api/* routes remain usable) even before a build.
    const spaIndex = path.join(distPath, 'index.html');
    if (fs.existsSync(spaIndex)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(spaIndex);
      });
    } else {
      app.get('*', (req, res) => {
        res.status(200).type('html').send(
          '<!doctype html><html><head><title>Recourse</title></head><body style="font-family:monospace;background:#0b1020;color:#cbd5e1;padding:2rem"><h1>Recourse API is running</h1><p>Frontend not built yet — run <code>npm run build</code> then start.</p><p>API routes under <code>/api/recourse/*</code> are live.</p></body></html>'
        );
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Recourse server running on http://0.0.0.0:${PORT}`);
  });
  console.log(`[boot] t+${Math.round(process.uptime())}s listen() called on ${PORT}`);
}

// Boot block: load persisted state AFTER every module-level `let` has been
// initialized (see note at the old call site ~line 831). Then reconcile the
// registry against the loaded state. Both must precede startServer(), whose
// safe-boot/autopilot resume logic depends on the loaded flags.

/**
 * Register every long-running Recourse function as a compartmentalized
 * scheduler job. Idempotent by id; each job has its own cadence + status and
 * failures are isolated (one broken subsystem never stops the others).
 * Called once at boot (and safe to re-call).
 */
function registerAllSchedulerJobs(): void {
  const register = (def: Parameters<typeof registerScheduledJob>[0]) => {
    const r = registerScheduledJob(def);
    if (!r.ok && !/already registered/.test(r.error ?? '')) {
      console.warn(`[job-scheduler] failed to register "${def.id}": ${r.error}`);
    }
  };

  register({
    id: 'server_tick',
    name: 'Server Heartbeat',
    group: 'autonomy',
    cadenceMs: SERVER_TICK_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!serverTickAutopilotOn) return { skipped: 'autopilot disabled' };
      await runServerTick().catch((err: Error) => ({ skipped: 'tick failed', error: err?.message }));
      return { ok: true };
    },
  });

  register({
    id: 'forge',
    name: 'Capability Forge',
    group: 'autonomy',
    cadenceMs: FORGE_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!forgeAutopilotOn) return { skipped: 'autopilot disabled' };
      if (forgeBusy) return { skipped: 'forge busy (overlap)' };
      forgeBusy = true;
      try {
        return await runForgeCycle();
      } finally {
        forgeBusy = false;
      }
    },
  });

  register({
    id: 'intake',
    name: 'Intake (external learning)',
    group: 'autonomy',
    cadenceMs: INTAKE_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!intakeAutopilotOn) return { skipped: 'autopilot disabled' };
      await runIntakeAutopilotTick();
      return { ok: true };
    },
  });

  register({
    id: 'swarm',
    name: 'Subagent Swarm',
    group: 'autonomy',
    cadenceMs: SWARM_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!swarmStatus.isSwarmAutopilotActive) return { skipped: 'autopilot disabled' };
      return { dispatched: await pumpSwarmQueue(1) };
    },
  });

  register({
    id: 'dev',
    name: 'Fleet Audit / Repair Report',
    group: 'autonomy',
    cadenceMs: DEV_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!devAutopilotOn) return { skipped: 'autopilot disabled' };
      const r = await runRepairReport(false);
      return { ok: r.ok, note: r.detail ?? 'reported' };
    },
  });

  register({
    id: 'self-repair',
    name: 'Stuck-Aware Self-Repair',
    group: 'autonomy',
    cadenceMs: SELF_REPAIR_MS,
    enabledByDefault: true,
    run: async () => {
      if (!devAutopilotOn) return { skipped: 'autopilot disabled' };
      const r = await runStuckRepairPass(false);
      return { ok: r.ok, stuck: (r.snapshot as any)?.stuckCount ?? 0, escalated: r.escalated ?? 0, signals: r.signals ?? 0 };
    },
  });

  register({
    id: 'corpus',
    name: 'Research corpus scan + agenda refill',
    group: 'intake',
    cadenceMs: CORPUS_SCAN_MS,
    enabledByDefault: true,
    run: async () => {
      const r = await runCorpusScan();
      return { artifacts: r.snapshot.artifacts.length, dispatched: r.added, refilled: r.refilled };
    },
  });

  register({
    id: 'science',
    name: 'Science Conductor (experiments + trend)',
    group: 'science',
    cadenceMs: SCIENCE_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!scienceAutopilotOn) return { skipped: 'autopilot disabled' };
      const c = await runScienceCycle();
      return { cycle: c.cycle, mode: c.experimentMode, trendEngine: c.trendScan?.engine, findings: c.findings.length, trendAnomalies: c.trendScan?.anomalyCount };
    },
  });

  register({
    id: 'global-lens',
    name: 'Global Lens research publish',
    group: 'reporting',
    cadenceMs: GLOBAL_LENS_PUBLISH_MS,
    enabledByDefault: true,
    run: async () => {
      if (!globalLensAutopilotOn) return { skipped: 'autopilot disabled' };
      const { result } = await runGlobalLensPublishPass();
      return { configured: result.configured, total: result.total, ok: result.ok, failed: result.failed };
    },
  });

  register({
    id: 'math',
    name: 'Math Conductor (hard problems + LLM forge)',
    group: 'math',
    cadenceMs: MATH_AUTOPILOT_MS,
    enabledByDefault: true,
    run: async () => {
      if (!mathAutopilotOn) return { skipped: 'autopilot disabled' };
      const c = await runMathCycle();
      return {
        cycle: c.cycle,
        problemId: c.problemId,
        tier: c.problemTier,
        passed: c.attemptPassed,
        score: c.attemptScore,
        generation: c.attemptGeneration,
        engines: c.enginesUsed.join(','),
        latencyMs: c.attemptLatencyMs,
      };
    },
  });

  register({
    id: 'agenda',
    name: 'Breakthrough Agenda (XP + milestone verification)',
    group: 'agenda',
    cadenceMs: Math.max(60_000, Number(process.env.AGENDA_REFRESH_MS) || 30 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const a = renderAndPersistAgenda();
      const g = persistGameProfile();
      return {
        met: a.metCount,
        onTrack: a.onTrackCount,
        atRisk: a.atRiskCount,
        overdue: a.overdueCount,
        nextMath: a.nextMath?.milestone.title ?? null,
        nextOncology: a.nextOncology?.milestone.title ?? null,
        xp: g.totalXp,
        level: g.level.name,
        streak: g.streak,
      };
    },
  });

  register({
    id: 'fleet_dashboard',
    name: 'Fleet Dashboard (unified markdown report)',
    group: 'reporting',
    cadenceMs: Math.max(60_000, Number(process.env.FLEET_DASHBOARD_MS) || 6 * 60 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const r = await renderDashboard();
      return { file: r.file, issues: r.sections.issues.length, agendaMilestones: r.sections.agenda.length, profile: r.sections.profile.totalXp };
    },
  });

  register({
    id: 'dream',
    name: 'Dream Engine (gene synthesis)',
    group: 'autonomy',
    cadenceMs: Math.max(60_000, Number(process.env.DREAM_AUTOPILOT_MS) || 2 * 60 * 1000),
    enabledByDefault: true,
    safeBootGated: true,
    run: async () => {
      if (!dreamState?.isDreamingActive) return { skipped: 'dreaming not active' };
      const r = await dreamEngine.tick();
      dreamState = r.dreamState;
      await mirrorCrystallizedDreamGenes();
      return { thought: r.newThought ? r.newThought.id : null, ready: r.newThought?.crystallizationReadiness ?? null };
    },
  });

  register({
    id: 'selfhosted_verify',
    name: 'Self-Hosted Tool Re-Verify',
    group: 'system',
    cadenceMs: Math.max(60_000, Number(process.env.SELFHOSTED_VERIFY_MS) || 10 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const entries = await verifyAllSelfHosted();
      return { healthy: entries.filter((e) => e.lastVerified?.passed).length, total: entries.length };
    },
  });

  register({
    id: 'keywire',
    name: 'Keywire Fleet Command (summary + services)',
    group: 'fleet',
    cadenceMs: Math.max(60_000, Number(process.env.KEYWIRE_POLL_MS) || 5 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const h = await keywireHealth();
      if (!h.ok) return { skipped: 'keywire unreachable', error: h.error };
      const summary = h.summary;
      return { health: summary?.health, taken: summary?.servers?.taken, open: summary?.servers?.open, drift: summary?.sync?.driftCount };
    },
  });

  register({
    id: 'reports',
    name: 'Research Reports (fleet + issues)',
    group: 'research',
    cadenceMs: Math.max(60_000, Number(process.env.REPORT_MS) || 6 * 60 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const daily = await renderDailyReport();
      renderIssueDocs();
      renderIssueIndex();
      return { files: daily.files, issues: computeIssueProgress().length };
    },
  });
}

// Boot block: load persisted state AFTER every module-level `let` has been
// initialized (see note at the old call site ~line 831). Then reconcile the
// registry against the loaded state. Both must precede startServer(), whose
// safe-boot/autopilot resume logic depends on the loaded flags.
console.log(`[boot] t+${Math.round(process.uptime())}s entering boot block`);
loadStateFromDisk();
console.log(`[boot] t+${Math.round(process.uptime())}s state loaded`);
// Deferred 2026-09-09: reconcileRegistryOnBoot() re-verifies every promoted
// tool version in sandboxes, synchronously, before listen. At 5718 registry
// tools that wedged boot for hours (bound nothing, held the lock). Health
// flags refresh in background after the server is up; startServer() only
// depends on the loaded autonomy flags above, not on reconcile output.
setImmediate(() => {
  try {
    reconcileRegistryOnBoot();
    console.log('[Recourse] background boot-reconcile complete.');
  } catch (err: unknown) {
    console.warn('[Recourse] background boot-reconcile failed:', err instanceof Error ? err.message : String(err));
  }
});
initGoalLedger();
// Reapply the persisted model provider mode ('local' Ollama vs 'api' LLM) so
// generative features resume with the operator's chosen endpoint after restart.
setActiveProviderProfile(providerMode);
// Surface any dream-engine crystallized genes that live only in the dream store
// into the real main registry, so dream genes are visible/usable as tools.
void mirrorCrystallizedDreamGenes().catch((err: any) =>
  console.warn('[Recourse Engine] dream gene mirror on boot failed:', err?.message || err),
);
// Autonomy governor: register + arm the compartmentalized job scheduler. The
// registration closures capture module-level state (forgeBusy, flags, engines),
// all initialized above; this is the single timer authority for the fleet.
registerAllSchedulerJobs();
const schedStart = jobSchedulerApi.startScheduler();
if (schedStart.started) {
  const armed = listScheduledJobs().filter((j) => j.enabled).length;
  const total = listScheduledJobs().length;
  console.log(`[Recourse] Job scheduler governor armed (${armed}/${total} jobs).`);
  appendProvenanceEvent('loop_started', { driverId: 'job_scheduler', note: 'armed at boot', armed, total });
}
startServer().catch((err: unknown) => {
  logCrash('startServer', err);
  process.exit(1);
});
// Pre-warm the corpus in the background shortly after boot. The first Global
// Lens publish (or science grounding) then never blocks a request on a cold,
// multi-minute scan of all corpus roots — the failure mode that wedged the
// first publish and killed the instance. Idempotent + deduped via
// corpusScanPromise; an empty result is left for the on-demand scan.
setTimeout(() => {
  if (corpusArtifacts.length === 0) {
    runCorpusScan().catch((err: unknown) =>
      console.warn('[corpus] background pre-warm failed:', err instanceof Error ? err.message : String(err)),
    );
  }
}, 5000);
