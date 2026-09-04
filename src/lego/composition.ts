// src/lego/composition.ts — Layer 3: The Hands (Composition Engine & DAG Builder)
// Wires primitive bricks into validated computation graphs, validates stud contracts,
// orders execution topologically, and threads forward/backward autograd passes.

import { Value } from '../dream/autograd';
import { 
  BrickOperator, 
  AssembledDAG, 
  GraphEdge, 
  DAGExecutionResult, 
  BrickExecutionTrace 
} from './types';
import { validateStudConnection } from './contracts';

// ============================================================================
// Composition Graph Builder
// ============================================================================

export class DAGBuilder {
  private bricks: Map<string, BrickOperator> = new Map();
  private edges: GraphEdge[] = [];
  private name: string;
  private generation: number;

  constructor(name = 'AssembledPipeline', generation = 1) {
    this.name = name;
    this.generation = generation;
  }

  /**
   * Add a primitive brick to the current assembly
   */
  addBrick(brick: BrickOperator): DAGBuilder {
    this.bricks.set(brick.id, brick);
    return this;
  }

  /**
   * Connect an output stud from sourceBrick to an input stud on targetBrick
   */
  connect(
    sourceBrickId: string, 
    targetBrickId: string,
    outputPort = 0,
    inputPort = 0
  ): { success: boolean; edge?: GraphEdge; error?: string } {
    const source = this.bricks.get(sourceBrickId);
    const target = this.bricks.get(targetBrickId);

    if (!source) {
      return { success: false, error: `Source brick '${sourceBrickId}' not found in assembly` };
    }
    if (!target) {
      return { success: false, error: `Target brick '${targetBrickId}' not found in assembly` };
    }

    // Layer 1 validation: Verify that the studs snap together safely!
    const validation = validateStudConnection(source.outputContract, target.inputContract);

    const edgeId = `edge_${sourceBrickId}_to_${targetBrickId}_${this.edges.length}`;
    const edge: GraphEdge = {
      id: edgeId,
      sourceBrickId,
      targetBrickId,
      outputPortIndex: outputPort,
      inputPortIndex: inputPort,
      contractStatus: validation.compatible ? (validation.broadcastPossible ? 'broadcasting' : 'valid') : 'incompatible',
      validationMessage: validation.compatible 
        ? (validation.warnings.length > 0 ? validation.warnings.join('; ') : 'Contracts aligned perfectly')
        : validation.mismatches.join('; '),
    };

    if (!validation.compatible) {
      return { 
        success: false, 
        edge, 
        error: `Stud mismatch: ${validation.mismatches.join(', ')}` 
      };
    }

    this.edges.push(edge);
    return { success: true, edge };
  }

