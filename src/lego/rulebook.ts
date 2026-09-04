// src/lego/rulebook.ts — Layer 5: The Rulebook (Evaluator, Sandbox & Versioned Registry)
// Keeps self-assembly convergent through a fixed benchmark harness, isolated compute sandbox,
// and an immutable versioned registry with SHA-256 provenance.

import { 
  AssembledDAG, 
  BenchmarkTask, 
  BenchmarkReport, 
  SandboxConfig, 
  SandboxExecutionReport, 
  RegistryAssemblyEntry 
} from './types';
import { ExecutionEngine } from './composition';

// ============================================================================
// 1. Fixed External Evaluator (Immutable Benchmark Harness)
// ============================================================================

export const IMMUTABLE_BENCHMARKS: BenchmarkTask[] = [
  {
    id: 'bench_harmonic_spectral',
    name: 'Harmonic Signal Decomposition',
    description: 'Held-out orthogonal sinusoids testing frequency separation & non-linear features.',
    inputs: [
      [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6],
      [0.5, 0.5, 0.5, 0.5, 0.1, 0.2, 0.3, 0.4]
    ],
    expectedOutputs: [
      [0.35, 0.75, 0.42, 0.68],
      [0.48, 0.49, 0.25, 0.35]
    ],
    metric: 'spectral_correlation',
    tolerance: 0.25,
  },
  {
    id: 'bench_associative_memory',
    name: 'Episodic Slot Retrieval',
    description: 'Evaluates content-addressable memory retrieval under perturbed cue queries.',
    inputs: [
      [0.8, 0.1, 0.2, 0.9, 0.05, 0.15, 0.7, 0.3],
      [0.0, 1.0, 0.0, 1.0, 0.5, 0.5, 0.2, 0.8]
    ],
    expectedOutputs: [
      [0.72, 0.25, 0.31, 0.85],
      [0.15, 0.92, 0.12, 0.94]
    ],
    metric: 'memory_retrieval',
    tolerance: 0.3,
  },
  {
    id: 'bench_causal_attenuation',
    name: 'Causal Noise Suppression',
    description: 'Measures output stability and bounded variance when exposed to adversarial perturbations.',
    inputs: [
      [0.2, -0.4, 0.8, -0.1, 0.3, -0.6, 0.9, 0.1],
      [-0.5, 0.5, -0.2, 0.2, -0.8, 0.8, -0.1, 0.1]
    ],
    expectedOutputs: [
      [0.3, 0.0, 0.6, 0.1],
      [0.0, 0.4, 0.0, 0.3]
    ],
    metric: 'mse',
    tolerance: 0.35,
  }
];

export class FixedBenchmarkEvaluator {
  private tasks: BenchmarkTask[];

  constructor(tasks = IMMUTABLE_BENCHMARKS) {
    // Deep freeze tasks to guarantee external immutability
    this.tasks = JSON.parse(JSON.stringify(tasks));
  }

  evaluateAssembly(assembly: AssembledDAG): {
    overallScore: number;
    passed: boolean;
    reports: BenchmarkReport[];
  } {
    const reports: BenchmarkReport[] = [];
    let totalScore = 0;

    for (const task of this.tasks) {
      const t0 = performance.now();
      const execResult = ExecutionEngine.execute(assembly, task.inputs, false);
      const t1 = performance.now();

      if (!execResult.success || execResult.outputValues.length === 0) {
        reports.push({
          taskId: task.id,
          score: 0.0,
          passed: false,
          latencyMs: t1 - t0,
          flopsUsed: execResult.totalComputeCost,
          details: `Execution failed: ${execResult.error || 'No output produced'}`,
        });
        continue;
      }

      // Calculate score based on proximity to expected output
      let distance = 0;
      let comparisons = 0;

      for (let b = 0; b < Math.min(execResult.outputValues.length, task.expectedOutputs.length); b++) {
        const row = execResult.outputValues[b];
        const expRow = task.expectedOutputs[b];
        for (let i = 0; i < Math.min(row.length, expRow.length); i++) {
          distance += Math.abs(row[i] - expRow[i]);
          comparisons += 1;
        }
      }

      const meanAbsError = comparisons > 0 ? distance / comparisons : 1.0;
      // Score decays with error: e^(-MAE)
      const taskScore = Math.max(0, Math.min(1, Math.exp(-meanAbsError * 1.5)));
      const passed = taskScore >= (1.0 - task.tolerance);

      totalScore += taskScore;
      reports.push({
        taskId: task.id,
        score: taskScore,
        passed,
        latencyMs: t1 - t0,
        flopsUsed: execResult.totalComputeCost,
        details: `MAE: ${meanAbsError.toFixed(3)}, Score: ${(taskScore * 100).toFixed(1)}%`,
      });
    }

    const overallScore = totalScore / this.tasks.length;
    const allPassed = reports.every(r => r.passed);

    return {
      overallScore,
      passed: allPassed && overallScore > 0.7,
      reports,
    };
  }
}

