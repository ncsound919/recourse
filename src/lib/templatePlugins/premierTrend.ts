/**
 * Premier-Connection trend/breakout analysis — an integration template plugin.
 *
 * The logic below is a faithful re-expression of the dependency-free, pure
 * time-series analysis core shipped in the Premier-Connection-System monorepo
 * (`packages/core-logic/src/analyzer.ts`, functions `analyzeTrend` and
 * `detectBreakout`). That source has no imports and does deterministic math on
 * plain `{ value }` series, so its semantics transfer 1:1 into a Recourse
 * sandbox gene and a self-hosted module. Registered with a single
 * `registerComponentTemplatePlugin(...)` call from componentTemplates.ts, the
 * same way any third-party add-on would be.
 *
 * Honesty note (no theater): these are *generic* numeric routines (OLS slope,
 * R², volatility, z-score breakout) — the source's own docstring claims
 * basketball/protein/crypto relevance, but nothing here encodes those domain
 * rules. It is registered as generic time-series analysis, nothing more.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'breakoutThreshold',
    label: 'Breakout z-score threshold',
    type: 'number',
    default: 2.0,
    min: 0.1,
    max: 6,
    step: 0.1,
    description: '|z| above which the latest point is flagged as a breakout'
  }
];

export const premierTrendPlugin: TemplatePlugin = {
  id: 'tpl_premier_trend',
  name: 'Time-Series Trend & Breakout Analyzer',
  domain: 'math' as ToolDomain,
  category: 'mathematical' as ComponentTemplateCategory,
  description:
    'Deterministic trend analysis (OLS slope, R-squared, volatility, momentum) and z-score breakout detection over plain time-series data — ported from the Premier-Connection core-logic package.',
  benchmarkFlops: 320,
  complexity: 'O(n)',
  defaultScore: 0.9,
  tags: ['time-series', 'regression', 'trend', 'breakout', 'statistics'],
  params,
  synthesizer: (userParams, options) => {
    const threshold = Number(userParams.breakoutThreshold) || 2.0;
    const compName = options?.componentName || 'TrendAnalyzer';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_premier_trend — ported from Premier-Connection @premier/core-logic (analyzer.ts).
 * Generic numeric time-series analysis. Slope/R2/volatility/momentum + z-score breakout.
 */
export class ${compName} {
  static analyzeTrend(data) {
    if (!Array.isArray(data) || data.length < 2) {
      return { trend: 'stable', slope: 0, rSquared: 0, volatility: 0, momentum: 0 };
    }
    const values = data.map((d) => d && typeof d.value === 'number' ? d.value : 0);
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
      ssTot += (values[i] - yMean) * (values[i] - yMean);
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;
    for (let i = 0; i < n; i++) {
      const predicted = slope * i + intercept;
      ssRes += (values[i] - predicted) * (values[i] - predicted);
    }
    const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

    const variance = values.reduce((acc, val) => acc + (val - yMean) * (val - yMean), 0) / n;
    const volatility = Math.sqrt(variance);

    const recentPeriod = Math.min(5, Math.floor(n / 4));
    const recentValues = values.slice(-recentPeriod);
    const olderValues = values.slice(-recentPeriod * 2, -recentPeriod);
    const recentAvg = recentValues.length ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length : 0;
    const olderAvg = olderValues.length ? olderValues.reduce((a, b) => a + b, 0) / olderValues.length : recentAvg;
    const momentum = olderAvg !== 0 ? (recentAvg - olderAvg) / olderAvg : 0;

    const slopeThreshold = volatility * 0.1;
    let trend = 'stable';
    if (slope > slopeThreshold) trend = 'increasing';
    else if (slope < -slopeThreshold) trend = 'decreasing';

    return { trend, slope, rSquared, volatility, momentum };
  }

  static detectBreakout(data, threshold) {
    const th = (typeof threshold === 'number') ? threshold : ${threshold};
    if (!Array.isArray(data) || data.length < 10) {
      return { detected: false, direction: null, strength: 0 };
    }
    const values = data.map((d) => d && typeof d.value === 'number' ? d.value : 0);
    const n = values.length;
    const historicalValues = values.slice(0, -1);
    const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const stdDev = Math.sqrt(
      historicalValues.reduce((acc, val) => acc + (val - mean) * (val - mean), 0) / historicalValues.length
    );
    const latestValue = values[n - 1];
    const zScore = stdDev !== 0 ? (latestValue - mean) / stdDev : 0;

    if (Math.abs(zScore) > th) {
      return {
        detected: true,
        direction: zScore > 0 ? 'up' : 'down',
        strength: Math.abs(zScore),
        timestamp: data[n - 1].timestamp
      };
    }
    return { detected: false, direction: null, strength: Math.abs(zScore) };
  }
}`;

    const testSuiteCode = `const a = ${compName}.analyzeTrend([1,2,3,4,5].map(function (v) { return { value: v }; }));
assert a.trend === 'increasing';
assert Math.abs(a.slope - 1) < 1e-9;
assert Math.abs(a.rSquared - 1) < 1e-9;
const short = ${compName}.analyzeTrend([{ value: 3 }]);
assert short.trend === 'stable';
assert short.slope === 0;
const rising = [1,2,3,4,5,6,7,8,9,100].map(function (v) { return { value: v }; });
const up = ${compName}.detectBreakout(rising, ${threshold});
assert up.detected === true;
assert up.direction === 'up';
const flat = Array(12).fill(0).map(function (v, i) { return { value: 10 }; });
const none = ${compName}.detectBreakout(flat, ${threshold});
assert none.detected === false;`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Trend/breakout analyzer over time series (OLS slope+R2, volatility, momentum, |z|>${threshold} breakout)`,
      selfHealingGuards: ['InputArrayTypeGuard', 'ThresholdBoundsClamp']
    };
  },
  selfHost: {
    stateful: false,
    methods: [
      { method: 'analyzeTrend', label: 'Analyze trend over a time series' },
      { method: 'detectBreakout', label: 'Detect a z-score breakout' }
    ]
  }
};
