import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LOGISTICS_COLUMNS,
  LOGISTICS_DATASET_DIR,
  LOGISTICS_DATASET_FILE,
  buildLogisticsScript,
  defaultOncologyGate,
  evaluateOncologyGate,
  loadOncologyGate,
  parseCsv,
  readLogisticsSample,
  renderLogisticsReport,
  renderOncologyGateReport,
} from '../src/lib/dailyScienceCore.js';

function makeDataset(rows: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsci-'));
  fs.mkdirSync(path.join(dir, LOGISTICS_DATASET_DIR));
  const header = ['Order_ID', ...LOGISTICS_COLUMNS].join(',');
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    lines.push(`o${i},30,4.5,12.9,77.6,13.0,77.7,2022-03-${String((i % 28) + 1).padStart(2, '0')},10:00:00,10:10:00,Sunny,"High ",bike ,Urban ,${100 + (i % 50)},Food`);
  }
  // LOGISTICS_COLUMNS order differs from this literal order on purpose: lookup must be by header name.
  fs.writeFileSync(path.join(dir, LOGISTICS_DATASET_DIR, LOGISTICS_DATASET_FILE), lines.join('\r\n') + '\r\n');
  return dir;
}

describe('parseCsv', () => {
  it('handles quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n')).toEqual([['a', 'b'], ['x,1', 'he said "hi"']]);
  });
  it('keeps a final row without trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('readLogisticsSample', () => {
  it('reports an error instead of inventing data when the file is missing', () => {
    const r = readLogisticsSample(path.join(os.tmpdir(), 'does-not-exist-dsci'));
    expect('error' in r).toBe(true);
  });
  it('samples deterministically with stable hashes', () => {
    const dir = makeDataset(300);
    const a = readLogisticsSample(dir, 100);
    const b = readLogisticsSample(dir, 100);
    expect('error' in a).toBe(false);
    if ('error' in a || 'error' in b) return;
    expect(a.sampledRows).toBe(100);
    expect(a.totalRows).toBe(300);
    expect(a.sampleSha256).toBe(b.sampleSha256);
    expect(a.fileSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.columns).toEqual([...LOGISTICS_COLUMNS]);
    expect(a.rows[0]).toHaveLength(LOGISTICS_COLUMNS.length);
  });
  it('rejects a file missing required columns', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsci-bad-'));
    fs.mkdirSync(path.join(dir, LOGISTICS_DATASET_DIR));
    fs.writeFileSync(path.join(dir, LOGISTICS_DATASET_DIR, LOGISTICS_DATASET_FILE), 'a,b\n1,2\n');
    const r = readLogisticsSample(dir);
    expect('error' in r && r.error).toMatch(/missing columns/);
  });
});

describe('logistics script', () => {
  it('embeds the data and defines no hard-coded metric values', () => {
    const dir = makeDataset(50);
    const s = readLogisticsSample(dir, 50);
    if ('error' in s) throw new Error(s.error);
    const py = buildLogisticsScript(s);
    expect(py).toContain('result = _main()');
    expect(py).not.toContain('__CFG__');
    expect(py).not.toMatch(/"mae":\s*\d/);
    expect(py).toContain('HistGradientBoostingRegressor');
  });
});

describe('renderLogisticsReport', () => {
  it('labels provenance as unverified and refuses to print numbers for a failed run', () => {
    const md = renderLogisticsReport({ experimentId: 'OV365-LOGI-001', taskId: 't1', platform: 'kaggle', at: 0, date: '2026-10-08', ok: false, error: 'boom' });
    expect(md).toContain('UNVERIFIED');
    expect(md).toContain('Run failed');
    expect(md).not.toMatch(/\| B2_gbm/);
  });
});

