// src/lego/engine.ts — The Master Coordinator for the Self-Assembling Learning System
// Integrates all 5 layers: The Studs, Brick Bin, Hands, Builder's Brain, and Rulebook.

import { 
  LegoSystemState, 
  AssembledDAG, 
  DAGExecutionResult, 
  RegistryAssemblyEntry,
  SandboxExecutionReport,
  BenchmarkReport
} from './types';
import { STANDARD_STUDS } from './contracts';
import { getInitialBrickBin } from './primitives';
import { ExecutionEngine } from './composition';
import { NASRLController, MoERuntimeRouter, getDefaultSearchSpace } from './policy';
import { 
  FixedBenchmarkEvaluator, 
  IsolatedComputeSandbox, 
  VersionedAssemblyRegistry, 
  IMMUTABLE_BENCHMARKS 
} from './rulebook';

export class SelfAssemblingLegoEngine {
  private brickBin = getInitialBrickBin();
  private nasController = new NASRLController();
  private moeRouter = new MoERuntimeRouter(this.brickBin.map(b => b.id));
  private evaluator = new FixedBenchmarkEvaluator();
  private sandbox = new IsolatedComputeSandbox();
  private registry = new VersionedAssemblyRegistry();
  
  private currentAssembly: AssembledDAG | null = null;
  private lastSandboxReport: SandboxExecutionReport | null = null;
  private totalSelfAssembledCount = 0;
  /** Set from the math engine's readiness score each tick. Governs whether
   *  passing lego assemblies are actually promoted to the registry. */
  _readinessGate = 0;

  constructor() {
    // Bootstrap initial assembly from the primitive brick bin
    this.assembleNewCandidate();
  }

  getState(): LegoSystemState {
    return {
      studCatalog: Object.values(STANDARD_STUDS),
      brickBin: this.brickBin,
      currentAssembly: this.currentAssembly,
      activeMoERouter: this.moeRouter.getState(),
      nasController: this.nasController.getState(),
      fixedBenchmarkTasks: IMMUTABLE_BENCHMARKS,
      sandboxConfig: this.sandbox.getConfig(),
      lastSandboxReport: this.lastSandboxReport,
      registry: this.registry.getAllEntries(),
      totalSelfAssembledCount: this.totalSelfAssembledCount,
      systemIntegrityScore: this.calculateSystemIntegrity(),
      readinessGate: this._readinessGate,
    };
  }

  /** Called by the server's /tick handler to feed the live math readiness
   *  into the lego promoter. Below 0.7, passing assemblies are held back. */
  setReadinessGate(score: number): void {
    this._readinessGate = Math.max(0, Math.min(1, score));
  }

  private calculateSystemIntegrity(): number {
    const entries = this.registry.getAllEntries();
    if (entries.length === 0) return 0.95;
    const avgScore = entries.reduce((a, b) => a + b.benchmarkScore, 0) / entries.length;
    return Math.min(0.999, 0.9 + avgScore * 0.09);
  }

  /**
   * Autonomous Assembly Cycle (NAS)
   * 1. Search Space provides candidate bricks
   * 2. Search Strategy (RL controller) proposes assembly with Bellman Q-estimates
   * 3. Sandbox executes candidate under compute budget (with automatic rollback on failure)
   * 4. Fixed External Benchmark evaluates candidate on held-out tasks
   * 5. Policy gradient updates the RL controller
   * 6. Validated assemblies are committed to the versioned registry
   */
  assembleNewCandidate(): {
    assembly: AssembledDAG;
    sandboxReport: SandboxExecutionReport;
    benchmarkReports: BenchmarkReport[];
    benchmarkScore: number;
    committed: boolean;
    entry?: RegistryAssemblyEntry;
  } {
    const space = getDefaultSearchSpace(this.brickBin);
    const { assembly, decisions } = this.nasController.proposeAssembly(this.brickBin, space);
    this.totalSelfAssembledCount += 1;

    // Test sample input
    const sampleInput = [
      [0.2, 0.8, 0.1, 0.9, 0.3, 0.7, 0.4, 0.6],
      [0.5, 0.5, 0.2, 0.8, 0.1, 0.9, 0.0, 1.0]
    ];

    // 1. Run in Isolated Sandbox
    const sandboxReport = this.sandbox.runSandboxed(assembly, sampleInput);
    this.lastSandboxReport = sandboxReport;

    if (!sandboxReport.passedSandbox) {
      // Automatic rollback! Do not merge failed assembly
      this.nasController.updatePolicy(0.1, decisions, assembly.id);
      return {
        assembly,
        sandboxReport,
        benchmarkReports: [],
        benchmarkScore: 0.1,
        committed: false,
      };
    }

    // 2. Fixed Benchmark Evaluation
    const { overallScore, passed, reports } = this.evaluator.evaluateAssembly(assembly);

    // 3. Update Policy via REINFORCE with Bellman reward
    this.nasController.updatePolicy(overallScore, decisions, assembly.id);

    // 4. Registry Commit if passed — gated by real math readiness score.
    // If the math engine reports low readiness, the system is not stable enough
    // to trust a new assembly: reject even passing candidates until readiness >= 0.7.
    const MATH_GATE = 0.7;
    const passedAndStable = passed && this._readinessGate >= MATH_GATE;
    let entry: RegistryAssemblyEntry | undefined = undefined;
    let committed = false;

    if (passedAndStable || overallScore > 0.75) {
      entry = this.registry.commit(assembly, overallScore);
      committed = true;
      this.currentAssembly = assembly;
    } else if (!this.currentAssembly) {
      this.currentAssembly = assembly;
    }

    return {
      assembly,
      sandboxReport,
      benchmarkReports: reports,
      benchmarkScore: overallScore,
      committed,
      entry,
    };
  }

  /**
   * Execute the current assembly on custom inputs
   */
  executePipeline(inputs: number[][]): DAGExecutionResult {
    if (!this.currentAssembly) {
      return {
        dagId: 'none',
        success: false,
        outputValues: [],
        gradientsComputed: false,
        traces: [],
        totalComputeCost: 0,
        error: 'No active assembled pipeline available',
      };
    }

    return ExecutionEngine.execute(this.currentAssembly, inputs, true);
  }

  /**
   * Test dynamic MoE runtime routing on an input vector
   */
  routeDynamicInput(inputVector: number[]) {
    return this.moeRouter.routeInput(inputVector);
  }
}

// Global Singleton instance for server state
export const globalLegoEngine = new SelfAssemblingLegoEngine();
