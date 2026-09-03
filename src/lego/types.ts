// src/lego/types.ts — Seven Building-Block Layers of Self-Assembling ML
// The Lego principle: the magic isn't just the bricks, it's the studs (standardized interfaces).

import { Value } from '../dream/autograd';

// ============================================================================
// LAYER 1: THE STUDS (TYPED CONTRACTS)
// ============================================================================

export type TensorDType = 'float32' | 'float64' | 'int32' | 'complex64' | 'boolean';

export interface TensorShape {
  dims: (number | 'B' | 'Seq' | 'Dim' | '*')[]; // e.g. ['B', 16] or ['B', 'Seq', 64]
  description: string;
}

export interface StudContract {
  id: string;
  name: string;
  shape: TensorShape;
  dtype: TensorDType;
  preconditions: string[];   // e.g. ["all_finite", "normalized_unit_interval", "rank_2"]
  expectedCostFlops: number; // Computational cost in FLOPs
  expectedLatencyMs: number; // Estimated execution latency
  schemaDescription: string;
}

export interface StudValidationResult {
  compatible: boolean;
  mismatches: string[];
  broadcastPossible: boolean;
  warnings: string[];
}

// ============================================================================
// LAYER 2: THE BRICK BIN (PRIMITIVE OPERATORS LIBRARY)
// ============================================================================

export type BrickCategory = 
  | 'transform'   // FFT, Convolutions, Multihead Attention, Projections
  | 'loss'        // MSE, Cross-Entropy, Contrastive, Huber
  | 'optimizer'   // Adam, SGD with Momentum, RMSprop
  | 'memory'      // Differentiable Episodic Memory, Working Register
  | 'router'      // MoE Sparse Top-K Router
  | 'evaluator';  // Property-based evaluation metrics

export interface BrickParameter {
  name: string;
  value: Value;
  initialValue: number;
}

export interface BrickExecutionTrace {
  brickId: string;
  inputs: number[][];
  outputs: number[][];
  flopsConsumed: number;
  latencyMs: number;
  differentiable: boolean;
}

export interface BrickOperator {
  id: string;
  name: string;
  category: BrickCategory;
  description: string;
  version: string;
  
  // Contracts (The Studs)
  inputContract: StudContract;
  outputContract: StudContract;
  
  // Trainable parameters
  params: Record<string, BrickParameter>;
  
  // Design properties
  isIndependentlyTrainable: boolean;
  isPureDeterministic: boolean;
  isDifferentiable: boolean;
  
  // Forward and backward execution
  forward: (input: Value[][]) => Value[][];
  
  // Standalone calibration / training score in isolation
  isolatedScore?: number;
  trainingEpochsInIsolation?: number;
}

// ============================================================================
// LAYER 3: THE HANDS (COMPOSITION GRAPH & DAG BUILDER)
// ============================================================================

export interface GraphEdge {
  id: string;
  sourceBrickId: string;
  targetBrickId: string;
  outputPortIndex: number;
  inputPortIndex: number;
  contractStatus: 'valid' | 'incompatible' | 'broadcasting';
  validationMessage?: string;
}

export interface AssembledDAG {
  id: string;
  name: string;
  generation: number;
  bricks: BrickOperator[];
  edges: GraphEdge[];
  topologicalOrder: string[]; // Brick IDs in execution order
  totalFlops: number;
  totalLatencyMs: number;
  isDifferentiableEndToEnd: boolean;
  createdAt: number;
}

export interface DAGExecutionResult {
  dagId: string;
  success: boolean;
  outputValues: number[][];
  loss?: number;
  gradientsComputed: boolean;
  traces: BrickExecutionTrace[];
  totalComputeCost: number;
  error?: string;
}

// ============================================================================
// LAYER 4: THE BUILDER'S BRAIN (ASSEMBLY POLICY - NAS)
// ============================================================================

export interface NASSearchSpace {
  availableBrickIds: string[];
  maxDepth: number;
  maxBreadth: number;
  allowedCategories: BrickCategory[];
  enforceDifferentiability: boolean;
}

export interface MoERouterState {
  expertBrickIds: string[];
  topK: number;
  gatingWeights: number[][]; // [inputDim, numExperts]
  lastRoutingProbabilities: number[];
  activeExperts: string[];
}

export interface PolicyControllerDecision {
  chosenBrickId: string;
  targetConnectionId: string | null;
  policyLogProb: number;
  estimatedQValue: number; // Bellman: Immediate score + discounted future enablement
  entropy: number;
}

export interface NASControllerState {
  episodes: number;
  learningRate: number;
  gamma: number; // Bellman discount factor
  policyGradients: number[];
  temperature: number;
  candidateProposalsCount: number;
  acceptedAssembliesCount: number;
  history: {
    episode: number;
    reward: number;
    qEstimate: number;
    assemblyId: string;
  }[];
}

// ============================================================================
// LAYER 5: THE RULEBOOK (BENCHMARK EVALUATOR, SANDBOX & VERSIONED REGISTRY)
// ============================================================================

export interface BenchmarkTask {
  id: string;
  name: string;
  description: string;
  inputs: number[][];
  expectedOutputs: number[][];
  metric: 'mse' | 'accuracy' | 'spectral_correlation' | 'memory_retrieval';
  tolerance: number;
}

export interface BenchmarkReport {
  taskId: string;
  score: number; // 0 to 1
  passed: boolean;
  latencyMs: number;
  flopsUsed: number;
  details: string;
}

export interface SandboxConfig {
  maxFlopsLimit: number;
  maxMemoryBytes: number;
  timeoutMs: number;
  enforcePureExecution: boolean;
}

export interface SandboxExecutionReport {
  passedSandbox: boolean;
  violationType?: 'flops_exceeded' | 'timeout' | 'nan_gradient' | 'contract_breach';
  rolledBack: boolean;
  peakFlops: number;
  durationMs: number;
}

export interface RegistryAssemblyEntry {
  id: string;
  version: string;
  hash: string; // SHA-256 integrity hash
  assembly: AssembledDAG;
  benchmarkScore: number;
  provenance: {
    parentAssemblyIds: string[];
    testedTasks: string[];
    createdAt: number;
    promotedAt?: number;
    lineageHash: string;
  };
  reusableAsBrick: boolean; // Can this composite assembly snap as a macro-brick into bigger builds?
}

// ============================================================================
// FULL LEGO SYSTEM STATE
// ============================================================================

export interface LegoSystemState {
  studCatalog: StudContract[];
  brickBin: BrickOperator[];
  currentAssembly: AssembledDAG | null;
  activeMoERouter: MoERouterState;
  nasController: NASControllerState;
  fixedBenchmarkTasks: BenchmarkTask[];
  sandboxConfig: SandboxConfig;
  lastSandboxReport: SandboxExecutionReport | null;
  registry: RegistryAssemblyEntry[];
  totalSelfAssembledCount: number;
  systemIntegrityScore: number;
  /** Live math-readiness gate set by the server's /tick. Assemblies below
   *  0.7 are held back from registry promotion. */
  readinessGate?: number;
}