describe('oncology gate', () => {
  it('is BLOCKED by default and lists every gate', () => {
    const ev = evaluateOncologyGate(defaultOncologyGate());
    expect(ev.status).toBe('BLOCKED');
    expect(ev.unmet.map((u) => u.gate).sort()).toEqual(
      ['dataset_snapshot_hash', 'kaggle_dataset_ref', 'label_escrow', 'license', 'partition_manifest_hash', 'patient_manifest_hash', 'preregistration_hash'],
    );
  });
  it('rejects placeholder hashes', () => {
    const cfg = { ...defaultOncologyGate(), datasetSnapshotHash: 'sha256:...' };
    expect(evaluateOncologyGate(cfg).unmet.some((u) => u.gate === 'dataset_snapshot_hash')).toBe(true);
  });
  it('a license flag without evidence does not pass', () => {
    const cfg = { ...defaultOncologyGate(), license: { resolved: true, evidence: '  ' } };
    expect(evaluateOncologyGate(cfg).unmet.some((u) => u.gate === 'license')).toBe(true);
  });
  it('meeting every gate still reports the runner as missing, not a result', () => {
    const h = 'sha256:' + 'a'.repeat(64);
    const cfg = {
      ...defaultOncologyGate(),
      license: { resolved: true, evidence: 'author email 2026-10-09' },
      datasetSnapshotHash: h, patientManifestHash: h, partitionManifestHash: h, preregistrationHash: h,
      labelEscrow: { physicallySeparated: true, store: 'sealed-bucket' },
      kaggleDatasetRef: 'djoochie/lumiere-locked',
    };
    const ev = evaluateOncologyGate(cfg);
    expect(ev.status).toBe('GATES_MET_RUNNER_MISSING');
    expect(renderOncologyGateReport(ev, '2026-10-08')).toContain('no metric was produced');
  });
  it('creates the all-unmet default file on first load', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dsci-gate-')), 'data', 'oncology-gate.json');
    const cfg = loadOncologyGate(file);
    expect(cfg.license.resolved).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
  });
});

import { buildLogisticsFinding } from '../src/lib/dailyScience.js';
import { mirrorReadout } from '../src/lib/lensReadoutMirror.js';
import { artifactFindings } from '../src/lib/globalLensPublisher.js';

describe('findings ledger bridge', () => {
  const rec = {
    experimentId: 'OV365-LOGI-001', taskId: 't9', platform: 'kaggle', at: 0, date: '2026-10-08', ok: true,
    dataset: { sourcePath: 'x', fileSha256: 'sha256:' + 'b'.repeat(64), sampleSha256: 'sha256:' + 'c'.repeat(64), totalRows: 100, sampledRows: 50 },
    data: { splits: { temporal_holdout: { n_train: 30, n_test: 20, arms: { B0_mean: { mae: 41 }, B2_gbm: { mae: 18 } }, mae_gain_gbm_vs_mean: { estimate: 23, ci95: [20, 26] } } } },
  } as any;
  it('builds an E4 internal finding from envelope numbers only', () => {
    const b = buildLogisticsFinding(rec)!;
    expect(b.artifact.evidenceTier).toBe('E4');
    expect(b.finding.numbers.mae_gain_vs_mean).toBe(23);
    expect(b.artifact.dataVersion).toBe(rec.dataset.fileSha256);
  });
  it('returns null when the envelope has no temporal result', () => {
    expect(buildLogisticsFinding({ ...rec, data: {} })).toBeNull();
  });
  it('internal-only kind is never offered to the public publisher', () => {
    const b = buildLogisticsFinding(rec)!;
    expect(artifactFindings([{ ...b.finding, artifact: b.artifact } as any])).toHaveLength(0);
  });
  it('mirrors a readout with an honest status line', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
    const f = mirrorReadout('Brief X', 'body', { source: 't', published: false, error: 'no key' }, dir)!;
    expect(fs.readFileSync(f, 'utf8')).toContain('NOT published: no key');
    expect(fs.existsSync(path.join(dir, 'latest.md'))).toBe(true);
  });
});

import { ONCOLOGY_METHODS, buildOncologyScript } from '../src/lib/oncologyExperiments.js';
import { buildOncologyFinding, renderOncologyMethodReport, renderWindowReport, startResearchWindow } from '../src/lib/dailyScience.js';

