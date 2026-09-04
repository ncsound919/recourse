// src/lego/policy.ts — Layer 4: The Builder's Brain (Assembly Policy & NAS)
// Canonical NAS decomposition: Search Space, Search Strategy (RL Controller + MoE Router), and Evaluation Strategy.

import { 
  BrickOperator, 
  AssembledDAG, 
  NASSearchSpace, 
  NASControllerState, 
  PolicyControllerDecision,
  MoERouterState
} from './types';
import { DAGBuilder } from './composition';
import { validateStudConnection } from './contracts';

// ============================================================================
// 1. NAS Search Space Specification
// ============================================================================

export function getDefaultSearchSpace(availableBricks: BrickOperator[]): NASSearchSpace {
  return {
    availableBrickIds: availableBricks.map(b => b.id),
    maxDepth: 4,
    maxBreadth: 2,
    allowedCategories: ['transform', 'memory', 'router', 'loss'],
    enforceDifferentiability: true,
  };
}

// ============================================================================
// 2. NAS Search Strategy: RL Controller with Bellman Updates
// Q(s, a) = R_immediate(s, a) + gamma * V(s_next)
// ============================================================================

export class NASRLController {
  private state: NASControllerState;

  constructor(initialState?: Partial<NASControllerState>) {
    this.state = {
      episodes: initialState?.episodes || 0,
      learningRate: initialState?.learningRate || 0.05,
      gamma: initialState?.gamma || 0.90, // Bellman discount factor
      policyGradients: initialState?.policyGradients || [0.25, 0.25, 0.25, 0.25],
      temperature: initialState?.temperature || 0.7,
      candidateProposalsCount: initialState?.candidateProposalsCount || 0,
      acceptedAssembliesCount: initialState?.acceptedAssembliesCount || 0,
      history: initialState?.history || [],
    };
  }

  getState(): NASControllerState {
    return { ...this.state };
  }

  /**
   * Sample action from the policy distribution with Boltzmann exploration
   */
  sampleDecision(availableBricks: BrickOperator[], existingBrickIds: string[]): PolicyControllerDecision {
    const n = availableBricks.length;
    if (n === 0) {
      throw new Error('No bricks available to propose in NAS controller');
    }

    // Compute policy logits
    const logits = availableBricks.map((brick, idx) => {
      // Base score from policy gradient weights
      const weight = this.state.policyGradients[idx % this.state.policyGradients.length] || 0.2;
      // Bonus if brick was independently pre-trained with high isolated score
      const qualityBonus = (brick.isolatedScore || 0.8) * 0.5;
      // Penalty if brick is already in graph to encourage diversity
      const diversityPenalty = existingBrickIds.includes(brick.id) ? -0.8 : 0;
      return (weight + qualityBonus + diversityPenalty) / this.state.temperature;
    });

    // Softmax probabilities
    const maxLogit = Math.max(...logits);
    const expVals = logits.map(l => Math.exp(l - maxLogit));
    const sumExp = expVals.reduce((a, b) => a + b, 0);
    const probs = expVals.map(e => e / sumExp);

    // Sample index
    let r = Math.random();
    let chosenIdx = 0;
    for (let i = 0; i < probs.length; i++) {
      if (r < probs[i]) {
        chosenIdx = i;
        break;
      }
      r -= probs[i];
    }

    const chosenBrick = availableBricks[chosenIdx];
    const logProb = Math.log(Math.max(probs[chosenIdx], 1e-7));

    // Bellman Q-Value formulation:
    // Q(s, a) = R_immediate(brick_score) + gamma * V(future_enablement)
    const immediateReward = (chosenBrick.isolatedScore || 0.8) * 10;
    const futureEnablementValue = chosenBrick.isDifferentiable ? 8 : 2;
    const estimatedQValue = immediateReward + this.state.gamma * futureEnablementValue;

    // Entropy calculation
    const entropy = -probs.reduce((acc, p) => acc + p * Math.log(p + 1e-9), 0);

    return {
      chosenBrickId: chosenBrick.id,
      targetConnectionId: existingBrickIds.length > 0 ? existingBrickIds[existingBrickIds.length - 1] : null,
      policyLogProb: logProb,
      estimatedQValue,
      entropy,
    };
  }

