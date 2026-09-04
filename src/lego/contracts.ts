// src/lego/contracts.ts — Layer 1: The Studs (Typed Contracts)
// Standardized, machine-readable interfaces enabling safe, autonomous component snapping.

import { StudContract, StudValidationResult, TensorShape, TensorDType } from './types';

// ============================================================================
// Standard Library of Stud Contracts
// ============================================================================

export const STANDARD_STUDS: Record<string, StudContract> = {
  // Dense feature vector [Batch, Dim]
  VECTOR_1D_8: {
    id: 'stud_vec_1d_8',
    name: 'Vector1D[B, 8]',
    shape: { dims: ['B', 8], description: 'Batch of 8-dimensional feature vectors' },
    dtype: 'float32',
    preconditions: ['all_finite', 'rank_2'],
    expectedCostFlops: 64,
    expectedLatencyMs: 0.1,
    schemaDescription: 'Array of arrays shaped [B, 8] with numeric floats',
  },
  VECTOR_1D_16: {
    id: 'stud_vec_1d_16',
    name: 'Vector1D[B, 16]',
    shape: { dims: ['B', 16], description: 'Batch of 16-dimensional embedding vectors' },
    dtype: 'float32',
    preconditions: ['all_finite', 'rank_2'],
    expectedCostFlops: 128,
    expectedLatencyMs: 0.15,
    schemaDescription: 'Array of arrays shaped [B, 16] with numeric floats',
  },
  VECTOR_1D_4: {
    id: 'stud_vec_1d_4',
    name: 'Vector1D[B, 4]',
    shape: { dims: ['B', 4], description: 'Batch of 4-dimensional compact features' },
    dtype: 'float32',
    preconditions: ['all_finite', 'rank_2'],
    expectedCostFlops: 32,
    expectedLatencyMs: 0.08,
    schemaDescription: 'Array of arrays shaped [B, 4] with numeric floats',
  },
  SCALAR_TARGET: {
    id: 'stud_scalar_target',
    name: 'ScalarTarget[B, 1]',
    shape: { dims: ['B', 1], description: 'Batch of single scalar predictions/losses' },
    dtype: 'float32',
    preconditions: ['all_finite', 'rank_2'],
    expectedCostFlops: 16,
    expectedLatencyMs: 0.05,
    schemaDescription: 'Array of single-element arrays shaped [B, 1]',
  },
  SEQUENCE_1D_8x4: {
    id: 'stud_seq_1d_8x4',
    name: 'Sequence[B, 8, 4]',
    shape: { dims: ['B', 8, 4], description: 'Temporal sequence of length 8 with 4 channels' },
    dtype: 'float32',
    preconditions: ['all_finite', 'rank_3'],
    expectedCostFlops: 256,
    expectedLatencyMs: 0.3,
    schemaDescription: 'Array of sequences shaped [B, Seq=8, Dim=4]',
  },
  FREQUENCY_SPECTRUM_8: {
    id: 'stud_freq_spec_8',
    name: 'FrequencySpectrum[B, 8]',
    shape: { dims: ['B', 8], description: 'Fourier transform magnitude spectrum' },
    dtype: 'float32',
    preconditions: ['all_finite', 'non_negative'],
    expectedCostFlops: 192,
    expectedLatencyMs: 0.25,
    schemaDescription: 'Frequency domain representation with 8 bins',
  },
  MEMORY_SLOT_4x4: {
    id: 'stud_mem_4x4',
    name: 'MemorySlot[B, 4, 4]',
    shape: { dims: ['B', 4, 4], description: 'Differentiable memory slot address/content matrix' },
    dtype: 'float32',
    preconditions: ['all_finite', 'bounded_values'],
    expectedCostFlops: 128,
    expectedLatencyMs: 0.2,
    schemaDescription: 'Read/write memory address and content bank',
  }
};

// ============================================================================
// Stud Compatibility and Validation Engine
// ============================================================================

/**
 * Checks if an output stud contract can safely plug into an input stud contract.
 * Like verifying that Lego cylinder studs align and have matching millimeter diameters.
 */
