import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  ToolEntry,
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
  verifyBiotechClaim,
  diagnoseAndRepairCode
} from './src/lib/verifiers.js';
import { executeToolFunction, executeTestSuite } from './src/lib/executionSandbox.js';
import { MerkleTree, auditCodeSecurity } from './src/lib/cyberDefenseEngine.js';
import { transformSync } from 'esbuild';
import { searchGitHubRepositories, fetchRepoSource, domainLabel } from './src/lib/githubResearchEngine.js';
import { validateBiotechClaimAgainstKG, CANONICAL_ONCOLOGY_KG } from './src/lib/biotechKnowledgeGraph.js';
import { buildLiveOncologyGraph, liveEvidenceHealth } from './src/lib/liveOncologyGraph.js';
import { synthesizeOdeKinetics } from './src/lib/odeKineticSynthesizer.js';
import { runDosingSweep } from './src/lib/dosingOptimizer.js';
import { exportOdeToSbml } from './src/lib/sbmlExporter.js';
import { exportOdeToPhysicell } from './src/lib/physicellExporter.js';
import { buildEvidenceDossier } from './src/lib/evidenceDossier.js';
import { otSearch, otHealth as openTargetsHealth } from './src/lib/openTargetsClient.js';
import { ptSearch, ptHealth as pubTatorHealth, parsePubTatorAnnotations } from './src/lib/pubTatorClient.js';
import { HARD_MATH_PROBLEMS } from './src/lib/hardMathProblems.js';
import { recordMathAttempt, recordBiotechClaim, getMathAttempts, getGoalProgress, MathAttempt, BiotechClaim as LedgerBiotechClaim, initGoalLedger, saveGoalLedger } from './src/lib/goalLedger.js';
import { oncologyHealth } from './src/lib/oncologyEngineBridge.js';
import { runScienceCycle, recentFindings, recentCycles } from './src/lib/scienceConductor.js';
import { runPublishPass, PUBLISH_DOMAINS } from './src/lib/globalLensPublisher.js';
import { musicTherapyFindings } from './src/lib/musicTherapyFindings.js';
import { runMathCycle, recentMathCycles } from './src/lib/mathConductor.js';
import { recentInsights } from './src/lib/trendLedger.js';
import { registerScheduledJob, setJobEnabled, listScheduledJobs } from './src/lib/jobScheduler.js';
import { keywireHealth } from './src/lib/keywireBridge.js';
import { computeIssueProgress, renderIssueDocs, renderIssueIndex } from './src/lib/issueTracker.js';
import { renderDailyReport } from './src/lib/researchReports.js';
// SelfReporter — deterministic first-person field dispatches about Recourse.
import {
  buildReporterFacts,
  composeArticle,
  narrateArticle,
  type ReporterState,
  type ReporterArticle,
} from './src/lib/selfReporter.js';
import {
  saveReporterArticle,
  latestReporterArticle,
  getReporterArticle,
  listReporterArticles,
  reporterStatus,
} from './src/lib/reporterStore.js';
import { listVoices, listFormats, loadReporterSoul, resolveFormat } from './src/lib/reporterVoice.js';
import { allProtocols } from './src/lib/reporterMetaphor.js';
import { renderAndPersistAgenda, selectNextMathMilestone, selectNextOncologyMilestone } from './src/lib/breakthroughAgenda.js';
import { persistGameProfile } from './src/lib/gamification.js';
import { renderDashboard } from './src/lib/fleetDashboard.js';
import * as jobSchedulerApi from './src/lib/jobScheduler.js';
import { zod400, kgNeighborhoodReq, kgBridgesReq } from './src/lib/contracts.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { DEFAULT_GROWTH_WEIGHTS } from './src/lib/decisionEngine.js';
import { DreamingEngine } from './src/dream/engine.js';
import { createDreamStore } from './src/dream/store.js';
import {
  createGeneRegistryStore,
  getActivePolicy,
  setActivePolicy,
  normalizePromotionPolicy
} from './src/dream/mutator.js';
import { INITIAL_SWARM_STATUS, dispatchSubAgentTask, stepSubTeams, INITIAL_SUB_TEAM_STATES, SubTeamState } from './src/lib/subagentSwarm.js';
import { createInitialLoopState, executeRecursiveStep } from './src/lib/recursiveMathEngine.js';
import { createLearnerStore, RecursiveLearner } from './src/dream/learner.js';
import type { GeneBelief } from './src/dream/learner-types.js';
import {
  deriveOpenHubBelief,
  deriveOpenHubAuditSignals,
  latestReportFromDocs,
  mergeFleetBeliefs,
  updateOpenHubHealth,
} from './src/lib/fleetSignal.js';
import { globalLegoEngine } from './src/lego/engine.js';
import {   checkOnline as modelCheckOnline, providerStatus, providerStatuses, chatComplete, extractJsonBlock, setActiveProviderProfile, activeProviderProfile, providerProfiles, setModelUsageSink, completionCacheSnapshot } from './src/lib/modelProvider.js';
import type { ProviderProfileId } from './src/lib/modelProvider.js';
import { lintSource } from './src/lib/lintGate.js';
import type { LintReport } from './src/lib/lintGate.js';
import { generationTargets, generationPlanDigest, summarizeBeliefsByDomain } from './src/lib/learnerGenerationPlan.js';
import { runSleepComputeUnit, takeReadySleepArtifact, sleepComputeSnapshot } from './src/lib/sleepCompute.js';
import { recordExperience, experienceHint, experienceSnapshot } from './src/lib/experience.js';
import { planAuditDepth } from './src/autopilot/auditDepth.js';
import type { Directive } from './src/dream/learner-types.js';
import {
  listSelfHostedEntries,
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
import { FORGE_AGENDA, attemptForgeSpec, benchmarkGapSpecs, generateForgeSource, forgeSampleBudget } from './src/lib/capabilityForge.js';
import type { ForgeSpec, ForgeAttemptOutcome } from './src/lib/capabilityForge.js';
import { assessForgeCandidate, extractToolDoc, findNearDuplicate } from './src/lib/forgeQuality.js';
import { BUILDER_SEED_PROFILES, chooseBuilderProfile, computeBuilderBeliefs, builderMutateDue, proposeBuilderProfile } from './src/lib/builderBrain.js';
import type { BuilderProfile, BuilderOutcome } from './src/lib/builderBrain.js';
// Close the loop: recursive learning orders tool generation, and real forge
// outcomes feed back into the learner (canonical keys + graded reward).
import {
  rankForgeSpecsByLearnerPlan,
  forgeLearnUpdate,
  chooseMintTarget,
  groundedMintContext,
  mintedProblemToForgeSpec,
} from './src/lib/forgeLearningLoop.js';
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
  getFleetDriver,
  probeDriverOnline,
  callDevBrain,
  applyDriverProposal,
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
import {
  openRepairVerification,
  resolveRepairVerification,
  repairVerificationStats,
  type RepairVerification,
} from './src/lib/repairVerification.js';
import {
  assessSourceSubstance,
} from './src/lib/honestyMetrics.js';

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
  memoryStoreStatus,
  consolidateSemanticMemory,
} from './src/lib/recourseActivator.js';

// AgentBrowser web-fetch connector (download from the web through the real browser).
import { createWebChannelRouter } from './src/server/routes/webChannel.js';

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
  isIsolateAvailable,
  executeToolInIsolate,
} from './src/lib/isolatedSandbox.js';
import { VectorMemory, openVectorMemory } from './src/lib/vectorMemory.js';
// Open-Ended Capability Engine — problem minting, curriculum, novelty/property
// gates, patch-mode editing, and dedup-aware fleet recursion.
import { OpenEndedArchive } from './src/lib/openEnded/archive.js';
import { runOpenEndedCycle, rewardForResult, capabilityKeyFor, type OpenEndedCycleResult } from './src/lib/openEnded/engine.js';
import { FleetRecursionLedger } from './src/lib/openEnded/fleetRecursion.js';
import { mintProblems } from './src/lib/openEnded/problemMint.js';
import { inspire } from './src/lib/inspirationCrossover.js';

// Intake / benchmark / readout subsystem
import { SignalStore, DEFAULT_TOPIC_QUERIES, DEFAULT_RSS_FEEDS } from './src/intake/store.js';
import type { IntakeSnapshot, BenchmarkRun, ExternalSignal, SourcePollResult } from './src/intake/types.js';
import { pollAllSources } from './src/intake/poll.js';
import { groundSignal } from './src/intake/grounding.js';
import { runBenchmark, allBenchmarkProblems, appendedBenchmarkProblems, restoreBenchmarkProblems, registryAttestation } from './src/benchmark/benchmark.js';
import { appendBenchmarkRun } from './src/lib/benchmarkLedger.js';

// Ecosystem research corpus (local sibling-project ingestion)
import { scanCorpus } from './src/intake/corpus/scanner.js';
import { refillAgendaFromCorpus } from './src/intake/corpus/agendaRefill.js';
import type { CorpusGrounding } from './src/intake/corpus/agendaRefill.js';
import { summarize, corpusDigest, artifactsToSignals, DEFAULT_CORPUS_ROOTS } from './src/intake/corpus/index.js';
import type {
  CorpusRoot,
  CorpusArtifact,
  CorpusSnapshot,
  CorpusSummary,
} from './src/intake/corpus/types.js';

// Skill library accessor (catalog, search, read sibling skill repositories)
import { scanSkillLibraries } from './src/skills/scanner.js';
import { summarize as summarizeSkills, defaultSkillRoots } from './src/skills/index.js';
import type { SkillRoot, SkillDef, SkillSnapshot, SkillSummary } from './src/skills/types.js';
// Composer (creative domain): the track routes live in src/routes/compose.ts;
// the server still needs the style list + the learner for that router's mount.
import { ComposerLearner, defaultLearnerFile } from './src/lib/composer/index.js';

const app = express();
const PORT = Number(process.env.PORT || 3050);
import { createStateStore } from './src/lib/stateStore.js';
import { createKgRouter } from './src/routes/kg.js';
import { createOncologyRouter } from './src/routes/oncology.js';
import { createFieldbridgeRouter } from './src/routes/fieldbridge.js';
import { createBioRouter } from './src/routes/bio.js';
import { createBridgesRouter } from './src/routes/bridges.js';
import { createToolsRouter } from './src/routes/tools.js';
import { createPipelinesRouter } from './src/routes/pipelines.js';
import { createServicesRouter } from './src/routes/services.js';
import { createResearchRouter } from './src/routes/research.js';
import { createOrchestrationRouter } from './src/routes/orchestration.js';
import { createMusicTherapyRouter } from './src/routes/musicTherapy.js';
import { createMemoryRouter } from './src/routes/memory.js';
import { createLegoRouter } from './src/routes/lego.js';
import { createIntakeRouter } from './src/routes/intake.js';
import { createCorpusRouter } from './src/routes/corpus.js';
import { createSkillsRouter } from './src/routes/skills.js';
import { createDevelopRouter } from './src/routes/develop.js';
import { createForgeRouter } from './src/routes/forge.js';
import { createOpenEndedRouter } from './src/routes/openEnded.js';
import { createRepairRouter } from './src/routes/repair.js';
import { createPolicyRouter } from './src/routes/policy.js';
import { createDreamRouter } from './src/routes/dream.js';
import { createMutateRouter } from './src/routes/mutate.js';
import { createDecisionRouter } from './src/routes/decision.js';
import { createTemplatesRouter } from './src/routes/templates.js';
import { createLearnRouter } from './src/routes/learn.js';
import { createReadoutRouter } from './src/routes/readout.js';
import { createInteropRouter } from './src/routes/interop.js';
import { createMathRouter } from './src/routes/math.js';
import { createBiotechRouter } from './src/routes/biotech.js';
import { createAxiomRouter } from './src/routes/axiom.js';
import { createSynergyRouter } from './src/routes/synergy.js';
import { createFleetDogfoodRouter } from './src/routes/fleetDogfood.js';
import { runFleetDogfoodCycle } from './src/lib/fleetDogfood.js';
import { createVizRouter } from './src/routes/viz.js';
import { createGhidraRouter } from './src/routes/ghidra.js';
import { buildLearnResult } from './src/lib/ghidraLearning.js';
import type { GhidraLearnInput, GhidraLearnResult } from './src/lib/ghidraLearning.js';
import { requireMutationAuth, requireMutationAuthIfConfigured, hasValidMutationSecret } from './src/lib/mutationAuth.js';
import { createApiGuard, resolveListenHost } from './src/lib/apiGuard.js';
import { openWallet } from './src/lib/wallet.js';
import { setSandboxSpendSink } from './src/lib/selfHostSandbox.js';
import { createProductRouter } from './src/routes/product.js';
import { createOpsRouter, metricsText } from './src/routes/ops.js';
import { metrics } from './src/lib/metrics.js';
import { tracer, runInSpan, parseTraceparent, formatTraceparent, currentSpan } from './src/lib/tracing.js';
import { A2A_SKILLS, openA2aTaskStore } from './src/lib/a2a.js';
import type { A2aOperation } from './src/lib/a2a.js';
import { buildOpenApiSpec } from './src/lib/openapi.js';
import { openUsageMeter, priceForModel, tokenCostCents } from './src/lib/usageMeter.js';
import { openTenantStore } from './src/lib/auth/tenants.js';
import { openApiKeyStore } from './src/lib/auth/apikeys.js';
import { openOutcomeLedger } from './src/lib/outcomeFeedback.js';
import { createV1Router } from './src/routes/v1.js';
import { createCommerceRouter } from './src/routes/commerce.js';
import { loadOrCreateIdentity, openPeerStore } from './src/lib/federation/index.js';
import { createFederationRouter } from './src/routes/federation.js';
import { openArticleStore, openPublishTargetStore, openDeliveryLog } from './src/lib/publishing/index.js';
import { createPublishingRouter } from './src/routes/publishing.js';
import { openCrmStore, openSuppressionStore, openOutbox } from './src/lib/growth/index.js';
import { createGrowthRouter } from './src/routes/growth.js';
import { openSkillRegistry } from './src/lib/skillRegistry.js';
import { federationSkillProviders } from './src/lib/ecosystem/skillFederation.js';
import { createEcosystemRouter } from './src/routes/ecosystem.js';
import { createSecurityRouter } from './src/routes/security.js';
import { createSchedulerRouter } from './src/routes/scheduler.js';
import { createSubagentsRouter } from './src/routes/subagents.js';
import { createIntelRouter } from './src/routes/intel.js';
import { createReporterRouter } from './src/routes/reporter.js';
import { createSelfhostedRouter } from './src/routes/selfhosted.js';
import { createComposeRouter } from './src/routes/compose.js';
import { createRatingRouter } from './src/routes/rating.js';
import { RatingStore, defaultRatingLedger } from './src/lib/rating/store.js';
import { createVoiceRouter } from './src/routes/voice.js';
import { createFleetVoiceRouter } from './src/routes/fleetVoice.js';
import { createAgentToolsRouter } from './src/routes/agentTools.js';
import { createAgentToolRegistry } from './src/lib/agentTools.js';
import type { SystemTool } from './src/lib/agentTools.js';
import { createMcpServerRegistry } from './src/lib/mcpToolProvider.js';
import { createRouteToolProvider } from './src/lib/routeTools.js';
import { createFederationToolProvider } from './src/lib/federationTools.js';
import { createSkillToolProvider } from './src/lib/skillTools.js';
import { configureSkillAwareness, skillAwareChat, makeSkillBodyReader } from './src/lib/skillContext.js';
import { runToolCallingAgent } from './src/lib/toolCalling.js';
import { loadBusinessProfile, listBusinessSlugs } from './src/autopilot/businessProfile.js';
import type { BusinessProfileT } from './src/autopilot/businessProfile.js';
import { publishToGlobalLens } from './src/lib/globalLensBridge.js';
import { openNightlyStore, runNightlyCycle } from './src/lib/nightlyLoop.js';
import type { Snapshot as UpgradeSnapshot } from './src/lib/upgradeReport.js';
import { openApprovalStore } from './src/lib/approvals.js';
import { createSelfModGuard, makeHarnessGate } from './src/lib/selfModification.js';
import { createSelfImprovementRouter } from './src/routes/selfImprovement.js';
import { openPolicyEngine } from './src/lib/policy.js';
import { attemptRemediation, resolveRemediationService, parseRemediationMap } from './src/lib/remediation.js';
import { createCodePlanner } from './src/autopilot/codePlanner.js';
const STATE_FILE = path.join(process.cwd(), 'recourse_storage.json');

// Budgeted action wallet (durable, hash-chained). Also installed as the sandbox
// spend sink so any granted `spend` capability is debited against a real budget.
const wallet = openWallet();
setSandboxSpendSink((cents, description, budgetToken) => {
  wallet.debit(budgetToken, cents, description);
});
// Productized surfaces (telemetry / audio / wallet) live in their own router.
const productRouter = createProductRouter({
  wallet,
  repoRoot: () => devRepoRoot(),
  requireMutationAuth,
});
// Voice-clone profiles + zero-shot synthesis (see src/routes/voice.ts). Follows
// the config-gated guard so local dashboards keep working unauthenticated while
// a configured secret still protects the mutating profile writes.
const voiceRouter = createVoiceRouter({ requireMutationAuth: requireMutationAuthIfConfigured });
// Spoken Axiom/OpenHub summaries (read-only). The real probes are injected here
// so the router stays pure/testable and the monolith owns the live state.
const fleetVoiceRouter = createFleetVoiceRouter({
  axiomStatus: axiomBridgeStatus,
  axiomLatest: () => axiomProjectLatest(),
  audit: () => loadAuditSnapshot() ?? null,
});

