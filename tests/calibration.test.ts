import { describe, it, expect } from 'vitest';
import {
  brierScore,
  mae,
  reliabilityBins,
  expectedCalibrationError,
  calibrationReport,
  isCalibrated,
  type Forecast,
} from '../src/lib/calibration';

describe('calibration', () => {
  describe('brierScore', () => {
    it('returns 0 for empty forecasts', () => {
      expect(brierScore([])).toBe(0);
    });

    it('returns 0 for perfect forecasts', () => {
      const forecasts: Forecast[] = [
        { predicted: 1, realized: 1 },
        { predicted: 0, realized: 0 },
        { predicted: 0.5, realized: 0.5 },
      ];
      expect(brierScore(forecasts)).toBe(0);
    });

    it('computes mean squared error', () => {
      const forecasts: Forecast[] = [
        { predicted: 0.8, realized: 1 },
        { predicted: 0.3, realized: 0 },
      ];
      const expected = ((0.8 - 1) ** 2 + (0.3 - 0) ** 2) / 2;
      expect(brierScore(forecasts)).toBeCloseTo(expected, 4);
    });
  });

  describe('mae', () => {
    it('returns 0 for empty forecasts', () => {
      expect(mae([])).toBe(0);
    });

    it('computes mean absolute error', () => {
      const forecasts: Forecast[] = [
        { predicted: 0.8, realized: 1 },
        { predicted: 0.3, realized: 0 },
      ];
      expect(mae(forecasts)).toBeCloseTo(0.25, 4);
    });
  });

  describe('reliabilityBins', () => {
    it('creates the correct number of bins', () => {
      const bins = reliabilityBins([], 10);
      expect(bins).toHaveLength(10);
      expect(bins[0].lo).toBe(0);
      expect(bins[9].hi).toBe(1);
    });

    it('bins forecasts correctly', () => {
      const forecasts: Forecast[] = [
        { predicted: 0.05, realized: 1 },
        { predicted: 0.15, realized: 0 },
        { predicted: 0.95, realized: 1 },
      ];
      const bins = reliabilityBins(forecasts, 10);
      expect(bins[0].count).toBe(1);
      expect(bins[0].meanPredicted).toBeCloseTo(0.05, 4);
      expect(bins[0].realizedFreq).toBe(1);
      expect(bins[1].count).toBe(1);
      expect(bins[9].count).toBe(1);
    });

    it('handles edge case of predicted = 1.0', () => {
      const forecasts: Forecast[] = [{ predicted: 1.0, realized: 1 }];
      const bins = reliabilityBins(forecasts, 10);
      expect(bins[9].count).toBe(1);
    });
  });

  describe('expectedCalibrationError', () => {
    it('returns 0 for empty bins', () => {
      const bins = reliabilityBins([], 10);
      expect(expectedCalibrationError(bins)).toBe(0);
    });

    it('computes weighted mean of bin gaps', () => {
      const forecasts: Forecast[] = [
        { predicted: 0.05, realized: 1 },
        { predicted: 0.15, realized: 0 },
      ];
      const bins = reliabilityBins(forecasts, 10);
      const ece = expectedCalibrationError(bins);
      expect(ece).toBeGreaterThan(0);
    });

    it('returns 0 when predictions match realizations', () => {
      const forecasts: Forecast[] = [
        { predicted: 0.5, realized: 0.5 },
        { predicted: 0.5, realized: 0.5 },
      ];
      const bins = reliabilityBins(forecasts, 10);
      expect(expectedCalibrationError(bins)).toBe(0);
    });
  });

  describe('calibrationReport', () => {
    it('returns a complete report', () => {
      const forecasts: Forecast[] = [
        { predicted: 0.8, realized: 1 },
        { predicted: 0.3, realized: 0 },
        { predicted: 0.6, realized: 0.5 },
      ];
      const report = calibrationReport(forecasts);
      expect(report.n).toBe(3);
      expect(report.brier).toBeGreaterThan(0);
      expect(report.mae).toBeGreaterThan(0);
      expect(report.ece).toBeGreaterThanOrEqual(0);
      expect(report.bins).toHaveLength(10);
    });
  });

  describe('isCalibrated', () => {
    it('returns false when not enough forecasts', () => {
      const report = calibrationReport([{ predicted: 0.5, realized: 0.5 }]);
      expect(isCalibrated(report, 10, 0.2)).toBe(false);
    });

    it('returns false when ECE is too high', () => {
      const forecasts: Forecast[] = Array.from({ length: 20 }, () => ({
        predicted: 0.1,
        realized: 0.9,
      }));
      const report = calibrationReport(forecasts);
      expect(isCalibrated(report, 10, 0.2)).toBe(false);
    });

    it('returns true when calibrated', () => {
      const forecasts: Forecast[] = Array.from({ length: 20 }, (_, i) => ({
        predicted: 0.5,
        realized: i < 10 ? 0.4 : 0.6,
      }));
      const report = calibrationReport(forecasts);
      expect(isCalibrated(report, 10, 0.2)).toBe(true);
    });
  });
});