  /**
   * Compute topological ordering (Kahn's Algorithm)
   */
  private computeTopologicalOrder(): { order: string[]; hasCycle: boolean } {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of this.bricks.keys()) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const edge of this.edges) {
      if (edge.contractStatus === 'incompatible') continue;
      const current = inDegree.get(edge.targetBrickId) || 0;
      inDegree.set(edge.targetBrickId, current + 1);
      adj.get(edge.sourceBrickId)?.push(edge.targetBrickId);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      for (const v of adj.get(u) || []) {
        const newDeg = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
        }
      }
    }

    const hasCycle = order.length !== this.bricks.size;
    return { order, hasCycle };
  }

  /**
   * Build the complete validated assembly
   */
  build(): { success: boolean; assembly?: AssembledDAG; error?: string } {
    if (this.bricks.size === 0) {
      return { success: false, error: 'Cannot assemble an empty graph with zero bricks' };
    }

    const { order, hasCycle } = this.computeTopologicalOrder();
    if (hasCycle) {
      return { success: false, error: 'Cyclic dependency detected; self-assembling graphs must be DAGs' };
    }

    let totalFlops = 0;
    let totalLatencyMs = 0;
    let isDifferentiableEndToEnd = true;

    for (const brick of this.bricks.values()) {
      totalFlops += brick.inputContract.expectedCostFlops + brick.outputContract.expectedCostFlops;
      totalLatencyMs += brick.inputContract.expectedLatencyMs + brick.outputContract.expectedLatencyMs;
      if (!brick.isDifferentiable) {
        isDifferentiableEndToEnd = false;
      }
    }

    const assembly: AssembledDAG = {
      id: `dag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: this.name,
      generation: this.generation,
      bricks: Array.from(this.bricks.values()),
      edges: [...this.edges],
      topologicalOrder: order,
      totalFlops,
      totalLatencyMs,
      isDifferentiableEndToEnd,
      createdAt: Date.now(),
    };

    return { success: true, assembly };
  }
}

// ============================================================================
// Execution Engine (Forward & Reverse Autograd Traversal)
// ============================================================================

export class ExecutionEngine {
  /**
   * Executes a composed assembly end-to-end.
   * If a loss node is present, threads backpropagation in reverse topological order.
   */
  static execute(
    assembly: AssembledDAG,
    rawInputs: number[][],
    computeGradients = true
  ): DAGExecutionResult {
    const startTime = performance.now();
    const traces: BrickExecutionTrace[] = [];
    const nodeOutputs = new Map<string, Value[][]>();

    // Wrap initial inputs in Autograd Value nodes
    let currentActivation: Value[][] = rawInputs.map(row => 
      row.map(val => new Value(val))
    );

    let totalComputeCost = 0;

    try {
      // Forward pass following strict topological order
      for (const brickId of assembly.topologicalOrder) {
        const brick = assembly.bricks.find(b => b.id === brickId);
        if (!brick) continue;

        // Find inputs from predecessor edges
        const incomingEdges = assembly.edges.filter(e => e.targetBrickId === brickId);
        let inputForBrick: Value[][];

        if (incomingEdges.length === 0) {
          // Entry point gets root inputs
          inputForBrick = currentActivation;
        } else {
          // Take output of the source brick
          const sourceId = incomingEdges[0].sourceBrickId;
          const sourceOutput = nodeOutputs.get(sourceId);
          inputForBrick = sourceOutput || currentActivation;
        }

        const t0 = performance.now();
        const outputValues = brick.forward(inputForBrick);
        const t1 = performance.now();

        nodeOutputs.set(brickId, outputValues);
        currentActivation = outputValues;

        const flops = brick.outputContract.expectedCostFlops;
        totalComputeCost += flops;

        traces.push({
          brickId: brick.id,
          inputs: inputForBrick.map(r => r.map(v => v.data)),
          outputs: outputValues.map(r => r.map(v => v.data)),
          flopsConsumed: flops,
          latencyMs: t1 - t0,
          differentiable: brick.isDifferentiable,
        });
      }

      // If gradients requested and graph is differentiable, run reverse pass!
      let gradientsComputed = false;
      let finalLoss: number | undefined = undefined;

      if (computeGradients && assembly.isDifferentiableEndToEnd && currentActivation.length > 0) {
        // Target the last scalar output node (e.g. from a loss brick or mean output)
        const lastRow = currentActivation[0];
        if (lastRow.length > 0) {
          const lossNode = lastRow[0];
          finalLoss = lossNode.data;
          // Reverse-mode automatic differentiation
          lossNode.backward();
          gradientsComputed = true;
        }
      }

      return {
        dagId: assembly.id,
        success: true,
        outputValues: currentActivation.map(r => r.map(v => v.data)),
        loss: finalLoss,
        gradientsComputed,
        traces,
        totalComputeCost,
      };
    } catch (err: any) {
      return {
        dagId: assembly.id,
        success: false,
        outputValues: [],
        gradientsComputed: false,
        traces,
        totalComputeCost,
        error: err.message || 'Execution error in computation graph',
      };
    }
  }
}
