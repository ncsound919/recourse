/**
 * oncology-account2.ts — run the oncology Kaggle lanes on the SECOND Kaggle
 * account (tap919), isolated from the primary account (djoochie) that the
 * Recourse server holds.
 *
 * Why a separate entry point: the oncology client (`submitOncologyNotebook`)
 * POSTs to the Recourse server, whose process credentials are account 1. Kaggle
 * credentials are process-global, so account 2 must submit in-process with its
 * own env (mirrors `scripts/kaggle-account2.ts`).
 *
 * Dataset refs `djoochie/onco-*` are rewritten to `tap919/onco-*` (private copies
 * pushed under account 2), so every data-backed lane attaches.
 *
 * Usage (from INFRASTRUCTURE/recourse):
 *   npx tsx scripts/oncology-account2.ts --lanes twin-ensemble,fm-embed --hardware gpu
 *   npx tsx scripts/oncology-account2.ts --all
 */
import fs from 'node:fs';
import path, { join } from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ONCO_LIB = 'C:/Users/User/Downloads/BUSINESS/SCIENCE/Oncology Ecosystem/platform/lib/oncology-kaggle-experiments.js';
const OUT_DIR = 'C:/Users/User/Downloads/BUSINESS/SCIENCE/Oncology Ecosystem/platform/data/batch-results';
const KAGGLE_BIN = process.env.KAGGLE_BIN
  || (fs.existsSync(path.join(process.env.APPDATA ?? '', 'Python', 'Python312', 'Scripts', 'kaggle.exe'))
      ? path.join(process.env.APPDATA ?? '', 'Python', 'Python312', 'Scripts', 'kaggle.exe')
      : 'kaggle');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Recover the __RECOURSE_RESULT__ envelope from a kernel log when the platform's
 * fetch cannot download output (e.g. the lane outran the fetch cap, or Kaggle
 * assigned a suffixed slug because the requested one was taken). Uses the ACTUAL
 * ref the platform returned (`handle.externalId`), never the requested slug.
 */
async function envelopeFromKernelLog(externalId: string): Promise<Record<string, unknown> | null> {
  try {
    for (let i = 0; i < 40; i++) {
      try {
        const st = execFileSync(KAGGLE_BIN, ['kernels', 'status', externalId], { encoding: 'utf8', timeout: 60_000 });
        if (!/RUNNING|QUEUED|PENDING/i.test(st)) break;
      } catch { break; }
      await sleep(45_000);
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2klog-'));
    execFileSync(KAGGLE_BIN, ['kernels', 'output', externalId, '-p', dir], { timeout: 240_000, stdio: 'ignore' });
    const logs: string[] = [];
    (function walk(d: string): void {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (p.endsWith('.log')) logs.push(p);
      }
    })(dir);
    for (const p of logs) {
      const entries = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{ stream_name?: string; data?: string }>;
      const out = entries.filter((e) => e.stream_name === 'stdout').map((e) => e.data ?? '').join('');
      const line = out.split('\n').find((l) => l.includes('__RECOURSE_RESULT__'));
      if (line) return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>;
    }
  } catch { /* fall through */ }
  return null;
}

const TOKEN_FILE = path.join(process.env.USERPROFILE ?? '', '.config', 'opencode', '.secrets', 'kaggle-account2.token');
function token(): string {
  const explicit = (process.env.KAGGLE2_TOKEN_FILE ?? '').trim();
  if (explicit && fs.existsSync(explicit)) return fs.readFileSync(explicit, 'utf8').split(/\r?\n/)[0].trim();
  return fs.readFileSync(TOKEN_FILE, 'utf8').split(/\r?\n/)[0].trim();
}

// Account-2 env BEFORE the platform initializes.
process.env.KAGGLE_USERNAME = process.env.KAGGLE_USERNAME || 'tap919';
process.env.KAGGLE_API_TOKEN = process.env.KAGGLE_API_TOKEN || token();
delete process.env.KAGGLE_KEY;
process.env.KAGGLE_QUOTA_FILE = process.env.KAGGLE_QUOTA_FILE || path.join(process.cwd(), 'data', 'kaggle-quota-2.json');
process.env.PYTHONUTF8 = '1';
process.env.PYTHONIOENCODING = 'utf-8';

