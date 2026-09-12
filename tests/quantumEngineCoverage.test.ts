import { describe, it, expect } from 'vitest';
import { synthesizeBellState } from '../src/lib/quantumEngine';

describe('synthesizeBellState (jsqubits wrapper)', () => {
  it('produces the exact (|00> + |11>)/sqrt(2) amplitudes', () => {
    const r = synthesizeBellState();

    // Expected amplitudes indexed by basis state |basis> (0..3).
    expect(r.amplitudes).toHaveLength(4);
    expect(r.amplitudes[0].re).toBeCloseTo(Math.SQRT1_2, 10);
    expect(r.amplitudes[0].im).toBeCloseTo(0, 10);
    expect(r.amplitudes[1].re).toBeCloseTo(0, 10);
    expect(r.amplitudes[1].im).toBeCloseTo(0, 10);
    expect(r.amplitudes[2].re).toBeCloseTo(0, 10);
    expect(r.amplitudes[2].im).toBeCloseTo(0, 10);
    expect(r.amplitudes[3].re).toBeCloseTo(Math.SQRT1_2, 10);
    expect(r.amplitudes[3].im).toBeCloseTo(0, 10);
  });

  it('normalizes to unit L2 norm', () => {
    const r = synthesizeBellState();
    expect(r.norm).toBeCloseTo(1, 10);
    const recomputed = Math.sqrt(r.amplitudes.reduce((s, a) => s + a.re * a.re + a.im * a.im, 0));
    expect(r.norm).toBeCloseTo(recomputed, 12);
  });

  it('reports Born-rule probabilities 0.5/0/0/0.5', () => {
    const r = synthesizeBellState();
    expect(r.probabilities).toHaveLength(4);
    expect(r.probabilities[0]).toBeCloseTo(0.5, 10);
    expect(r.probabilities[1]).toBeCloseTo(0, 10);
    expect(r.probabilities[2]).toBeCloseTo(0, 10);
    expect(r.probabilities[3]).toBeCloseTo(0.5, 10);
    expect(r.probabilities.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
    // Each probability is the squared modulus of its amplitude.
    for (let i = 0; i < 4; i++) {
      const a = r.amplitudes[i];
      expect(r.probabilities[i]).toBeCloseTo(a.re * a.re + a.im * a.im, 12);
    }
  });

  it('is maximally entangled (von Neumann entropy = 1 bit across the bipartition)', () => {
    const r = synthesizeBellState();
    // Reduced state of qubit 0: p(|0>) = p00 + p01 = 0.5, p(|1>) = p10 + p11 = 0.5
    const p0 = r.probabilities[0] + r.probabilities[1];
    const p1 = r.probabilities[2] + r.probabilities[3];
    const expectedEntropy = p0 > 0 ? -p0 * Math.log2(p0) : 0;
    const expectedEntropy2 = p1 > 0 ? expectedEntropy - p1 * Math.log2(p1) : expectedEntropy;
    expect(expectedEntropy2).toBeCloseTo(1, 10);
    expect(r.entropy).toBeCloseTo(expectedEntropy2, 10);
    expect(r.isMaximallyEntangled).toBe(true);
  });

  it('is deterministic across calls', () => {
    const a = synthesizeBellState();
    const b = synthesizeBellState();
    expect(a.probabilities).toEqual(b.probabilities);
    expect(a.amplitudes).toEqual(b.amplitudes);
  });
});
