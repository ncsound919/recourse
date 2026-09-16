/**
 * Deterministic Trend Engine — the analysis core (blueprint Phases 2–4).
 *
 * Pure, seeded, content-addressed: the same series + config produce identical
 * anomalies, bursts, hypotheses, and hashes. No wall-clock, no randomness, no
 * LLM routing. Control flow is declarative; LLMs (when used by callers) are
 * only tools that may score/extract, never route.
 *
 * Stages implemented here:
 *   [4] TREND — SMA decomposition (trend/remainder), Kleinberg two-state
 *       burst detection, momentum + acceleration.
 *   [5] ANOMALY — ±σ bands on the remainder; novelty (first-ever volume).
 *   [6] HYPOTHESIS — template library + tournament scoring (deterministic).
 *   [7] CROSS-DOMAIN — lagged Pearson cross-correlation between series.
 *
 * Output records carry full provenance (series id + window + engine version)
 * and every scan returns a manifest hash so reruns are diffable.
 */

import { pearsonSignificance, benjaminiHochberg, stationarize } from './synergy/stats.js';

// --- Types -------------------------------------------------------------------

export interface SeriesPoint {
  /** Ordinal time bucket (day index / epoch bucket). Must be monotonic. */
  t: number;
  value: number;
}

export interface TrendSeries {
  id: string;
  name: string;
  domain: string;
  points: SeriesPoint[];
}

export interface Decomposition {
  trend: number[];
  remainder: number[];
  mean: number;
  sd: number;
}

export interface Burst {
  seriesId: string;
  start: number;
  end: number;
  strength: number;
  /** Normalized [0,1] recency — how "now" the burst peak is. */
  recency: number;
}

export interface Momentum {
  seriesId: string;
  lastValue: number;
  prevValue: number;
  wowDelta: number;
  /** z-scored velocity of the trend component (normalized). */
  zAcceleration: number;
}

export interface Anomaly {
  seriesId: string;
  type: 'spike' | 'drop' | 'novelty' | 'changepoint';
  t: number;
  score: number;
  value: number;
  remainder: number;
  windowStart: number;
  windowEnd: number;
  evidenceHash: string;
}

export interface Hypothesis {
  id: string;
  templateId: string;
  statement: string;
  anomalyIds: string[];
  scores: { support: number; novelty: number; crossDomain: number; falsifiability: number; simplicity: number; total: number };
  engineVersion: string;
}

export interface LaggedCorrelation {
  a: string;
  b: string;
  bestLag: number;
  correlation: number;
  significant: boolean;
  /** Fisher-z two-sided p-value for the best lag correlation. */
  pValue?: number;
  /** Pair count at the best lag. */
  n?: number;
}

export interface TrendScanResult {
  engineVersion: string;
  anomalies: Anomaly[];
  bursts: Burst[];
  momentum: Momentum[];
  hypotheses: Hypothesis[];
  crossDomain: LaggedCorrelation[];
  manifestHash: string;
}

export const TREND_ENGINE_VERSION = '1.0.0';

// --- Deterministic math helpers ----------------------------------------------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function zscore(x: number, m: number, s: number): number {
  return s === 0 ? 0 : (x - m) / s;
}

function sha256Hex(s: string): string {
  // Deterministic FNV-1a fallback — no crypto import needed for content
  // addressing in pure-DS contexts; still stable for identical strings.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Simple moving average trend with a `period` window. Deterministic. */
export function decompose(series: TrendSeries, period: number): Decomposition {
  const n = series.points.length;
  const trend = Array.from({ length: n }, () => 0);
  const half = Math.max(1, Math.floor(period / 2));
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    trend[i] = mean(series.points.slice(lo, hi).map((p) => p.value));
  }
  const remainder = series.points.map((p, i) => p.value - trend[i]);
  const m = mean(series.points.map((p) => p.value));
  const s = sd(series.points.map((p) => p.value));
  return { trend, remainder, mean: m, sd: s };
}

/**
 * Kleinberg two-state burst detection (deterministic approximation):
 * a document/mention count series is modeled as a two-state automaton
 * (base / burst). Entry to the burst state happens when z >= gamma;
 * exit when it drops back below gamma for `persistence` consecutive points.
 */