export function validateStudConnection(
  outputContract: StudContract,
  inputContract: StudContract
): StudValidationResult {
  const mismatches: string[] = [];
  const warnings: string[] = [];
  let broadcastPossible = false;

  // 1. Data Type Compatibility
  if (outputContract.dtype !== inputContract.dtype) {
    // Some types can be promoted (e.g. float32 to float64)
    if (outputContract.dtype === 'float32' && inputContract.dtype === 'float64') {
      warnings.push(`DType promotion required from ${outputContract.dtype} to ${inputContract.dtype}`);
    } else {
      mismatches.push(`Incompatible DType: Output is ${outputContract.dtype}, but Input requires ${inputContract.dtype}`);
    }
  }

  // 2. Rank and Dimension Compatibility
  const outDims = outputContract.shape.dims;
  const inDims = inputContract.shape.dims;

  if (outDims.length !== inDims.length) {
    // Check if broadcasting is possible (e.g. [B, 1] to [B, D])
    if (outDims.length === 2 && inDims.length === 2) {
      if (outDims[1] === 1 || inDims[1] === 1 || inDims[1] === '*') {
        broadcastPossible = true;
        warnings.push(`Broadcasting applied across rank-2 dimensions: [${outDims.join(', ')}] -> [${inDims.join(', ')}]`);
      } else {
        mismatches.push(`Rank mismatch: Output rank is ${outDims.length} (${outputContract.name}), Input rank is ${inDims.length} (${inputContract.name})`);
      }
    } else {
      mismatches.push(`Rank mismatch: Output has ${outDims.length} dimensions, Input expects ${inDims.length}`);
    }
  } else {
    // Same rank: check individual dimensions
    for (let i = 0; i < outDims.length; i++) {
      const outD = outDims[i];
      const inD = inDims[i];

      // Wildcard or dynamic batch matches any
      if (outD === '*' || inD === '*' || (outD === 'B' && inD === 'B')) {
        continue;
      }

      if (typeof outD === 'number' && typeof inD === 'number') {
        if (outD !== inD) {
          if (outD === 1 || inD === 1) {
            broadcastPossible = true;
            warnings.push(`Dimension ${i} broadcasted from ${outD} to ${inD}`);
          } else {
            mismatches.push(`Dimension ${i} mismatch: Output has size ${outD}, but Input expects size ${inD}`);
          }
        }
      }
    }
  }

  // 3. Preconditions validation
  for (const pre of inputContract.preconditions) {
    if (pre === 'non_negative' && !outputContract.preconditions.includes('non_negative')) {
      warnings.push(`Input expects non-negative values; ensure preceding activation bounds output`);
    }
  }

  return {
    compatible: mismatches.length === 0,
    mismatches,
    broadcastPossible,
    warnings,
  };
}

/**
 * Validates actual runtime tensor data against a StudContract schema.
 */
export function validateRuntimeTensor(
  tensor: number[][],
  contract: StudContract
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(tensor) || tensor.length === 0) {
    return { valid: false, errors: ['Tensor must be a non-empty array'] };
  }

  const batchSize = tensor.length;
  const expectedDim = typeof contract.shape.dims[1] === 'number' ? contract.shape.dims[1] : null;

  for (let b = 0; b < batchSize; b++) {
    const row = tensor[b];
    if (!Array.isArray(row)) {
      errors.push(`Batch row ${b} is not an array`);
      break;
    }

    if (expectedDim !== null && row.length !== expectedDim) {
      errors.push(`Row ${b} dimension is ${row.length}, expected ${expectedDim}`);
      break;
    }

    for (let i = 0; i < row.length; i++) {
      const val = row[i];
      if (!Number.isFinite(val)) {
        errors.push(`Non-finite numerical value detected at [${b}, ${i}]: ${val}`);
        break;
      }
      if (contract.preconditions.includes('non_negative') && val < 0) {
        errors.push(`Negative value (${val}) violates non_negative precondition at [${b}, ${i}]`);
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
