/**
 * Upgrade report builder (Phase 5 #17).
 *
 * The nightly self-improvement loop (dream -> problem -> forge -> verify ->
 * promote) is meant to produce a *measured, self-attested* upgrade report — the
 * project's public changelog. This module renders that report from real
 * before/after metric snapshots. It never fabricates improvement: if a cycle
 * moved no metric (or regressed it), the report says so plainly.
 */

export interface MetricSnapshot {
  registryTools: number;
  liveSelfHosted: number;
  verifierPassRate: number; // 0..1
  promoted: number;
  benchmarkSolved: number;
  benchmarkTotal: number;
  healedTools: number;
  openAnomalies: number;
}

export const EMPTY_METRICS: MetricSnapshot = {
  registryTools: 0,
  liveSelfHosted: 0,
  verifierPassRate: 1,
  promoted: 0,
  benchmarkSolved: 0,
  benchmarkTotal: 0,
  healedTools: 0,
  openAnomalies: 0,
};

export interface MetricDelta {
  before: number;
  after: number;
  delta: number;
}

export type Snapshot = Partial<MetricSnapshot>;

export function diffSnapshots(before: Snapshot, after: Snapshot): Record<keyof MetricSnapshot, MetricDelta> {
  const keys: Array<keyof MetricSnapshot> = [
    'registryTools', 'liveSelfHosted', 'verifierPassRate', 'promoted',
    'benchmarkSolved', 'benchmarkTotal', 'healedTools', 'openAnomalies',
  ];
  const out = {} as Record<keyof MetricSnapshot, MetricDelta>;
  for (const k of keys) {
    const b = Number(before[k] ?? 0);
    const a = Number(after[k] ?? 0);
    out[k] = { before: b, after: a, delta: Math.round((a - b) * 1000) / 1000 };
  }
  return out;
}

function fmt(n: number): string {
  return Math.round(n * 1000) / 1000 === n ? String(n) : String(Math.round(n * 100) / 100);
}

/** Render a dated, honest markdown upgrade report. */
export function renderUpgradeReport(opts: {
  before: Snapshot;
  after: Snapshot;
  date?: Date;
  events?: string[];
}): string {
  const d = diffSnapshots(opts.before, opts.after);
  const lines: string[] = [];
  const pos = (x: number) => x > 0;
  const anyGain =
    d.registryTools.delta > 0 ||
    d.liveSelfHosted.delta > 0 ||
    d.promoted.delta > 0 ||
    (d.benchmarkTotal.delta > 0 && d.benchmarkSolved.delta > 0) ||
    d.healedTools.delta > 0;
  const regression = d.verifierPassRate.delta < 0 || d.openAnomalies.delta > 0;

  lines.push(`# Recourse Upgrade Report — ${(opts.date ?? new Date()).toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('| metric | before | after | Δ |');
  lines.push('|---|---|---|---|');
  const rows: Array<[keyof MetricSnapshot, string]> = [
    ['registryTools', 'registry tools'],
    ['liveSelfHosted', 'live self-hosted'],
    ['verifierPassRate', 'verifier pass rate'],
    ['promoted', 'promoted'],
    ['benchmarkSolved', 'benchmark solved'],
    ['benchmarkTotal', 'benchmark total'],
    ['healedTools', 'healed'],
    ['openAnomalies', 'open anomalies'],
  ];
  for (const [k, label] of rows) {
    const sign = d[k].delta > 0 ? '+' : '';
    lines.push(`| ${label} | ${fmt(d[k].before)} | ${fmt(d[k].after)} | ${sign}${fmt(d[k].delta)} |`);
  }

  lines.push('');
  if (anyGain && !regression) {
    lines.push('**Verdict: verified improvement this cycle.** Changes promoted only after passing the sandbox + lint gate.');
  } else if (regression) {
    lines.push('**Verdict: regression detected** (pass-rate fell or anomalies rose). No promotions were assumed safe.');
  } else {
    lines.push('**Verdict: no measurable improvement this cycle.** This is an honest result, not an invented one — the loop produced nothing that cleared the gate.');
  }

  if (opts.events && opts.events.length > 0) {
    lines.push('');
    lines.push('Notable events:');
    for (const e of opts.events.slice(0, 20)) lines.push(`- ${e}`);
  }
  lines.push('');
  return lines.join('\n');
}