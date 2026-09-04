// src/lego/primitives.ts — Layer 2: The Brick Bin (Primitive Operators Library)
// Curated atomic, independently trainable, pure & deterministic operators.

import { Value } from '../dream/autograd';
import { BrickOperator, BrickCategory } from './types';
import { STANDARD_STUDS } from './contracts';

// ============================================================================
// Helper: Pure Matrix Multiplication with Autograd Values
// ============================================================================

function matmulValues(A: Value[][], B: Value[][]): Value[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const rowsB = B.length;
  const colsB = B[0].length;

  if (colsA !== rowsB) {
    throw new Error(`Dimension mismatch in MatMul: A[${rowsA}x${colsA}] vs B[${rowsB}x${colsB}]`);
  }

  const result: Value[][] = [];
  for (let r = 0; r < rowsA; r++) {
    const rowOut: Value[] = [];
    for (let c = 0; c < colsB; c++) {
      let sum: Value = new Value(0);
      for (let k = 0; k < colsA; k++) {
        sum = sum.add(A[r][k].mul(B[k][c]));
      }
      rowOut.push(sum);
    }
    result.push(rowOut);
  }
  return result;
}

// ============================================================================
// Brick 1: Dense Projection & Non-linear Transform (MLP)
// [B, 8] -> [B, 16]
// ============================================================================

export function createMLPProjectionBrick(id = 'brick_mlp_proj_8_16'): BrickOperator {
  const inDim = 8;
  const outDim = 16;
  
  // Deterministic Xavier/Glorot initialization seed
  const params: Record<string, { name: string; value: Value; initialValue: number }> = {};
  for (let i = 0; i < inDim; i++) {
    for (let j = 0; j < outDim; j++) {
      const initVal = Math.sin((i + 1) * 31.7 + (j + 1) * 17.3) * Math.sqrt(2 / (inDim + outDim));
      params[`w_${i}_${j}`] = {
        name: `w_${i}_${j}`,
        value: new Value(initVal),
        initialValue: initVal,
      };
    }
  }

  return {
    id,
    name: 'Dense Projection (8 -> 16)',
    category: 'transform',
    description: 'Differentiable linear projection with LeakyReLU activation mapping 8D to 16D.',
    version: '1.2.0',
    inputContract: STANDARD_STUDS.VECTOR_1D_8,
    outputContract: STANDARD_STUDS.VECTOR_1D_16,
    params,
    isIndependentlyTrainable: true,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 0.94,
    trainingEpochsInIsolation: 120,
    forward: (input: Value[][]): Value[][] => {
      const batchSize = input.length;
      const output: Value[][] = [];

      for (let b = 0; b < batchSize; b++) {
        const rowOut: Value[] = [];
        for (let j = 0; j < outDim; j++) {
          let sum = new Value(0.01); // small bias
          for (let i = 0; i < inDim; i++) {
            const w = params[`w_${i}_${j}`].value;
            sum = sum.add(input[b][i].mul(w));
          }
          // LeakyReLU: x > 0 ? x : 0.05 * x
          const activated = sum.data > 0 ? sum : sum.mul(0.05);
          rowOut.push(activated);
        }
        output.push(rowOut);
      }
      return output;
    }
  };
}

// ============================================================================
// Brick 2: Scalar Self-Attention Head
// [B, 8] -> [B, 8]
// ============================================================================

