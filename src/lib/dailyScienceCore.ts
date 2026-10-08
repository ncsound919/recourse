/**
 * Daily science core — pure helpers (fs/crypto/path only, no Recourse imports) so
 * they can be unit-tested without booting the server.
 *
 * Two daily experiments:
 *   OV365-LOGI-001   delivery-time regression on a REAL local CSV, run on Kaggle
 *                    CPU, with baselines, a temporal holdout and day-clustered
 *                    bootstrap CIs. Every number comes from the remote run.
 *   OV365-NEURO-002  oncology leakage benchmark. NOT RUNNABLE yet: this module only
 *                    evaluates prerequisite gates and reports what is unmet. It
 *                    never produces a metric.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LOGISTICS_EXPERIMENT_ID = 'OV365-LOGI-001';
export const ONCOLOGY_EXPERIMENT_ID = 'OV365-NEURO-002';
export const LOGISTICS_DATASET_DIR = 'sujalsuthar__amazon-delivery-dataset';
export const LOGISTICS_DATASET_FILE = 'amazon_delivery.csv';

const DEFAULT_TRUCKING_DATASETS = 'C:\\Users\\User\\Downloads\\BUSINESS\\TRUCKING\\datasets\\kaggle';
const DEFAULT_LENS_DIR = 'C:\\Users\\User\\Downloads\\BUSINESS\\PLATFORMS\\Overlay-Global-Lens';

export function truckingDatasetsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.TRUCKBUDDY_DATASETS_DIR || DEFAULT_TRUCKING_DATASETS;
}

/** Reports land in <Overlay-Global-Lens>/science-reports (OVERLAY_GLOBAL_LENS_PATH overrides the base). */
export function scienceReportsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.OVERLAY_GLOBAL_LENS_PATH || DEFAULT_LENS_DIR, 'science-reports');
}