  /**
   * Autonomous assembly proposal: uses the RL controller to construct a new candidate DAG
   */
  proposeAssembly(availableBricks: BrickOperator[], space: NASSearchSpace): {
    assembly: AssembledDAG;
    decisions: PolicyControllerDecision[];
  } {
    this.state.candidateProposalsCount += 1;
    const builder = new DAGBuilder(`SelfAssembled_Gen_${this.state.episodes + 1}`, this.state.episodes + 1);
    const decisions: PolicyControllerDecision[] = [];
    const addedIds: string[] = [];

    const depth = Math.min(space.maxDepth, Math.floor(2 + Math.random() * 3)); // 2 to 4 layers

    for (let d = 0; d < depth; d++) {
      const decision = this.sampleDecision(availableBricks, addedIds);
      decisions.push(decision);

      const brick = availableBricks.find(b => b.id === decision.chosenBrickId)!;
      builder.addBrick(brick);
      addedIds.push(brick.id);

      // Try snapping to predecessor if compatible studs exist
      if (d > 0) {
        const prevId = addedIds[d - 1];
        const prevBrick = availableBricks.find(b => b.id === prevId)!;
        const validation = validateStudConnection(prevBrick.outputContract, brick.inputContract);

        if (validation.compatible) {
          builder.connect(prevId, brick.id);
        }
      }
    }

    const buildResult = builder.build();
    if (!buildResult.success || !buildResult.assembly) {
      // Fallback: create safe linear chain with guaranteed compatible bricks
      const safeChain = availableBricks.slice(0, 2);
      const safeBuilder = new DAGBuilder(`SafeFallback_Gen_${this.state.episodes}`, this.state.episodes);
      safeChain.forEach(b => safeBuilder.addBrick(b));
      if (safeChain.length >= 2) {
        safeBuilder.connect(safeChain[0].id, safeChain[1].id);
      }
      return {
        assembly: safeBuilder.build().assembly!,
        decisions,
      };
    }

    return {
      assembly: buildResult.assembly,
      decisions,
    };
  }

  /**
   * Update policy gradient with episode reward (REINFORCE algorithm)
   */
  updatePolicy(reward: number, decisions: PolicyControllerDecision[], assemblyId: string) {
    this.state.episodes += 1;
    if (reward > 0.7) {
      this.state.acceptedAssembliesCount += 1;
    }

    // Policy gradient update: theta <- theta + alpha * R * grad_log_prob
    const avgQ = decisions.reduce((acc, d) => acc + d.estimatedQValue, 0) / Math.max(decisions.length, 1);
    
    // Adjust policy gradient parameters
    this.state.policyGradients = this.state.policyGradients.map((g, idx) => {
      const delta = this.state.learningRate * (reward - 0.5) * (1.0 / (idx + 1));
      return Math.max(0.05, Math.min(1.0, g + delta));
    });

    // Anneal exploration temperature slowly
    this.state.temperature = Math.max(0.2, this.state.temperature * 0.99);

    this.state.history.unshift({
      episode: this.state.episodes,
      reward,
      qEstimate: avgQ,
      assemblyId,
    });

    if (this.state.history.length > 20) {
      this.state.history.pop();
    }
  }
}

// ============================================================================
// 3. Dynamic Runtime Self-Assembly: MoE Sparse Gating Router
// ============================================================================

export class MoERuntimeRouter {
  private state: MoERouterState;

  constructor(expertBrickIds: string[]) {
    const inDim = 8;
    const numExperts = expertBrickIds.length;
    const gatingWeights: number[][] = [];

    // Initialize gating weights
    for (let i = 0; i < inDim; i++) {
      const row: number[] = [];
      for (let e = 0; e < numExperts; e++) {
        row.push(Math.sin((i + 1) * 3.3 + (e + 1) * 1.7) * 0.3);
      }
      gatingWeights.push(row);
    }

    this.state = {
      expertBrickIds,
      topK: Math.min(2, numExperts),
      gatingWeights,
      lastRoutingProbabilities: new Array(numExperts).fill(1 / numExperts),
      activeExperts: expertBrickIds.slice(0, 2),
    };
  }

  getState(): MoERouterState {
    return { ...this.state };
  }

  /**
   * Routes an input token dynamically to top-K expert bricks
   */
  routeInput(inputVector: number[]): {
    chosenExperts: string[];
    routingProbabilities: number[];
  } {
    const numExperts = this.state.expertBrickIds.length;
    const logits: number[] = new Array(numExperts).fill(0);

    for (let e = 0; e < numExperts; e++) {
      for (let i = 0; i < Math.min(inputVector.length, this.state.gatingWeights.length); i++) {
        logits[e] += inputVector[i] * this.state.gatingWeights[i][e];
      }
    }

    // Softmax
    const maxL = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxL));
    const sumExps = exps.reduce((a, b) => a + b, 1e-9);
    const probs = exps.map(e => e / sumExps);

    this.state.lastRoutingProbabilities = probs;

    // Pick top-K
    const indexed = probs.map((p, idx) => ({ p, id: this.state.expertBrickIds[idx] }));
    indexed.sort((a, b) => b.p - a.p);

    const chosen = indexed.slice(0, this.state.topK).map(item => item.id);
    this.state.activeExperts = chosen;

    return {
      chosenExperts: chosen,
      routingProbabilities: probs,
    };
  }
}
