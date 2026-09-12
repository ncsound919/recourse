/**
 * Quantum Bell-State Synthesis (via jsqubits)
 *
 * This module is a thin wrapper over the mature jsqubits quantum simulator
 * (https://davidbkemp.github.io/jsqubits/). It builds the real Bell state
 * (|00> + |11>) / sqrt(2) by applying H then CNOT to |00>, and returns the
 * exact amplitudes and derived quantities. All statevector, gate, and norm
 * math is delegated to jsqubits; nothing here is hand-rolled.
 *
 * Historical note: this file previously hand-rolled a full statevector engine
 * (Complex helpers, QuantumStateVector, QuantumCircuit, noise channels, and a
 * density-matrix eigensolver whose dim>2 branch returned 0 as a placeholder).
 * None of that machinery had consumers outside this file, and the eigensolver
 * was an explicit stub, so it was deleted rather than carried forward.
 */

import { jsqubits } from 'jsqubits';

export interface BellStateResult {
  /** L2 norm of the state vector, sqrt(sum_i |c_i|^2). */
  norm: number;
  /** Von Neumann entanglement entropy (bits) across the bipartition. */
  entropy: number;
  isMaximallyEntangled: boolean;
  /** Born-rule probabilities indexed by basis state (|00>=0 ... |11>=3). */
  probabilities: number[];
  /** Exact complex amplitudes per basis state, in the same index order. */
  amplitudes: { re: number; im: number }[];
}

/**
 * Builds the Bell state (|00> + |11>) / sqrt(2) with jsqubits:
 *   |00> --H on qubit 0--> (|00> + |10>) / sqrt(2) --CNOT(0,1)--> (|00> + |11>) / sqrt(2)
 */
export function synthesizeBellState(): BellStateResult {
  const numQubits = 2;
  const state = jsqubits(`|${'0'.repeat(numQubits)}>`).hadamard(0).cnot(0, 1);

  const amplitudes: { re: number; im: number }[] = [];
  let normSq = 0;
  for (let basis = 0; basis < 1 << numQubits; basis++) {
    // jsqubits returns a Complex (real / imaginary) for every basis index,
    // including zeros for absent amplitudes.
    const c = state.amplitude(basis);
    amplitudes.push({ re: c.real, im: c.imaginary });
    normSq += c.real * c.real + c.imaginary * c.imaginary;
  }
  const norm = Math.sqrt(normSq);
  const probabilities = amplitudes.map(a => a.re * a.re + a.im * a.im);

  // Von Neumann entropy of the reduced state of qubit 0. For a pure bipartite
  // state the reduced-density-matrix eigenvalues are the qubit-0 marginals,
  // so entropy = -p0*log2(p0) - p1*log2(p1), computed from the real amplitudes.
  const p0 = probabilities[0] + probabilities[2];
  const p1 = probabilities[1] + probabilities[3];
  let entropy = 0;
  for (const p of [p0, p1]) {
    if (p > 1e-12) entropy -= p * Math.log2(p);
  }
  const isMaximallyEntangled = Math.abs(entropy - 1.0) < 1e-3;

  return { norm, entropy, isMaximallyEntangled, probabilities, amplitudes };
}