export function localDateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Minimal RFC-4180 parser (quotes, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

export const LOGISTICS_COLUMNS = [
  'Agent_Age', 'Agent_Rating', 'Store_Latitude', 'Store_Longitude', 'Drop_Latitude', 'Drop_Longitude',
  'Order_Date', 'Order_Time', 'Pickup_Time', 'Weather', 'Traffic', 'Vehicle', 'Area', 'Category', 'Delivery_Time',
] as const;

export interface LogisticsSample {
  columns: string[];
  rows: string[][];
  totalRows: number;
  sampledRows: number;
  sourcePath: string;
  fileSha256: string;
  sampleSha256: string;
}

/**
 * Deterministic even-stride sample (no RNG) of the real CSV, restricted to the
 * model columns. Hashes the whole file and the exact sample so a run is traceable.
 */
export function readLogisticsSample(dir = truckingDatasetsDir(), maxRows = 15000): LogisticsSample | { error: string } {
  const file = path.join(dir, LOGISTICS_DATASET_DIR, LOGISTICS_DATASET_FILE);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch (err) {
    return { error: `dataset not readable at ${file}: ${err instanceof Error ? err.message : String(err)}` };
  }
  const table = parseCsv(buf.toString('utf8').replace(/^\uFEFF/, ''));
  if (table.length < 2) return { error: `dataset at ${file} has no data rows` };
  const header = table[0].map((h) => h.trim());
  const idx = LOGISTICS_COLUMNS.map((c) => header.indexOf(c));
  const missing = LOGISTICS_COLUMNS.filter((_, i) => idx[i] < 0);
  if (missing.length) return { error: `dataset missing columns: ${missing.join(', ')}` };
  const body = table.slice(1).filter((r) => r.length >= header.length);
  const n = Math.min(maxRows, body.length);
  const rows: string[][] = [];
  for (let i = 0; i < n; i++) {
    const src = body[Math.floor((i * body.length) / n)];
    rows.push(idx.map((j) => src[j]));
  }
  const columns = [...LOGISTICS_COLUMNS] as string[];
  return {
    columns,
    rows,
    totalRows: body.length,
    sampledRows: rows.length,
    sourcePath: file,
    fileSha256: 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'),
    sampleSha256: 'sha256:' + crypto.createHash('sha256').update(JSON.stringify({ columns, rows })).digest('hex'),
  };
}

// ---------------------------------------------------------------------------
// Remote script (runs on Kaggle CPU; must define `result`)
// ---------------------------------------------------------------------------

const LOGISTICS_PY = [
  'import numpy as np',
  'import pandas as pd',
  'from sklearn.linear_model import Ridge, LinearRegression',
  'from sklearn.ensemble import HistGradientBoostingRegressor',
  'from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score',
  '',
  'cfg = _rc_json.loads(__CFG__)',
  '',
  'def hav(lat1, lon1, lat2, lon2):',
  '    p1, p2 = np.radians(lat1), np.radians(lat2)',
  '    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2',
  '    return 2 * 6371.0 * np.arcsin(np.sqrt(a))',
  '',
  'def metrics(yt, p):',
  '    return {"mae": float(mean_absolute_error(yt, p)), "rmse": float(np.sqrt(mean_squared_error(yt, p))), "r2": float(r2_score(yt, p))}',
  '',
  'def _main():',
  '    df = pd.DataFrame(cfg["rows"], columns=cfg["columns"])',
  '    n_in = len(df)',
  '    for c in ["Agent_Age", "Agent_Rating", "Store_Latitude", "Store_Longitude", "Drop_Latitude", "Drop_Longitude", "Delivery_Time"]:',
  '        df[c] = pd.to_numeric(df[c], errors="coerce")',
  '    for c in ["Weather", "Traffic", "Vehicle", "Area", "Category"]:',
  '        df[c] = df[c].astype(str).str.strip()',
  '    od = pd.to_datetime(df["Order_Date"], errors="coerce")',
  '    ot = pd.to_timedelta(df["Order_Time"], errors="coerce")',
  '    pt = pd.to_timedelta(df["Pickup_Time"], errors="coerce")',
  '    df["order_date"] = od',
  '    df["hour"] = ot.dt.total_seconds() / 3600.0',
  '    wait = (pt - ot).dt.total_seconds() / 60.0',
  '    df["pickup_wait_min"] = np.where(wait < 0, wait + 1440, wait)',
  '    df["dow"] = od.dt.dayofweek',
  '    df["dist_km"] = hav(df["Store_Latitude"], df["Store_Longitude"], df["Drop_Latitude"], df["Drop_Longitude"])',
  '    zero_coord = (df["Store_Latitude"].abs() < 1e-6) | (df["Store_Longitude"].abs() < 1e-6)',
  '    need = ["Agent_Age", "Agent_Rating", "dist_km", "hour", "pickup_wait_min", "order_date", "Delivery_Time", "dow"]',
  '    keep = (~zero_coord) & df[need].notna().all(axis=1)',
  '    dropped = int((~keep).sum())',
  '    df = df[keep].reset_index(drop=True)',
  '    if len(df) < 500:',
  '        return {"ok": False, "error": "fewer than 500 usable rows after cleaning (" + str(len(df)) + ")"}',
  '    warnings = []',
  '    far = int((df["dist_km"] > 100).sum())',
  '    if far:',
  '        warnings.append(str(far) + " rows have store-to-drop distance > 100 km (likely bad coordinates); kept, not filtered")',
  '    dlat = (df["Drop_Latitude"] - df["Store_Latitude"]).abs() / 0.01',
  '    dlon = (df["Drop_Longitude"] - df["Store_Longitude"]).abs() / 0.01',
  '    grid = float((np.isclose(dlat, np.round(dlat), atol=1e-3) & np.isclose(dlon, np.round(dlon), atol=1e-3)).mean())',
  '    if grid > 0.9:',
  '        warnings.append("{:.1f}% of drop-minus-store coordinate offsets are exact multiples of 0.01 degrees; the coordinates look generated, so distance features are not trustworthy".format(100 * grid))',
  '    cats = pd.get_dummies(df[["Weather", "Traffic", "Vehicle", "Area", "Category"]], dtype=float)',
  '    X_full = pd.concat([df[["Agent_Age", "Agent_Rating", "dist_km", "hour", "pickup_wait_min", "dow"]].astype(float), cats], axis=1)',
  '    X_dist = df[["dist_km"]]',
  '    y = df["Delivery_Time"].values.astype(float)',
  '    dates = df["order_date"].dt.strftime("%Y-%m-%d").values',
  '',
  '    def run_split(tr, te):',
  '        ytr, yte = y[tr], y[te]',
  '        preds = {}',
  '        preds["B0_train_mean"] = np.full(len(te), ytr.mean())',
  '        preds["B0b_distance_linear"] = LinearRegression().fit(X_dist.iloc[tr], ytr).predict(X_dist.iloc[te])',
  '        mu = X_full.iloc[tr].mean()',
  '        sd = X_full.iloc[tr].std().replace(0, 1.0).fillna(1.0)',
  '        preds["B1_ridge"] = Ridge(alpha=1.0).fit((X_full.iloc[tr] - mu) / sd, ytr).predict((X_full.iloc[te] - mu) / sd)',
  '        preds["B2_gbm"] = HistGradientBoostingRegressor(random_state=7).fit(X_full.iloc[tr], ytr).predict(X_full.iloc[te])',
  '        arms = {k: metrics(yte, v) for k, v in preds.items()}',
  '        d_te = dates[te]',
  '        days = np.unique(d_te)',
  '        by_day = [np.where(d_te == d)[0] for d in days]',
  '        ae = {k: np.abs(yte - v) for k, v in preds.items()}',
  '        rng = np.random.default_rng(20261007)',
  '        g_mean, g_dist = [], []',
  '        for _ in range(2000):',
  '            ii = np.concatenate([by_day[k] for k in rng.integers(0, len(days), len(days))])',
  '            g_mean.append(ae["B0_train_mean"][ii].mean() - ae["B2_gbm"][ii].mean())',
  '            g_dist.append(ae["B0b_distance_linear"][ii].mean() - ae["B2_gbm"][ii].mean())',
  '        def ci(a, est):',
  '            return {"estimate": float(est), "ci95": [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]}',
  '        return {',
  '            "n_train": int(len(tr)), "n_test": int(len(te)), "test_days": int(len(days)), "arms": arms,',
  '            "mae_gain_gbm_vs_mean": ci(g_mean, ae["B0_train_mean"].mean() - ae["B2_gbm"].mean()),',
  '            "mae_gain_gbm_vs_distance_linear": ci(g_dist, ae["B0b_distance_linear"].mean() - ae["B2_gbm"].mean()),',
  '        }',
  '',
  '    srt = np.sort(dates)',
  '    cutoff = srt[int(len(srt) * 0.8)]',
  '    tr_t, te_t = np.where(dates < cutoff)[0], np.where(dates >= cutoff)[0]',
  '    splits = {}',
  '    if len(tr_t) >= 200 and len(te_t) >= 100:',
  '        s = run_split(tr_t, te_t)',
  '        s["cutoff_date"] = str(cutoff)',
  '        splits["temporal_holdout"] = s',
  '    else:',
  '        warnings.append("temporal holdout skipped: dates do not allow a split with enough rows on both sides")',
  '    perm = np.random.default_rng(42).permutation(len(df))',
  '    k = int(len(df) * 0.8)',
  '    splits["random_holdout"] = run_split(np.sort(perm[:k]), np.sort(perm[k:]))',
  '    if splits["random_holdout"]["arms"]["B0b_distance_linear"]["r2"] < 0.01:',
  '        warnings.append("distance-only linear model has R2 below 0.01: distance carries no usable signal in this data, so the gain over B0b is only the categorical and time features")',
  '    warnings.append("rows are orders; agent/driver identity is not in the data, so correlated orders cannot be grouped. The bootstrap clusters by order day only.")',
  '    return {',
  '        "ok": True, "experiment_id": cfg["experiment_id"], "n_input": int(n_in), "n_used": int(len(df)), "n_dropped": dropped,',
  '        "date_min": str(dates.min()), "date_max": str(dates.max()), "target": "Delivery_Time (minutes)",',
  '        "target_mean": float(y.mean()), "target_sd": float(y.std()), "splits": splits, "warnings": warnings,',
  '    }',
  '',
  'try:',
  '    result = _main()',
  'except Exception as _e:',
  '    import traceback',
  '    result = {"ok": False, "error": str(_e), "trace": traceback.format_exc()[-1500:]}',
].join('\n');

export function buildLogisticsScript(sample: LogisticsSample): string {
  const cfgJson = JSON.stringify({
    experiment_id: LOGISTICS_EXPERIMENT_ID,
    columns: sample.columns,
    rows: sample.rows,
  });
  return LOGISTICS_PY.split('__CFG__').join(JSON.stringify(cfgJson));
}

export const LOGISTICS_REQUIREMENTS = ['scikit-learn', 'pandas', 'numpy'];

// ---------------------------------------------------------------------------
// Report rendering (logistics)
// ---------------------------------------------------------------------------

export interface LogisticsRunRecord {
  experimentId: string;
  taskId: string;
  platform: string;
  at: number;
  date: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  dataset?: { sourcePath: string; fileSha256: string; sampleSha256: string; totalRows: number; sampledRows: number };
}

const f = (n: unknown, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : 'n/a');

export function renderLogisticsReport(run: LogisticsRunRecord): string {
  const L: string[] = [];
  L.push(`# ${LOGISTICS_EXPERIMENT_ID} — Delivery-time regression (${run.date})`);
  L.push('');
  L.push(`Run ${run.taskId} on ${run.platform} (CPU). Generated ${new Date(run.at).toISOString()}.`);
  L.push('');
  L.push('**Evidence status:** real run on real file rows; every metric below was computed on the Kaggle kernel and parsed from its result envelope. **Dataset provenance is UNVERIFIED** (public Kaggle upload, no stated source or license). Indian last-mile motorcycle/scooter deliveries — **not truck detention or dwell. Do not transfer these numbers to AetherRoute.**');
  L.push('');
  if (!run.ok || !run.data) {
    L.push('## Run failed');
    L.push('');
    L.push(`Error: ${run.error ?? 'no result data'}`);
    L.push('');
    return L.join('\n');
  }
  const d = run.data as Record<string, any>;
  if (run.dataset) {
    L.push('## Data');
    L.push('');
    L.push(`- Source: \`${run.dataset.sourcePath}\``);
    L.push(`- File hash: \`${run.dataset.fileSha256}\``);
    L.push(`- Sample hash (exact rows sent to the kernel): \`${run.dataset.sampleSha256}\``);
    L.push(`- Rows: ${run.dataset.totalRows} in file, ${run.dataset.sampledRows} sampled (even stride, no RNG), ${d.n_used} used after cleaning (${d.n_dropped} dropped: missing values or zero store coordinates)`);
    L.push(`- Dates ${d.date_min} to ${d.date_max}; target ${d.target}, mean ${f(d.target_mean, 1)}, sd ${f(d.target_sd, 1)}`);
    L.push('');
  }
  const names: Record<string, string> = {
    temporal_holdout: 'Temporal holdout (train on earlier days, test on the latest days) — primary',
    random_holdout: 'Random 80/20 holdout — secondary (optimistic: neighbouring orders share days)',
  };
  for (const key of ['temporal_holdout', 'random_holdout']) {
    const s = d.splits?.[key];
    if (!s) continue;
    L.push(`## ${names[key]}`);
    L.push('');
    L.push(`Train ${s.n_train} / test ${s.n_test} rows; ${s.test_days} test day(s)${s.cutoff_date ? `; cutoff ${s.cutoff_date}` : ''}.`);
    L.push('');
    L.push('| arm | MAE (min) | RMSE (min) | R² |');
    L.push('|---|---:|---:|---:|');
    for (const [arm, m] of Object.entries<any>(s.arms ?? {})) L.push(`| ${arm} | ${f(m.mae)} | ${f(m.rmse)} | ${f(m.r2, 3)} |`);
    L.push('');
    const g1 = s.mae_gain_gbm_vs_mean, g2 = s.mae_gain_gbm_vs_distance_linear;
    L.push(`MAE gain of B2 over predict-the-mean: ${f(g1?.estimate)} min, 95% day-cluster bootstrap CI [${f(g1?.ci95?.[0])}, ${f(g1?.ci95?.[1])}].`);
    L.push(`MAE gain of B2 over distance-only linear: ${f(g2?.estimate)} min, 95% CI [${f(g2?.ci95?.[0])}, ${f(g2?.ci95?.[1])}].`);
    L.push('');
  }
  L.push('## Caveats');
  L.push('');
  for (const w of (d.warnings as string[]) ?? []) L.push(`- ${w}`);
  L.push('- A CI that spans 0 means this run does not show the model beating that baseline; it is not evidence of equivalence.');
  L.push('- One run, one sample of the file. Seeds are fixed, so a rerun on identical rows should reproduce within numerical tolerance, not necessarily bitwise.');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Oncology gate (OV365-NEURO-002) — evaluates prerequisites, never runs anything
// ---------------------------------------------------------------------------

export interface OncologyGateConfig {
  experiment: string;
  license: { resolved: boolean; evidence: string | null };
  datasetSnapshotHash: string | null;
  patientManifestHash: string | null;
  partitionManifestHash: string | null;
  preregistrationHash: string | null;
  labelEscrow: { physicallySeparated: boolean; store: string | null };
  kaggleDatasetRef: string | null;
}

export function defaultOncologyGate(): OncologyGateConfig {
  return {
    experiment: ONCOLOGY_EXPERIMENT_ID,
    license: { resolved: false, evidence: null },
    datasetSnapshotHash: null,
    patientManifestHash: null,
    partitionManifestHash: null,
    preregistrationHash: null,
    labelEscrow: { physicallySeparated: false, store: null },
    kaggleDatasetRef: null,
  };
}

const HASH_RE = /^sha256:[0-9a-f]{64}$/;

export interface OncologyGateEval {
  status: 'BLOCKED' | 'GATES_MET_RUNNER_MISSING';
  unmet: Array<{ gate: string; requirement: string }>;
  met: string[];
}

export function evaluateOncologyGate(cfg: OncologyGateConfig): OncologyGateEval {
  const unmet: OncologyGateEval['unmet'] = [];
  const met: string[] = [];
  const check = (ok: boolean, gate: string, requirement: string) => (ok ? met.push(gate) : unmet.push({ gate, requirement }));
  check(
    cfg.license.resolved === true && !!cfg.license.evidence?.trim(),
    'license',
    'LUMIERE license conflict resolved with written evidence (Figshare tags CC0; the Scientific Data usage notes and the authors\' README say non-commercial). Record the evidence string.',
  );
  check(HASH_RE.test(cfg.datasetSnapshotHash ?? ''), 'dataset_snapshot_hash', 'sha256 of the locked dataset snapshot (sha256:<64 hex>)');
  check(HASH_RE.test(cfg.patientManifestHash ?? ''), 'patient_manifest_hash', 'sha256 of the canonical patient manifest');
  check(HASH_RE.test(cfg.partitionManifestHash ?? ''), 'partition_manifest_hash', 'sha256 of the patient-level partition manifest');
  check(HASH_RE.test(cfg.preregistrationHash ?? ''), 'preregistration_hash', 'sha256 of the frozen preregistration');
  check(
    cfg.labelEscrow.physicallySeparated === true && !!cfg.labelEscrow.store?.trim(),
    'label_escrow',
    'Test labels held where the experiment process cannot read them (labels are public, so this must be physical separation, not a flag)',
  );
  check(/^[\w.-]+\/[\w.-]+$/.test(cfg.kaggleDatasetRef ?? ''), 'kaggle_dataset_ref', 'Private Kaggle dataset owner/slug holding the locked snapshot (license permitting)');
  return { status: unmet.length ? 'BLOCKED' : 'GATES_MET_RUNNER_MISSING', unmet, met };
}

export function renderOncologyGateReport(ev: OncologyGateEval, date: string): string {
  const L: string[] = [];
  L.push(`# ${ONCOLOGY_EXPERIMENT_ID} — Oncology leakage benchmark gate (${date})`);
  L.push('');
  L.push(`**Status: ${ev.status === 'BLOCKED' ? 'BLOCKED' : 'GATES MET, RUNNER NOT BUILT'}.** No experiment ran and no metric was produced today. This job only checks prerequisites and fails closed.`);
  L.push('');
  if (ev.unmet.length) {
    L.push(`## Unmet gates (${ev.unmet.length})`);
    L.push('');
    for (const u of ev.unmet) L.push(`- **${u.gate}** — ${u.requirement}`);
    L.push('');
  }
  if (ev.met.length) {
    L.push(`## Met gates`);
    L.push('');
    for (const m of ev.met) L.push(`- ${m}`);
    L.push('');
  }
  L.push('## Always-on blockers (not configurable)');
  L.push('');
  L.push('- The pipeline itself does not exist yet: patient identity resolver, partition engine, label escrow, temporal-leakage detector, cluster bootstrap, unseal gate. Meeting every gate above still produces no result.');
  L.push('- The earlier mammography audit notebook used simulated TP53, tissue-site and age variables and is **not** scheduled. TP53, TSS and genomics do not exist in CBIS-DDSM or CMMD.');
  L.push('- The published LUMIERE 50.96% benchmark (Matoso et al., arXiv:2504.18268) splits folds by patient-week timepoint with test-fold early stopping, so a leakage comparison (A0 vs patient-grouped) is well motivated, but the effect size is unmeasured.');
  L.push('');
  L.push('Edit `data/oncology-gate.json` to record gate evidence. Hashes must be real `sha256:<64 hex>` values; placeholders are rejected.');
  L.push('');
  return L.join('\n');
}

/** Read the gate file, creating the all-unmet default on first run. */
export function loadOncologyGate(file: string): OncologyGateConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<OncologyGateConfig>;
    const d = defaultOncologyGate();
    return {
      experiment: d.experiment,
      license: { ...d.license, ...(raw.license ?? {}) },
      datasetSnapshotHash: raw.datasetSnapshotHash ?? null,
      patientManifestHash: raw.patientManifestHash ?? null,
      partitionManifestHash: raw.partitionManifestHash ?? null,
      preregistrationHash: raw.preregistrationHash ?? null,
      labelEscrow: { ...d.labelEscrow, ...(raw.labelEscrow ?? {}) },
      kaggleDatasetRef: raw.kaggleDatasetRef ?? null,
    };
  } catch {
    const d = defaultOncologyGate();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf8');
    } catch { /* read-only is fine; default is all-unmet */ }
    return d;
  }
}