describe('oncology method experiments', () => {
  const rec = (id: string) => ({
    experimentId: id, taskId: 'tt1234567', platform: 'kaggle', at: 0, date: '2026-10-08', ok: true,
    data: { seed: 3, reps: 300, summary: { claim: 'c', numbers: { a: 0.5, b: 1 }, n: 10, test: null } },
  }) as any;
  it('scripts embed seed/reps/kind and no hard-coded results', () => {
    for (const m of ONCOLOGY_METHODS) {
      const py = buildOncologyScript(m, 7, 300);
      expect(py).not.toContain('__CFG__');
      expect(py).toContain('load_breast_cancer');
      expect(py).toContain(m.kind);
    }
  });
  it('failed run reports no numbers', () => {
    const md = renderOncologyMethodReport({ ...rec('OV365-ONC-A'), ok: false, error: 'boom', data: undefined });
    expect(md).toContain('Run failed');
    expect(md).not.toContain('| quantity');
  });
  it('finding is E4 and carries a test only when the summary has p+effect', () => {
    expect(buildOncologyFinding(rec('OV365-ONC-A'))!.artifact.stats).toBeNull();
    const withTest = rec('OV365-ONC-C'); withTest.data.summary = { ...withTest.data.summary, test: 'permutation_auc', p: 0.004, effect: 0.5 };
    expect(buildOncologyFinding(withTest)!.artifact.stats?.p).toBe(0.004);
    expect(buildOncologyFinding(rec('OV365-ONC-A'))!.artifact.evidenceTier).toBe('E4');
  });
  it('window report pools across seeds and says what the spread means', () => {
    const a = rec('OV365-ONC-A'); const b = rec('OV365-ONC-A'); b.data.summary = { ...b.data.summary, numbers: { a: 0.7, b: 1 } };
    const md = renderWindowReport({ id: 'win_1', startedAt: 0, endsAt: 1, cycle: 2, reps: 300, taskIds: ['x', 'y'], done: true }, [a, b], 0);
    expect(md).toContain('| a | 0.6000');
    expect(md).toContain('between-seed variability');
  });
  it('does not start a second window while one is active', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'win-')), 'w.json');
    process.env.RESEARCH_WINDOW_FILE = f;
    expect(startResearchWindow(3600_000, 300, 1000).started).toBe(true);
    expect(startResearchWindow(3600_000, 300, 2000).started).toBe(false);
    delete process.env.RESEARCH_WINDOW_FILE;
  });
});

import { enqueueRemoteTask, drainRemoteTasks, readRemoteQueue, registerRemoteApplier, clearRemoteAppliers } from '../src/lib/remoteCompute.js';
import { applyScienceExperiment, runResearchWindowTick, WINDOW_GRACE_MS } from '../src/lib/dailyScience.js';

function sandboxEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsci-e2e-'));
  const env = {
    REMOTE_COMPUTE_FILE: path.join(dir, 'remote-compute.json'),
    DAILY_SCIENCE_FILE: path.join(dir, 'daily-science.json'),
    RESEARCH_WINDOW_FILE: path.join(dir, 'research-window.json'),
    OVERLAY_GLOBAL_LENS_PATH: path.join(dir, 'lens'),
    ONCOLOGY_LENS_READOUTS_DIR: path.join(dir, 'readouts'),
  };
  Object.assign(process.env, env);
  return { dir, env, restore: () => { for (const k of Object.keys(env)) delete process.env[k]; } };
}

function fakeClient(envelope: unknown) {
  return {
    async submit(j: any) { return { id: j.id, platform: 'kaggle', externalId: j.id, submittedAt: Date.now(), status: 'running' }; },
    async submitTo(p: any, j: any) { return { id: j.id, platform: p, externalId: j.id, submittedAt: Date.now(), status: 'running' }; },
    async poll(h: any) { return { handle: h, state: 'completed' }; },
    async await(h: any) { return { handle: h, success: true, stdout: `noise\n__RECOURSE_RESULT__${JSON.stringify(envelope)}\n`, stderr: '', durationMs: 5 }; },
    async cancel() { return true; },
    status() { return []; },
  } as any;
}

describe('science_experiment end to end (fake Kaggle client)', () => {
  it('persists only the slim payload, drains, applies, and records an E4 finding', async () => {
    const sb = sandboxEnv();
    try {
      const envelope = { ok: true, seed: 2, reps: 60, summary: { claim: 'WDBC claim', numbers: { real_auc: 0.99 }, n: 569, test: 'permutation_auc', p: 0.005, effect: 0.5 } };
      const client = fakeClient(envelope);
      const recorded: any[] = [];
      clearRemoteAppliers();
      registerRemoteApplier('science_experiment', (t) => applyScienceExperiment(t, undefined, (f, a) => recorded.push({ f, a })));
      const q = await enqueueRemoteTask('science_experiment', { script: 'print(1)\n'.repeat(1000), experiment: 'OV365-ONC-C' }, { platform: 'kaggle', persistPayload: { experiment: 'OV365-ONC-C', seed: 2, scriptOmitted: true } }, { client });
      expect(q.queued).toBe(true);
      const stored = readRemoteQueue().tasks[0]!;
      expect(stored.payload.script).toBeUndefined();
      expect(stored.payload.scriptOmitted).toBe(true);
      const s = await drainRemoteTasks({ client });
      expect(s.applied).toBe(1);
      expect(recorded).toHaveLength(1);
      expect(recorded[0].a.evidenceTier).toBe('E4');
      expect(recorded[0].a.stats.p).toBe(0.005);
      const reports = fs.readdirSync(path.join(sb.env.OVERLAY_GLOBAL_LENS_PATH, 'science-reports'));
      expect(reports.some((f) => f.startsWith('OV365-ONC-C-'))).toBe(true);
      // per-run reports are NOT mirrored into the Oncology Ecosystem folder
      expect(fs.existsSync(sb.env.ONCOLOGY_LENS_READOUTS_DIR)).toBe(false);
    } finally { clearRemoteAppliers(); sb.restore(); }
  });
});