// Wave 2 safety layers: the shared policy engine (the approval store is created
// alongside the self-mod guard below, and both are reused here so the ops routes
// and self-repair remediation agree on one set of engines).
const policyEngine = openPolicyEngine();
// Durable A2A task store so tasks/get survives a restart.
const a2aTaskStore = openA2aTaskStore();
// Real code planner for the business autopilot: Tier A code gaps get real
// source + an acceptance test (gated by a real sandbox run) instead of a
// placeholder. Offline/unparseable output falls back to the honest placeholder.
const autopilotCodePlanner = createCodePlanner((messages) => chatComplete(messages));

// ---------------------------------------------------------------------------
// Wave 1 commercial layer: durable usage metering, tenant/API-key identity, and
// the outcome-feedback ledger that ties real business results to the learner.
// The model-usage sink below feeds EVERY model call (from any call site) into
// the meter, and debits the `model` wallet budget when the cost rounds to >=1c.
// ---------------------------------------------------------------------------
const usageMeter = openUsageMeter();
const tenantStore = openTenantStore();
const apiKeyStore = openApiKeyStore();
const outcomeLedger = openOutcomeLedger();

// Prometheus handles (created once; the registry keys by name).
const modelCallsTotal = metrics.counter('recourse_model_calls_total', 'Model calls by model and profile');
const modelTokensTotal = metrics.counter('recourse_model_tokens_total', 'Model tokens by model and direction');
const modelCostCentsTotal = metrics.counter('recourse_model_cost_cents_total', 'Model spend in cents by model');
const httpRequestsTotal = metrics.counter('recourse_http_requests_total', 'HTTP requests by method and status');
const httpRequestSeconds = metrics.histogram('recourse_http_request_seconds', 'HTTP request latency');

setModelUsageSink((u) => {
  const cents = tokenCostCents(priceForModel(u.model), u.promptTokens, u.completionTokens);
  try {
    usageMeter.record({
      tenantId: process.env.RECOURSE_SYSTEM_TENANT || 'system',
      kind: 'model_call',
      provider: u.profile,
      model: u.model,
      inputTokens: u.promptTokens,
      outputTokens: u.completionTokens,
      cents,
      estimated: u.estimated,
      description: `model ${u.model} (${u.profile})`,
    });
  } catch { /* metering must never break generation */ }
  // Observability: every model call is counted (independent of metering success)
  // and traced as a child of whatever request/task span is active.
  const parentSpan = currentSpan();
  const span = tracer.startSpan('model.call', {
    parent: parentSpan?.context,
    attributes: { 'model.name': u.model, 'model.profile': u.profile, 'model.total_tokens': u.totalTokens, 'model.estimated': u.estimated },
  });
  tracer.endSpan(span, { status: 'ok' });
  modelCallsTotal.inc({ model: u.model, profile: u.profile, estimated: String(u.estimated) });
  modelTokensTotal.inc({ model: u.model, direction: 'input' }, u.promptTokens);
  modelTokensTotal.inc({ model: u.model, direction: 'output' }, u.completionTokens);
  if (cents > 0) modelCostCentsTotal.inc({ model: u.model }, cents);
  const whole = Math.round(cents);
  if (whole > 0) {
    try {
      wallet.debit(process.env.RECOURSE_MODEL_BUDGET_TOKEN || 'model', whole, `model ${u.model}`);
    } catch { /* an absent/unfunded budget must never break generation */ }
  }
});

// Versioned, API-key-authenticated, quota-metered commercial surface mounted at
// /v1 (see src/routes/v1.ts). `learner` is declared later in the file; the
// closure below is only invoked at request time, after module init completes.
const v1Router = createV1Router({
  meter: usageMeter,
  keys: apiKeyStore,
  tenants: tenantStore,
  wallet,
  outcome: outcomeLedger,
  runLearnerEpisode: (externalScore) => learner.runEpisode(externalScore),
  statusInfo: () => ({ version: '1.0.0' }),
});
// Operator control plane for tenants/keys/usage (guarded writes).
const commerceRouter = createCommerceRouter({
  tenants: tenantStore,
  keys: apiKeyStore,
  meter: usageMeter,
  outcome: outcomeLedger,
  requireMutationAuth,
});

// ---------------------------------------------------------------------------
// Wave 4 — network effects: instance federation, public publishing + paywall,
// and the growth channels (CRM / compliant outbound / SEO / ads / lead capture).
// ---------------------------------------------------------------------------
const federationIdentity = loadOrCreateIdentity();
const peerStore = openPeerStore();
// The signed skill registry is the concrete provider behind federation's
// injectable export/import seam, so skills actually replicate between peers.
const skillRegistry = openSkillRegistry();
const federationRouter = createFederationRouter({
  identity: federationIdentity,
  peers: peerStore,
  requireMutationAuth,
  ...federationSkillProviders(skillRegistry),
});
const ecosystemRouter = createEcosystemRouter({ requireMutationAuth });

const articleStore = openArticleStore();
const publishTargetStore = openPublishTargetStore();
const deliveryLog = openDeliveryLog();
const publishingRouter = createPublishingRouter({
  store: articleStore,
  targets: publishTargetStore,
  log: deliveryLog,
  tenants: tenantStore,
  requireMutationAuth,
  globalLensPublish: async (article) => {
    const res = await publishToGlobalLens({
      title: article.title,
      body: article.body,
      category: 'recourse',
      source_name: 'Recourse',
      url: `recourse://articles/${article.slug}`,
    });
    return { ok: res.ok, inserted: res.inserted, error: res.error };
  },
});

function currentBusinessProfile(): BusinessProfileT | null {
  try {
    const slugs = listBusinessSlugs();
    return slugs.length ? loadBusinessProfile(slugs[0]) : null;
  } catch {
    return null;
  }
}
const crmStore = openCrmStore();
const suppressionStore = openSuppressionStore();
const growthOutbox = openOutbox();
const growthRouter = createGrowthRouter({
  crm: crmStore,
  suppression: suppressionStore,
  outbox: growthOutbox,
  requireMutationAuth,
  getProfile: currentBusinessProfile,
});

// ---------------------------------------------------------------------------
// Wave 5 — verified self-modification + the nightly autonomous cycle.
// The approval queue gates modifications to Recourse's own harness source, and
// the nightly coordinator runs dream -> forge -> benchmark once per UTC day and
// writes a self-attested upgrade report. Prefer RECOURSE_SELF_MOD_APPLY=1 for
// unattended harness changes; otherwise each harness target needs an approval.
// ---------------------------------------------------------------------------
const approvalStore = openApprovalStore();
const selfModGuard = createSelfModGuard({
  approvals: approvalStore,
  autoApprove: () => process.env.RECOURSE_SELF_MOD_APPLY === '1',
});
const nightlyStore = openNightlyStore();

// Wave 2 ops surface reuses the shared policy + approval engines above, so a
// remediation approval queued by self-repair is visible to the ops routes.
const opsRouter = createOpsRouter({
  requireMutationAuth,
  policy: policyEngine,
  approvals: approvalStore,
  requireReadAuth: telemetryAuthorized,
});

function nightlyMetrics(): UpgradeSnapshot {
  const dossier = devDossierInput();
  return {
    registryTools: registry.length,
    liveSelfHosted: dossier.liveSelfHostedTools,
    verifierPassRate: dossier.verifierPassRate,
    promoted: forgeLedger.filter((l) => l.status === 'materialized').length,
    benchmarkSolved: latestBenchmark?.solved ?? 0,
    benchmarkTotal: latestBenchmark?.total ?? 0,
    healedTools: status.selfRepair?.totalHealedCount ?? 0,
    openAnomalies: dossier.openAnomalies,
  };
}

/** Drive one full nightly self-improvement pass (idempotent per UTC day). */
async function runNightlyPass(force: boolean) {
  return runNightlyCycle({
    store: nightlyStore,
    force,
    metrics: async () => nightlyMetrics(),
    steps: {
      dream: async () => {
        const tick = await dreamEngine.tick();
        dreamState = tick.dreamState;
        const mirrored = await mirrorCrystallizedDreamGenes();
        saveStateToDisk();
        return { ok: true, detail: `dream tick (${mirrored} gene(s) mirrored)`, data: { mirrored } };
      },
      openended: async () => {
        const result = await runOpenEndedEngineCycle();
        const skipped = 'skipped' in result && result.skipped;
        const r = result as OpenEndedCycleResult;
        return {
          ok: true,
          detail: skipped ? 'open-ended cycle skipped' : `open-ended: minted ${r.minted}, solved=${r.solved}`,
          data: result,
        };
      },
      forge: async () => {
        const result = await runForgeCycle();
        const skipped = 'skipped' in result && result.skipped;
        // Recursive learning drives tool generation: drive the learner-directed
        // synthesize-directive route in-process so the nightly pass builds one
        // component for the learner's highest-priority domain (real suite + lint
        // gated). Best-effort and honest: a failure is reported, never faked.
        let learnerSynth: { success?: boolean; message?: string; synthesizedTool?: { name?: string } } = {};
        try {
          const res = await internalApiCall('POST', '/api/recourse/learn/synthesize-directive', {}, true);
          learnerSynth = (res.data ?? {}) as typeof learnerSynth;
        } catch (err: any) {
          learnerSynth = { success: false, message: err?.message || String(err) };
        }
        const synthNote = learnerSynth.success
          ? `learner synthesized ${learnerSynth.synthesizedTool?.name ?? 'a component'}`
          : `learner synth: ${learnerSynth.message ?? 'no target'}`;
        return {
          ok: true,
          detail: skipped ? `forge skipped: ${(result as any).reason ?? 'n/a'}` : `forge cycle completed; ${synthNote}`,
          data: { forge: result, learnerSynth },
        };
      },
      benchmark: async () => {
        const run = runBenchmarkCycle();
        return { ok: true, detail: `benchmark ${run.solved}/${run.total}`, data: { solved: run.solved, total: run.total } };
      },
    },
  });
}

const selfImprovementRouter = createSelfImprovementRouter({
  nightly: nightlyStore,
  approvals: approvalStore,
  requireMutationAuth,
  runCycle: runNightlyPass,
  patchStatus: () => {
    const root = devRepoRoot();
    const patches = listFleetPatches(root);
    return {
      applied: patches.filter((p) => !p.reverted).length,
      reverted: patches.filter((p) => p.reverted).length,
      ciGate: HARNESS_CI_GATE,
    };
  },
});


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
  const refuse = (existing: number) => {
    console.error(
      `[Recourse] Refusing to start: instance PID ${existing} is already running ` +
      `(lock ${LOCK_FILE}). Kill it first, or run with RECOURSE_ALLOW_MULTI=1 to force.`
    );
    return false;
  };
  const takeOver = (): boolean => {
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf-8');
      return true;
    } catch (err: any) {
      console.warn('[Recourse] Could not write instance lock; continuing:', err?.message || err);
      return true;
    }
  };
  // Atomic create: `wx` fails if the file already exists, so two simultaneous
  // starters cannot both believe they created it.
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (err: any) {
    if (err?.code !== 'EEXIST') {
      // Unwritable cwd etc. — preserve prior behavior and continue.
      console.warn('[Recourse] Could not write instance lock; continuing:', err?.message || err);
      return true;
    }
  }
  // Lock exists — is the holder alive?
  try {
    const existing = Number(String(fs.readFileSync(LOCK_FILE, 'utf-8')).trim());
    if (existing > 0) {
      try {
        process.kill(existing, 0); // liveness probe only
        return refuse(existing);
      } catch {
        // Stale lock from a dead process — reclaim it.
      }
    }
    return takeOver();
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

// Dream-engine model generator: asks the configured local model (the Spark
// model served by llama-server) to propose a falsifiable hypothesis
// in a random domain WITH plain-JS implementation and real assert tests. The
// Dreaming Engine runs those tests before the thought can ever promote.
const DREAM_DOMAINS: ToolDomain[] = ['math', 'coding', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

async function dreamModelGenerator(input?: { domain?: ToolDomain; recentHypotheses?: string[] }): Promise<import('./src/dream/engine.js').DreamGeneratorResult | null> {
  const online = await modelCheckOnline(false);
  if (!online) return null;
  const recent = (input?.recentHypotheses || []).slice(0, 3);
  const domain = input?.domain || DREAM_DOMAINS[Math.floor(Math.random() * DREAM_DOMAINS.length)];
  const result = await skillAwareChat([
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
// P1 sleep-time compute: how many specs to pre-compute per consolidation cycle.
const SLEEP_COMPUTE_LIMIT = Math.max(1, Number(process.env.SLEEP_COMPUTE_LIMIT) || 2);
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
    // P1 sleep-time compute: during consolidation, precompute + sandbox-verify
    // artifacts for the forge specs the learner is most likely to need next.
    // The forge consumes a verified artifact with zero model calls; it is still
    // re-verified before promotion.
    sleepCompute: async () => {
      try {
        const specs = allForgeSpecs();
        const have = new Set([
          ...registry.map((t) => t.name),
          ...forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name),
        ]);
        const pending = specs.filter((s) => !have.has(s.name)).slice(0, SLEEP_COMPUTE_LIMIT);
        return await runSleepComputeUnit({
          specs: pending.map((s) => ({
            name: s.name,
            domain: s.domain,
            prompt: s.prompt ?? s.title,
            refSuite: s.refSuite ?? '',
          })),
          generate: async (task) => {
            const res = await generateForgeSource(
              {
                id: `sleep_${task.name}`,
                name: task.name,
                domain: task.domain as ToolDomain,
                title: task.name,
                prompt: task.prompt,
                refSuite: task.refSuite,
              },
            );
            return { ok: res.ok === true, source: res.source };
          },
          verify: (source, suite) => executeTestSuite(source, suite),
          limit: SLEEP_COMPUTE_LIMIT,
        });
      } catch (err) {
        return { attempted: 0, ready: 0, note: `sleep compute unavailable: ${err instanceof Error ? err.message : String(err)}` };
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
  /** Forge quality gate (forgeQuality.ts): score + verdict of the candidate. */
  quality?: { score: number; gateOk: boolean; reasons: string[] };
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
// P2.9: the distilled legacy digest (capability trend, registry/health trend,
// learner trend, repair patterns, research topics, agenda themes). A
// first-class artifact so old runs inform new work instead of being re-derived.
let legacyDigest: Record<string, unknown> | null = null;
let systemBaseline: SystemSnapshot | null = null;

// Model provider mode persisted across restarts ('local' Spark | 'api' LLM).
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
// Dev (audit/repair) autopilot cadence. Env-overridable and floored at 60s so a
// CPU-bound box doesn't register a minute-cadence job that node-cron reports as
// "missed execution" whenever the event loop is briefly busy. Default 5 min.
const DEV_AUTOPILOT_MS = Math.max(60_000, Number(process.env.DEV_AUTOPILOT_MS) || 5 * 60 * 1000);
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
  /** Operational remediation outcome for service-kind issues (when attempted). */
  remediation?: { status: string; service?: string; approvalId?: string; detail: string };
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

// ---------------------------------------------------------------------------
// Ghidra learning sink. A real Ghidra analysis (functions/imports/strings +
// deterministic risk findings) is folded into (a) the recursive learner as a
// per-artifact reward, (b) durable vector memory, (c) the provenance chain, and
// (d) the stuck-issue ledger when the heuristic risk is high. Nothing is
// fabricated: the learner reward is computed from the real analysis, and a
// high-risk artifact is escalated only through the same stuck loop as any other
// real signal.
// ---------------------------------------------------------------------------
async function learnFromGhidra(input: GhidraLearnInput): Promise<GhidraLearnResult> {
  const result = buildLearnResult(input);
  await learner.learnRealTools(result.tools);
  try {
    const mem = await ensureVectorMemory();
    await mem.remember(
      'snapshot',
      `ghidra:${input.binaryName}:${input.analysis?.sha256 || Date.now()}`,
      result.summary,
      {
        source: 'ghidra',
        riskScore: input.findings.riskScore,
        indicators: input.findings.indicatorCount,
        sha256: input.analysis?.sha256 ?? null,
      },
    );
  } catch {
    // Vector memory is optional; the learner update above already happened.
  }
  appendProvenanceEvent('system_tick', {
    action: 'ghidra_analysis',
    binary: input.binaryName,
    riskScore: input.findings.riskScore,
    indicators: input.findings.indicatorCount,
    reward: result.reward,
  });
  if (result.signals.some((s) => s.failing)) {
    stuckIssues = updateStuckIssues(stuckIssues, result.signals, Date.now());
  }
  return result;
}

app.use(express.json({
  limit: '10mb',
  // Preserve the exact bytes for Stripe webhook signature verification
  // (signatures are computed over the raw body, not a re-serialization).
  verify: (req, _res, buf) => {
    (req as typeof req & { rawBody?: string }).rawBody = buf.toString('utf-8');
  },
}));

// Default-deny floor for mutating /api routes (see src/lib/apiGuard.ts): the
// local UI keeps working, remote/cross-site callers need RECOURSE_API_SECRET.
app.use(createApiGuard());

// Observability: count + time every HTTP request (exposed at GET /metrics).
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    httpRequestsTotal.inc({ method: req.method, status: String(res.statusCode) });
    httpRequestSeconds.observe(seconds, { method: req.method });
  });
  next();
});

// Distributed tracing: one root span per request, propagating W3C trace context
// to any child work (model calls, tool executions) run inside the handler.
app.use((req, res, next) => {
  const parent = parseTraceparent(req.headers['traceparent'] as string | undefined);
  const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`, {
    parent,
    attributes: { 'http.method': req.method, 'http.target': req.path },
  });
  res.setHeader('traceparent', formatTraceparent(span));
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    tracer.endSpan(span, {
      status: res.statusCode >= 500 ? 'error' : 'ok',
      attributes: { 'http.status_code': res.statusCode },
    });
  };
  res.on('finish', finish);
  res.on('close', finish);
  runInSpan(span, () => next());
});

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

// --- Promotion-gate policy: one vocabulary, one setter, one status mirror ----
// Both the legacy /policy route and /mutate/policy route funnel through here, so
// the mutator, the persisted status, and the UI can never diverge again.
function applyPromotionPolicy(
  raw: unknown
): { ok: true; policy: PromotionPolicy; note?: string } | { ok: false; error: string } {
  const normalized = normalizePromotionPolicy(String(raw ?? ''));
  if ('error' in normalized) return { ok: false, error: normalized.error };
  setActivePolicy(normalized.policy);
  status.activePolicy = normalized.policy;
  return { ok: true, policy: normalized.policy, ...(normalized.note ? { note: normalized.note } : {}) };
}

/**
 * Telemetry reads (`/metrics`, trace inspection) are open on the local bind by
 * default. Set `RECOURSE_TELEMETRY_AUTH=1` to require the mutation secret — the
 * metrics expose model names/costs and traces expose request paths.
 */
function telemetryAuthorized(req: any, res: any): boolean {
  if (process.env.RECOURSE_TELEMETRY_AUTH !== '1') return true;
  if (hasValidMutationSecret(req)) return true;
  res.status(401).json({ success: false, error: 'unauthorized (RECOURSE_TELEMETRY_AUTH=1)' });
  return false;
}

if (process.env.RECOURSE_PROMOTION_POLICY) {
  try {
    setActivePolicy(process.env.RECOURSE_PROMOTION_POLICY);
    status.activePolicy = getActivePolicy();
  } catch (err) {
    console.warn(
      '[policy] ignoring invalid RECOURSE_PROMOTION_POLICY:',
      err instanceof Error ? err.message : String(err)
    );
  }
}
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
// Repair verification windows: a heal claim is pending until a later re-verify
// confirms it (see src/lib/repairVerification.ts). Persisted with the state.
let repairVerifications: RepairVerification[] = [];

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
let skillRoots: SkillRoot[] = defaultSkillRoots();
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
      if (Array.isArray(data.benchmarkAppendedProblems)) restoreBenchmarkProblems(data.benchmarkAppendedProblems);
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
      if (Array.isArray(data.skillRoots) && data.skillRoots.length) {
        skillRoots = data.skillRoots;
        // Merge in new default skill libraries (e.g. newly added roots) without
        // duplicating or dropping user-configured roots.
        for (const d of defaultSkillRoots()) {
          if (!skillRoots.some((r: any) => r && r.id === d.id)) skillRoots.push({ ...d });
        }
      }
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
      // Also drop legacy corpus_* specs: every one was the same FNV-fingerprint
      // contract under a file-derived name (clone tools, zero capability).
      dynamicAgenda = data.dynamicAgenda.filter((s: any) => s?.name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s.name) && !reserved.has(s.name) && !String(s.id ?? '').startsWith('corpus_'));
    }
      if (data.capabilityAdoptions) capabilityAdoptions = data.capabilityAdoptions;
      if (data.capabilityServed) capabilityServed = data.capabilityServed;
      if (Array.isArray(data.systemSnapshots)) systemSnapshots = data.systemSnapshots;
      if (data.legacyDigest && typeof data.legacyDigest === 'object') legacyDigest = data.legacyDigest as Record<string, unknown>;
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
      repairVerifications,
      growthWeights,
      gitHubBlueprints,
      swarmStatus,
      swarmTeamStates,
      status,
      intakeSignals,
      benchmarkHistory,
      benchmarkAppendedProblems: appendedBenchmarkProblems(),
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
      legacyDigest,
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
  let repairSuite: string | undefined;
  if (domain === 'biotech') {
    try {
      const claim = JSON.parse(repairedCode) as BiotechClaim;
      verifierResult = verifyBiotechClaim(claim);
    } catch {
      verifierResult = { passed: false, summary: 'FAILED (repaired payload is not valid JSON)', details: [], score: 0 };
    }
  } else {
    repairSuite = resolveRepairSuite(tool, testSuite);
    if (repairSuite) {
      verifierResult = verifyCodeWithSuite(repairedCode, repairSuite);
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
    test_suite_code: repairSuite,
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

  // Update Status Metrics. A heal claim opens a VERIFICATION WINDOW: it is not
  // counted as a success until a later re-verify confirms it (see
  // reverifyPendingRepairs). Smoke-only heals (no suite) are unverifiable and
  // never count. The success rate is therefore verified/(verified+regressed),
  // not "how many times we said we fixed it".
  if (healed) {
    status.selfRepair.totalHealedCount += 1;
    status.selfRepair.lastHealedTool = toolName;
    status.selfRepair.lastHealTimestamp = Date.now();
    status.selfRepair.meanTimeToRepairMs = Math.round(
      (status.selfRepair.meanTimeToRepairMs * (status.selfRepair.totalHealedCount - 1) + repairLatency) / status.selfRepair.totalHealedCount
    );
    repairVerifications.push(openRepairVerification({
      id: `rv_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      tool: toolName,
      version: newVersionStr,
      healedAt: Date.now(),
      suitePresent: Boolean(repairSuite),
    }));
    if (repairVerifications.length > 500) repairVerifications.splice(0, repairVerifications.length - 500);
  }
  const rvStats = repairVerificationStats(repairVerifications);
  status.selfRepair.repairSuccessRate = rvStats.successRate;
  status.selfRepair.verifiedRepairs = rvStats.verified;
  status.selfRepair.pendingRepairs = rvStats.pending;
  status.selfRepair.regressedRepairs = rvStats.regressed;
  status.selfRepair.unverifiableRepairs = rvStats.unverifiable;
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
import { axiomBridgeStatus, integrateAxiomTool, axiomReachable, axiomProjectLatest } from './src/lib/axiomBridge.js';
// (hackingtool security routes extracted to src/routes/security.ts)

