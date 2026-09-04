export type PromotionPolicy = 'any_pass' | 'non_regressing' | 'strict_improve' | 'human_approval' | 'auto_promote' | 'manual_approval';

export type ToolDomain = 
  | 'coding' 
  | 'math' 
  | 'biotech' 
  | 'systemic'
  | 'neuro_symbolic'
  | 'cyber_defense'
  | 'quantum_sim';

export type ToolOutcome = 'promoted' | 'rejected' | 'held_back' | 'pending_approval' | 'self_repaired';

export interface ToolVersion {
  version: string;
  hash: string;
  created_at: number;
  passed_verifier: boolean;
  score: number;
  promoted: boolean;
  verifier_notes: string;
  source_code?: string;
  test_suite_code?: string;
  isRepaired?: boolean;
}

export interface ToolEntry {
  name: string;
  domain: ToolDomain;
  entrypoint: string;
  description: string;
  versions: ToolVersion[];
  currentVersion?: string;
  pendingVersions?: ToolVersion[];
  healthStatus?: 'healthy' | 'degraded' | 'corrupted' | 'healing';
  anomalyCount?: number;
}

export type ProvenanceEventType =
  | 'tool_registered'
  | 'tool_verification'
  | 'tool_promoted'
  | 'tool_rejected'
  | 'tool_held_back'
  | 'tool_pending_approval'
  | 'tool_human_approved'
  | 'tool_repaired'
  | 'self_repair_triggered'
  | 'anomaly_injected'
  | 'gene_crossover'
  | 'report_generated'
  | 'system_tick'
  | 'ai_mutation'
  | 'growth_decision_executed'
  | 'dream_crystallized'
  | 'github_tool_ingested'
  | 'subagent_task_completed'
  | 'template_component_built'
  | 'template_repair_synthesized'
  | 'self_learning_directive_applied'
  | 'selfhosted_tool_called'
  | 'selfhosted_tool_removed'
  | 'capability_adopted'
  | 'capability_reverted'
  | 'capability_served'
  | 'loop_started'
  | 'loop_stopped'
  | 'loop_error'
  | 'signal_grounded'
  | 'intake_poll'
  | 'corpus_scanned'
  | 'corpus_dispatched'
  | 'skill_catalog_scanned'
  | 'skill_exported'
  | 'skill_imported'
  | 'selfuse_mismatch'
  | 'selfuse_error'
  | 'benchmark_run';

export interface ProvenanceEvent {
  prev: string;
  hash: string;
  type: ProvenanceEventType;
  ts: number;
  data: Record<string, any>;
}

// ==========================================
// 1. DETERMINISTIC GROWTH DECISION ENGINE
// ==========================================
export type GrowthActionType =
  | 'domain_gap_expansion'
  | 'deep_security_hardening'
  | 'cross_domain_hybridization'
  | 'github_research_import'
  | 'dream_crystallization'
  | 'redteam_stress_test'
  | 'quarantine_resolution';

export interface GrowthFactorWeights {
  domainGapWeight: number;      // 0.0 - 1.0 (priority given to underrepresented domains)
  vulnerabilityWeight: number;  // 0.0 - 1.0 (priority to resolving corrupted/degraded genes)
  passRateImprovement: number;  // 0.0 - 1.0 (priority to optimizing lower-performing test suites)
  noveltyExploration: number;   // 0.0 - 1.0 (priority to discovering new algorithmic paradigms)
  crossDomainSynergy: number;   // 0.0 - 1.0 (priority to recombining disparate genomes)
}

export interface CandidateGrowthAction {
  id: string;
  actionType: GrowthActionType;
  targetDomain: ToolDomain;
  targetToolName?: string;
  title: string;
  description: string;
  rawFactorScores: {
    domainDeficit: number;     // 0-1
    vulnerabilityUrgency: number; // 0-1
    passRateGap: number;        // 0-1
    noveltyPotential: number;   // 0-1
    crossDomainSynergy: number; // 0-1
  };
  computedUtilityScore: number; // weighted sum
  rank: number;
  deterministicRationale: string;
  suggestedParameters?: Record<string, any>;
}