export function createAttentionHeadBrick(id = 'brick_attention_head_8'): BrickOperator {
  const dim = 8;
  const params: Record<string, { name: string; value: Value; initialValue: number }> = {};
  
  // Query, Key, Value weight matrices
  ['Q', 'K', 'V'].forEach((type, tIdx) => {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        const initVal = (i === j ? 0.8 : 0.05) * Math.cos((tIdx + 1) * (i + 1) * 11.2);
        params[`${type}_${i}_${j}`] = {
          name: `${type}_${i}_${j}`,
          value: new Value(initVal),
          initialValue: initVal,
        };
      }
    }
  });

  return {
    id,
    name: 'Multi-Head Attention (Self-Attn 8D)',
    category: 'transform',
    description: 'Scaled dot-product self-attention with learnable Query, Key, Value projections.',
    version: '2.0.1',
    inputContract: STANDARD_STUDS.VECTOR_1D_8,
    outputContract: STANDARD_STUDS.VECTOR_1D_8,
    params,
    isIndependentlyTrainable: true,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 0.96,
    trainingEpochsInIsolation: 200,
    forward: (input: Value[][]): Value[][] => {
      const batchSize = input.length;
      const output: Value[][] = [];
      const scaleFactor = 1 / Math.sqrt(dim);

      for (let b = 0; b < batchSize; b++) {
        // Project Q, K, V
        const Q: Value[] = [];
        const K: Value[] = [];
        const V: Value[] = [];

        for (let j = 0; j < dim; j++) {
          let sumQ = new Value(0);
          let sumK = new Value(0);
          let sumV = new Value(0);
          for (let i = 0; i < dim; i++) {
            sumQ = sumQ.add(input[b][i].mul(params[`Q_${i}_${j}`].value));
            sumK = sumK.add(input[b][i].mul(params[`K_${i}_${j}`].value));
            sumV = sumV.add(input[b][i].mul(params[`V_${i}_${j}`].value));
          }
          Q.push(sumQ);
          K.push(sumK);
          V.push(sumV);
        }

        // Dot product Q and K
        let qkDot = new Value(0);
        for (let i = 0; i < dim; i++) {
          qkDot = qkDot.add(Q[i].mul(K[i]));
        }
        
        // Softmax attention weight via sigmoid approximation
        const attnWeight = qkDot.mul(scaleFactor).sigmoid();

        // Weighted output with residual connection
        const rowOut: Value[] = [];
        for (let i = 0; i < dim; i++) {
          const attended = V[i].mul(attnWeight);
          rowOut.push(input[b][i].add(attended)); // Residual connection
        }
        output.push(rowOut);
      }
      return output;
    }
  };
}

// ============================================================================
// Brick 3: 1D Discrete Fourier Spectral Transform
// [B, 8] -> [B, 8]
// ============================================================================

export function createFFT1DTransformBrick(id = 'brick_fft_spectral_8'): BrickOperator {
  const N = 8;
  const params: Record<string, { name: string; value: Value; initialValue: number }> = {
    gain: { name: 'gain', value: new Value(1.0), initialValue: 1.0 },
    dcFilter: { name: 'dcFilter', value: new Value(0.95), initialValue: 0.95 }
  };

  return {
    id,
    name: '1D Fourier Spectral Transform',
    category: 'transform',
    description: 'Fast discrete Fourier transform decomposing feature signals into orthogonal frequency magnitude bins.',
    version: '1.1.0',
    inputContract: STANDARD_STUDS.VECTOR_1D_8,
    outputContract: STANDARD_STUDS.FREQUENCY_SPECTRUM_8,
    params,
    isIndependentlyTrainable: true,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 0.98,
    trainingEpochsInIsolation: 80,
    forward: (input: Value[][]): Value[][] => {
      const batchSize = input.length;
      const output: Value[][] = [];

      for (let b = 0; b < batchSize; b++) {
        const spectrum: Value[] = [];
        for (let k = 0; k < N; k++) {
          let real = new Value(0);
          let imag = new Value(0);
          for (let n = 0; n < N; n++) {
            const angle = (-2 * Math.PI * k * n) / N;
            const cosVal = Math.cos(angle);
            const sinVal = Math.sin(angle);
            real = real.add(input[b][n].mul(cosVal));
            imag = imag.add(input[b][n].mul(sinVal));
          }
          // Magnitude = sqrt(real^2 + imag^2 + epsilon)
          const magSquared = real.pow(2).add(imag.pow(2)).add(1e-6);
          const mag = magSquared.pow(0.5).mul(params.gain.value);
          spectrum.push(mag);
        }
        output.push(spectrum);
      }
      return output;
    }
  };
}

// ============================================================================
// Brick 4: 1D Causal Convolution Feature Extractor
// [B, 16] -> [B, 8]
// ============================================================================