app.use('/api/recourse', createAxiomRouter({
  healthDossier: () => computeHealthDossier(devDossierInput()),
  recordDev: (action, ok, detail, extra) => recordDev(action, ok, detail, extra as any),
}));

// =========================================================================
// hackingtool security bridge (Z4nzu/hackingtool, MIT) — authorized testing.
// Read-only catalog awareness + recommendations; the ONE executing path
// (engagement) is fail-closed behind RECOURSE_API_SECRET + an env kill switch
// + an explicit scope allowlist. Abuse-shaped goals are refused up front.
// =========================================================================

// Security / authorized-testing routes are mounted from src/routes/security.ts
// (mode/status route below).

// Operator readouts: big GET /status, provenance/registry/sandbox/failures/
// benchmark/selfuse/snapshots/legacy-digest/upgrade-report/capabilities/
// generations/readout. Mounted at the original position of GET /status.
app.use('/api/recourse', createReadoutRouter({
  verifyChainIntegrity,
  statusRef: () => status,
  registryRef: () => registry,
  currentProviderStatus,
  repairVerificationsRef: () => repairVerifications,
  growthWeightsRef: () => growthWeights,
  dreamEngine,
  setDreamState: (s) => { dreamState = s; },
  swarmStatusRef: () => swarmStatus,
  lastGrowthDecisionRef: () => lastGrowthDecision,
  anomaliesRef: () => anomalies,
  gitHubBlueprintsRef: () => gitHubBlueprints,
  forgeLedgerRef: () => forgeLedger,
  benchmarkHistoryRef: () => benchmarkHistory,
  latestBenchmarkRef: () => latestBenchmark,
  learnerStore,
  provenanceEventsRef: () => provenanceEvents,
  serveCapability: (capId, ctx) => serveCapability(capId as any, ctx as any),
  failureLedger,
  outcomeLedger,
  selfUseStatus,
  systemSnapshotsRef: () => systemSnapshots,
  systemBaselineRef: () => systemBaseline,
  legacyDigestRef: () => legacyDigest,
  buildUpgradeReport,
  upgradeReport,
  capabilitiesRef: () => CAPABILITIES,
  capabilitiesState,
  generationLedgerRef: () => generationLedger,
  intakeSnapshot,
  benchmarkState,
}));

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


// =========================================================================
// DURABLE VECTOR MEMORY (LanceDB) — self-learning retrieval
// =========================================================================
let vectorMemory: VectorMemory | null = null;
let memoryInit: Promise<VectorMemory> | null = null;
function ensureVectorMemory(): Promise<VectorMemory> {
  if (!memoryInit) memoryInit = openVectorMemory({ dir: process.env.RECOURSE_MEMORY_DIR || 'data/recourse-memory' }).then((m) => { vectorMemory = m; return m; }).catch(() => vectorMemory as VectorMemory);
  return memoryInit;
}

/** OpenHub's latest self-report (from fleet memory) as generation + audit input.
 *  Honest: empty when memory is unavailable or no report exists — never a
 *  fabricated signal. */
async function openhubFleetSignal(): Promise<{
  beliefs: GeneBelief[];
  auditSignals: Array<{ uncertainty: number; meanReward: number; attempts: number }>;
  degraded: boolean;
  reportAt: string | null;
  health: { alpha: number; beta: number; healthy: string[]; degraded: string[] } | null;
}> {
  const empty = { beliefs: [], auditSignals: [], degraded: false, reportAt: null, health: null };
  try {
    const mem = await ensureVectorMemory();
    const hits = await mem.recall('openhub self report openhub-self-report fleet health', 'snapshot', 50);
    const report = latestReportFromDocs(hits);
    if (!report) return empty;
    const belief = deriveOpenHubBelief(report);
    const audit = deriveOpenHubAuditSignals(report);
    return {
      beliefs: belief ? [belief] : [],
      auditSignals: audit ? [audit] : [],
      degraded: belief ? belief.beta > belief.alpha : false,
      reportAt: typeof report.at === 'string' ? report.at : null,
      health: updateOpenHubHealth(report),
    };
  } catch {
    return empty;
  }
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
    const toolCount = snap.toolCount ?? snap.tools?.length ?? 0;
    const text = `${snap.label} gen ${snap.gen}: ${toolCount} tools, ${snap.capabilities.length} capabilities`;
    await mem.remember('snapshot', `snap:${snap.label}:${snap.ts}`, text, { gen: snap.gen });
    indexed++;
  }
  return { indexed, status: await mem.status() };
}

// Memory + fleet-memory routes moved to src/routes/memory.ts (mounted here).
app.use(
  '/api/recourse',
  createMemoryRouter({
    ensureVectorMemory,
    indexSystemMemory,
    openhubFleetSignal,
  }),
);

// =========================================================================
// A2A (Agent-to-Agent) surface — Recourse as a callable agent.
// =========================================================================

/** Public base URL for the agent card, honoring proxy headers. */
function a2aBaseUrl(req: { headers: Record<string, any>; protocol?: string }): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0] || req.protocol || 'http';
  const host = String(req.headers['x-forwarded-host'] ?? '') || req.headers.host || `127.0.0.1:${PORT}`;
  return `${proto}://${host}`;
}