export interface GrowthDecisionReport {
  timestamp: number;
  generation: number;
  weights: GrowthFactorWeights;
  candidateActions: CandidateGrowthAction[];
  selectedAction: CandidateGrowthAction;
  decisionEntropy: number;
  entropyReduction: number;
  stateVectorSummary: {
    totalGenes: number;
    activeDomains: number;
    healthIndex: number;
    overallPassRate: number;
  };
}

// ==========================================
// 2. ALWAYS-ON DREAMING ENGINE
// ==========================================
import type {
  DreamPhase,
  GenomeSpec,
  InvariantCheck,
  DreamThought,
  CrystallizedTool,
  DreamState,
  TickResult
} from './dream/types.js';

export type {
  DreamPhase,
  GenomeSpec,
  InvariantCheck,
  DreamThought,
  CrystallizedTool,
  DreamState,
  TickResult
};

import type {
  MutationOutcome,
  GeneStatus,
  GeneOrigin,
  MutationCandidate,
  RegistryGene,
  MutationResult
} from './dream/mutator-types.js';

export type {
  MutationOutcome,
  GeneStatus,
  GeneOrigin,
  MutationCandidate,
  RegistryGene,
  MutationResult
};

// ==========================================
// 3. DETERMINISTIC GITHUB TOOL RESEARCHER
// ==========================================
export interface GitHubRepoBlueprint {
  id: string;
  repoName: string;
  repoUrl: string;
  author: string;
  stars: number;
  domain: ToolDomain;
  algorithmName: string;
  description: string;
  license: string;
  securityAuditStatus: 'clean' | 'sandboxed' | 'flagged';
  extractedSourceCode: string;
  generatedTestSuite: string;
  asymptoticComplexity: string;
  deterministicProof: string;
  provenanceSourceTag: string;
  isIngested?: boolean;
}

export interface GitHubIngestionResult {
  success: boolean;
  blueprintId: string;
  toolName: string;
  domain: ToolDomain;
  version: string;
  hash: string;
  securityAuditScore: number;
  sandboxTestPassed: boolean;
  notes: string;
}

// ==========================================
// 4. AUTONOMOUS SUBAGENT BUILDERS
// ==========================================
export type SubAgentType =
  | 'algorithmic_synthesizer'
  | 'biochem_ontologist'
  | 'formal_prover'
  | 'cyber_sentinel'
  | 'quantum_compiler'
  | 'dream_consolidator';

export interface SubAgentTask {
  id: string;
  agentType: SubAgentType;
  title: string;
  domain: ToolDomain;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  outputArtifact?: {
    toolName: string;
    version: string;
    score: number;
    summary: string;
  };
}

export interface SubAgent {
  id: SubAgentType;
  name: string;
  specialty: string;
  domainFocus: ToolDomain;
  avatarIcon: string;
  status: 'idle' | 'executing' | 'synthesizing' | 'dreaming';
  currentTaskId?: string;
  tasksCompleted: number;
  efficiencyScore: number; // 0.0 - 1.0
  activeThought: string;
  lastExecutionTimestamp: number;
}

export interface SwarmStatus {
  isSwarmAutopilotActive: boolean;
  totalAgents: number;
  activeAgentsCount: number;
  totalSwarmTasksCompleted: number;
  collaborationIndex: number;
  agents: SubAgent[];
  activeTaskQueue: SubAgentTask[];
  recentCollaborations: Array<{
    id: string;
    title: string;
    teamId: string;
    participants: SubAgentType[];
    timestamp: number;
    artifacts: string[];
  }>;
}

export interface ChainVerificationResult {
  valid: boolean;
  length: number;
  lastHash: string;
  tamperedAt?: number;
  brokenLinkIndex?: number;
}