export function detectBursts(series: TrendSeries, opts?: { gamma?: number; persistence?: number }): Burst[] {
  const gamma = opts?.gamma ?? 2.0;
  const persistence = opts?.persistence ?? 2;
  const dec = decompose(series, Math.max(2, Math.floor(series.points.length / 4) || 2));
  const bursts: Burst[] = [];
  const n = series.points.length;
  let inBurst = false;
  let burstStart = 0;
  let below = 0;
  let peak = 0;
  let peakT = 0;
  for (let i = 0; i < n; i++) {
    const z = zscore(series.points[i].value, dec.mean, dec.sd);
    if (z >= gamma) {
      below = 0;
      if (!inBurst) {
        inBurst = true;
        burstStart = i;
        peak = z;
        peakT = series.points[i].t;
      } else if (z > peak) {
        peak = z;
        peakT = series.points[i].t;
      }
    } else if (inBurst) {
      below++;
      if (below >= persistence) {
        inBurst = false;
        const strength = Math.min(1, peak / (gamma * 3));
        const lastT = series.points[n - 1].t;
        const firstT = series.points[0].t;
        const span = lastT - firstT || 1;
        bursts.push({
          seriesId: series.id,
          start: series.points[burstStart].t,
          end: series.points[i].t,
          strength: Math.round(strength * 1000) / 1000,
          recency: Math.round(Math.min(1, (lastT - peakT) / span) * 1000) / 1000,
        });
        below = 0;
      }
    }
  }
  if (inBurst) {
    const lastT = series.points[n - 1].t;
    const firstT = series.points[0].t;
    const span = lastT - firstT || 1;
    bursts.push({
      seriesId: series.id,
      start: series.points[burstStart].t,
      end: lastT,
      strength: Math.round(Math.min(1, peak / (gamma * 3)) * 1000) / 1000,
      recency: Math.round(Math.min(1, (lastT - peakT) / span) * 1000) / 1000,
    });
  }
  return bursts;
}

/** Momentum: week-over-week delta + z-scored acceleration of the trend tail. */
export function momentumOf(series: TrendSeries, opts?: { period?: number }): Momentum {
  const period = opts?.period ?? Math.max(2, Math.floor(series.points.length / 4) || 2);
  const dec = decompose(series, period);
  const n = series.points.length;
  const lastValue = series.points[n - 1]?.value ?? 0;
  const prevValue = series.points[n - 2]?.value ?? 0;
  const wowDelta = lastValue - prevValue;
  const tailTrend = dec.trend.slice(Math.max(0, n - 4));
  const accel = sd(tailTrend) === 0 ? 0 : (tailTrend[tailTrend.length - 1] - tailTrend[0]) / sd(tailTrend);
  return {
    seriesId: series.id,
    lastValue: Math.round(lastValue * 1000) / 1000,
    prevValue: Math.round(prevValue * 1000) / 1000,
    wowDelta: Math.round(wowDelta * 1000) / 1000,
    zAcceleration: Math.round(Math.min(3, Math.max(-3, accel)) * 1000) / 1000,
  };
}

/**
 * Anomaly detection: ±σ bands on the STL remainder + novelty (first-ever
 * non-zero volume). Returns records with evidence hashes over the window.
 */
export function detectAnomalies(series: TrendSeries, opts?: { sigma?: number }): Anomaly[] {
  const sigma = opts?.sigma ?? 2;
  const dec = decompose(series, Math.max(2, Math.floor(series.points.length / 4) || 2));
  const remSd = sd(dec.remainder);
  const anomalies: Anomaly[] = [];
  let seenAny = false;
  for (let i = 0; i < series.points.length; i++) {
    const p = series.points[i];
    const r = dec.remainder[i];
    const z = remSd === 0 ? 0 : Math.abs(r) / remSd;
    if (z >= sigma) {
      anomalies.push({
        seriesId: series.id,
        type: r > 0 ? 'spike' : 'drop',
        t: p.t,
        score: Math.round(Math.min(3, z) * 1000) / 1000,
        value: p.value,
        remainder: Math.round(r * 1000) / 1000,
        windowStart: Math.max(0, i - 2),
        windowEnd: Math.min(series.points.length - 1, i + 2),
        evidenceHash: sha256Hex(`${series.id}|${p.t}|${p.value}|${r}`),
      });
    }
    if (p.value > 0 && !seenAny) {
      seenAny = true;
    } else if (p.value > 0 && i > 0 && !hadPrior(series, i)) {
      // Novelty: first non-zero value after zero-history prefix.
      anomalies.push({
        seriesId: series.id,
        type: 'novelty',
        t: p.t,
        score: 1,
        value: p.value,
        remainder: r,
        windowStart: i,
        windowEnd: i,
        evidenceHash: sha256Hex(`${series.id}|novelty|${p.t}`),
      });
    }
  }
  return anomalies;
}