describe('research window', () => {
  it('force-finalizes when a kernel is still in flight past the grace period', async () => {
    const sb = sandboxEnv();
    try {
      const now = Date.now();
      fs.writeFileSync(sb.env.REMOTE_COMPUTE_FILE, JSON.stringify({ version: 1, updatedAt: now, tasks: [
        { id: 'stuck1', kind: 'science_experiment', platform: 'kaggle', handle: {}, status: 'running', createdAt: now - 4 * 3600_000, updatedAt: now, payload: { experiment: 'OV365-ONC-A' } },
      ] }));
      fs.writeFileSync(sb.env.RESEARCH_WINDOW_FILE, JSON.stringify({ id: 'win_x', startedAt: now - 3 * 3600_000, endsAt: now - WINDOW_GRACE_MS - 60_000, cycle: 1, reps: 300, taskIds: ['stuck1'], done: false }));
      const r = await runResearchWindowTick({}, now);
      expect(r.state).toBe('finished');
      expect(r.detail).toMatch(/forced/);
      expect(r.detail).toContain('stuck1');
      expect(fs.readFileSync(path.join(sb.env.ONCOLOGY_LENS_READOUTS_DIR, 'latest.md'), 'utf8')).toContain('forced');
    } finally { sb.restore(); }
  });
  it('waits (does not finalize) inside the grace period', async () => {
    const sb = sandboxEnv();
    try {
      const now = Date.now();
      fs.writeFileSync(sb.env.REMOTE_COMPUTE_FILE, JSON.stringify({ version: 1, updatedAt: now, tasks: [
        { id: 'k1', kind: 'science_experiment', platform: 'kaggle', handle: {}, status: 'running', createdAt: now, updatedAt: now, payload: {} },
      ] }));
      fs.writeFileSync(sb.env.RESEARCH_WINDOW_FILE, JSON.stringify({ id: 'win_y', startedAt: now - 7200_000, endsAt: now - 60_000, cycle: 1, reps: 300, taskIds: ['k1'], done: false }));
      expect((await runResearchWindowTick({}, now)).state).toBe('waiting');
    } finally { sb.restore(); }
  });
});

describe('stale kernel output guard', () => {
  it('refuses an envelope whose experiment id does not match the task', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-'));
    process.env.DAILY_SCIENCE_FILE = path.join(dir, 'ds.json');
    process.env.OVERLAY_GLOBAL_LENS_PATH = path.join(dir, 'lens');
    const recorded: unknown[] = [];
    applyScienceExperiment({ id: 'tX', kind: 'science_experiment', platform: 'kaggle', handle: {} as any, status: 'completed', createdAt: Date.now(), updatedAt: Date.now(),
      payload: { experiment: 'OV365-ONC-B' },
      result: { ok: true, data: { ok: true, experiment: 'OV365-ONC-A', summary: { claim: 'c', numbers: { a: 1 }, n: 1, test: null } } } } as any, undefined, (f) => recorded.push(f));
    expect(recorded).toHaveLength(0);
    const md = fs.readFileSync(path.join(dir, 'lens', 'science-reports', 'latest-OV365-ONC-B.md'), 'utf8');
    expect(md).toContain('stale kernel output');
    delete process.env.DAILY_SCIENCE_FILE; delete process.env.OVERLAY_GLOBAL_LENS_PATH;
  });
});

import { expireAbandonedReservations, reserveQuota, readQuota, RESERVATION_GRACE_MS } from '../src/lib/kaggleClient.js';
import { repairScriptHash, enqueueRepairDiagnose } from '../src/lib/remoteComputeIntegrations.js';