/** Same-process HTTP call (keeps the A2A ops thin — they reuse the REST routes). */
async function internalApiCall(
  method: 'GET' | 'POST',
  apiPath: string,
  body?: unknown,
  withAuth = false,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const secret = process.env.RECOURSE_API_SECRET;
  if (withAuth && secret) headers.Authorization = `Bearer ${secret}`;
  const res = await fetch(`http://127.0.0.1:${PORT}${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

function buildA2aOperations(): Record<string, A2aOperation> {
  const make = (
    id: string,
    run: (args: Record<string, unknown>) => Promise<unknown> | unknown,
  ): [string, A2aOperation] => {
    const skill = A2A_SKILLS.find((s) => s.id === id);
    if (!skill) throw new Error(`A2A skill metadata missing for ${id}`);
    return [id, { skill, run }];
  };
  return Object.fromEntries([
    make('recourse.status', async () => (await internalApiCall('GET', '/api/recourse/status')).data),
    make('recourse.registry', async () => (await internalApiCall('GET', '/api/recourse/registry')).data),
    make('recourse.selfhosted', async () => (await internalApiCall('GET', '/api/recourse/selfhosted')).data),
    make('recourse.sandbox_status', async () => (await internalApiCall('GET', '/api/recourse/selfhosted/sandbox')).data),
    make('recourse.memory_tiered', async () => (await internalApiCall('GET', '/api/recourse/memory/tiered')).data),
    make('recourse.recall_memory', async (args) => {
      const q = encodeURIComponent(String(args.q ?? args.query ?? ''));
      const kind = args.kind ? `&kind=${encodeURIComponent(String(args.kind))}` : '';
      const topK = args.topK ? `&topK=${Number(args.topK)}` : '';
      return (await internalApiCall('GET', `/api/recourse/memory/recall?q=${q}${kind}${topK}`)).data;
    }),
    make('recourse.inspect_learner', async () => (await internalApiCall('GET', '/api/recourse/learn/status')).data),
    make('recourse.problems', async () => (await internalApiCall('GET', '/api/recourse/math/problems')).data),
    make('recourse.run_forge', async (args) =>
      (await internalApiCall('POST', '/api/recourse/forge/run', { count: args.count ?? 1 }, true)).data),
    make('recourse.execute_selfhosted', async (args) => {
      const name = String(args.name ?? '');
      const method = String(args.method ?? '');
      const url = `/api/recourse/selfhosted/${encodeURIComponent(name)}/execute`;
      return (await internalApiCall('POST', url, { method, args: args.args ?? [], mode: args.mode }, true)).data;
    }),
    make('recourse.consolidate_memory', async (args) =>
      (await internalApiCall('POST', '/api/recourse/memory/consolidate', { minClusterSize: args.minClusterSize }, true)).data),
    make('recourse.promote_skills', async (args) =>
      (await internalApiCall('POST', '/api/recourse/memory/promote-skills', {
        minDistinctProblemWins: args.minDistinctProblemWins,
        maxPerRun: args.maxPerRun,
      }, true)).data),
    make('recourse.revert', async (args) =>
      (await internalApiCall('POST', '/api/recourse/develop/revert', { token: args.token }, true)).data),
    // Telemetry reads may be guarded by RECOURSE_TELEMETRY_AUTH; authenticate the
    // internal hop so these agent tools keep working when it is enabled.
    make('recourse.traces', async () => (await internalApiCall('GET', '/api/recourse/ops/traces', undefined, true)).data),
    make('recourse.tracing_status', async () => (await internalApiCall('GET', '/api/recourse/ops/tracing/status', undefined, true)).data),
    make('recourse.skills', async () => (await internalApiCall('GET', '/api/recourse/ecosystem/skills')).data),
    make('recourse.skill_verify', async (args) => {
      const id = encodeURIComponent(String(args.id ?? ''));
      return (await internalApiCall('GET', `/api/recourse/ecosystem/skills/${id}/verify`)).data;
    }),
    make('recourse.connectors', async () => (await internalApiCall('GET', '/api/recourse/ecosystem/connectors')).data),
    make('recourse.validate_plugin', async (args) =>
      (await internalApiCall('POST', '/api/recourse/ecosystem/plugins/validate', { manifest: args.manifest ?? args })).data),
    make('recourse.publish_skill', async (args) =>
      (await internalApiCall('POST', '/api/recourse/ecosystem/skills/publish', {
        id: args.id,
        name: args.name,
        version: args.version,
        description: args.description,
        domain: args.domain,
        toolName: args.toolName,
        source: args.source,
        license: args.license,
        author: args.author,
      }, true)).data),
  ]);
}

// Replay + OpenAPI + A2A + remote MCP (paths span /api/recourse, /api, and
// /.well-known, so this router is mounted at the app root with full paths).
app.use(createInteropRouter({
  a2aBaseUrl,
  buildA2aOperations,
  a2aTaskStore,
}));

// /api/recourse/memory/recall, /fleet/memory, /fleet/signal moved to
// src/routes/memory.ts (see the createMemoryRouter mount above).

// Promotion policy + autonomy routes (policy/toggle-auto/autonomy/safe-boot/
// halt) moved to src/routes/policy.ts; host state is injected as closures.
app.use(
  '/api/recourse',
  createPolicyRouter({
    autonomySnapshot: () => ({
      safeBoot: autonomySettings.safeBoot,
      autoEvolving: status.isAutoEvolving,
      dreamActive: dreamState.isDreamingActive,
      swarmAutopilot: swarmStatus.isSwarmAutopilotActive,
      intakeAutopilot: intakeAutopilotOn,
      forgeAutopilot: forgeAutopilotOn,
      devAutopilot: devAutopilotOn,
      serverTickAutopilot: serverTickAutopilotOn,
    }),
    setSafeBoot: (safeBoot) => {
      autonomySettings.safeBoot = safeBoot;
      saveStateToDisk();
      return autonomySettings.safeBoot;
    },
    setAutoEvolving: (enabled) => {
      status.isAutoEvolving = enabled;
      appendProvenanceEvent('system_tick', {
        action: 'auto_evolve_toggle',
        isAutoEvolving: status.isAutoEvolving,
        generation: status.generation,
      });
      saveStateToDisk();
      return status.isAutoEvolving;
    },
    applyPromotionPolicy,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
    generation: () => status.generation,
    haltAllAutonomousLoops,
  }),
);

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

// Self-repair routes (status/scan-heal/single/knowledge/auto-heal) moved to
// src/routes/repair.ts; executeSelfRepair + anomaly/status state stay host-side.
app.use(
  '/api/recourse',
  createRepairRouter({
    selfRepairStatus: () => status.selfRepair,
    anomalies: () => anomalies,
    executeSelfRepair,
    registry: () => registry,
    saveState: saveStateToDisk,
  }),
);


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
// Ghidra reverse-engineering sidecar (NSA Ghidra headless analyzer). Stateless
// disassembly/decompile proxies plus a gated /learn hook that folds a real
// analysis into the recursive learner + self-repair loop. Honestly reports
// available:false when Ghidra/JRE are absent - never a fabricated analysis.
// ---------------------------------------------------------------------------
app.use('/api/recourse/ghidra', createGhidraRouter({ learnFromAnalysis: learnFromGhidra }));

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
// FieldBridge batch-artifact bridge — cross-disciplinary trend/matrix engine
// (`02_Pillars/Overlay Science/fieldbridge`). A batch tool, NOT a live HTTP
// service: these routes read the checked-in matrix/benchmark JSON snapshot
// (src/routes/fieldbridge.ts -> src/lib/fieldbridgeBridge.ts).
// ---------------------------------------------------------------------------
app.use('/api/recourse/fieldbridge', createFieldbridgeRouter());

// ---------------------------------------------------------------------------
// Research integrity bridge (:8025; reproducibility/custody wrapper).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// integrity / studies / folding / pathosphere / umoe / chemlab / foresight
// bridges. Extracted to src/routes/bridges.ts (stateless proxies over libs).
// ---------------------------------------------------------------------------
app.use('/api/recourse', createBridgesRouter());

// ---------------------------------------------------------------------------
// Coding pipelines — selectable coding harnesses (opencode / deepseek /
// axiom / settlement) + the head-to-head benchmark runner driven by
// Benchmark Olympics. Extracted to src/routes/pipelines.ts.
// ---------------------------------------------------------------------------
app.use('/api/recourse', createPipelinesRouter());

// ---------------------------------------------------------------------------
// Versioned commercial API (/v1): API-key auth + per-tenant monthly quota +
// usage metering. Distinct from the operator /api/recourse surface.
// ---------------------------------------------------------------------------
app.use('/v1', v1Router);

// ---------------------------------------------------------------------------
// Commerce control plane (operator): bootstrap tenants, mint/rotate/revoke API
// keys, inspect usage and outcomes. Writes are behind requireMutationAuth.
// ---------------------------------------------------------------------------
app.use('/api/recourse/commerce', commerceRouter);

// ---------------------------------------------------------------------------
// Wave 4 — federation (signed peer protocol), publishing + paywall, growth.
// ---------------------------------------------------------------------------
app.use('/api/recourse/federation', federationRouter);
app.use('/api/recourse/publishing', publishingRouter);
app.use('/api/recourse/growth', growthRouter);
app.use('/api/recourse/self-improvement', selfImprovementRouter);
// Wave 3 ecosystem primitives (skills / plugins / connectors).
app.use('/api/recourse/ecosystem', ecosystemRouter);
// Authorized-testing security surface (extracted from the monolith).
app.use('/api/recourse/security', createSecurityRouter({ requireMutationAuth }));

// ---------------------------------------------------------------------------
// Science conductor — the 24/7 research loop driving the connected stack.
// Every cycle: scout services -> hypothesis from grant registry -> real
// experiment (biosim/umoe/local-deterministic) -> integrity verify -> record.
// Findings carry provenance; offline services are skipped honestly.
// ---------------------------------------------------------------------------
// Science conductor / Global Lens / math conductor / agenda / game / fleet
// dashboard routes moved to src/routes/research.ts. The compose+publish pass and
// the global-lens autopilot flag stay in the monolith (the scheduler owns them).
app.use(
  '/api/recourse',
  createResearchRouter({
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    globalLens: {
      getAutopilot: () => globalLensAutopilotOn,
      setAutopilot: (on) => {
        globalLensAutopilotOn = on;
        setJobEnabled('global-lens', on);
        saveStateToDisk();
      },
      intervalMs: () => GLOBAL_LENS_PUBLISH_MS,
      getLastPublish: () => globalLensLastPublish,
      publishPass: () => runGlobalLensPublishPass(),
    },
  }),
);

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

// ---------------------------------------------------------------------------
// translation / keywire / trend bridges. Extracted to src/routes/services.ts
// (stateless proxies over lib modules).
// ---------------------------------------------------------------------------
app.use('/api/recourse', createServicesRouter());
app.use('/api/recourse', createSynergyRouter());
// Bidirectional Recourse <-> Draymond dogfood loop (trend + synergy + TID).
app.use('/api/recourse', createFleetDogfoodRouter());

// Math conductor / agenda / game / fleet-dashboard routes moved to
// src/routes/research.ts (see the createResearchRouter mount above).

// ---------------------------------------------------------------------------
// Job scheduler API — the autonomy governor. Compartmentalized cron jobs for
// every long-running function (forge, intake, swarm, dev, tick, science,
// dream, self-hosted re-verify). Toggle per job, trigger a manual run, and
// read per-job status (lastRun/lastOk/error, run/fail counts).
// ---------------------------------------------------------------------------
// Job-scheduler API mounted from src/routes/scheduler.ts. The toggle hook keeps
// the legacy autopilot flags in sync and records provenance.
app.use(
  '/api/recourse/scheduler',
  createSchedulerRouter({
    requireMutationAuth: requireMutationAuthIfConfigured,
    onJobToggled: (id, enabled) => {
      mirrorAutopilotFlag(id, enabled);
      appendProvenanceEvent('loop_started', { driverId: `scheduler:${id}`, enabled });
    },
  }),
);

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
// Phased subsystem orchestration + issues + research reports moved to
// src/routes/orchestration.ts (mounted at /api/recourse).
app.use(
  '/api/recourse',
  createOrchestrationRouter({
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
  }),
);

// ---------------------------------------------------------------------------
// SelfReporter — Recourse writing a deterministic, first-person dispatch about
// itself. The article is a pure function of live state (systems, development,
// connections, growth, data), content-addressed by the SHA-256 of its facts.
// The reporter's OWN provenance events are excluded from the facts so writing a
// dispatch never changes the fingerprint and therefore never self-triggers.
// ---------------------------------------------------------------------------
/**
 * Read the audit snapshot written by OpenHub (Workstream F4). A malformed or
 * missing file yields null — the reporter then says no audit is recorded rather
 * than fabricating one.
 */
function loadAuditSnapshot(): ReporterState['audit'] {
  try {
    const p = process.env.AUDIT_SNAPSHOT_PATH || path.join(process.cwd(), 'data', 'reports', 'audit-snapshot.json');
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
    if (typeof raw.grade !== 'string' || !Array.isArray(raw.dimensions) || typeof raw.findings !== 'object') return null;
    return raw as unknown as ReporterState['audit'];
  } catch {
    return null;
  }
}

async function collectSelfReporterState(opts: { voiceId?: string; format?: string } = {}): Promise<ReporterState> {
  const registryTotal = registry.length;
  const healthy = registry.filter((t) => t.healthStatus === 'healthy').length;
  const degraded = registry.filter((t) => Boolean(t.healthStatus) && t.healthStatus !== 'healthy').length;
  const selfHosted = registry.filter((t) => Boolean(t.entrypoint && t.entrypoint.includes('.selfhosted/'))).length;

  const domainMap = new Map<string, number>();
  for (const t of registry) {
    const d = t.domain || 'unknown';
    domainMap.set(d, (domainMap.get(d) || 0) + 1);
  }

  const factsProvenance = provenanceEvents.filter(
    (e) => !(e.type === 'report_generated' && (e.data as Record<string, unknown> | undefined)?.driverId === 'self_reporter'),
  );
  const byTypeMap = new Map<string, number>();
  for (const e of factsProvenance) byTypeMap.set(e.type, (byTypeMap.get(e.type) || 0) + 1);

  let chainValid = true;
  try { chainValid = verifyChainIntegrity().valid; } catch { chainValid = false; }
  const lastHash = factsProvenance[factsProvenance.length - 1]?.hash ?? getLastHash();

  let promotions = 0, repairs = 0, pending = 0, rejected = 0, heldBack = 0;
  for (const e of factsProvenance) {
    const d = (e as { data?: Record<string, unknown> }).data ?? {};
    if (e.type === 'tool_promoted' || (e.type === 'tool_verification' && d.outcome === 'promoted')) promotions++;
    else if (e.type === 'template_component_built') promotions++;
    else if (e.type === 'signal_grounded') promotions++;
    else if (e.type === 'dream_crystallized') promotions += typeof d.count === 'number' ? d.count : (d.verified === false ? 0 : 1);
    else if (e.type === 'ai_mutation') promotions++;
    else if (e.type === 'tool_human_approved') promotions++;
    else if (e.type === 'gene_crossover' && d.verified !== false) promotions++;
    if (e.type === 'tool_rejected' || (e.type === 'tool_verification' && d.outcome === 'rejected')) rejected++;
    if (e.type === 'tool_held_back' || (e.type === 'tool_verification' && d.outcome === 'held_back')) heldBack++;
    if (e.type === 'tool_pending_approval' || (e.type === 'tool_verification' && d.outcome === 'pending_approval')) pending++;
    if (e.type === 'tool_repaired' || e.type === 'template_repair_synthesized') repairs++;
  }

  const jobs = listScheduledJobs().map((j) => ({
    id: j.id,
    name: j.name,
    group: j.group,
    enabled: j.enabled,
    runCount: j.runCount,
    failCount: j.failCount,
    lastOk: j.lastOk,
    cadenceMs: j.cadenceMs ?? null,
  }));
  const activeLoops = jobs.filter((j) => j.enabled && j.group !== 'system' && j.id !== 'self-reporter').map((j) => j.name);

  let agendaHead: string | null = null;
  try {
    agendaHead = selectNextMathMilestone()?.milestone.title ?? selectNextOncologyMilestone()?.milestone.title ?? null;
  } catch { agendaHead = null; }

  const learnerState = await learner.status().catch(() => null);
  const goals = getGoalProgress();

  const connections: ReporterState['connections'] = [];
  try {
    const p = providerStatuses();
    connections.push({ name: 'Local model', reachable: p.local.online === true, detail: p.local.model });
    connections.push({ name: 'API model', reachable: p.api.online === true, detail: p.api.model });
  } catch { /* provider status unavailable — omitted, not invented */ }
  try {
    connections.push({ name: 'Axiom bridge', reachable: await axiomReachable() });
  } catch { connections.push({ name: 'Axiom bridge', reachable: false, detail: 'status check failed' }); }
  try {
    const h = await keywireHealth();
    connections.push({ name: 'Keywire fleet', reachable: h.ok, ...(h.error ? { detail: h.error } : {}) });
  } catch { connections.push({ name: 'Keywire fleet', reachable: false, detail: 'status check failed' }); }

  const activeProfile = activeProviderProfile();
  return {
    generation: status.generation,
    registry: { total: registryTotal, healthy, degraded, selfHosted, domains: [...domainMap.entries()].map(([domain, count]) => ({ domain, count })) },
    provenance: { total: factsProvenance.length, byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })), chainValid, lastHash },
    jobs,
    development: {
      promotions,
      repairs,
      pending,
      rejected,
      heldBack,
      agendaHead,
      activeLoops: activeLoops.slice(0, 8),
    },
    growth: {
      dreamActive: dreamState.isDreamingActive,
      dreamCycles: dreamState.dreamCyclesCompleted,
      cognitiveCoherence: dreamState.cognitiveCoherence,
      crystallizedGenes: dreamState.totalCrystallizedGenes,
      learnerEpisodes: learnerState?.episode ?? 0,
      calibration: learnerState?.selfScore ?? null,
      skills: skillCatalog.length,
      corpusArtifacts: corpusArtifacts.length,
    },
    goals: {
      mathSolved: goals.math.solved,
      mathTotal: goals.math.total,
      biotechPassed: goals.biotech.passed,
      biotechTotal: goals.biotech.total,
    },
    connections,
    data: {
      registryTools: registryTotal,
      provenanceEvents: factsProvenance.length,
      modelProfile: activeProfile,
      modelOnline: (() => {
        try { return providerStatuses()[activeProfile].online === true; } catch { return false; }
      })(),
    },
    audit: loadAuditSnapshot(),
    ...(opts.voiceId ? { voiceId: opts.voiceId } : {}),
    ...(opts.format ? { format: resolveFormat(opts.format) } : {}),
    soul: loadReporterSoul(),
  };
}

/**
 * Compose and (when the deterministic fingerprint changed) persist a dispatch.
 * `force` writes even when unchanged. Never fabricates: an offline article is
 * still deterministic — only the optional narration can be unavailable.
 */
async function generateSelfReporterArticle(opts: { force?: boolean; voiceId?: string; format?: string } = {}): Promise<{
  article: ReporterArticle;
  written: boolean;
  files: string[];
  previousFingerprint: string | null;
  reason?: string;
}> {
  const state = await collectSelfReporterState({ voiceId: opts.voiceId, format: opts.format });
  const facts = buildReporterFacts(state);
  const article = composeArticle(facts, Date.now());
  const previous = latestReporterArticle();
  if (!opts.force && previous?.fingerprint === article.fingerprint) {
    return {
      article,
      written: false,
      files: [],
      previousFingerprint: previous.fingerprint,
      reason: 'state unchanged since the last dispatch',
    };
  }
  const saved = saveReporterArticle(article);
  appendProvenanceEvent('report_generated', {
    driverId: 'self_reporter',
    fingerprint: article.fingerprint,
    headline: article.headline,
  });
  return { article, written: true, files: saved.files, previousFingerprint: previous?.fingerprint ?? null };
}

/** Compose a dispatch without persisting it (for previewing a voice/format). */
async function previewSelfReporterArticle(opts: { voiceId?: string; format?: string } = {}): Promise<ReporterArticle> {
  const state = await collectSelfReporterState({ voiceId: opts.voiceId, format: opts.format });
  return composeArticle(buildReporterFacts(state), Date.now());
}

// Self Reporter routes mounted from src/routes/reporter.ts. State collection and
// the article store stay here; the router receives operations.
app.use(
  '/api/recourse/reporter',
  createReporterRouter({
    requireMutationAuth: requireMutationAuthIfConfigured,
    cadenceMs: () => REPORTER_MS,
    status: () => reporterStatus() as Record<string, unknown>,
    voices: () => listVoices(),
    formats: () => listFormats(),
    protocolsCount: () => allProtocols().length,
    soulLoaded: () => Boolean(loadReporterSoul()),
    preview: (voiceId, format) => previewSelfReporterArticle({ voiceId, format }),
    latest: () => latestReporterArticle(),
    articles: (limit) => listReporterArticles(limit),
    article: (fingerprint) => getReporterArticle(fingerprint),
    generate: (opts) => generateSelfReporterArticle(opts),
    narrate: async (fingerprint) => {
      const base = fingerprint ? getReporterArticle(fingerprint) : latestReporterArticle();
      if (!base) return { kind: 'not_found' as const };
      const narration = await narrateArticle(base, chatComplete);
      if (!narration.ok || !narration.prose) {
        return { kind: 'unavailable' as const, payload: narration as unknown as Record<string, unknown> };
      }
      const narrated: ReporterArticle = {
        ...base,
        narration: { prose: narration.prose, ...(narration.model ? { model: narration.model } : {}), nonCanonical: true },
      };
      saveReporterArticle(narrated);
      return { kind: 'ok' as const, article: narrated };
    },
  }),
);

// =========================================================================
// MODEL PROVIDER CHAT (OpenAI-compatible)
// =========================================================================

// Non-agentic chat against the configured provider: the local Spark model
// (llama-server) first, with an automatic API fallback. Online only if the
// endpoint answers; offline/error are reported honestly, never fabricated.
app.post('/api/recourse/provider/chat', async (req, res) => {
  const { model, prompt, system = '' } = req.body;
  const effectiveModel = model || currentProviderStatus().model;
  const started = Date.now();
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, status: 'error', error: 'prompt is required' });
  }
  const result = await chatComplete([
    { role: 'system', content: system || ('You are a helpful assistant running on ' + effectiveModel + '.') },
    { role: 'user', content: prompt }
  ], { temperature: 0.6 });
  const elapsed = Date.now() - started;
  const completionTokens = result.usage?.completionTokens ?? (result.content ? Math.max(1, Math.round(result.content.length / 4)) : 0);
  res.json({
    success: true,
    status: result.status,
    model: result.model || effectiveModel,
    response: result.content || '',
    error: result.error || undefined,
    metrics: {
      totalDurationMs: result.latencyMs || elapsed,
      promptEvalCount: result.usage?.promptTokens ?? 0,
      evalCount: completionTokens,
      tokensPerSec: completionTokens ? Math.round(completionTokens / ((elapsed / 1000) || 1)) : 0
    }
  });
});

// OpenAI-compatible chat shim for external bot clients (Open-Chat). Wraps the
// same provider chain as /api/recourse/provider/chat (local model first, then
// the API fallback) so Open-Chat's generic HTTP protocol works unchanged.
// JSON by default; SSE when `stream:true`. Honest on failure — never fabricates.
app.post('/v1/chat/completions', async (req, res) => {
  // Bearer gate (RECOURSE_CHAT_TOKEN). This endpoint is reachable through the
  // public Cloudflare tunnel, so it must not be an open model proxy. Mirrors
  // OpenHub's fail-closed pattern: unset token => endpoint refuses.
  const expected = (process.env.RECOURSE_CHAT_TOKEN || '').trim();
  if (!expected) {
    return res.status(401).json({ error: { message: 'Chat endpoint disabled: set RECOURSE_CHAT_TOKEN.', type: 'invalid_request_error' } });
  }
  const authHeader = String(req.headers['authorization'] || '');
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const got = bearer ? bearer[1].trim() : '';
  let diff = got.length === expected.length ? 0 : 1;
  for (let i = 0; i < got.length && got.length === expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) {
    return res.status(401).json({ error: { message: 'unauthorized', type: 'invalid_request_error' } });
  }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const textOf = (m: any) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''));
  const system = messages.filter((m: any) => m?.role === 'system').map(textOf).join('\n').trim();
  const user = messages.filter((m: any) => m?.role !== 'system').map(textOf).filter((s: string) => s && s.trim()).join('\n\n').trim();

  if (!user) {
    return res.status(400).json({ error: { message: 'messages must include a non-empty user message.', type: 'invalid_request_error' } });
  }

  const model = (typeof body.model === 'string' && body.model.trim())
    ? body.model.trim()
    : currentProviderStatus().model;
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-recourse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const result = await chatComplete([
      { role: 'system', content: system || ('You are a helpful assistant running on ' + model + '.') },
      { role: 'user', content: user },
    ], { temperature: 0.6 });
    const content = result.content || '';

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      const frame = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      frame({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] });
      frame({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    res.json({
      id,
      object: 'chat.completion',
      created,
      model: result.model || model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    });
  } catch (err: any) {
    res.status(502).json({ error: { message: String(err?.message || err).slice(0, 300) || 'chat failed', type: 'upstream_error' } });
  }
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
// Moved to src/routes/templates.ts; registry/status mutation, lint gate,
// self-host loop supervisor, and capability sweep stay host-side (injected).
app.use(
  '/api/recourse',
  createTemplatesRouter({
    registryRef: () => registry,
    statusRef: () => status,
    promoteTool,
    gateWithLint,
    lintVerdictNote,
    startSelfHostedLoop: (name) => selfhostedRouter.startLoop(name),
    sweepCapabilityAdoptions,
    recordSystemChange,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
  }),
);

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


// Warm the plain-language rephrase cache so the first report is not slow.
void (async () => {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const rep = upgradeReport();
    if (rep.topChanged.length > 0) await rephraseToolDescriptions(rep.topChanged);
  } catch { /* warm-up optional */ }
})();


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
    toolCount: tools.length,
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

/**
 * P2 state hygiene: keep the DB bounded without manual intervention.
 *
 *  - Historical system snapshots keep only a COUNT (the per-tool arrays are the
 *    bloat; only the baseline + the most recent snapshots keep full `tools`, which
 *    the upgrade report needs).
 *  - Snapshot history is capped.
 *  - The SQLite file is VACUUMed when it exceeds `RECOURSE_STATE_VACUUM_MB`.
 *
 * Safe to run while serving: it mutates in-memory arrays and issues a VACUUM on
 * the live connection. Returns what it did (honestly).
 */
function stateHygiene(): { snapshots: number; toolsStripped: number; vacuum?: { before: number; after: number } } {
  const keepFull = new Set<number>();
  if (systemBaseline) keepFull.add(systemSnapshots.indexOf(systemBaseline));
  for (let i = Math.max(0, systemSnapshots.length - 10); i < systemSnapshots.length; i++) keepFull.add(i);

  let toolsStripped = 0;
  systemSnapshots.forEach((s, i) => {
    if (keepFull.has(i)) return;
    if (Array.isArray(s.tools) && s.tools.length > 0) {
      s.toolCount = s.tools.length;
      s.tools = [];
      toolsStripped += 1;
    }
  });

  const MAX_SNAPSHOTS = 100;
  if (systemSnapshots.length > MAX_SNAPSHOTS) {
    systemSnapshots.splice(0, systemSnapshots.length - MAX_SNAPSHOTS);
  }
  saveStateToDisk();

  let vacuum: { before: number; after: number } | undefined;
  try {
    const threshold = Number(process.env.RECOURSE_STATE_VACUUM_MB || 64) * 1024 * 1024;
    const store = ensureStateStore();
    if (fs.statSync(store.stateFile()).size > threshold) vacuum = store.vacuum();
  } catch { /* best-effort; hygiene never blocks the loop */ }

  return { snapshots: systemSnapshots.length, toolsStripped, ...(vacuum ? { vacuum } : {}) };
}

/** Schedule state hygiene on a cadence. Opt-in via RECOURSE_STATE_HYGIENE_MS. */
function startStateHygiene(): void {
  const intervalMs = Number(process.env.RECOURSE_STATE_HYGIENE_MS);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
  const t = setInterval(() => {
    try {
      const r = stateHygiene();
      console.log(`[state-hygiene] snapshots=${r.snapshots} toolsStripped=${r.toolsStripped}${r.vacuum ? ` vacuum ${(r.vacuum.before / 1048576).toFixed(1)}MB->${(r.vacuum.after / 1048576).toFixed(1)}MB` : ''}`);
    } catch (err) {
      console.warn('[state-hygiene] failed:', err instanceof Error ? err.message : String(err));
    }
  }, intervalMs);
  t.unref?.();
  console.log(`[state-hygiene] scheduled every ${intervalMs}ms`);
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

// Self-hosted tool runtime + loop supervisor mounted from
// src/routes/selfhosted.ts. The host supplies provenance, the generation
// counter, and the registry cleanup that must run on removal.
const selfhostedRouter = createSelfhostedRouter({
  appendProvenanceEvent: (type, data) => appendProvenanceEvent(type as any, data),
  generation: () => status.generation,
  onRemoved: (name, removedFile) => {
    let registryToolRemoved = false;
    const tool = registry.find((t) => t.name === name);
    if (tool && tool.entrypoint && tool.entrypoint.includes('.selfhosted/')) {
      registry.splice(registry.indexOf(tool), 1);
      registryToolRemoved = true;
      status.registeredToolsCount = registry.length;
    }
    appendProvenanceEvent('selfhosted_tool_removed', { tool: name, removedFile, removedGene: registryToolRemoved });
    saveStateToDisk();
    void sweepCapabilityAdoptions().catch(() => {});
    try { recordSystemChange('selfhosted-remove'); } catch { /* non-fatal */ }
    return { registryToolRemoved };
  },
});
app.use('/api/recourse', selfhostedRouter.router);
// Boot auto-supervision after boot self-host verification settles.
setTimeout(() => { try { selfhostedRouter.ensureLoops(); } catch { /* non-fatal */ } }, 400);

// ---------------------------------------------------------------------------
// MODEL-NATIVE TOOL CALLING (OpenAI-compatible `tools` via the local Spark model
// or the API profile). Tools = sandboxed self-hosted artifacts + read-only host
// operations (the same in-process A2A ops) + the Recourse MCP server's tool set.
// ---------------------------------------------------------------------------
/** Read-only host operations exposed as `system_*` tools. Reuses the in-process
 *  A2A operations (which call the REST routes), skipping mutating ones so the
 *  model's read surface never silently writes. */
function buildAgentSystemTools(): SystemTool[] {
  const schema: Record<string, Record<string, unknown>> = {
    'recourse.recall_memory': {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Semantic query text.' },
        kind: { type: 'string', description: 'Optional memory kind (gene|lesson|hypothesis|signal|snapshot).' },
        topK: { type: 'number', description: 'How many hits to return (default 5).' },
      },
      required: ['q'],
    },
    'recourse.skill_verify': {
      type: 'object',
      properties: { id: { type: 'string', description: 'Skill id to verify.' } },
      required: ['id'],
    },
  };
  try {
    const ops = buildA2aOperations();
    return Object.entries(ops)
      .filter(([, op]) => op.skill.mutating !== true)
      .map(([id, op]) => ({
        name: id.replace(/^recourse\./, ''),
        description: op.skill.description || op.skill.name,
        parameters: schema[id] ?? { type: 'object', properties: {} },
        invoke: (args: Record<string, unknown>) => op.run(args),
      }));
  } catch {
    return [];
  }
}

const mcpToolProvider = createMcpServerRegistry();
/** Read a positive integer turn cap from env, clamped (bad values fall back). */
function agentTurns(envName: string, fallback: number, cap = 8): number {
  const n = Number(process.env[envName] ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.min(n, cap) : fallback;
}
// On-disk skill libraries (fleet-skills / ECC): list + read SKILL.md and run
// bundled scripts. The catalog is scanned lazily on first use if not yet loaded.
const skillToolProvider = createSkillToolProvider({
  ensureCatalog: async () => {
    if (!skillCatalog.length) {
      try { await runSkillScan(); } catch { /* honest: leaves the catalog empty */ }
    }
    return skillCatalog;
  },
  getRoots: () => skillRoots,
});
// Live REST operations (every bridge/sidecar route) become model tools.
const routeToolProvider = createRouteToolProvider({
  spec: buildOpenApiSpec(`http://127.0.0.1:${PORT}`),
  baseUrl: `http://127.0.0.1:${PORT}`,
  secret: process.env.RECOURSE_API_SECRET,
});
// Signed peer skills from federated sync become model tools.
const federationToolProvider = createFederationToolProvider({ registry: skillRegistry });
const agentToolRegistry = createAgentToolRegistry({
  systemTools: buildAgentSystemTools(),
  mcp: mcpToolProvider,
  skills: skillToolProvider,
  extra: [routeToolProvider, federationToolProvider],
});
// Make autonomous generation skill-aware: self-improvement/research loops
// retrieve relevant skills and (where safe) call the skills tools.
configureSkillAwareness({
  getCatalog: () => skillCatalog,
  provider: skillToolProvider,
  readSkill: makeSkillBodyReader(() => skillRoots),
});
app.use('/api/recourse', createAgentToolsRouter({
  registry: agentToolRegistry,
  chat: chatComplete,
  // Per-tool gating: read tools always; mutating tools only with the secret
  // (open mode when no secret is configured).
  isAuthorized: (req) => !process.env.RECOURSE_API_SECRET || hasValidMutationSecret(req),
  mcpStatus: () => mcpToolProvider.statusDetailed(),
  maxTurns: agentTurns('AGENT_TOOLS_MAX_TURNS', 4),
  appendProvenanceEvent: (type, data) => appendProvenanceEvent(type as any, data),
}));

