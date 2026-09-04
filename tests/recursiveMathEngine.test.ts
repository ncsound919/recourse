import { describe, it, expect } from 'vitest';
import {
  computeEulerEncoding,
  computePythagoreanMetric,
  computeDerivativeUpdate,
  computeSchrodingerEvolution,
  computeEnergyBudget,
  computeBellmanUpdate,
  computeBayesianUpdate,
  computeChainRuleGradient,
  createInitialLoopState,
  executeRecursiveStep,
  DEFAULT_LOOP_CONFIG,
} from '../src/lib/recursiveMathEngine';

describe('Recursive Math Engine - Five Formulas + Trifecta', () => {
  describe("1. Euler's Formula (Spectral Encoding & Phasors)", () => {
    it('encodes signal into spectral phasors and computes coherence', () => {
      const signal = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0, -0.2, -0.4];
      const result = computeEulerEncoding(signal, 8);

      expect(result.formulaLatex).toContain('e^{ix}');
      expect(result.phasors.length).toBe(8);
      expect(result.encodedFeatureVector.length).toBe(8);
      expect(result.spectralEntropy).toBeGreaterThanOrEqual(0);
      expect(result.phaseCoherence).toBeGreaterThanOrEqual(0);
      expect(result.phaseCoherence).toBeLessThanOrEqual(1.0);
    });

    it('handles empty or flat signal gracefully without NaN', () => {
      const result = computeEulerEncoding([0, 0, 0, 0], 4);
      expect(result.phasors.length).toBe(4);
      expect(Number.isNaN(result.spectralEntropy)).toBe(false);
      expect(Number.isNaN(result.phaseCoherence)).toBe(false);
    });
  });

  describe('2. Pythagorean Theorem (Invariant Distance & Loss)', () => {
    it('calculates Euclidean distance and readiness score accurately', () => {
      const current = [1.0, 0.85, 0.70, 0.55];
      const target = [1.0, 0.85, 0.70, 0.55];
      const metric = computePythagoreanMetric(current, target, 0.04);

      expect(metric.euclideanDistance).toBeCloseTo(0, 3);
      expect(metric.readinessScore).toBeCloseTo(1.0, 3);
      expect(metric.isWithinInvariantTolerance).toBe(true);
      expect(metric.invariantViolations.length).toBe(0);
    });

    it('flags invariant violations when distance exceeds tolerance', () => {
      const current = [2.0, 0.0, 0.0, 0.0];
      const target = [0.0, 0.0, 0.0, 0.0];
      const metric = computePythagoreanMetric(current, target, 0.05);

      expect(metric.euclideanDistance).toBe(2.0);
      expect(metric.readinessScore).toBeLessThan(0.5);
      expect(metric.isWithinInvariantTolerance).toBe(false);
      expect(metric.invariantViolations.length).toBeGreaterThan(0);
    });
  });

  describe('3. Derivative Update (Momentum Gradient Descent)', () => {
    it('steps parameters toward target with momentum', () => {
      const current = [0.5, 0.5];
      const target = [1.0, 1.0];
      const priorDeltas = [0.0, 0.0];
      const update = computeDerivativeUpdate(current, target, priorDeltas, 0.1, 0.8);

      expect(update.gradients[0]).toBeCloseTo(-0.5, 3);
      expect(update.updatedParameters[0]).toBeGreaterThan(current[0]);
      expect(update.gradientNorm).toBeGreaterThan(0);
    });
  });

  describe('4. Schrödinger Equation (Unitary Evolution)', () => {
    it('preserves unitarity and normalizes state vector', () => {
      const initialPsi = [
        { real: 1 / Math.sqrt(2), imag: 0, amplitudeSq: 0.5 },
        { real: 1 / Math.sqrt(2), imag: 0, amplitudeSq: 0.5 },
      ];
      const evolution = computeSchrodingerEvolution(initialPsi, 0.05, 1.0, [1.0, 2.0]);

      expect(evolution.normConservationCheck).toBeCloseTo(1.0, 2);
      expect(evolution.coherencePreserved).toBe(true);
      expect(evolution.stateVectorPsi.length).toBe(2);
    });
  });

  describe('5. E = mc² (Relativistic Compute Budget)', () => {
    it('enforces compute budget and gates execution when depleted', () => {
      const budget = computeEnergyBudget(10.0, 1, 0.05, 5000, 5000);
      expect(budget.permitNextIteration).toBe(true);
      expect(budget.iterationMassM).toBeGreaterThan(0);

      const exhaustedBudget = computeEnergyBudget(10.0, 10, 0.05, 10, 5000);
      expect(exhaustedBudget.permitNextIteration).toBe(false);
    });
  });

  describe('Trifecta: Bellman, Bayesian, Chain Rule', () => {
    it('computes Bellman dynamic programming updates', () => {
      const currentV = [0.0, 0.0, 0.0];
      const rewards = [1.0, 2.0, 3.0];
      const bellman = computeBellmanUpdate(currentV, rewards, 0.9);

      expect(bellman.stateValues.length).toBe(3);
      expect(bellman.stateValues[0]).toBe(1.0);
      expect(bellman.maxDelta).toBeGreaterThan(0);
    });

    it('computes Bayesian posterior update without division by zero', () => {
      const bayes = computeBayesianUpdate(0.5, 0.2, 0.8, 0.1);
      expect(bayes.posteriorMu).toBeGreaterThan(0.5);
      expect(bayes.posteriorSigma).toBeLessThan(0.2);
      expect(bayes.kalmanGain).toBeGreaterThan(0);

      // Edge case: zero variance
      const zeroBayes = computeBayesianUpdate(0.5, 0.0, 0.8, 0.0);
      expect(Number.isNaN(zeroBayes.kalmanGain)).toBe(false);
      expect(Number.isNaN(zeroBayes.posteriorMu)).toBe(false);
    });

    it('computes Chain Rule gradient propagation', () => {
      const chain = computeChainRuleGradient([0.5, 0.5, 0.5], 1.0, 1.0, 0.1);
      expect(chain.gradients.length).toBe(3);
      expect(chain.loss).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Full Recursive Loop Execution', () => {
    it('initializes state and performs deterministic iterative steps', () => {
      const state = createInitialLoopState(DEFAULT_LOOP_CONFIG);
      expect(state.iteration).toBe(1);
      expect(state.history.length).toBe(1);

      const step1 = executeRecursiveStep(state);
      expect(state.iteration).toBe(2);
      expect(state.history.length).toBe(2);
      expect(step1.readinessScore).toBeDefined();

      // Run multiple steps to verify history cap
      for (let i = 0; i < 60; i++) {
        executeRecursiveStep(state);
      }
      expect(state.history.length).toBeLessThanOrEqual(50);
    });
  });
});
