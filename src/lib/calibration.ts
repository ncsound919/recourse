// src/lib/calibration.ts — Brier score, reliability curves, and ECE.
//
// Pure functions for measuring how well the learner's predictions match
// realized outcomes. No clock, no randomness — fully deterministic.

export interface Forecast {
  predicted: number; // 0..1 — the learner's Beta posterior mean before the update
  realized: number;  // 0..1 — the actual outcome
}

export interface ReliabilityBin {
  bin: number;          // bin index (0..bins-1)
  lo: number;           // lower bound of the bin
  hi: number;           // upper bound of the bin
  count: number;        // number of forecasts in this bin
  meanPredicted: number; // mean predicted value in this bin
  realizedFreq: number;  // mean realized value in this bin
  gap: number;          // |meanPredicted - realizedFreq|
}

export interface CalibrationReport {
  brier: number;          // mean((predicted - realized)^2)
  ece: number;            // expected calibration error (weighted mean of bin gaps)
  mae: number;            // mean(|predicted - realized|) — the existing metric
  bins: ReliabilityBin[]; // reliability curve data
  n: number;              // number of forecasts
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Brier score: mean squared error of probabilistic forecasts. */
export function brierScore(forecasts: Forecast[]): number {
  if (forecasts.length === 0) return 0;
  const sum = forecasts.reduce((acc, f) => acc + (f.predicted - f.realized) ** 2, 0);
  return round4(sum / forecasts.length);
}

/** Mean absolute error of forecasts. */
export function mae(forecasts: Forecast[]): number {
  if (forecasts.length === 0) return 0;
  const sum = forecasts.reduce((acc, f) => acc + Math.abs(f.predicted - f.realized), 0);
  return round4(sum / forecasts.length);
}

/** Bin forecasts into K equal-width bins over [0, 1]. */
export function reliabilityBins(forecasts: Forecast[], numBins = 10): ReliabilityBin[] {
  const bins: ReliabilityBin[] = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      bin: i,
      lo: round4(i / numBins),
      hi: round4((i + 1) / numBins),
      count: 0,
      meanPredicted: 0,
      realizedFreq: 0,
      gap: 0,
    });
  }

  for (const f of forecasts) {
    const idx = Math.min(numBins - 1, Math.max(0, Math.floor(f.predicted * numBins)));
    const bin = bins[idx];
    bin.count += 1;
    bin.meanPredicted += f.predicted;
    bin.realizedFreq += f.realized;
  }

  for (const bin of bins) {
    if (bin.count > 0) {
      bin.meanPredicted = round4(bin.meanPredicted / bin.count);
      bin.realizedFreq = round4(bin.realizedFreq / bin.count);
      bin.gap = round4(Math.abs(bin.meanPredicted - bin.realizedFreq));
    }
  }

  return bins;
}

/** Expected Calibration Error: weighted mean of bin gaps. */
export function expectedCalibrationError(bins: ReliabilityBin[]): number {
  const total = bins.reduce((acc, b) => acc + b.count, 0);
  if (total === 0) return 0;
  const weighted = bins.reduce((acc, b) => acc + b.count * b.gap, 0);
  return round4(weighted / total);
}

/** Full calibration report from a list of forecasts. */
export function calibrationReport(forecasts: Forecast[], numBins = 10): CalibrationReport {
  const bins = reliabilityBins(forecasts, numBins);
  return {
    brier: brierScore(forecasts),
    ece: expectedCalibrationError(bins),
    mae: mae(forecasts),
    bins,
    n: forecasts.length,
  };
}

/** Check if the learner's calibration is good enough to trust promotions.
 *  Returns true when ECE is below the threshold and we have enough data. */
export function isCalibrated(report: CalibrationReport, minForecasts = 10, maxEce = 0.20): boolean {
  return report.n >= minForecasts && report.ece <= maxEce;
}
