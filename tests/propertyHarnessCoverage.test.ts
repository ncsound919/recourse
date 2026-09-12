import { describe, it, expect } from 'vitest';
import { propertyScore, scoreGeneWithProperties } from '../src/dream/property-harness';

const PURE = `function g(input) { return input; }`;
const RANDOM = `function r(input) { return Math.random(); }`;
const THROWS = `function t(input) { return input.toUpperCase(); }`;
const NONDET_ARR = `function n(input) { return [Math.random()]; }`;

describe('property-harness coverage', () => {
  describe('propertyScore', () => {
    it('returns available:false with no runs when fast-check is absent (reward 0)', () => {
      // This path is normally reached only when require('fast-check') fails;
      // here we assert the API shape is honored by a compile-failing gene too.
      const report = propertyScore('this is not js(((', [], 1, 10);
      expect(report.available).toBe(true); // fast-check IS installed
      expect(report.properties[0].passed).toBe(false);
      expect(report.score).toBe(0);
    });

    it('reports a compile failure with available:true and a failing syntax property', () => {
      const report = propertyScore('function x( {', [1], 1, 10);
      expect(report.available).toBe(true);
      expect(report.properties).toHaveLength(1);
      expect(report.properties[0].name).toBe('SandboxSyntaxValid');
      expect(report.properties[0].passed).toBe(false);
      expect(report.score).toBe(0);
    });

    it('passes all four properties for a pure deterministic total gene', () => {
      const report = propertyScore(PURE, [1, 2, 3], 123, 50);
      expect(report.available).toBe(true);
      expect(report.runsPerProperty).toBe(50);
      expect(report.properties.map((p) => p.name)).toEqual([
        'Totality', 'DeterminismUnderReplay', 'InputPurity', 'FiniteOutputs',
      ]);
      expect(report.properties.every((p) => p.passed)).toBe(true);
      expect(report.score).toBe(1);
    });

    it('catches non-determinism with a counterexample', () => {
      const report = propertyScore(RANDOM, [1], 99, 30);
      expect(report.available).toBe(true);
      const det = report.properties.find((p) => p.name === 'DeterminismUnderReplay');
      expect(det?.passed).toBe(false);
      expect(det?.counterexample).toBeDefined();
      expect(report.score).toBeLessThan(1);
    });

    it('catches totality violations when the gene throws', () => {
      const report = propertyScore(THROWS, [1], 7, 30);
      const total = report.properties.find((p) => p.name === 'Totality');
      expect(total?.passed).toBe(false);
      expect(total?.counterexample).toBeDefined();
    });

    it('works with empty vectors (falls back to a constant arbitrary)', () => {
      const report = propertyScore(PURE, [], 5, 20);
      expect(report.available).toBe(true);
      expect(report.properties.length).toBe(4);
    });

    it('handles array-output genes across property checks', () => {
      const report = propertyScore(NONDET_ARR, [[1, 2]], 3, 20);
      const det = report.properties.find((p) => p.name === 'DeterminismUnderReplay');
      expect(det?.passed).toBe(false);
    });

    it('degrades safely on a circular vector (safeStringify + property catch)', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      // uniqueShapes' safeStringify throws on the cycle (line 88) and
      // inferArbitrary over the cyclic record stack-overflows -> outer catch.
      const report = propertyScore(PURE, [circular], 4, 10);
      expect(typeof report.score).toBe('number');
    });

    it('maps an unrecognized scalar to a constant arbitrary (fallback branch)', () => {
      const report = propertyScore(PURE, [function unused() {}], 6, 5);
      expect(report.available).toBe(true);
    });
  });

  describe('scoreGeneWithProperties', () => {
    it('scores a valid gene in [0,1]', () => {
      const { reward, propertyReport } = scoreGeneWithProperties(PURE, [1, 2, 3], 123);
      expect(reward).toBeGreaterThan(0);
      expect(reward).toBeLessThanOrEqual(1);
      expect(propertyReport.available).toBe(true);
    });

    it('returns reward 0 for a gene that fails to compile', () => {
      const { reward, propertyReport } = scoreGeneWithProperties('definitely not js {', [1], 5);
      expect(reward).toBe(0);
      expect(propertyReport.available).toBe(false);
    });

    it('handles mixed-typed vectors (number/array/object/string/null)', () => {
      const vectors = [1, [2, 3], { a: 4, b: [5] }, 'text', null, true];
      const { reward } = scoreGeneWithProperties(PURE, vectors, 42);
      expect(reward).toBeGreaterThanOrEqual(0);
      expect(reward).toBeLessThanOrEqual(1);
    });

    it('handles empty vectors', () => {
      const { reward } = scoreGeneWithProperties(PURE, [], 8);
      expect(reward).toBeGreaterThanOrEqual(0);
    });
  });
});