export interface VerifierResult {
  passed: boolean;
  summary: string;
  details: string[];
  score: number;
  stdout?: string;
  stderr?: string;
  detectedFault?: string;
  suggestedPatch?: string;
}

export interface BiotechClaim {
  asset_name: string;
  mechanism: string;
  leg: 'debulking' | 'blocking' | 'resistance' | 'cleanup';
  evidence_tier: number; // 0-5
  source: string;
  confidence_notes?: string;
}

export interface AnomalyReport {
  id: string;
  timestamp: number;
  toolName: string;
  domain: ToolDomain;
  severity: 'critical' | 'warning' | 'degraded';
  errorType: 
    | 'syntax_ast_error'
    | 'vieta_sign_bug'
    | 'memory_leak_risk'
    | 'security_taint'
    | 'biotech_kg_conflict'
    | 'quantum_decoherence'
    | 'logic_regression';
  description: string;
  rootCause: string;
  brokenCode: string;
  fixedCode?: string;
  test_suite_code?: string;
  status: 'detected' | 'analyzing' | 'repaired' | 'quarantined';
  repairLatencyMs?: number;
  repairGen?: number;
}

export interface SelfRepairStatus {
  isAutoHealingEnabled: boolean;
  totalHealedCount: number;
  activeAnomaliesCount: number;
  meanTimeToRepairMs: number;
  repairSuccessRate: number;
  lastHealedTool?: string;
  lastHealTimestamp?: number;
}

export interface HyperParameters {
  explorationRate: number; // 0.0 - 1.0 (balance new gene discovery vs refinement)
  repairAggressiveness: number; // 0.0 - 1.0 (auto-heal latency & depth)
  diversityQuotient: number; // 0.0 - 1.0 (breadth across domain spectrum)
  mutationTemperature: number; // 0.0 - 1.0 (creativity/variability)
  crossoverFrequency: number; // 0.0 - 1.0 (rate of cross-domain hybridizations)
  dreamCycleFrequency?: number; // 0.0 - 1.0 (speed of dreaming consolidation)
  githubIngestionAutopilot?: boolean; // toggle auto-research
}

// ==========================================
// 5. FIVE FORMULAS RECURSIVE LEARNING LOOP
// ==========================================
export interface ComplexPhasor {
  frequency: number;
  real: number;
  imag: number;
  magnitude: number;
  phaseAngleRad: number;
  spectralContribution: number;
}

export interface EulerEncoding {
  formulaLatex: string;
  phasors: ComplexPhasor[];
  primaryHarmonicHz: number;
  spectralEntropy: number;
  phaseCoherence: number;
  encodedFeatureVector: number[];
}

export interface PythagoreanMetric {
  formulaLatex: string;
  targetVector: number[];
  currentVector: number[];
  euclideanDistance: number;
  squaredErrorLoss: number;
  cosineSimilarity: number;
  readinessScore: number; // 1 / (1 + d)
  invariantViolations: string[];
  isWithinInvariantTolerance: boolean;
}

export interface DerivativeUpdate {
  formulaLatex: string;
  gradients: number[];
  parameterDeltas: number[];
  learningRateEta: number;
  momentumMu: number;
  gradientNorm: number;
  priorParameters: number[];
  updatedParameters: number[];
  backpropChainDepth: number;
  lossDelta: number;
}

export interface SchrodingerEvolution {
  formulaLatex: string;
  stateVectorPsi: Array<{ real: number; imag: number; amplitudeSq: number }>;
  timeStepDeltaT: number;
  planckConstantHbar: number;
  hamiltonianEnergyLevels: number[];
  normConservationCheck: number; // Sum |psi_i|^2 (must be 1.0)
  expectedEnergyValue: number;
  coherencePreserved: boolean;
}

export type CoreArchitecture = 'five-formula' | 'trifecta';

export interface BellmanValue {
  formulaLatex: string;
  stateValues: number[];
  rewards: number[];
  discountGamma: number;
  maxDelta: number;
}