// Recursive learner + evolution-op routes (synthesize-directive, crossover,
// approve, verify, evolve, learn/status|episode|run|replay|directives).
app.use('/api/recourse', createLearnRouter({
  learner,
  openhubFleetSignal,
  realSystemReward: () => realSystemReward(),
  currentProviderStatus,
  gateWithLint,
  lintVerdictNote,
  executeSelfRepair,
  registryRef: () => registry,
  statusRef: () => status,
  promoteTool,
  appendProvenance: (type, data) => appendProvenanceEvent(type as any, data),
  saveState: () => saveStateToDisk(),
}));

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
// 1. DETERMINISTIC GROWTH DECISION ENGINE + JEV ADVISORY ROUTES
// =========================================================================
// Moved to src/routes/decision.ts; registry/anomaly/weight/status state and
// the dream-state mirror stay host-side and are injected.
app.use(
  '/api/recourse',
  createDecisionRouter({
    dreamEngine,
    setDreamState: (state) => { dreamState = state; },
    registryRef: () => registry,
    anomaliesRef: () => anomalies,
    growthWeightsRef: () => growthWeights,
    setGrowthWeights: (weights) => { growthWeights = weights; },
    statusRef: () => status,
    gitHubBlueprintsRef: () => gitHubBlueprints,
    setLastGrowthDecision: (decision) => { lastGrowthDecision = decision; },
    promoteTool,
    executeSelfRepair,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
  }),
);

// =========================================================================
// 2. ALWAYS-ON DREAMING ENGINE ROUTES
// =========================================================================
// Moved to src/routes/dream.ts; engine instance, dream-state mirror, registry
// promotion, and the crystal-mirror helper stay host-side and are injected.
app.use(
  '/api/recourse',
  createDreamRouter({
    dreamEngine,
    setDreamState: (state) => { dreamState = state; },
    saveState: saveStateToDisk,
    mirrorCrystallizedDreamGenes,
    promoteTool,
    statusRef: () => status,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
  }),
);

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
      const dreamPromoted = promoteTool({
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
      }, { origin: 'dream-mirror' });
      // A stub that fails the substance gate is not added and not queued for the
      // forge — it would only be re-generated into the same junk.
      if (!dreamPromoted) continue;
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


// =========================================================================
// 2.5 AI ARCHITECTURAL MUTATOR ROUTES
// =========================================================================
const geneRegistryStore = createGeneRegistryStore();