function hadPrior(series: TrendSeries, i: number): boolean {
  for (let j = 0; j < i; j++) {
    if (series.points[j].value > 0) return true;
  }
  return false;
}

// --- Hypothesis templates (deterministic) -------------------------------------

const HYPOTHESIS_TEMPLATES: Array<{ id: string; build: (ctx: HypothesisContext) => string }> = [
  {
    id: 'trend_driver_lead',
    build: (ctx) =>
      `"${ctx.seriesName}" volume spiked ${ctx.pctRise.toFixed(0)}% in ${ctx.windowDesc} — candidate driver "${ctx.driverName}" (${ctx.driverDomain}) led it by ${ctx.lagDays} days (lagged correlation ${ctx.corr.toFixed(2)}). Falsifiable: if the driver hypothesis holds, detrending "${ctx.driverName}" removes the spike.`,
  },
  {
    id: 'novelty_emergence',
    build: (ctx) =>
      `"${ctx.seriesName}" first-ever measurable volume at t=${ctx.firstT} (${ctx.windowDesc}) — emerging topic with no prior history, consistent with a burst-start rather than noise. Falsifiable: extended observation showing no sustained follow-on volume contradicts the emergence reading.`,
  },
  {
    id: 'momentum_accel',
    build: (ctx) =>
      `"${ctx.seriesName}" trend accelerated at ${ctx.zAccel.toFixed(2)}σ (z) in the last window — momentum is building beyond week-over-week noise. Falsifiable: if acceleration is not sustained next window, the trend reverts to baseline.`,
  },
  {
    id: 'crossdomain_link',
    build: (ctx) =>
      `Series "${ctx.seriesName}" (${ctx.domainA}) and "${ctx.driverName}" (${ctx.domainB}) share significant lagged correlation at ${ctx.corr.toFixed(2)} (lag ${ctx.lagDays}) — candidate cross-domain causal link. Falsifiable: out-of-sample lagged correlation below threshold rejects the link.`,
  },
];

interface HypothesisContext {
  seriesName: string;
  seriesDomain: string;
  domainA: string;
  domainB: string;
  driverName: string;
  driverDomain: string;
  lagDays: number;
  corr: number;
  pctRise: number;
  windowDesc: string;
  firstT: number;
  zAccel: number;
}

function windowDesc(series: TrendSeries): string {
  const pts = series.points;
  if (pts.length < 2) return 'window';
  return `t=${pts[0].t}..${pts[pts.length - 1].t}`;
}

function pctRise(series: TrendSeries): number {
  const pts = series.points;
  if (pts.length < 2) return 0;
  const base = mean(pts.slice(0, Math.max(1, Math.floor(pts.length / 3))).map((p) => p.value));
  const last = pts[pts.length - 1].value;
  return base > 0 ? ((last - base) / base) * 100 : 0;
}