export interface BayesianUpdate {
  formulaLatex: string;
  priorMu: number;
  priorSigma: number;
  observation: number;
  kalmanGain: number;
  posteriorMu: number;
  posteriorSigma: number;
}

export interface ChainRuleGradient {
  formulaLatex: string;
  weights: number[];
  activations: number[];
  gradients: number[];
  target: number;
  loss: number;
}

export interface EnergyBudget {
  formulaLatex: string;
  iterationMassM: number;
  computeSpeedOfLightC: number;
  relativisticVelocityV: number;
  lorentzFactorGamma: number;
  energyJoulesOrFlops: number; // E = gamma * m * c^2
  budgetCap: number;
  budgetRemaining: number;
  marginalReadinessGain: number;
  computeRoi: number; // Delta Readiness / Energy
  permitNextIteration: boolean;
}

export interface RecursiveIterationResult {
  iteration: number;
  timestamp: number;
  euler: EulerEncoding;
  pythagoras: PythagoreanMetric;
  derivative: DerivativeUpdate;
  schrodinger: SchrodingerEvolution;
  energyBudget: EnergyBudget;
  bellman?: BellmanValue;
  bayes?: BayesianUpdate;
  chainRule?: ChainRuleGradient;
  readinessScore: number;
  overallConvergenceRatio: number;
  loopStatus: 'converging' | 'optimal' | 'budget_gated' | 'divergent';
}

export interface RecursiveLoopParameters {
  coreArchitecture?: CoreArchitecture;
  learningRateEta: number;
  momentumMu: number;
  energyBudgetCap: number;
  timeStepDeltaT: number;
  planckConstantHbar: number;
  spectralBinsN: number;
  invariantTolerance: number;
  targetInvariantVector: number[];
  bellmanGamma?: number;
  bayesObservationNoise?: number;
}

export interface RecursiveLoopState {
  isLoopRunning: boolean;
  iteration: number;
  converged: boolean;
  currentParameters: number[];
  bellmanV?: number[];
  bayesMu?: number;
  bayesSigma?: number;
  chainWeights?: number[];
  history: RecursiveIterationResult[];
  latestResult: RecursiveIterationResult;
  config: RecursiveLoopParameters;
}

import type {
  LearnerState,
  EpisodeReport,
  ReplayReport,
  LedgerEntry,
  GeneBelief,
  MetaParams,
  Directive,
  DirectiveKind,
} from './dream/learner-types.js';

export type {
  LearnerState,
  EpisodeReport,
  ReplayReport,
  LedgerEntry,
  GeneBelief,
  MetaParams,
  Directive,
  DirectiveKind,
};

export type ArtifactType = 'acp' | 'mpc' | 'cli' | 'agent' | 'pipeline';
export type ArtifactStatus = 'designing' | 'compiling' | 'verifying' | 'deployed';

export interface StructuralArtifact {
  id: string;
  name: string;
  type: ArtifactType;
  status: ArtifactStatus;
  progress: number;
  loc: number;
  complexity: number;
  description: string;
  dependencies: string[];
  lastUpdated: string;
}

export interface SystemStatus {
  uptimeSeconds: number;
  generation: number;
  activePolicy: PromotionPolicy;
  isAutoEvolving: boolean;
  autoIntervalSeconds: number;
  totalUpgrades: number;
  verifierPassRate: number;
  hashChainIntegrity: boolean;
  registeredToolsCount: number;
  pendingApprovalsCount: number;
  lastTickTime: number;
  aiStudioModel: string;
  providerStatus?: {
    kind: string;
    baseUrl: string;
    model: string;
    online: boolean;
    lastError?: string;
    checkedAt?: number;
  };
  selfRepair: SelfRepairStatus;
  hyperParams: HyperParameters;
  domainCoverage: Record<ToolDomain, { activeGenes: number; passRate: number }>;
  growthWeights?: GrowthFactorWeights;
  lastDecision?: GrowthDecisionReport;
  dreamState?: DreamState;
  swarmStatus?: SwarmStatus;
  recursiveMathLoop?: RecursiveLoopState;
  