// The platform's CLI check execs a bare `kaggle.exe`, which fails when this is not
// the shell that has the Python Scripts dir on PATH. Put it there explicitly so the
// runner does not depend on the caller's environment.
const KAGGLE_DIR = join(process.env.APPDATA ?? '', 'Python', 'Python312', 'Scripts');
if (fs.existsSync(join(KAGGLE_DIR, 'kaggle.exe')) && !(process.env.PATH ?? '').split(path.delimiter).includes(KAGGLE_DIR)) {
  process.env.PATH = `${KAGGLE_DIR}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.KAGGLE_BIN = join(KAGGLE_DIR, 'kaggle.exe');
}

const log = (s: string) => console.log(`[onco-a2] ${s}`);

function args(): { lanes: string[]; hardware: 'gpu' | 'cpu' | 'auto'; all: boolean } {
  const a = process.argv.slice(2);
  const out = { lanes: [] as string[], hardware: 'auto' as 'gpu' | 'cpu' | 'auto', all: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--lanes') out.lanes = a[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a[i] === '--hardware') out.hardware = a[++i] as 'gpu' | 'cpu';
    else if (a[i] === '--all') out.all = true;
  }
  return out;
}

async function main() {
  const opt = args();
  const { initializeComputePlatforms, getPlatform } = await import('../src/lib/computePlatforms.js');
  const onco = await import(pathToFileURL(ONCO_LIB).href);
  const { KAGGLE_EXPERIMENTS, getKaggleExperiment } = onco as any;

  await initializeComputePlatforms();
  const kaggle = getPlatform('kaggle');
  if (!kaggle?.configured) { log('FAIL: kaggle CLI not configured in this process'); process.exit(1); }
  log(`account ${process.env.KAGGLE_USERNAME}  ledger ${process.env.KAGGLE_QUOTA_FILE}`);

  let lanes: string[] = opt.lanes;
  if (opt.all || lanes.length === 0) {
    lanes = KAGGLE_EXPERIMENTS.filter((e: any) => typeof e.buildCells === 'function').map((e: any) => e.id);
  }

  for (const laneId of lanes) {
    const exp = getKaggleExperiment(laneId);
    if (!exp?.buildCells) { log(`${laneId}: no buildCells (skip)`); continue; }
    const hw = opt.hardware === 'auto' ? exp.hardware : opt.hardware;
    const datasets = (exp.datasetSources ?? []).map((s: string) => s.replace(/^djoochie\//, 'tap919/'));
    const job = {
      id: `a2_${laneId.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}`,
      platform: 'kaggle' as const,
      kind: 'notebook' as const,
      payload: { kernel: 'python3' as const, cells: exp.buildCells() },
      hardware: { type: hw as 'gpu' | 'cpu' | 'tpu' },
      maxRuntimeMs: exp.maxRuntimeMs,
      meta: { kernelSlug: `onco2-${laneId}`.slice(0, 50), datasetSources: datasets },
    };
    log(`${laneId}: submitting (${hw}, datasets=[${datasets.join(', ')}])`);
    let handle: { externalId: string };
    try { handle = await kaggle.submit(job); }
    catch (e) { log(`${laneId}: SUBMIT FAIL ${e instanceof Error ? e.message : String(e)}`); continue; }
    const res = await kaggle.fetch(handle, Math.min(exp.maxRuntimeMs + 900_000, 1_800_000));
    const line = String(res.stdout ?? '').split('\n').find((l: string) => l.includes('__RECOURSE_RESULT__')) ?? '';
    let env: Record<string, unknown> | null = line ? JSON.parse(line.slice(line.indexOf('{'))) : null;
    if (!env) {
      log(`${laneId}: fetch gave no envelope (success=${res.success} error=${res.error ?? ''}); trying kernel log ${handle.externalId}`);
      env = await envelopeFromKernelLog(handle.externalId);
    }
    if (env) {
      log(`${laneId}: RESULT ${JSON.stringify(env).slice(0, 400)}`);
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${laneId}.a2.json`), JSON.stringify({ lane: laneId, account: 'tap919', envelope: env }, null, 2));
    } else {
      log(`${laneId}: NO ENVELOPE`);
    }
  }
  log('done');
}

main().catch((e) => { console.error('[onco-a2] FATAL', e); process.exit(1); });