/** Deterministic tournament scoring — no LLM, no randomness. */
function scoreHypothesis(
  statement: string,
  anomalyCount: number,
  crossDomain: boolean,
  _hasWindow: boolean,
): Hypothesis['scores'] {
  const support = Math.min(1, anomalyCount / 3);
  const novelty = crossDomain ? 0.9 : 0.5;
  const falsifiability = /falsifiable/i.test(statement) ? 0.9 : 0.4;
  const simplicity = statement.length > 400 ? 0.4 : 0.8;
  const crossDomainScore = crossDomain ? 0.85 : 0.2;
  const total = support + novelty + falsifiability + simplicity + crossDomainScore;
  return {
    support: Math.round(support * 100) / 100,
    novelty: Math.round(novelty * 100) / 100,
    crossDomain: Math.round(crossDomainScore * 100) / 100,
    falsifiability: Math.round(falsifiability * 100) / 100,
    simplicity: Math.round(simplicity * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// --- Cross-domain --------------------------------------------------------------

/** Lagged Pearson cross-correlation: best lag (b leads a when lag>0). */
export function laggedCorrelation(a: TrendSeries, b: TrendSeries, maxLag = 5): LaggedCorrelation {
  let best = { lag: 0, corr: 0 };
  let bestN = 0;
  let any = false;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const pairs: Array<[number, number]> = [];
    for (const pa of a.points) {
      const pb = b.points.find((p) => p.t === pa.t - lag);
      if (pb) pairs.push([pa.value, pb.value]);
    }
    if (pairs.length < 3) continue;
    const xs = pairs.map((p) => p[0]);
    const ys = pairs.map((p) => p[1]);
    const mx = mean(xs);
    const my = mean(ys);
    const sx = sd(xs);
    const sy = sd(ys);
    let cov = 0;
    for (const [x, y] of pairs) cov += (x - mx) * (y - my);
    const r = sx === 0 || sy === 0 ? 0 : cov / (pairs.length * sx * sy);
    any = true;
    if (Math.abs(r) >= Math.abs(best.corr)) {
      best = { lag, corr: r };
      bestN = pairs.length;
    }
  }
  if (!any) {
    return { a: a.id, b: b.id, bestLag: 0, correlation: 0, pValue: 1, n: 0, significant: false };
  }
  const sig = pearsonSignificance(best.corr, bestN);
  return {
    a: a.id,
    b: b.id,
    bestLag: best.lag,
    correlation: Math.round(best.corr * 1000) / 1000,
    pValue: sig.p,
    n: bestN,
    significant: sig.significant,
  };
}

// --- Scan ----------------------------------------------------------------------

/**
 * Difference a series until stationary for cross-domain correlation. Only used
 * when the caller opts in (`stationarize: true`) so default output is unchanged.
 */
function stationarizeSeries(s: TrendSeries): TrendSeries {
  const r = stationarize(s.points.map((p) => p.value));
  if (r.transforms.length === 0) return s;
  const offset = s.points.length - r.series.length;
  return {
    ...s,
    points: r.series.map((value, i) => ({ ...s.points[i + offset], value })),
  };
}

export function runTrendScan(
  seriesList: TrendSeries[],
  opts?: { gamma?: number; sigma?: number; maxLag?: number; topK?: number; stationarize?: boolean },
): TrendScanResult {
  const gamma = opts?.gamma ?? 2.0;
  const sigma = opts?.sigma ?? 2;
  const maxLag = opts?.maxLag ?? 5;
  const topK = opts?.topK ?? 5;

  const anomalies: Anomaly[] = [];
  const bursts: Burst[] = [];
  const momentum: Momentum[] = [];
  for (const s of seriesList) {
    anomalies.push(...detectAnomalies(s, { sigma }));
    bursts.push(...detectBursts(s, { gamma }));
    momentum.push(momentumOf(s));
  }

  // Cross-domain: all ordered pairs. Optionally difference first so lagged
  // correlation is not dominated by shared trend (opt-in; defaults unchanged).
  const crossSource = opts?.stationarize ? seriesList.map(stationarizeSeries) : seriesList;
  let crossDomain: LaggedCorrelation[] = [];
  for (const a of crossSource) {
    for (const b of crossSource) {
      if (a.id === b.id) continue;
      crossDomain.push(laggedCorrelation(a, b, maxLag));
    }
  }

  // Multiple-testing correction across every cross-domain pair test. BH-FDR is
  // applied before hypotheses/manifest construction so both reflect the
  // corrected decision; only surviving pairs are retained.
  const { rejected } = benjaminiHochberg(crossDomain.map((c) => c.pValue ?? 1));
  crossDomain.forEach((c, i) => { c.significant = rejected[i]; });
  crossDomain = crossDomain.filter((c) => c.significant);

  // Hypotheses from templates, driven by anomaly + cross-domain context.
  const hypotheses: Hypothesis[] = [];
  let hCount = 0;
  for (const s of seriesList) {
    const sAnoms = anomalies.filter((x) => x.seriesId === s.id);
    const sBursts = bursts.filter((x) => x.seriesId === s.id);
    const sMom = momentum.find((x) => x.seriesId === s.id);
    const sCorr = crossDomain.find((x) => x.a === s.id);
    const ctxBase: HypothesisContext = {
      seriesName: s.name,
      seriesDomain: s.domain,
      domainA: s.domain,
      domainB: sCorr ? seriesList.find((x) => x.id === sCorr.b)?.domain ?? 'unknown' : 'same',
      driverName: sCorr ? seriesList.find((x) => x.id === sCorr.b)?.name ?? 'unknown' : 'baseline',
      driverDomain: sCorr ? seriesList.find((x) => x.id === sCorr.b)?.domain ?? 'unknown' : 'same',
      lagDays: sCorr?.bestLag ?? 0,
      corr: sCorr?.correlation ?? 0,
      pctRise: pctRise(s),
      windowDesc: windowDesc(s),
      firstT: s.points[0]?.t ?? 0,
      zAccel: sMom?.zAcceleration ?? 0,
    };

    if (sBursts.length > 0) {
      const statement = HYPOTHESIS_TEMPLATES[0].build({ ...ctxBase, driverName: ctxBase.driverName });
      hypotheses.push({
        id: `hyp_${hCount++}_${sha256Hex(s.id + 'driver')}`,
        templateId: HYPOTHESIS_TEMPLATES[0].id,
        statement,
        anomalyIds: sAnoms.slice(0, 3).map((x) => `${x.type}:${x.t}`),
        scores: scoreHypothesis(statement, sAnoms.length, Boolean(sCorr), true),
        engineVersion: TREND_ENGINE_VERSION,
      });
    }
    if (sAnoms.some((x) => x.type === 'novelty')) {
      const statement = HYPOTHESIS_TEMPLATES[1].build(ctxBase);
      hypotheses.push({
        id: `hyp_${hCount++}_${sha256Hex(s.id + 'novelty')}`,
        templateId: HYPOTHESIS_TEMPLATES[1].id,
        statement,
        anomalyIds: sAnoms.filter((x) => x.type === 'novelty').map((x) => `novelty:${x.t}`),
        scores: scoreHypothesis(statement, 1, false, true),
        engineVersion: TREND_ENGINE_VERSION,
      });
    }
    if (sMom && Math.abs(sMom.zAcceleration) >= 1.5) {
      const statement = HYPOTHESIS_TEMPLATES[2].build(ctxBase);
      hypotheses.push({
        id: `hyp_${hCount++}_${sha256Hex(s.id + 'mom')}`,
        templateId: HYPOTHESIS_TEMPLATES[2].id,
        statement,
        anomalyIds: sAnoms.slice(0, 2).map((x) => `${x.type}:${x.t}`),
        scores: scoreHypothesis(statement, sAnoms.length, false, true),
        engineVersion: TREND_ENGINE_VERSION,
      });
    }
  }
  for (const lc of crossDomain) {
    const a = seriesList.find((x) => x.id === lc.a);
    const b = seriesList.find((x) => x.id === lc.b);
    if (!a || !b) continue;
    const statement = HYPOTHESIS_TEMPLATES[3].build({
      seriesName: a.name,
      seriesDomain: a.domain,
      domainA: a.domain,
      domainB: b.domain,
      driverName: b.name,
      driverDomain: b.domain,
      lagDays: lc.bestLag,
      corr: lc.correlation,
      pctRise: pctRise(a),
      windowDesc: windowDesc(a),
      firstT: a.points[0]?.t ?? 0,
      zAccel: momentum.find((x) => x.seriesId === a.id)?.zAcceleration ?? 0,
    });
    hypotheses.push({
      id: `hyp_${hCount++}_${sha256Hex(a.id + b.id + String(lc.bestLag))}`,
      templateId: HYPOTHESIS_TEMPLATES[3].id,
      statement,
      anomalyIds: [],
      scores: scoreHypothesis(statement, 0, true, true),
      engineVersion: TREND_ENGINE_VERSION,
    });
  }

  // Sort hypotheses by total score desc, keep top-K.
  const ranked = hypotheses.sort((x, y) => y.scores.total - x.scores.total).slice(0, Math.max(1, topK));

  // Manifest hash over every emitted record — reruns diffable.
  const manifestInput = [
    ...anomalies.map((x) => x.evidenceHash),
    ...bursts.map((x) => `${x.seriesId}:${x.start}:${x.end}:${x.strength}`),
    ...ranked.map((x) => `${x.templateId}:${x.statement}`),
    ...crossDomain.map((x) => `${x.a}:${x.b}:${x.bestLag}:${x.correlation}`),
  ].join('\n');

  return {
    engineVersion: TREND_ENGINE_VERSION,
    anomalies,
    bursts,
    momentum,
    hypotheses: ranked,
    crossDomain,
    manifestHash: sha256Hex(manifestInput),
  };
}