  // Determinism Expansion
  determinismDepth?: number;
  entropyReduction?: number;
  axiomLedger?: string[];
  
  // Structural Forge
  artifacts?: StructuralArtifact[];
  
  // Deterministic Mathematical Loop
  readinessScore?: number;

  // Real, durable progress (measured artifacts — NOT the self-consistent
  // readiness number). What the UI should treat as "development".
  realProgress?: {
    registeredTools: number;
    liveSelfHostedTools: number;
    forgeMaterialized: number;
    healedTools: number;
    benchmarkSolved: number;
    benchmarkTotal: number;
    verifierPassRate: number;
    openAnomalies: number;
  };
}

export interface HourlyReport {
  id: string;
  timestamp: number;
  dateFormatted: string;
  promotedCount: number;
  rejectedCount: number;
  heldBackCount: number;
  pendingCount: number;
  repairedCount?: number;
  summaryMarkdown: string;
  eventsCount: number;
}

export interface MutationRequest {
  targetToolName?: string;
  domain: ToolDomain;
  promptInstructions: string;
  policy?: PromotionPolicy;
}

export interface CrossoverRequest {
  parentGeneA: string;
  parentGeneB: string;
  targetDomain: ToolDomain;
  hybridName?: string;
}

// ==========================================
// 8. TEMPLATE-DRIVEN COMPONENT BUILDING
// ==========================================
export type ComponentTemplateCategory =
  | 'algorithmic'
  | 'mathematical'
  | 'infrastructure'
  | 'security'
  | 'biotech'
  | 'neuro_symbolic'
  | 'quantum'
  | 'lego_primitive'
  | 'web'
  | 'revenue';

/**
 * What a self-hosted template output becomes at runtime. `function` is the
 * original JSON-callable method adapter. The others add a transport:
 *  - `cli`   — runnable subcommands
 *  - `api`   — mounted HTTP routes
 *  - `mcp`   — JSON-RPC tool server (Model Context Protocol style)
 *  - `a2a`   — Agent-to-Agent JSON-RPC endpoint with a capability card
 *  - `loop`  — supervised periodic worker emitting heartbeats into the ledger
 */
export type ArtifactKind = 'function' | 'cli' | 'api' | 'mcp' | 'a2a' | 'loop';


export interface ComponentTemplateParam {
  id: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description: string;
}

export interface ComponentTemplate {
  id: string;
  name: string;
  domain: ToolDomain;
  category: ComponentTemplateCategory;
  description: string;
  params: ComponentTemplateParam[];
  defaultScore: number;
  benchmarkFlops: number;
  complexity: string;
  tags: string[];
  /** Present on API metadata when the template declares a selfHost descriptor. */
  selfHostable?: boolean;
}

export interface ComponentBuildRequest {
  templateId: string;
  componentName?: string;
  domain?: ToolDomain;
  params?: Record<string, any>;
  withSelfHealing?: boolean;
}

export interface ComponentBuildResult {
  success: boolean;
  toolEntry?: ToolEntry;
  synthesizedCode: string;
  testSuiteCode: string;
  entrypointName: string;
  verifierResult?: any;
  templateId: string;
  complexity: string;
  selfHealingGuards?: string[];
  error?: string;
}

export interface SelfRepairStrategy {
  errorType: string;
  domain: ToolDomain;
  repairedCount: number;
  successRate: number;
  avgConfidence: number;
  associatedTemplateId?: string;
  lastUsedTimestamp: number;
}

export interface SelfRepairKnowledge {
  totalDiagnoses: number;
  successfulHeals: number;
  templateAssistedHeals: number;
  meanConfidenceScore: number;
  strategies: SelfRepairStrategy[];
}