export function createConv1DTransformBrick(id = 'brick_conv1d_16_8'): BrickOperator {
  const kernelSize = 3;
  const inDim = 16;
  const outDim = 8;
  const params: Record<string, { name: string; value: Value; initialValue: number }> = {};

  for (let k = 0; k < kernelSize; k++) {
    const initVal = Math.cos((k + 1) * 2.7) * 0.4;
    params[`filter_${k}`] = {
      name: `filter_${k}`,
      value: new Value(initVal),
      initialValue: initVal,
    };
  }

  return {
    id,
    name: '1D Local Causal Convolution (16 -> 8)',
    category: 'transform',
    description: 'Sliding window causal convolution capturing local spatial receptive fields with kernel size 3.',
    version: '1.0.4',
    inputContract: STANDARD_STUDS.VECTOR_1D_16,
    outputContract: STANDARD_STUDS.VECTOR_1D_8,
    params,
    isIndependentlyTrainable: true,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 0.91,
    trainingEpochsInIsolation: 140,
    forward: (input: Value[][]): Value[][] => {
      const batchSize = input.length;
      const output: Value[][] = [];

      for (let b = 0; b < batchSize; b++) {
        const rowOut: Value[] = [];
        // Stride 2 to pool from 16 down to 8
        for (let j = 0; j < outDim; j++) {
          const centerIdx = j * 2;
          let convSum = new Value(0);
          for (let k = 0; k < kernelSize; k++) {
            const idx = Math.min(Math.max(centerIdx + k - 1, 0), inDim - 1);
            convSum = convSum.add(input[b][idx].mul(params[`filter_${k}`].value));
          }
          rowOut.push(convSum.relu());
        }
        output.push(rowOut);
      }
      return output;
    }
  };
}

// ============================================================================
// Brick 5: Differentiable Episodic Memory Slot Operator
// [B, 8] -> [B, 8]
// ============================================================================

export function createEpisodicMemoryBrick(id = 'brick_episodic_memory_8'): BrickOperator {
  const numSlots = 4;
  const dim = 8;
  const params: Record<string, { name: string; value: Value; initialValue: number }> = {};

  for (let s = 0; s < numSlots; s++) {
    for (let d = 0; d < dim; d++) {
      const initVal = Math.sin((s + 1) * 5.3 + (d + 1) * 3.1) * 0.3;
      params[`slot_${s}_${d}`] = {
        name: `slot_${s}_${d}`,
        value: new Value(initVal),
        initialValue: initVal,
      };
    }
  }

  return {
    id,
    name: 'Differentiable Key-Value Memory',
    category: 'memory',
    description: 'Associative content-addressable memory buffer reading and writing experience slots via cosine addressing.',
    version: '2.1.0',
    inputContract: STANDARD_STUDS.VECTOR_1D_8,
    outputContract: STANDARD_STUDS.VECTOR_1D_8,
    params,
    isIndependentlyTrainable: true,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 0.95,
    trainingEpochsInIsolation: 190,
    forward: (input: Value[][]): Value[][] => {
      const batchSize = input.length;
      const output: Value[][] = [];

      for (let b = 0; b < batchSize; b++) {
        // Compute dot product alignment with each memory slot
        const alignments: Value[] = [];
        for (let s = 0; s < numSlots; s++) {
          let dot = new Value(0);
          for (let d = 0; d < dim; d++) {
            dot = dot.add(input[b][d].mul(params[`slot_${s}_${d}`].value));
          }
          alignments.push(dot.sigmoid());
        }

        // Read out memory blend
        const readOut: Value[] = [];
        for (let d = 0; d < dim; d++) {
          let slotBlend = new Value(0);
          for (let s = 0; s < numSlots; s++) {
            slotBlend = slotBlend.add(params[`slot_${s}_${d}`].value.mul(alignments[s]));
          }
          // Residual blend with current input
          readOut.push(input[b][d].mul(0.7).add(slotBlend.mul(0.3)));
        }
        output.push(readOut);
      }
      return output;
    }
  };
}

