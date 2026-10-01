/**
 * remoteRepairScripts.ts — deterministic Python scripts that turn REAL local
 * state into a remote analytical verdict on a free-tier compute box.
 *
 * These are not LLM prompts and not theater: each script embeds actual measured
 * series/windows from the running system and computes a statistical answer
 * (bootstrap calibration stability, change-point / trend detection). The only
 * thing the remote box adds is the compute budget (many bootstrap resamples,
 * full-series scans) that would otherwise stall the server's event loop.
 *
 * Two producers:
 *   - `learnerStressEvalScript(forecastWindow)` — bootstrap ECE/Brier stability
 *     over the learner's (predicted, realized) forecasts; emits an `externalScore`.
 *   - `stuckDiagnosisScript(issue, context)` — change-point/trend diagnosis over
 *     a measured numeric series; emits a structured diagnosis + recommendation.
 *
 * Both return `null` when there is not enough real data to say anything honest.
 */

export interface RemoteScript {
  script: string;
  requirements: string[];
}

const MAX_SERIES = 500;
const MAX_WINDOW = 500;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function finiteSeries(values: unknown): number[] {
  return (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .slice(0, MAX_SERIES);
}

/**
 * Bootstrap calibration-stability script. `externalScore` is 1 when the
 * learner's ECE is stable under resampling, and falls toward 0 as the ECE's
 * relative spread grows. Requires >= 12 forecasts to be meaningful.
 */
export function learnerStressEvalScript(
  forecastWindow: Array<{ predicted: number; realized: number }>,
  opts: { bootstrap?: number } = {},
): RemoteScript | null {
  const pairs = (Array.isArray(forecastWindow) ? forecastWindow : [])
    .map((p) => [Number(p?.predicted), Number(p?.realized)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    .slice(-MAX_WINDOW);
  if (pairs.length < 12) return null;
  const bootstrap = Math.max(64, Math.min(2000, Math.floor(opts.bootstrap ?? 400)));
  const code =
    `import numpy as np\n` +
    `pw = np.array(${JSON.stringify(pairs)}, dtype=float)\n` +
    `pred, real = pw[:, 0], pw[:, 1]\n` +
    `n = len(pred)\n` +
    `def ece(p, r, bins=10):\n` +
    `    edges = np.linspace(0.0, 1.0, bins + 1)\n` +
    `    e = 0.0\n` +
    `    for i in range(bins):\n` +
    `        lo, hi = edges[i], edges[i + 1]\n` +
    `        m = (p >= lo) & (p <= hi if i == bins - 1 else p < hi)\n` +
    `        if m.sum() > 0:\n` +
    `            e += (m.sum() / len(p)) * abs(float(r[m].mean()) - float(p[m].mean()))\n` +
    `    return float(e)\n` +
    `def brier(p, r):\n` +
    `    return float(np.mean((p - r) ** 2))\n` +
    `rng = np.random.default_rng(20260101)\n` +
    `B = ${bootstrap}\n` +
    `eces = np.empty(B); briers = np.empty(B)\n` +
    `for k in range(B):\n` +
    `    idx = rng.integers(0, n, n)\n` +
    `    eces[k] = ece(pred[idx], real[idx]); briers[k] = brier(pred[idx], real[idx])\n` +
    `ece_mean, ece_std = float(eces.mean()), float(eces.std())\n` +
    `brier_mean, brier_std = float(briers.mean()), float(briers.std())\n` +
    `stability = max(0.0, min(1.0, 1.0 - ece_std / max(ece_mean, 1e-6)))\n` +
    `result = {"ok": True, "externalScore": round(stability, 4), "eceMean": round(ece_mean, 4),\n` +
    `          "eceStd": round(ece_std, 4), "brierMean": round(brier_mean, 4), "brierStd": round(brier_std, 4),\n` +
    `          "n": int(n), "bootstrap": int(B)}`;
  return { script: code, requirements: ['numpy'] };
}

export interface StuckDiagnosisContext {
  /** Real measured series, oldest -> newest. */
  series: number[];
  /** Human label for the metric (e.g. 'math attempt score'). */
  label: string;
  /** Optional context string echoed into the diagnosis. */
  note?: string;
}

/**
 * Change-point / trend diagnosis for a sustained stall. Computes a
 * Mann-Kendall trend and the strongest two-sample change point, then states
 * whether the recent segment is a genuine regression vs noise. Requires >= 6
 * points. Returns null otherwise (no honest remote verdict available).
 */
export function stuckDiagnosisScript(
  issue: { id: string; name: string; detail: string },
  context: StuckDiagnosisContext,
): RemoteScript | null {
  const series = finiteSeries(context.series);
  if (series.length < 6) return null;
  const meta = {
    issueId: issue.id,
    issueName: issue.name,
    detail: String(issue.detail || '').slice(0, 300),
    label: String(context.label || 'metric').slice(0, 80),
    note: String(context.note || '').slice(0, 200),
  };
  const code =
    `import warnings, numpy as np\n` +
    `from scipy import stats\n` +
    `warnings.filterwarnings("ignore")\n` +
    `meta = ${JSON.stringify(meta)}\n` +
    `x = np.array(${JSON.stringify(series)}, dtype=float)\n` +
    `n = len(x)\n` +
    `# Mann-Kendall trend (no tie correction; adequate for a monotone stall check)\n` +
    `s = 0.0\n` +
    `for i in range(n - 1):\n` +
    `    s += float(np.sign(x[i + 1:] - x[i]).sum())\n` +
    `var = n * (n - 1) * (2 * n + 5) / 18.0\n` +
    `z = (s - np.sign(s)) / np.sqrt(var) if var > 0 else 0.0\n` +
    `mk_p = float(2 * (1 - stats.norm.cdf(abs(z))))\n` +
    `# strongest change point (Welch t between prefix and suffix)\n` +
    `best_i, best_t = 0, 0.0\n` +
    `for i in range(2, n - 2):\n` +
    `    t, _ = stats.ttest_ind(x[:i], x[i:], equal_var=False)\n` +
    `    if np.isfinite(t) and abs(t) > abs(best_t):\n` +
    `        best_t, best_i = float(t), i\n` +
    `df = max(1, min(best_i, n - best_i) - 1)\n` +
    `cp_p = float(2 * (1 - stats.t.cdf(abs(best_t), df)))\n` +
    `recent = float(x[-3:].mean())\n` +
    `overall = float(x.mean())\n` +
    `regressed = (recent <= overall) and (mk_p < 0.10 or cp_p < 0.10)\n` +
    `confidence = round(1.0 - min(mk_p, cp_p, 1.0), 4)\n` +
    `if regressed:\n` +
    `    diagnosis = ("Sustained regression in " + meta["label"] +\n` +
    `                 " (recent mean %.4f vs overall %.4f; MK p=%.4f, change-point p=%.4f at index %d)." %\n` +
    `                 (recent, overall, mk_p, cp_p, best_i))\n` +
    `    recommendation = "Treat as a real stall: reset/search beyond the current parameter region and re-measure."\n` +
    `else:\n` +
    `    diagnosis = ("No statistically significant regression in " + meta["label"] +\n` +
    `                 " (MK p=%.4f, change-point p=%.4f); the recent dip is consistent with noise." % (mk_p, cp_p))\n` +
    `    recommendation = "Do not escalate a structural fix; the stall is within expected variance so far."\n` +
    `result = {"ok": True, "issueId": meta["issueId"], "diagnosis": diagnosis,\n` +
    `          "recommendation": recommendation, "regressed": bool(regressed), "confidence": confidence,\n` +
    `          "trendZ": round(float(z), 4), "mkP": round(mk_p, 4), "changePointIndex": int(best_i),\n` +
    `          "changeP": round(cp_p, 4), "recentMean": round(recent, 4), "overallMean": round(overall, 4), "n": int(n)}`;
  return { script: code, requirements: ['numpy', 'scipy'] };
}

/** True when a confidence value should be treated as actionable (>=0.9). */
export function diagnosisConfidenceActionable(confidence: unknown): boolean {
  return typeof confidence === 'number' && clamp01(confidence) >= 0.9;
}