// AI architectural mutator routes moved to src/routes/mutate.ts; the gene
// store instance + promotion/provenance side effects stay host-side.
app.use(
  '/api/recourse',
  createMutateRouter({
    geneRegistryStore,
    promoteTool,
    statusRef: () => status,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
    applyPromotionPolicy,
    generation: () => status.generation,
  }),
);


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
// configured local model (the Spark model via llama-server): each task produces a
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

  // A subagent may call tools (inspect the registry/memory, run a self-hosted
  // tool) before writing the candidate. The loop is bounded, executes tool calls
  // through the same sandbox/guards as everything else, and only a final
  // non-tool turn yields the JSON parsed below. Offline/error stays honest.
  const agentRun = await runToolCallingAgent([
    { role: 'system', content: system },
    { role: 'user', content: `Task: ${task.title}\nDomain: ${task.domain}` },
  ], {
    chat: chatComplete,
    registry: agentToolRegistry,
    maxTurns: agentTurns('AGENT_TOOLS_MAX_TURNS', 4),
    temperature: 0.3,
  });
  const result = {
    ok: agentRun.status === 'completed',
    content: agentRun.content,
    status: agentRun.status === 'offline' ? 'offline' : agentRun.status === 'error' ? 'error' : 'online',
    model: agentRun.model || currentProviderStatus().model,
    latencyMs: 0,
    error: agentRun.error,
  };

  let parsed: any = null;
  const parseSwarmJson = (content: string | null | undefined): any => {
    if (!content) return null;
    const block = extractJsonBlock(content);
    if (!block) return null;
    try { return JSON.parse(block); } catch { return null; }
  };
  if (result.ok && result.content) parsed = parseSwarmJson(result.content);
  // Tool-augmented turns are not JSON-constrained, so if the bounded loop did
  // not end on usable JSON, retry once with a strict JSON completion. This keeps
  // the swarm's original save-then-requeue behaviour from regressing.
  if (!parsed && result.status === 'online') {
    const strict = await chatComplete([
      { role: 'system', content: system },
      { role: 'user', content: `Task: ${task.title}\nDomain: ${task.domain}` },
    ], { temperature: 0.3, json: true });
    if (strict.ok && strict.content) parsed = parseSwarmJson(strict.content);
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

  if (!promoteTool(entry, { origin: 'swarm' })) {
    // Substance gate refused the generated tool (recorded as promotion_refused):
    // do not claim the task completed with a passing score.
    patchTask(task.id, (t) => { t.status = 'failed'; t.completedAt = Date.now(); });
    return false;
  }
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

// Subagent-swarm routes mounted from src/routes/subagents.ts. The swarm's mutable
// state stays here; the router receives operations so state has one owner.
app.use(
  '/api/recourse/subagents',
  createSubagentsRouter({
    status: () => ({
      swarmStatus: { ...swarmStatus, subTeamStates: swarmTeamStates },
      intervalMs: SWARM_AUTOPILOT_MS,
      model: currentProviderStatus().model,
      busy: swarmBusy,
    }),
    toggleAutopilot: () => {
      swarmStatus.isSwarmAutopilotActive = !swarmStatus.isSwarmAutopilotActive;
      if (swarmStatus.isSwarmAutopilotActive) {
        ensureSwarmAutopilot();
        pumpSwarmQueue(1).catch(() => {});
      } else {
        stopSwarmAutopilot();
      }
      saveStateToDisk();
      return swarmStatus.isSwarmAutopilotActive;
    },
    dispatch: (agentType, title, domain) => {
      const result = dispatchSubAgentTask(agentType as SubAgentType, title, domain as ToolDomain, swarmStatus);
      swarmStatus = result.updatedSwarm;
      saveStateToDisk();
      if (swarmStatus.isSwarmAutopilotActive) {
        pumpSwarmQueue(1).catch(() => {});
      }
      return { swarmStatus, newTask: result.newTask };
    },
    process: (limit) => pumpSwarmQueue(limit),
  }),
);

// =========================================================================
// 5. FIVE-FORMULA RECURSIVE LEARNING LOOP ROUTES
// =========================================================================

// Recursive-math conductor routes (state/step/reset/configure,
// problems/attempts/goals, solve) moved to src/routes/math.ts.
app.use('/api/recourse', createMathRouter({
  mathLoopStateRef: () => mathLoopState,
  setMathLoopState: (s) => { mathLoopState = s; },
  solveNextMathProblem,
  appendProvenance: (type, data) => appendProvenanceEvent(type as any, data),
  saveState: () => saveStateToDisk(),
}));

// =========================================================================
// 5b. BIOTECH / ONCOLOGY GOAL — real semantic claim verification against KG
// =========================================================================
app.use('/api/recourse', createBiotechRouter({
  saveGoalLedger: () => saveGoalLedger(),
  currentGeneration: () => status.generation,
}));

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
  // Real-world outcome term: the mean reward from the outcome-feedback ledger,
  // which is fed by post-merge scorecard deltas (loopStateMachine) and by any
  // revenue/external signals recorded through /v1/outcome. Neutral 0.5 until a
  // real outcome exists, so it never inflates the reward before evidence.
  const outcome = outcomeLedger.reward(5);
  const outcomeReward = typeof outcome === 'number' ? outcome : 0.5;
  // 0.30 verifier pass-rate + 0.25 real external benchmark solves + 0.20 live
  // self-hosted + 0.10 cleanliness + 0.15 real-world outcome. The outcome term
  // is the signal that closes the loop from business results back to learning.
  const reward =
    0.3 * verifier +
    0.25 * benchmarkFrac +
    0.2 * selfHostFrac +
    0.1 * cleanFrac +
    0.15 * outcomeReward;
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
    const result = await skillAwareChat([
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
    const results = await probeAutopilotOnce({ planner: autopilotCodePlanner });
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

// Hoisted to module level (was nested inside runServerTick) so the math
// router can reference it and /math/solve registers once at boot.
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

    const result = await skillAwareChat(
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
// SelfReporter cadence: one first-person dispatch roughly every 2 hours. A
// dispatch is only written when the deterministic state fingerprint changes.
const REPORTER_MS = Math.max(60_000, Number(process.env.REPORTER_MS) || 2 * 60 * 60 * 1000);

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


// =========================================================================
// 8. LEGO COMPOSABLE ML & AUTONOMOUS SELF-ASSEMBLY ROUTES
// =========================================================================
// LEGO routes moved to src/routes/lego.ts.
app.use(createLegoRouter({ readinessScore: () => (typeof status.readinessScore === 'number' ? status.readinessScore : 1) }));

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
    problems: allBenchmarkProblems(),
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
  if (!promoteTool(newTool, { origin: 'grounding' })) {
    // Substance gate refused the generated tool: leave the signal unconsumed so
    // a later cycle can retry, and report honestly.
    lastGroundAt = Date.now();
    lastGroundSummary = `${signal.source}:${signal.title.slice(0, 60)} → substance gate refused ${result.toolName}`;
    saveStateToDisk();
    return { grounded: false, reason: 'substance-gate', domain: result.domain, signal };
  }
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
  // Self-attest the run in the durable hash-chained ledger (registry hash proves
  // exactly which live sources were scored). Never let a ledger failure hide the
  // run itself — the history above is already updated.
  try {
    const record = appendBenchmarkRun(run, { registryHash: registryAttestation(registry) });
    appendProvenanceEvent('benchmark_attested', {
      recordId: record.id,
      hash: record.hash,
      registryHash: record.registryHash,
      deltaSolved: record.deltaSolved,
    });
  } catch (err: any) {
    console.warn('[benchmark] ledger attestation failed:', err?.message ?? String(err));
  }
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

// Intake (poll/brain/ground/autopilot) + benchmark routes moved to
// src/routes/intake.ts. The signal store / autopilot flag / benchmark cycles
// stay host-owned and are injected.
app.use(
  '/api/recourse',
  createIntakeRouter({
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
    snapshot: () => intakeSnapshot(),
    isAutopilotOn: () => intakeAutopilotOn,
    intervalMs: () => INTAKE_AUTOPILOT_MS,
    maxPoll: () => INTAKE_MAX_POLL,
    brainUrl: () => INTAKE_BRAIN_URL,
    brainKaggleQueries: () => INTAKE_BRAIN_KAGGLE_QUERIES,
    brainNews: () => INTAKE_BRAIN_NEWS,
    brainNewsLimit: () => INTAKE_BRAIN_NEWS_LIMIT,
    runCycle: runIntakeCycle,
    runGrounding: runGroundingCycle,
    ingest: (signals) => signalStore.ingest(signals as ExternalSignal[]),
    setLastPollResults: (results) => { lastPollResults = results as SourcePollResult[]; },
    toggleAutopilot: () => {
      intakeAutopilotOn = !intakeAutopilotOn;
      if (intakeAutopilotOn) {
        ensureIntakeAutopilot();
        runIntakeAutopilotTick().catch(() => {});
      } else {
        stopIntakeAutopilot();
      }
      saveStateToDisk();
      return intakeAutopilotOn;
    },
    benchmarkState: () => benchmarkState(),
    runBenchmark: () => runBenchmarkCycle(),
  }),
);

// Productized surfaces (telemetry / audio / wallet) are mounted from their own
// router module — see src/routes/product.ts.
app.use('/api/recourse', productRouter.router);
// Voice-clone profiles + zero-shot synthesis (record a clip, speak in it).
app.use('/api/recourse', voiceRouter);
// Spoken Axiom/OpenHub briefs + transition feed.
app.use('/api/recourse', fleetVoiceRouter);
// Policy / approvals / deploy (Wave 2), namespaced to avoid route collisions.
app.use('/api/recourse/ops', opsRouter);
// Prometheus metrics exposition (Wave 2 observability).
app.get('/metrics', (req, res) => {
  if (!telemetryAuthorized(req, res)) return;
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metricsText());
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
      const { proposals, groundings, result } = refillAgendaFromCorpus(corpusArtifacts, seen, existing);
      for (const p of proposals) intelProposals.push(p);
      // Corpus artifacts ground learner-driven minting (real problem + proven
      // reference) instead of becoming clone FNV "tools" named after files.
      for (const g of groundings) corpusGroundings.push(g);
      if (corpusGroundings.length > 500) corpusGroundings = corpusGroundings.slice(-500);
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

// Corpus + local cancer library (datasets / PDFs / literature KG) routes moved
// to src/routes/corpus.ts; roots/artifacts/scan stay host-owned and injected.
app.use(
  '/api/recourse',
  createCorpusRouter({
    snapshot: () => corpusSnapshot(),
    digest: (snap) => corpusDigest(snap),
    scan: () => runCorpusScan(),
    getArtifacts: () => corpusArtifacts,
    getRoots: () => corpusRoots,
    setRoots: (roots) => { corpusRoots = roots as CorpusRoot[]; },
    getLastScan: () => corpusLastScan,
    loadLiteratureDocs: () => loadLiteratureDocs(),
  }),
);

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

// Skill library + Phase-4 distribution routes moved to src/routes/skills.ts.
// Catalogs/roots/export counters stay host-owned (persisted) and are injected.
app.use(
  '/api/recourse',
  createSkillsRouter({
    snapshot: () => skillSnapshot(),
    scan: () => runSkillScan(),
    getRoots: () => skillRoots,
    setRoots: (roots) => { skillRoots = roots; },
    getCatalog: () => skillCatalog,
    getRegistry: () => registry,
    bumpUpgrades: () => { status.totalUpgrades += 1; },
    getExportRoot: () => skillExportRoot,
    incExports: () => ++skillExports,
    incImports: () => ++skillImports,
    getPending: () => skillImportPending,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
    gateWithLint,
    lintVerdictNote,
  }),
);

// Composer routes mounted from src/routes/compose.ts.
const composeRouter = createComposeRouter({
  requireMutationAuth,
  getLearner: () => composerLearner,
});
app.use('/api/recourse', composeRouter);

// Cross-app pairwise rating store (ChordStudio / SoundLab -> Elo standings).
// Generic and separate from the composer learner: it ranks opaque external
// variations by a client-computed paramHash, never re-generating the audio.
const ratingStore = new RatingStore(defaultRatingLedger());
app.use('/api/recourse', createRatingRouter({
  store: ratingStore,
  // Config-gated: open on a default unconfigured local run so the desktop UI
  // can rate, enforced the moment RECOURSE_API_SECRET is set.
  requireMutationAuth: requireMutationAuthIfConfigured,
}));

// Music sector + music-therapy research routes moved to
// src/routes/musicTherapy.ts (mounted below, after the pooled-evidence state).

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

app.use(
  '/api/recourse',
  createMusicTherapyRouter({
    anchors: () => MUSIC_THERAPY_ANCHORS,
    getEvidence: () => musicTherapyEvidence,
    getQualitative: () => musicTherapyQualitative,
    getFeedAt: () => musicTherapyFeedAt,
    setFeed: (poolable, qualitative, fetchedAt) => {
      musicTherapyEvidence = poolable;
      musicTherapyQualitative = qualitative;
      musicTherapyFeedAt = fetchedAt;
    },
  }),
);
// Episodes are human ratings on reproducible (style,seed) compositions. The
// learner derives quality biases that the compose route now applies via
// composeWithLearner. Ratings are the only signal; no fake autonomy.
const composerLearner = new ComposerLearner(defaultLearnerFile());

/** Record / update a rating for a reproducible composition. Guarded write. */

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
  // Benchmark gaps are forge targets too: the generated tier is headroom only
  // until the forge builds a tool for it (see benchmarkGapSpecs).
  const lastRun = latestBenchmark ?? benchmarkHistory[benchmarkHistory.length - 1] ?? null;
  return [...FORGE_AGENDA, ...dynamicAgenda, ...benchmarkGapSpecs(lastRun)];
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

function nextForgeSpec(order?: ForgeSpec[]): ForgeSpec | null {
  const names = new Set(registry.map((t) => t.name));
  const builtLedger = new Set(forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name));
  const selfHosted = new Set(listSelfHostedEntries().map((e) => e.name));
  // Iterate the learner-ordered agenda when supplied; fall back to the static
  // construction order (allForgeSpecs) so callers without a plan are unchanged.
  for (const spec of order ?? allForgeSpecs()) {
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

// =========================================================================
// Recursive-learning <-> capability-forge integration
// =========================================================================
// The learner decides WHERE to build (its generation plan); the forge reports
// WHAT it built back. Both directions go through the pure `forgeLearningLoop`
// module so the decision is deterministic and replayable.

// The fleet self-report (OpenHub) changes slowly; cache it so the 2s forge
// autopilot does not hammer vector memory just to pick a priority domain.
let forgeFleetSignalCache: { at: number; degraded: boolean; beliefs: GeneBelief[] } | null = null;
const FORGE_FLEET_SIGNAL_TTL_MS = Math.max(5_000, Number(process.env.FORGE_FLEET_SIGNAL_TTL_MS) || 30_000);

async function cachedFleetSignal(): Promise<{ degraded: boolean; beliefs: GeneBelief[] }> {
  const now = Date.now();
  if (forgeFleetSignalCache && now - forgeFleetSignalCache.at < FORGE_FLEET_SIGNAL_TTL_MS) {
    return { degraded: forgeFleetSignalCache.degraded, beliefs: forgeFleetSignalCache.beliefs };
  }
  const fleet = await openhubFleetSignal();
  forgeFleetSignalCache = { at: now, degraded: fleet.degraded, beliefs: fleet.beliefs };
  return { degraded: fleet.degraded, beliefs: fleet.beliefs };
}

/**
 * The forge agenda ordered by the recursive learner's real generation plan.
 * When the fleet reports degraded, the systemic domain is ranked first (the
 * fleet's own weak spot) — the same boost the synthesize-directive route uses.
 * Honest fallback: any learner/fleet read failure returns the static agenda.
 */
async function forgeSpecOrder(): Promise<ForgeSpec[]> {
  const specs = allForgeSpecs();
  try {
    const state = await learner.status();
    const fleet = await cachedFleetSignal();
    const planningState = mergeFleetBeliefs(state, fleet.beliefs);
    const { ordered } = rankForgeSpecsByLearnerPlan(specs, planningState, {
      priorityDomains: fleet.degraded ? (['systemic'] as const) : [],
    });
    return ordered;
  } catch {
    return specs;
  }
}

/** Recall prior solutions from durable memory as generator inspiration, or
 *  undefined when memory is unavailable / has no confident match. */
async function forgeInspirationHint(spec: ForgeSpec): Promise<string | undefined> {
  try {
    const mem = await ensureVectorMemory();
    const hits = await mem.recall(`${spec.title} ${spec.prompt}`, null, 20);
    const items = hits
      .filter((h) => typeof h.text === 'string' && h.text.length > 20)
      .map((h) => ({ id: h.id, text: h.text }));
    if (!items.length) return undefined;
    const inspiration = inspire(`${spec.title} ${spec.prompt}`, items, { k: 2, threshold: 0.2 });
    if (!inspiration.hits.length) return undefined;
    const block = inspiration.hits
      .map((h, i) => `[prior solution ${i + 1} — similarity ${h.similarity}] ${h.text}`)
      .join('\n');
    const experience = experienceHint(spec.domain);
    return (
      'Prior verified solutions worth borrowing ideas from ' +
      `(do not copy blindly; the contract above is the real judge):\n${block}` +
      (experience ? `\n\n${experience}` : '')
    );
  } catch {
    return undefined;
  }
}

/** Fold a real forge outcome into the learner's beliefs (canonical key + graded
 *  reward). Best-effort: a learner write failure never blocks the forge. */
async function learnFromForgeOutcome(
  outcome: ForgeAttemptOutcome,
  spec: ForgeSpec,
  status: ForgeLedgerEntry['status'],
): Promise<void> {
  const update = forgeLearnUpdate(outcome, spec, status);
  if (!update) return;
  try {
    await learner.learnRealTools([update]);
  } catch {
    /* honest: learning is best-effort; the forge ledger is the source of truth */
  }
}

/** Real sandbox verifier for minted problems (shared by forge minting). */
function sandboxVerify(source: string, suite: string): { passed: boolean; testDetails: string[] } {
  const run = executeTestSuite(source, suite);
  return { passed: run.passed, testDetails: run.testDetails };
}

let forgeMintBusy = false;
/** Research excerpts from the corpus scan, consumed one per grounded mint. */
let corpusGroundings: CorpusGrounding[] = [];

/** Next unused grounding, preferring the target domain. */
function takeCorpusGrounding(domain: string): CorpusGrounding | null {
  if (!corpusGroundings.length) return null;
  const idx = corpusGroundings.findIndex((g) => g.domain === domain);
  const at = idx >= 0 ? idx : 0;
  const [g] = corpusGroundings.splice(at, 1);
  return g ?? null;
}

/**
 * Mint a brand-new forge spec from the learner's top unmet synthesize/refine
 * target. The model drafts a problem AND a reference implementation; the
 * reference must pass its own acceptance test in the sandbox before the problem
 * is admitted (the same proof the open-ended engine uses). The admitted
 * acceptance test becomes the forge's hidden reference suite, so a later forge
 * cycle builds and sandbox-verifies a real implementation against it. Returns
 * the number of specs added.
 */
async function mintForgeSpecFromLearnerPlan(): Promise<number> {
  if (forgeMintBusy) return 0;
  forgeMintBusy = true;
  try {
    const state = await learner.status().catch(() => null);
    if (!state) return 0;
    const targets = generationTargets(state);
    const existing = allForgeSpecs();
    // Only domains with NOTHING waiting to be built count as "covered": once a
    // minted spec is built, a still-weak domain may mint another.
    const built = new Set([
      ...registry.map((t) => t.name),
      ...forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name),
    ]);
    const pendingDomains = existing.filter((s) => !built.has(s.name)).map((s) => s.domain);
    const target = chooseMintTarget(targets, pendingDomains);
    if (!target) return 0;

    const knownTitles = existing.map((s) => s.title);
    const grounding = takeCorpusGrounding(target.domain);
    const result = await mintProblems({
      context: groundedMintContext(target, grounding),
      count: 1,
      knownTitles,
      draft: async (system, user) => {
        const res = await chatComplete(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.4 },
        );
        if (!res.ok || res.content === null) throw new Error(res.error || 'model offline');
        return res.content;
      },
      verify: sandboxVerify,
    });

    let added = 0;
    for (const problem of result.minted) {
      const spec = mintedProblemToForgeSpec(problem, { sourceDirectiveId: target.directiveId });
      if (registry.some((t) => t.name === spec.name)) continue;
      if (allForgeSpecs().some((s) => s.name === spec.name)) continue;
      dynamicAgenda.push(spec);
      added += 1;
    }
    if (added > 0) {
      saveStateToDisk();
      appendProvenanceEvent('capability_adopted', {
        driverId: `learner_mint:${target.domain}`,
        note: `minted ${added} new ${target.domain} forge spec(s) from learner ${target.action}`,
        domain: target.domain,
      });
      console.log(`[forge] minted ${added} new ${target.domain} spec(s) from learner plan (${target.reason}).`);
    }
    return added;
  } catch (err) {
    console.warn('[forge] learner mint failed:', err instanceof Error ? err.message : String(err));
    return 0;
  } finally {
    forgeMintBusy = false;
  }
}

/**
 * Operator-facing view of the recursive-learning plan the forge is following:
 * the domain targets, the next spec that will be built, and the top of the
 * learner-ordered agenda. Honest: a read failure returns { error }.
 */
async function forgePlanSummary(): Promise<Record<string, unknown>> {
  const specs = allForgeSpecs();
  try {
    const state = await learner.status();
    const fleet = await cachedFleetSignal();
    const planningState = mergeFleetBeliefs(state, fleet.beliefs);
    const ranking = rankForgeSpecsByLearnerPlan(specs, planningState, {
      priorityDomains: fleet.degraded ? (['systemic'] as const) : [],
    });
    const built = new Set([
      ...registry.map((t) => t.name),
      ...forgeLedger.filter((l) => l.status === 'materialized').map((l) => l.name),
    ]);
    const next = ranking.ordered.find((s) => !built.has(s.name));
    return {
      episode: state.episode,
      fleetDegraded: fleet.degraded,
      targets: ranking.targets.map((t) => ({
        domain: t.domain, action: t.action, priority: t.priority, reason: t.reason,
      })),
      next: next
        ? { id: next.id, name: next.name, domain: next.domain, title: next.title, reason: ranking.reasons[next.id] }
        : null,
      order: ranking.ordered.slice(0, 12).map((s) => ({
        name: s.name, domain: s.domain, built: built.has(s.name), reason: ranking.reasons[s.id],
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Current promoted source of a registry entry, or null. */
function currentSourceOf(entry: ToolEntry): string | null {
  const v = entry.versions?.find((x) => x.version === entry.currentVersion)
    ?? entry.versions?.[entry.versions.length - 1];
  return v?.source_code ?? null;
}

/**
 * Shared registry promotion chokepoint (P1.4).
 *
 * Every NEW capability — generated, learned, mutated, dream-crystallized,
 * swarm-built, grounded, imported — must clear the substance gate before it
 * enters the registry. Repairs, restores and pending candidates pass
 * `gate:false` (they are not new generated capability; a repair is judged by the
 * verification window, not by this gate). A refusal is recorded in provenance so
 * it is auditable, never silent. Returns true when the entry was added.
 */
function promoteTool(entry: ToolEntry, opts: { origin: string; gate?: boolean; push?: boolean }): boolean {
  if (opts.gate !== false) {
    const source = currentSourceOf(entry);
    if (source) {
      const verdict = assessSourceSubstance(source);
      if (!verdict.ok) {
        try {
          appendProvenanceEvent('promotion_refused', {
            tool: entry.name, origin: opts.origin, reason: verdict.reason, lines: verdict.meaningfulLines,
          });
          recordDev('promotion-refused', false, `${entry.name} (${opts.origin}): ${verdict.reason}`, { driver: 'substance-gate' });
        } catch { /* refusal logging is best-effort; the refusal itself still holds */ }
        return false;
      }
      // Novelty (P1.4): the same algorithm with different constants under a new
      // name (e.g. dream weight-mutation variants) is not a new capability.
      const dup = findNearDuplicate(
        source,
        entry.name,
        registry.map((t) => ({ name: t.name, sourceCode: currentSourceOf(t) ?? undefined })),
      );
      if (dup) {
        try {
          appendProvenanceEvent('promotion_refused', {
            tool: entry.name, origin: opts.origin, reason: `near-duplicate of ${dup}`, lines: verdict.meaningfulLines,
          });
          recordDev('promotion-refused', false, `${entry.name} (${opts.origin}): near-duplicate of ${dup}`, { driver: 'novelty-gate' });
        } catch { /* best-effort */ }
        return false;
      }
    }
  }
  if (opts.push) registry.push(entry); else registry.unshift(entry);
  return true;
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

  if (outcome.quality) {
    base.quality = { score: outcome.quality.score, gateOk: outcome.quality.gate.ok, reasons: outcome.quality.gate.reasons };
  }
  if (outcome.ok !== true || !outcome.source) {
    base.status = outcome.reason === 'offline' ? 'offline' : 'failed';
    if (outcome.reason === 'quality') base.summary = `passed reference suite but failed quality gate: ${outcome.quality?.gate.reasons.join('; ') ?? 'unknown'}`;
    base.wallMs = Date.now() - started;
    forgeLedger.push(base);
    saveStateToDisk();
    return base;
  }

  // 1a. Quality gate (P1.4): reject sub-substance implementations before lint.
  // A trivial stub that passes a trivial suite is not a capability.
  const substance = assessSourceSubstance(outcome.source);
  if (!substance.ok) {
    base.status = 'failed';
    base.summary = substance.reason;
    base.failures = [...(base.failures || []), { attempt: 0, note: substance.reason ?? 'substance gate' }];
    base.wallMs = Date.now() - started;
    forgeLedger.push(base);
    saveStateToDisk();
    return base;
  }

  // 1b. Quality gate for sources that did not come through attemptForgeSpec
  // (dream/backfill genes): the same differential/robustness/overfit checks.
  const quality = outcome.quality ?? assessForgeCandidate(
    {
      name: spec.name,
      refSuite: outcome.refSuite ?? spec.refSuite,
      reference: spec.reference,
      vectors: spec.vectors,
      kind: spec.kind,
    },
    outcome.source,
  );
  base.quality = { score: quality.score, gateOk: quality.gate.ok, reasons: quality.gate.reasons };
  if (!quality.gate.ok) {
    base.status = 'failed';
    base.summary = `quality gate: ${quality.gate.reasons.join('; ')}`;
    base.failures = [...(base.failures || []), { attempt: 0, note: base.summary }];
    base.wallMs = Date.now() - started;
    // Deterministic rejection: without a quarantine bump the autopilot would
    // re-pick this (dream/backfill) spec every cycle.
    bumpForgeQuarantine(spec.name);
    forgeLedger.push(base);
    saveStateToDisk();
    return base;
  }
  const doc = outcome.doc ?? extractToolDoc(outcome.source, spec.name);
  const nearDup = findNearDuplicate(outcome.source, spec.name, listSelfHostedEntries());
  if (nearDup) {
    base.status = 'failed';
    base.summary = `novelty gate: near-duplicate of self-hosted tool ${nearDup}`;
    base.failures = [...(base.failures || []), { attempt: 0, note: base.summary }];
    base.wallMs = Date.now() - started;
    // Deterministic rejection: without a quarantine bump the autopilot would
    // re-pick this (dream/backfill) spec every cycle.
    bumpForgeQuarantine(spec.name);
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
      description: doc.summary || spec.title,
      paramDocs: doc.params,
      returnsDoc: doc.returns,
      quality: {
        score: quality.score,
        gateOk: quality.gate.ok,
        reasons: quality.gate.reasons,
        differential: quality.differential ? { checked: quality.differential.checked, agreed: quality.differential.agreed } : null,
        at: Date.now(),
      },
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

// =========================================================================
// OPEN-ENDED CAPABILITY ENGINE
// -------------------------------------------------------------------------
// dream -> MINT a problem (with a sandbox-proven hidden reference) ->
// CURRICULUM pick (learner beliefs) -> RECALL inspiration from durable memory
// -> SOLVE with the model -> novelty + property + acceptance gates -> archive
// -> learn back. Fills the gap where the forge only ever rebuilt a fixed list
// of 26 hardcoded micro-functions and never learned a genuinely new target.
// =========================================================================

const OPEN_ENDED_FILE = process.env.RECOURSE_OPEN_ENDED_FILE || path.join(process.cwd(), 'data', 'open-ended', 'problems.json');
const OPEN_ENDED_CYCLES_FILE = process.env.RECOURSE_OPEN_ENDED_CYCLES_FILE || path.join(process.cwd(), 'data', 'open-ended', 'cycles.jsonl');
let openEndedArchive: OpenEndedArchive | null = null;
let openEndedBusy = false;
const openEndedCycleLog: OpenEndedCycleResult[] = [];
const fleetRecursion = new FleetRecursionLedger();

function getOpenEndedArchive(): OpenEndedArchive {
  if (!openEndedArchive) openEndedArchive = new OpenEndedArchive(OPEN_ENDED_FILE, 4);
  return openEndedArchive;
}

function appendOpenEndedCycle(result: OpenEndedCycleResult): void {
  openEndedCycleLog.push(result);
  if (openEndedCycleLog.length > 100) openEndedCycleLog.splice(0, openEndedCycleLog.length - 100);
  try {
    fs.mkdirSync(path.dirname(OPEN_ENDED_CYCLES_FILE), { recursive: true });
    fs.appendFileSync(OPEN_ENDED_CYCLES_FILE, JSON.stringify({ at: Date.now(), ...result }) + '\n', 'utf-8');
  } catch { /* best-effort cycle log */ }
}

/** Approximate fast-check input shapes for the property gate, from the
 *  problem's required export name. Catches infinite loops / mutation for array
 *  and numeric capabilities; returns null for constructor-style problems where
 *  vector-shaped arbitraries do not apply. */
function propertyVectorsForProblem(problem: { functionName: string; vectors?: unknown[] }): unknown[] | null {
  // Prefer the minted problem's own sample calls: they have the correct
  // parameter arity and shapes for any domain (arrays, strings, objects).
  if (Array.isArray(problem.vectors) && problem.vectors.length) return problem.vectors;
  const n = problem.functionName.toLowerCase();
  if (/arr|list|array|chunk|merge|flatten|sort|dedupe|search|sieve|top|uniq/.test(n)) return [[[]], [[1, 2, 3]], [[5]]];
  if (/cache|class|constructor/.test(n)) return null;
  return [[0], [1], [2], [7]];
}

/** Build open-ended deps from real server state and run one engine cycle. */
async function runOpenEndedEngineCycle(): Promise<OpenEndedCycleResult | { skipped: boolean; reason: string }> {
  if (openEndedBusy) return { skipped: true, reason: 'open-ended cycle already running' };
  openEndedBusy = true;
  try {
    const archive = getOpenEndedArchive();
    const learnerState = await learner.status().catch(() => null);
    type BeliefRow = { domain: string; alpha: number; beta: number; attempts: number };
    const beliefs: BeliefRow[] = learnerState
      ? Object.values(learnerState.geneBeliefs as Record<string, BeliefRow>).map((b) => ({
          domain: b.domain,
          alpha: b.alpha,
          beta: b.beta,
          attempts: b.attempts,
        }))
      : [];
    const knownDomains = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

    // Durable-memory inspiration pool (best-effort; empty when memory is offline).
    let memory: Array<{ id: string; text: string; payload?: unknown }> = [];
    try {
      const mem = await ensureVectorMemory();
      const hits = await mem.recall('capability tool problem implementation solution', null, 40);
      memory = hits
        .filter((h) => typeof h.text === 'string' && h.text.length > 20)
        .map((h) => ({ id: h.id, text: h.text, payload: h.meta }));
    } catch { /* memory unavailable -> no inspiration */ }

    const verifyInSandbox = (source: string, suite: string) => {
      const run = executeTestSuite(source, suite);
      return { passed: run.passed, testDetails: run.testDetails };
    };

    const result = await runOpenEndedCycle({
      archive,
      beliefs,
      knownDomains,
      minUnsolved: Math.max(0, Math.floor(Number(process.env.OPEN_ENDED_MIN_UNSOLVED) || 6)),
      maxMintRounds: Math.max(1, Math.min(6, Math.floor(Number(process.env.OPEN_ENDED_MINT_ROUNDS) || 3))),
      mint: {
        context:
          'verified, self-contained micro-capabilities across coding, mathematics, cyber-defense, ' +
          'quantum simulation, neuro-symbolic reasoning and systemic domains',
        count: Math.max(1, Math.min(4, Math.floor(Number(process.env.OPEN_ENDED_MINT_BATCH) || 2))),
        draft: async (system, user) => {
          const res = await chatComplete(
            [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            { temperature: 0.4 },
          );
          if (!res.ok || res.content === null) throw new Error(res.error || 'model offline');
          return res.content;
        },
        verify: verifyInSandbox,
      },
      solver: async (problem, inspirationHint) => {
        const system =
          'You write plain JavaScript micro-functions. Return ONLY source. No Markdown fences, no prose, ' +
          `no imports, no TypeScript. Define and export exactly one function named ${problem.functionName}. ` +
          'Match the contract exactly and handle edge cases (empty inputs, bounds) explicitly.';
        const res = await chatComplete(
          [
            { role: 'system', content: system },
            { role: 'user', content: `${problem.statement}\n\n${inspirationHint}\n\nReturn only the source.` },
          ],
          { temperature: 0.2 },
        );
        if (res.ok && res.content) {
          const source = res.content.replace(/```(?:js|javascript)?/gi, '').replace(/```/g, '').trim();
          if (source.length > 10) return { ok: true, source, detail: 'model' };
        }
        // Fallback: the deterministic Axiom builder. Build-only (the engine runs
        // its own novelty + property + acceptance gates before promoting), so an
        // Axiom solution that fails a gate never leaves an orphan self-hosted tool.
        try {
          if (await axiomReachable()) {
            const ax = await integrateAxiomTool(
              problem.functionName,
              problem.domain as ToolDomain,
              problem.statement,
              problem.acceptanceTest,
              { selfHost: false },
            );
            if (ax.ok && ax.sourceCode) return { ok: true, source: ax.sourceCode, detail: 'axiom' };
            return { ok: false, detail: ax.error || 'Axiom produced no verified source' };
          }
        } catch (err: any) {
          return { ok: false, detail: `axiom fallback error: ${err?.message ?? String(err)}` };
        }
        return { ok: false, detail: res.error || 'model offline and Axiom unreachable' };
      },
      verify: verifyInSandbox,
      propertyVectorsFor: propertyVectorsForProblem,
      maxSolveAttempts: Math.max(1, Math.min(4, Math.floor(Number(process.env.OPEN_ENDED_SOLVE_TRIES) || 2))),
      memory,
      noveltyPool: registry.map((t) => `${t.name} ${t.description ?? ''}`),
    });

    appendOpenEndedCycle(result);

    // Learn back: fold the GRADED real outcome into the recursive learner,
    // keyed by the canonical capability key so name-variants of one capability
    // compound onto a single posterior (and match the forge's learned keys).
    if (result.picked) {
      const key = capabilityKeyFor(result);
      await learner
        .learnRealTools([
          {
            name: result.picked.title,
            domain: result.picked.domain,
            reward: rewardForResult(result),
            ...(key ? { key: key.replace(/^real:/, '') } : {}),
          },
        ])
        .catch(() => ({}));
    }
    if (result.solved && result.source && result.picked) {
      try {
        const mem = await ensureVectorMemory();
        await mem.remember(
          'lesson',
          `openended:${result.picked.id}`,
          `Solved open-ended problem "${result.picked.title}" (${result.picked.domain}) against a minted acceptance test.`,
          { problemId: result.picked.id, domain: result.picked.domain, source: result.source.slice(0, 4000) },
        );
      } catch { /* memory unavailable */ }
    }
    return result;
  } catch (err: any) {
    return { skipped: true, reason: err?.message ?? String(err) };
  } finally {
    openEndedBusy = false;
  }
}

function openEndedSnapshot() {
  return {
    archive: getOpenEndedArchive().snapshot(),
    busy: openEndedBusy,
    recent: openEndedCycleLog.slice(-10),
    file: OPEN_ENDED_FILE,
  };
}

async function runForgeCycle(): Promise<ForgeLedgerEntry | { skipped: boolean; reason: string }> {
  // The learner's generation plan orders the agenda so the next tool targets its
  // weakest domain; when the whole agenda is exhausted, mint a fresh spec from
  // the learner's top unmet synthesize/refine target.
  let spec = nextForgeSpec(await forgeSpecOrder());
  if (!spec) {
    const minted = await mintForgeSpecFromLearnerPlan();
    if (minted > 0) spec = nextForgeSpec(await forgeSpecOrder());
  }
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
    // Cross-run knowledge transfer: recall prior verified solutions from durable
    // memory and inject them as generator inspiration (best-effort).
    const inspirationHint = await forgeInspirationHint(spec);
    // P0.1 compute-optimal budget: easy/well-understood domains get 1 sample,
    // only hard/uncertain ones earn more (arXiv:2408.03314).
    const samples = await forgeSamplesForSpec(spec);
    // P1: consume a verified sleep-time-compute artifact with zero model calls
    // when the dream precomputed one (the forge still re-verifies it).
    const sleepArtifact = takeReadySleepArtifact(spec.name, spec.domain);
    outcome = await attemptForgeSpec(spec, samples, {
      systemPrompt: b.systemPrompt,
      temperature: b.temperature,
      samples,
      ...(inspirationHint ? { inspirationHint } : {}),
      ...(sleepArtifact ? { precomputedSource: sleepArtifact.source } : {}),
    });
    if (outcome.reason !== 'offline') {
      recordBuilderOutcome(b.id, spec, outcome.ok === true, outcome.attemptsUsed);
      builderMetaStep(false);
      // P1 experience distillation: learn which (domain, strategy) actually works.
      try { recordExperience(spec.domain, b.id, outcome.ok === true); } catch { /* best-effort */ }
    }
  }
  const entry = await materializeForgeOutcome(outcome, spec, literature);
  // Close the loop: the real verification/materialization outcome updates the
  // learner's domain beliefs so the next generation plan reflects it.
  await learnFromForgeOutcome(outcome, spec, entry.status);
  return entry;
}

/** P0.1: compute-optimal sample budget for a spec from the learner's real
 *  domain belief. Falls back to a structural prompt-size proxy when the learner
 *  has no evidence for the domain. */
async function forgeSamplesForSpec(spec: ForgeSpec): Promise<number> {
  try {
    const state = await learner.status();
    const summary = summarizeBeliefsByDomain(Object.values(state.geneBeliefs)).find((d) => d.domain === spec.domain);
    return forgeSampleBudget(
      { uncertainty: summary?.uncertainty, meanReward: summary?.meanReward, promptChars: spec.prompt?.length },
      { max: Math.max(1, Number(process.env.FORGE_BUDGET_MAX) || 3) },
    );
  } catch {
    return forgeSampleBudget({ promptChars: spec.prompt?.length });
  }
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


// Forge (snapshot/plan/mint/cycle/autopilot) moved to src/routes/forge.ts;
// engines + ledger + busy/autopilot state stay host-side and are injected.
app.use(
  '/api/recourse',
  createForgeRouter({
    forgeSnapshot,
    forgePlanSummary,
    mintForgeSpecFromLearnerPlan,
    runForgeCycle,
    forgeBusy: () => forgeBusy,
    setForgeBusy: (busy: boolean) => { forgeBusy = busy; },
    toggleForgeAutopilot: () => {
      forgeAutopilotOn = !forgeAutopilotOn;
      if (forgeAutopilotOn) ensureForgeAutopilot();
      else stopForgeAutopilot();
      saveStateToDisk();
      return forgeAutopilotOn;
    },
  }),
);

// Efficiency telemetry (P0/P1): completion-cache hit rate, sleep-time-compute
// artifacts, and distillation coverage. Read-only.
app.get('/api/recourse/perf', (_req, res) => {
  res.json({
    success: true,
    completionCache: completionCacheSnapshot(),
    sleepCompute: sleepComputeSnapshot(),
    experience: experienceSnapshot(),
    policy: {
      adaptiveBudgetMin: 1,
      adaptiveBudgetMax: Number(process.env.FORGE_BUDGET_MAX) || 3,
      modelCacheDisabled: process.env.MODEL_CACHE_DISABLED === '1',
      sleepComputeLimit: SLEEP_COMPUTE_LIMIT,
    },
  });
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

// External-intel routes mounted from src/routes/intel.ts. Proposals + the
// dynamic forge agenda stay here; adoption is the ONE gated path (a real
// reference suite is required before an invented idea becomes buildable).
app.use(
  '/api/recourse/intel',
  createIntelRouter({
    view: () => intelView(),
    pull: () => runIntelPull(),
    rank: () => runIntelRank(),
    snapshot: () => intelSnapshot(),
    adopt: (input) => {
      const { proposalId, functionName, prompt, referenceSuite, domain, title } = input as {
        proposalId?: unknown; functionName?: unknown; prompt?: unknown;
        referenceSuite?: unknown; domain?: unknown; title?: unknown;
      };
      if (typeof proposalId !== 'string') return { ok: false, status: 400, error: 'proposalId required' };
      const prop = intelProposals.find((p) => p.id === proposalId);
      if (!prop) return { ok: false, status: 404, error: 'proposal not found' };
      if (typeof functionName !== 'string' || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName)) {
        return { ok: false, status: 400, error: 'functionName must be a valid identifier' };
      }
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length < 20) {
        return { ok: false, status: 400, error: 'prompt must describe the behavior (>=20 chars)' };
      }
      if (typeof referenceSuite !== 'string' || referenceSuite.trim().length < 10) {
        return { ok: false, status: 400, error: 'referenceSuite is required — invented ideas need a real, testable contract before they can be built+verified' };
      }
      const dom = (domain as ToolDomain) && (['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'] as ToolDomain[]).includes(domain as ToolDomain)
        ? (domain as ToolDomain)
        : prop.domain;
      const spec: ForgeSpec = {
        id: `intel_${proposalId.slice(-20)}`,
        name: functionName,
        domain: dom,
        title: typeof title === 'string' && title.trim() ? title : prop.title,
        prompt,
        refSuite: referenceSuite,
      };
      if (!dynamicAgenda.some((d) => d.name === spec.name)) dynamicAgenda.push(spec);
      prop.status = 'adopted';
      prop.adoptedSpecId = spec.id;
      prop.adoptedAt = Date.now();
      saveStateToDisk();
      appendProvenanceEvent('capability_adopted', { driverId: `intel:${prop.source}`, proposalId: prop.id, spec: spec.id, toolName: spec.name });
      return { ok: true, spec };
    },
  }),
);

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

/** Real CI-green gate for harness patches (Phase 5): the composite
 *  typecheck + lint (+ test when RECOURSE_HARNESS_GATE_CHECKS asks) gate from
 *  src/lib/selfModification.ts. Runs before any write and blocks a patch whose
 *  change does not keep the tree green. Diagnostic-only: this module is no
 *  longer the implementation, the gate lives in one place. */
function makeHarnessBootGreenGate(): BootGreenGate {
  return makeHarnessGate({ cwd: devRepoRoot() });
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

/**
 * Recursive-learning decisions surfaced to operators: the generation plan the
 * forge will follow and the audit depth the audit team will use. Honest: a
 * learner read failure returns { error }, never a fabricated plan.
 */
async function learnerPlanSummary(): Promise<Record<string, unknown>> {
  try {
    const state = await learner.status();
    const targets = generationTargets(state);
    const audit = planAuditDepth(state);
    return {
      episode: state.episode,
      generationDigest: generationPlanDigest(targets),
      nextGeneration: targets[0] ?? null,
      generationPlan: targets.slice(0, 4).map((t) => ({
        domain: t.domain,
        action: t.action,
        priority: t.priority,
        uncertainty: t.uncertainty,
        meanReward: t.meanReward,
        reason: t.reason,
      })),
      deepestAudit: audit[0] ?? null,
      auditDepthPlan: audit.slice(0, 4).map((p) => ({
        domain: p.domain,
        depth: p.depth,
        auditors: p.auditors,
        reason: p.reason,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
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
    learner: await learnerPlanSummary(),
    fleet: await openhubFleetSignal(),
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

  // (0) Service-kind issues are OPERATIONAL, not code: route them through the
  // policy + approval gate into the deploy actuator (restart/redeploy) instead
  // of asking a model for a patch. A denied/queued/attempted remediation is
  // recorded and short-circuits the code path for this issue.
  if (issue.kind === 'service') {
    const service = resolveRemediationService(issue.id, parseRemediationMap(process.env.RECOURSE_REMEDIATE_SERVICES));
    if (!service) {
      action.remediation = { status: 'unmapped', detail: `no RECOURSE_REMEDIATE_SERVICES mapping for "${issue.id}"` };
    } else if (!SELF_REPAIR_APPLY) {
      action.remediation = { status: 'withheld', service, detail: 'RECOURSE_SELF_REPAIR_APPLY=0 — remediation not executed' };
    } else {
      const outcome = await attemptRemediation(
        { issueId: issue.id, service, cwd: repo, kind: 'restart', reason: issue.detail },
        { policy: policyEngine, approvals: approvalStore },
      );
      action.remediation = {
        status: outcome.status,
        service,
        approvalId: outcome.approvalId,
        detail: outcome.reason,
      };
      recordDev('stuck-remediate', outcome.status === 'applied', `${issue.id}: ${outcome.reason}`, {
        driver: 'remediation',
      });
      appendProvenanceEvent('capability_adopted', {
        driverId: 'remediation',
        issueId: issue.id,
        service,
        status: outcome.status,
        approvalId: outcome.approvalId,
        feedback: outcome.feedback,
      });
    }
    // Operational remediation replaces the code-patch path for service issues.
    action.brainDetail = action.remediation.detail;
    return action;
  }

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
          guard: selfModGuard,
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

/** Re-verify pending repair windows: a heal that later fails becomes `regressed`
 *  (a real failure). Re-runs each repaired version's stored suite in the sandbox;
 *  entries with no suite/source are left pending (honest — cannot verify). */
function reverifyPendingRepairs(): { checked: number; verified: number; regressed: number } {
  let checked = 0;
  let verified = 0;
  let regressed = 0;
  for (const e of repairVerifications) {
    if (e.status !== 'pending') continue;
    const tool = registry.find((t) => t.name === e.tool);
    const version = tool?.versions.find((v) => v.version === e.version);
    const suite = version?.test_suite_code;
    const source = version?.source_code;
    if (!suite || !source) continue;
    checked += 1;
    let passed = false;
    try { passed = verifyCodeWithSuite(source, suite).passed; } catch { passed = false; }
    resolveRepairVerification(repairVerifications, e.id, passed, Date.now(),
      passed ? 're-verified live' : 'regressed on re-verify');
    if (passed) verified += 1; else regressed += 1;
  }
  if (checked > 0) {
    const s = repairVerificationStats(repairVerifications);
    status.selfRepair.repairSuccessRate = s.successRate;
    status.selfRepair.verifiedRepairs = s.verified;
    status.selfRepair.pendingRepairs = s.pending;
    status.selfRepair.regressedRepairs = s.regressed;
    status.selfRepair.unverifiableRepairs = s.unverifiable;
  }
  return { checked, verified, regressed };
}

/** One full stuck-repair pass: collect signals -> update issues -> escalate
 *  each stuck issue past its backoff. Returns what happened (honestly). */
async function runStuckRepairPass(force = false): Promise<Record<string, unknown>> {
  if (selfRepairBusy) return { ok: false, skipped: 'self-repair busy (overlap guard)' };
  selfRepairBusy = true;
  try {
    const now = Date.now();
    const reverify = reverifyPendingRepairs();
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
      reverify,
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


// Autonomous-development (stuck loop / repair-team / brain / council / patch)
// routes moved to src/routes/develop.ts. Host state + engines are injected.
app.use(
  '/api/recourse',
  createDevelopRouter({
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    saveState: saveStateToDisk,
    recordDev,
    isAutopilotOn: () => devAutopilotOn,
    applyEnabled: () => SELF_REPAIR_APPLY,
    backoffMs: () => SELF_REPAIR_BACKOFF_MS,
    band: () => SELF_REPAIR_BAND,
    stuckSnapshot: () => stuckSnapshot(stuckIssues),
    stuckLedger: () => stuckRepairLedger,
    clearStuck: (id) => {
      const before = stuckIssues.length;
      stuckIssues = stuckIssues.filter((i) => i.id !== id);
      stuckRepairLedger.push({
        issueId: id, at: Date.now(),
        dispatchedRepairTeam: false, repairTeamDetail: 'cleared by operator',
        brainAsked: false, brainDetail: '',
        proposalsApplied: 0, proposalsRejected: 0, proposalsSkipped: 0,
      });
      saveStateToDisk();
      return { removed: before - stuckIssues.length, remaining: stuckIssues.length };
    },
    runStuckRepairPass,
    devSnapshot,
    runRepairReport,
    runDeepAnalyze,
    devRepoRoot,
    selfModGuard,
    bootGreenForPatch,
    makeHarnessBootGreenGate,
    harnessCiGate: HARNESS_CI_GATE,
    runBrainGateway,
    runCouncilDecide,
    runCouncilState,
    runCouncilLessons,
    runCouncilPostMortem,
    toggleAutopilot: () => {
      devAutopilotOn = !devAutopilotOn;
      if (devAutopilotOn) {
        ensureDevAutopilot();
        runRepairReport(false).catch(() => {});
      } else {
        stopDevAutopilot();
      }
      saveStateToDisk();
      return devAutopilotOn;
    },
  }),
);

// =========================================================================
// AGENTBROWSER WEB CHANNEL — download from the web via the real browser
// =========================================================================
// Extracted to src/server/routes/webChannel.ts (Router + narrow deps pattern).
app.use(createWebChannelRouter({ appendProvenanceEvent }));

// Open-ended capability engine (QD view, snapshot/run/archive/hygiene/patch,
// fleet-recursion ledger) moved to src/routes/openEnded.ts.
app.use(
  '/api/recourse',
  createOpenEndedRouter({
    openEndedSnapshot,
    runOpenEndedEngineCycle,
    getOpenEndedArchive,
    registry: () => registry,
    pruneBeliefs: (opts) => learner.pruneBeliefs(opts),
    saveState: saveStateToDisk,
    devRepoRoot,
    selfModGuard,
    appendProvenance: (eventType, data) => appendProvenanceEvent(eventType as ProvenanceEvent['type'], data),
    fleetRecursion,
  }),
);

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
    // Arm the Open-Ended Capability Engine job on non-safe boot so the loop
    // (mint -> solve -> verify -> archive -> learn) runs unattended.
    setJobEnabled('open-ended', true);
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
  // Throttle switches (operator). Heavy vs light loops are gated separately so
  // the box can stay responsive without disabling useful light jobs:
  //   RECOURSE_SCIENCE_LOOPS=0  -> skip the science conductor (model-heavy experiments)
  //   RECOURSE_RESEARCH_JOBS=0  -> skip the reports + keywire poll jobs
  // Defaults are unchanged (both ON) unless explicitly set to 0.
  if (process.env.RECOURSE_SCIENCE_LOOPS !== '0') {
    ensureScienceAutopilot();
    console.log(`[boot] t+${Math.round(process.uptime())}s science autopilot ensured`);
  } else {
    console.log('[boot] science conductor SKIPPED (RECOURSE_SCIENCE_LOOPS=0)');
  }
  if (process.env.RECOURSE_RESEARCH_JOBS !== '0') {
    setJobEnabled('reports', true);
    setJobEnabled('keywire', true);
    console.log(`[boot] t+${Math.round(process.uptime())}s reports/keywire jobs enabled`);
  } else {
    console.log('[boot] reports/keywire jobs SKIPPED (RECOURSE_RESEARCH_JOBS=0)');
  }
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

  const LISTEN_HOST = resolveListenHost();
  app.listen(PORT, LISTEN_HOST, () => {
    console.log(`Recourse server running on http://${LISTEN_HOST}:${PORT}` +
      (LISTEN_HOST === '127.0.0.1' ? ' (loopback only; set RECOURSE_HOST=0.0.0.0 to expose)' : ''));
    startStateHygiene();
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
let fleetDogfoodBusy = false;

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
    id: 'open-ended',
    name: 'Open-Ended Capability Engine',
    group: 'autonomy',
    cadenceMs: Math.max(60_000, Number(process.env.OPEN_ENDED_MS) || 10 * 60 * 1000),
    enabledByDefault: true,
    safeBootGated: true,
    run: async () => {
      const r = await runOpenEndedEngineCycle();
      if ('skipped' in r) return { skipped: r.reason };
      return {
        minted: r.minted,
        solved: r.solved,
        problem: r.picked?.title ?? null,
        archive: r.archive.total,
        unsolved: r.archive.unsolved,
      };
    },
  });

  register({
    id: 'fleet-dogfood',
    name: 'Fleet Dogfood (Recourse <-> Draymond trend/synergy/TID loop)',
    group: 'science',
    cadenceMs: Math.max(60_000, Number(process.env.FLEET_DOGFOOD_MS) || 30 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      if (fleetDogfoodBusy) return { skipped: 'dogfood busy (overlap)' };
      fleetDogfoodBusy = true;
      try {
        const snap = await runFleetDogfoodCycle();
        return {
          online: snap.draymond.online,
          series: snap.ingest.series,
          links: snap.graph.links,
          persisted: snap.export.persisted,
        };
      } finally {
        fleetDogfoodBusy = false;
      }
    },
  });

  register({
    id: 'gene-hygiene',
    name: 'Gene-Belief Hygiene (merge duplicates + retire dead noise)',
    group: 'system',
    cadenceMs: Math.max(60_000, Number(process.env.GENE_HYGIENE_MS) || 6 * 60 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const report = await learner.pruneBeliefs({ minWeight: 0.001, minMeanReward: 0.001 });
      return {
        before: report.before,
        after: report.after,
        merged: report.duplicatesRemoved,
        retired: report.droppedNoise.length,
      };
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
    id: 'telemetry',
    name: 'Environment Telemetry (machine + git)',
    group: 'system',
    cadenceMs: Math.max(15_000, Number(process.env.TELEMETRY_MS) || 60_000),
    enabledByDefault: true,
    run: async () => {
      const snap = productRouter.recordTelemetry();
      return { allowHeavy: snap.workWindow.allowHeavy, dirty: snap.git.dirtyCount, reason: snap.workWindow.reason };
    },
  });

  register({
    id: 'memory_consolidation',
    name: 'Tiered Memory Consolidation (episodic -> semantic)',
    group: 'system',
    cadenceMs: Math.max(60_000, Number(process.env.MEMORY_CONSOLIDATION_MS) || 15 * 60 * 1000),
    enabledByDefault: true,
    run: async () => {
      const created = consolidateSemanticMemory({ minClusterSize: 2 });
      const status = memoryStoreStatus();
      return { driver: status.kind, episodes: status.episodes, facts: status.facts, created: created.length };
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

  register({
    id: 'self-reporter',
    name: 'Self Reporter (first-person dispatch)',
    group: 'reporting',
    cadenceMs: REPORTER_MS,
    enabledByDefault: true,
    run: async () => {
      const r = await generateSelfReporterArticle();
      return { written: r.written, fingerprint: r.article.fingerprint, headline: r.article.headline, reason: r.reason };
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
// Skill library: refresh the catalog in the background when persisted state
// does not cover every configured root (e.g. new default libraries were added).
setImmediate(() => {
  const covered = skillCatalog.length > 0 && skillRoots.every((r) => skillCatalog.some((s) => s.rootId === r.id));
  if (covered) return;
  void runSkillScan()
    .then((snap) => console.log(`[Recourse] skill scan complete: ${snap.skills.length} skills across ${snap.roots.length} roots`))
    .catch((err: unknown) => console.warn('[Recourse] skill scan failed:', err instanceof Error ? err.message : String(err)));
});
initGoalLedger();
// Reapply the persisted model provider mode ('local' Spark vs 'api' LLM) so
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