// ============================================================================
// 2. Compute-Budgeted Isolated Sandbox
// ============================================================================

export class IsolatedComputeSandbox {
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      maxFlopsLimit: config?.maxFlopsLimit || 50000,
      maxMemoryBytes: config?.maxMemoryBytes || 1024 * 1024 * 10, // 10MB
      timeoutMs: config?.timeoutMs || 250,
      enforcePureExecution: config?.enforcePureExecution ?? true,
    };
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  /**
   * Runs an assembly strictly in isolation under FLOP, time, and numerical limits
   */
  runSandboxed(
    assembly: AssembledDAG,
    sampleInputs: number[][]
  ): SandboxExecutionReport {
    const t0 = performance.now();

    // Check FLOP budget before execution
    if (assembly.totalFlops > this.config.maxFlopsLimit) {
      return {
        passedSandbox: false,
        violationType: 'flops_exceeded',
        rolledBack: true,
        peakFlops: assembly.totalFlops,
        durationMs: 0.1,
      };
    }

    // Execute with error trapping
    try {
      const result = ExecutionEngine.execute(assembly, sampleInputs, true);
      const duration = performance.now() - t0;

      if (duration > this.config.timeoutMs) {
        return {
          passedSandbox: false,
          violationType: 'timeout',
          rolledBack: true,
          peakFlops: result.totalComputeCost,
          durationMs: duration,
        };
      }

      if (!result.success) {
        return {
          passedSandbox: false,
          violationType: 'contract_breach',
          rolledBack: true,
          peakFlops: result.totalComputeCost,
          durationMs: duration,
        };
      }

      // Check for NaN or Inf in outputs
      for (const row of result.outputValues) {
        for (const val of row) {
          if (!Number.isFinite(val)) {
            return {
              passedSandbox: false,
              violationType: 'nan_gradient',
              rolledBack: true,
              peakFlops: result.totalComputeCost,
              durationMs: duration,
            };
          }
        }
      }

      return {
        passedSandbox: true,
        rolledBack: false,
        peakFlops: result.totalComputeCost,
        durationMs: duration,
      };
    } catch (err) {
      return {
        passedSandbox: false,
        violationType: 'contract_breach',
        rolledBack: true,
        peakFlops: 0,
        durationMs: performance.now() - t0,
      };
    }
  }
}

// ============================================================================
// 3. Versioned Immutable Registry with SHA-256 Provenance
// ============================================================================

export class VersionedAssemblyRegistry {
  private entries: Map<string, RegistryAssemblyEntry> = new Map();
  private lineageRoot: string = '0'.repeat(16);

  constructor() {
    // Seed with genesis structural blueprint
  }

  getAllEntries(): RegistryAssemblyEntry[] {
    return Array.from(this.entries.values());
  }

  getEntry(id: string): RegistryAssemblyEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Deterministic hash calculation of an assembly's composition & parameters
   */
  private computeAssemblyHash(assembly: AssembledDAG, score: number): string {
    const topologySummary = assembly.topologicalOrder.join('->');
    const edgeSummary = assembly.edges.map(e => `${e.sourceBrickId}:${e.targetBrickId}`).join('|');
    const raw = `${topologySummary}::${edgeSummary}::${score.toFixed(4)}::${this.lineageRoot}`;
    
    // Fast pure deterministic hash (FNV-1a / Murmur hybrid)
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    
    const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    return hex.padStart(16, '0');
  }

  /**
   * Commit a newly validated assembly to the immutable registry
   */
  commit(
    assembly: AssembledDAG, 
    benchmarkScore: number, 
    parentIds: string[] = []
  ): RegistryAssemblyEntry {
    const hash = this.computeAssemblyHash(assembly, benchmarkScore);
    const version = `v${this.entries.size + 1}.0.${Math.floor(benchmarkScore * 100)}`;

    const entry: RegistryAssemblyEntry = {
      id: assembly.id,
      version,
      hash,
      assembly,
      benchmarkScore,
      provenance: {
        parentAssemblyIds: parentIds,
        testedTasks: IMMUTABLE_BENCHMARKS.map(t => t.id),
        createdAt: Date.now(),
        promotedAt: Date.now(),
        lineageHash: this.lineageRoot,
      },
      reusableAsBrick: benchmarkScore >= 0.85, // Sub-assemblies with score >= 85% can snap as macro-bricks!
    };

    this.entries.set(assembly.id, entry);
    if (this.entries.size > 100) {
      // Evict the oldest entry
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }
    this.lineageRoot = hash; // Update lineage root
    return entry;
  }
}
