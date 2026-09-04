import { describe, it, expect } from 'vitest';
import { DAGBuilder, ExecutionEngine } from '../src/lego/composition';
import { getInitialBrickBin } from '../src/lego/primitives';
import { IsolatedComputeSandbox, FixedBenchmarkEvaluator, VersionedAssemblyRegistry } from '../src/lego/rulebook';
import { SelfAssemblingLegoEngine } from '../src/lego/engine';

describe('Lego Subsystem: Layers 3, 4, and 5 (Hands, Brain & Rulebook)', () => {
  const brickBin = getInitialBrickBin();

  describe('Layer 3: The Hands (Autograd DAG Composition)', () => {
    it('builds valid acyclic DAG and sorts in topological order', () => {
      const b1 = brickBin.find(b => b.id === 'brick_mlp_proj_8_16')!;
      const b2 = brickBin.find(b => b.id === 'brick_conv1d_16_8')!;

      const builder = new DAGBuilder('TestDAG_Linear', 1);
      builder.addBrick(b1);
      builder.addBrick(b2);
      builder.connect(b1.id, b2.id);

      const buildResult = builder.build();
      expect(buildResult.success).toBe(true);
      expect(buildResult.assembly).toBeDefined();

      const dag = buildResult.assembly!;
      expect(dag.topologicalOrder).toEqual([b1.id, b2.id]);
      expect(dag.totalFlops).toBeGreaterThan(0);
    });

    it('detects and rejects cyclical graph connections', () => {
      const b1 = brickBin.find(b => b.id === 'brick_mlp_proj_8_16')!;
      const b2 = brickBin.find(b => b.id === 'brick_conv1d_16_8')!;

      const builder = new DAGBuilder('CycleTest', 1);
      builder.addBrick(b1);
      builder.addBrick(b2);
      builder.connect(b1.id, b2.id);
      builder.connect(b2.id, b1.id); // Cycle!

      const buildResult = builder.build();
      expect(buildResult.success).toBe(false);
      expect(buildResult.error).toContain('Cyclic dependency detected');
    });

    it('executes assembled DAG end-to-end with intermediate states', () => {
      const b1 = brickBin.find(b => b.id === 'brick_mlp_proj_8_16')!;
      const b2 = brickBin.find(b => b.id === 'brick_conv1d_16_8')!;

      const builder = new DAGBuilder('ExecTest', 1);
      builder.addBrick(b1);
      builder.addBrick(b2);
      builder.connect(b1.id, b2.id);
      const dag = builder.build().assembly!;

      const sampleInput = [
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
      ];

      const result = ExecutionEngine.execute(dag, sampleInput);
      expect(result.success).toBe(true);
      expect(result.outputValues.length).toBe(2);
      expect(result.outputValues[0].length).toBe(8);
      expect(result.traces.some(t => t.brickId === b1.id)).toBe(true);
      expect(result.traces.some(t => t.brickId === b2.id)).toBe(true);
      expect(result.totalComputeCost).toBeGreaterThan(0);
    });
  });

  describe('Layer 5: The Rulebook (Sandbox & Versioned Registry)', () => {
    it('executes safely in isolated sandbox under FLOP budget', () => {
      const b1 = brickBin.find(b => b.id === 'brick_mlp_proj_8_16')!;
      const b2 = brickBin.find(b => b.id === 'brick_conv1d_16_8')!;

      const builder = new DAGBuilder('SandboxTest', 1);
      builder.addBrick(b1);
      builder.addBrick(b2);
      builder.connect(b1.id, b2.id);
      const dag = builder.build().assembly!;

      const sandbox = new IsolatedComputeSandbox({ maxFlopsLimit: 50000, timeoutMs: 250 });
      const report = sandbox.runSandboxed(dag, [[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]]);

      expect(report.passedSandbox).toBe(true);
      expect(report.rolledBack).toBe(false);
      expect(report.peakFlops).toBeLessThanOrEqual(50000);
    });

    it('evaluates assemblies against immutable benchmark tasks', () => {
      const b1 = brickBin.find(b => b.id === 'brick_mlp_proj_8_16')!;
      const b2 = brickBin.find(b => b.id === 'brick_conv1d_16_8')!;

      const builder = new DAGBuilder('BenchmarkTest', 1);
      builder.addBrick(b1);
      builder.addBrick(b2);
      builder.connect(b1.id, b2.id);
      const dag = builder.build().assembly!;

      const evaluator = new FixedBenchmarkEvaluator();
      const report = evaluator.evaluateAssembly(dag);

      expect(report.reports.length).toBe(3);
      expect(report.overallScore).toBeGreaterThan(0);
    });

    it('commits approved assemblies with cryptographic lineage and enforces memory bounds', () => {
      const registry = new VersionedAssemblyRegistry();
      const b1 = brickBin[0];
      const builder = new DAGBuilder('RegistryTest', 1);
      builder.addBrick(b1);
      const dag = builder.build().assembly!;

      const entry = registry.commit(dag, 0.88);
      expect(entry.id).toBe(dag.id);
      expect(entry.hash).toBeDefined();
      expect(entry.version).toContain('v1.0.88');
      expect(entry.reusableAsBrick).toBe(true);

      // Verify bounds capping
      for (let i = 0; i < 110; i++) {
        const d = new DAGBuilder(`Dag_${i}`, i);
        d.addBrick(b1);
        registry.commit(d.build().assembly!, 0.80);
      }
      expect(registry.getAllEntries().length).toBeLessThanOrEqual(100);
    });
  });

  describe('Master Coordinator: SelfAssemblingLegoEngine', () => {
    it('completes full autonomous NAS assemble-evaluate-commit cycle', () => {
      const engine = new SelfAssemblingLegoEngine();
      const state = engine.getState();

      expect(state.brickBin.length).toBeGreaterThan(0);
      expect(state.currentAssembly).toBeDefined();
      expect(state.systemIntegrityScore).toBeGreaterThan(0.9);

      // Run new candidate proposal
      const candidateResult = engine.assembleNewCandidate();
      expect(candidateResult.assembly).toBeDefined();
      expect(candidateResult.sandboxReport).toBeDefined();
    });
  });
});