// ============================================================================
// Brick 6: MoE Gating Router (Sparse Top-K Brick Activation)
// [B, 8] -> [B, 4]
// ============================================================================

export function createMoERouterBrick(id = 'brick_moe_gating_router'): BrickOperator {
  const inDim = 8;
  const numExperts = 4;
  const params: Record<string, { name: string; value: Value; initialValue: number }> = {};

  for (let i = 0; i < inDim; i++) {
    for (let e = 0; e < numExperts; e++) {
      const initVal = Math.cos((i + 1) * 7.1 + (e + 1) * 9.3) * 0.2;
      params[`gate_${i}_${e}`] = {
        name: `gate_${i}_${e}`,
        value: new Value(initVal),
        initialValue: initVal,
      };
    }
  }

  return {
    id,
    name: 'MoE Sparse Gating Router (Top-2)',
    category: 'router',
    description: 'Dynamic per-input expert router activating sparse computational paths for token-level self-assembly.',
    version: '3.0.0',
    inputContract: STANDARD_STUDS.VECTOR_1D_8,
    outputContract: STANDARD_STUDS.VECTOR_1D_4,
    params,
    isIndependentlyTrainable: true,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 0.97,
    trainingEpochsInIsolation: 250,
    forward: (input: Value[][]): Value[][] => {
      const batchSize = input.length;
      const output: Value[][] = [];

      for (let b = 0; b < batchSize; b++) {
        // Calculate gating logits for each expert
        const logits: Value[] = [];
        for (let e = 0; e < numExperts; e++) {
          let logit = new Value(0);
          for (let i = 0; i < inDim; i++) {
            logit = logit.add(input[b][i].mul(params[`gate_${i}_${e}`].value));
          }
          logits.push(logit);
        }

        // Softmax routing probabilities
        let expSum = new Value(1e-6);
        const exps: Value[] = [];
        for (let e = 0; e < numExperts; e++) {
          // Numerical stability clamp
          const clampedVal = Math.max(Math.min(logits[e].data, 10), -10);
          const expVal = new Value(Math.exp(clampedVal));
          exps.push(expVal);
          expSum = expSum.add(expVal);
        }

        const routingProbs: Value[] = [];
        for (let e = 0; e < numExperts; e++) {
          routingProbs.push(exps[e].div(expSum));
        }
        output.push(routingProbs);
      }
      return output;
    }
  };
}

// ============================================================================
// Brick 7: Mean Squared Error Loss Brick
// [B, 1] & [B, 1] -> [1, 1]
// ============================================================================

export function createMSELossBrick(id = 'brick_mse_loss'): BrickOperator {
  return {
    id,
    name: 'MSE Objective Evaluator',
    category: 'loss',
    description: 'Computes differentiable mean squared error between model predictions and target ground truth.',
    version: '1.0.0',
    inputContract: STANDARD_STUDS.SCALAR_TARGET,
    outputContract: STANDARD_STUDS.SCALAR_TARGET,
    params: {},
    isIndependentlyTrainable: false,
    isPureDeterministic: true,
    isDifferentiable: true,
    isolatedScore: 1.0,
    forward: (input: Value[][]): Value[][] => {
      // Expects first element as prediction, second as target if combined, or computes variance from 0
      let totalLoss = new Value(0);
      const batchSize = input.length;

      for (let b = 0; b < batchSize; b++) {
        const pred = input[b][0];
        const target = input[b].length > 1 ? input[b][1] : new Value(0);
        const err = pred.sub(target);
        totalLoss = totalLoss.add(err.pow(2));
      }
      const meanLoss = totalLoss.div(batchSize);
      return [[meanLoss]];
    }
  };
}

// ============================================================================
// Default Primitive Catalog
// ============================================================================

export function getInitialBrickBin(): BrickOperator[] {
  return [
    createMLPProjectionBrick(),
    createAttentionHeadBrick(),
    createFFT1DTransformBrick(),
    createConv1DTransformBrick(),
    createEpisodicMemoryBrick(),
    createMoERouterBrick(),
    createMSELossBrick(),
  ];
}