describe('Kaggle quota: abandoned reservations', () => {
  it('expires a reservation past its window + grace and charges the full reserved hours', () => {
    const now = 1_800_000_000_000;
    const doc: any = { weekStart: 0, gpuHours: 1, tpuHours: 0, cpuHours: 0, reserved: {
      live: { type: 'gpu', hours: 2, at: now - 3600_000 },                                  // still inside its 2 h window
      dead: { type: 'gpu', hours: 0.5, at: now - 0.5 * 3600_000 - RESERVATION_GRACE_MS - 1 }, // past window + grace
      [`onco_${now - 10 * 3600_000}_x`]: { type: 'cpu', hours: 0.25 },                     // legacy, ts in id, long past
      legacy_no_ts: { type: 'tpu', hours: 1 },                                              // legacy, unknown age
    } };
    expect(expireAbandonedReservations(doc, now)).toBe(3);
    expect(Object.keys(doc.reserved)).toEqual(['live']);
    expect(doc.gpuHours).toBeCloseTo(1.5);
    expect(doc.cpuHours).toBeCloseTo(0.25);
    expect(doc.tpuHours).toBeCloseTo(1);
  });
  it('new reservations carry a timestamp and survive a read inside their window', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quota-')), 'q.json');
    const now = Date.now();
    reserveQuota('job1', 'cpu', 0.5, f, now);
    const d = readQuota(f, now + 10 * 60_000);
    expect(d.reserved.job1?.at).toBe(now);
  });
});

describe('repair_diagnose queue payload', () => {
  it('stores the script hash, not the script', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-'));
    process.env.REMOTE_COMPUTE_FILE = path.join(dir, 'q.json');
    try {
      const script = 'print("diag")\n'.repeat(200);
      const r = await enqueueRepairDiagnose(script, { id: 'verifier:pass-rate', name: 'n', detail: 'd' }, { platform: 'kaggle' }, { client: fakeClient({ ok: true }) });
      expect(r.queued).toBe(true);
      const t = readRemoteQueue().tasks[0]!;
      expect(t.payload.script).toBeUndefined();
      expect(t.payload.scriptSha256).toBe(repairScriptHash(script));
      expect((t.payload.issue as any).id).toBe('verifier:pass-rate');
    } finally { delete process.env.REMOTE_COMPUTE_FILE; }
  });
});

import { COHORT_EXPERIMENTS, buildCohortScript, cohortKernelSlug } from '../src/lib/cohortExperiments.js';
import { buildRemoteJob } from '../src/lib/remoteCompute.js';

describe('cohort experiments', () => {
  it('each experiment gets its own kernel and attaches its dataset', () => {
    const slugs = new Set(COHORT_EXPERIMENTS.map(cohortKernelSlug));
    expect(slugs.size).toBe(COHORT_EXPERIMENTS.length);
    const e = COHORT_EXPERIMENTS[0]!;
    const job = buildRemoteJob('science_experiment', { script: buildCohortScript(e, 3) }, { kernelSlug: cohortKernelSlug(e), datasetSources: [e.dataset] })!;
    expect(job.meta?.kernelSlug).toBe('recourse-ov365-coh-01');
    expect(job.meta?.datasetSources).toEqual([e.dataset]);
  });
  it('the shared science kernel keeps its per-kind slug and attaches nothing', () => {
    const job = buildRemoteJob('science_experiment', { script: 'print(1)' }, {})!;
    expect(job.meta?.kernelSlug).toBe('recourse-science-experiment');
    expect(job.meta?.datasetSources).toBeUndefined();
  });
  it('METABRIC script derives the event from death_from_cancer, not the column name', () => {
    const py = buildCohortScript(COHORT_EXPERIMENTS[0]!, 1);
    expect(py).toContain('overall_survival==1 means alive');
    expect(py).toContain('refusing to guess');
  });
  it('cohort reports carry the dataset and licence', () => {
    const md = renderOncologyMethodReport({ experimentId: 'OV365-COH-02', taskId: 't', platform: 'kaggle', at: 0, date: 'd', ok: true,
      data: { experiment: 'OV365-COH-02', fileSha256: 'sha256:x', summary: { claim: 'c', numbers: { a: 1 }, n: 1, test: null } } } as any);
    expect(md).toContain('vinayjose/glioma-grading-clinical-and-mutation-features');
    expect(md).toContain('full result');
  });
});
