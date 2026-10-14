/**
 * kaggle-account2.ts — run one heavy job on the SECOND Kaggle account (tap919),
 * fully isolated from the primary account (djoochie) that the oncology lane uses.
 *
 * Why this is a separate entry point: Kaggle credentials are process-global. The
 * `kaggle` CLI reads `KAGGLE_API_TOKEN` / `KAGGLE_USERNAME` / `KAGGLE_KEY` from
 * the environment, and `KAGGLE_API_TOKEN` overrides the on-disk
 * `~/.kaggle/kaggle.json` (which holds account 1 = djoochie). A process that
 * wants account 2 must therefore set that env itself — it cannot share the
 * Recourse server process, which holds account 1.
 *
 * Isolation guarantees:
 *   - KAGGLE_USERNAME=tap919 + KAGGLE_API_TOKEN=<2nd token>  => account 2 only
 *   - KAGGLE_QUOTA_FILE=data/kaggle-quota-2.json             => its own ledger
 *   - KAGGLE_KEY is cleared, so a stray ambient key can never win over the token
 *   - one notebook is pushed via kagglePlatform.submit, then awaited via fetch
 *
 * Usage (run from INFRASTRUCTURE/recourse):
 *   npx tsx scripts/kaggle-account2.ts --script scripts/jobs/hello-gpu.py --slug a2-hello --gpu --hours 1
 *   npx tsx scripts/kaggle-account2.ts --script scripts/jobs/llm-generate.py --slug a2-llm --gpu --hours 4
 *
 * Credentials, in order: KAGGLE_API_TOKEN in the env, else the first line of the
 * file at KAGGLE2_TOKEN_FILE (default: BUSINESS\2nd kaggle.txt). The token is
 * never printed.
 */
import fs from 'node:fs';
import path from 'node:path';

const log = (s: string) => console.log(`[kaggle-account2] ${s}`);
const fail = (stage: string, why: string): never => {
  console.error(`[kaggle-account2] FAIL at ${stage}: ${why}`);
  process.exit(1);
};

/** Account-2 username; override with KAGGLE_USERNAME if the account is renamed. */
const SECRETS_TOKEN_FILE = path.join('C:', 'Users', 'User', '.config', 'opencode', '.secrets', 'kaggle-account2.token');
const KEYWIRE_BASE_URL = process.env.KEYWIRE_BASE_URL ?? 'http://127.0.0.1:4700';
const KEYWIRE_PROJECT = process.env.KEYWIRE_PROJECT ?? 'prj-mt7jrul1'; // overlay365-fleet
const KEYWIRE_ENV = process.env.KEYWIRE_ENV ?? 'production';

function firstLine(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  } catch {
    return '';
  }
}

function keywireBearer(): string {
  const fromEnv = (process.env.KEYWIRE_TOKEN ?? '').trim();
  if (fromEnv) return fromEnv;
  return firstLine(path.join('C:', 'Users', 'User', '.config', 'opencode', '.secrets', 'keywire-token.txt'));
}

/** Best-effort read of one value from the Keywire vault (short timeout). */
async function fromKeywire(key: string): Promise<string> {
  const bearer = keywireBearer();
  if (!bearer) return '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `${KEYWIRE_BASE_URL}/api/v1/projects/${KEYWIRE_PROJECT}/envs/${KEYWIRE_ENV}/secrets?unmask=true`,
      { headers: { Authorization: `Bearer ${bearer}` }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return '';
    const arr = (await res.json()) as Array<{ key?: string; value?: string }>;
    const hit = Array.isArray(arr) ? arr.find((s) => s.key === key) : undefined;
    return (hit?.value ?? '').trim();
  } catch {
    return '';
  }
}

/**
 * Account-2 token, in order: KAGGLE_API_TOKEN env, KAGGLE2_TOKEN_FILE, the
 * Keywire vault (overlay365-fleet/production), then the local secrets file.
 * Keywire is the primary store; the file is only a fallback so a down vault
 * does not block a run.
 */
async function loadAccount2Token(): Promise<string> {
  const fromEnv = (process.env.KAGGLE_API_TOKEN ?? '').trim();
  if (fromEnv) { log('token source: env KAGGLE_API_TOKEN'); return fromEnv; }
  const explicit = (process.env.KAGGLE2_TOKEN_FILE ?? '').trim();
  if (explicit && fs.existsSync(explicit)) {
    const v = firstLine(explicit);
    if (v) { log('token source: KAGGLE2_TOKEN_FILE'); return v; }
  }
  const fromVault = await fromKeywire('KAGGLE_ACCOUNT2_API_TOKEN');
  if (fromVault) { log('token source: keywire'); return fromVault; }
  const fromFile = firstLine(SECRETS_TOKEN_FILE);
  if (fromFile) { log('token source: local secrets file (keywire unavailable)'); return fromFile; }
  return fail('credentials', 'no KAGGLE_API_TOKEN, no KAGGLE2_TOKEN_FILE, Keywire unreachable, and no local token file');
}

/** Account-2 username: env, else Keywire, else the known default. */
async function resolveAccount2Username(): Promise<string> {
  const fromEnv = (process.env.KAGGLE_USERNAME ?? '').trim();
  if (fromEnv) return fromEnv;
  const fromVault = await fromKeywire('KAGGLE_ACCOUNT2_USERNAME');
  return fromVault || 'tap919';
}

function parseArgs(argv: string[]): { script?: string; slug?: string; gpu: boolean; hours: number; out?: string; datasets: string[]; envs: string[] } {
  const out = {
    script: undefined as string | undefined, slug: undefined as string | undefined,
    gpu: false, hours: 1, out: undefined as string | undefined,
    datasets: [] as string[], envs: [] as string[],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--script') out.script = argv[++i];
    else if (a === '--slug') out.slug = argv[++i];
    else if (a === '--gpu') out.gpu = true;
    else if (a === '--cpu') out.gpu = false;
    else if (a === '--hours') out.hours = Number(argv[++i]) || 1;
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--dataset') out.datasets.push(argv[++i]); // repeatable: owner/slug
    else if (a === '--env') out.envs.push(argv[++i]);         // repeatable: KEY=VALUE
  }
  return out;
}

/** A leading notebook cell that sets os.environ for the job (jobs read A2_*). */
function envPreamble(envs: string[]): string {
  const lines = envs.map((e) => {
    const i = e.indexOf('=');
    const k = i === -1 ? e : e.slice(0, i);
    const v = i === -1 ? '' : e.slice(i + 1);
    return `os.environ[${JSON.stringify(k)}] = ${JSON.stringify(v)}`;
  });
  return 'import os\n' + lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const script = args.script!;
  const slug = args.slug!;
  if (!script) fail('args', 'missing --script <python file>');
  if (!slug) fail('args', 'missing --slug <kernel-slug>');
  const scriptPath = path.resolve(script);
  if (!fs.existsSync(scriptPath)) fail('args', `script not found: ${scriptPath}`);

  // --- Set account-2 env BEFORE the platform initializes (it reads process.env). ---
  const token = await loadAccount2Token();
  const username = await resolveAccount2Username();
  process.env.KAGGLE_USERNAME = username;
  process.env.KAGGLE_API_TOKEN = token;
  delete process.env.KAGGLE_KEY; // a stray ambient key must not win over the token
  process.env.KAGGLE_QUOTA_FILE =
    process.env.KAGGLE_QUOTA_FILE ?? path.join(process.cwd(), 'data', 'kaggle-quota-2.json');
  // The kaggle CLI is Python; when its stdout is piped on Windows it defaults to
  // cp1252 and crashes on Unicode model output ("charmap codec can't encode").
  process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING ?? 'utf-8';
  process.env.PYTHONUTF8 = process.env.PYTHONUTF8 ?? '1';
  log(`account: ${username}  quota ledger: ${process.env.KAGGLE_QUOTA_FILE}`);

  const { initializeComputePlatforms, getPlatform } = await import('../src/lib/computePlatforms.js');
  const { resolveKaggleCredentials, readQuota, quotaFilePath } = await import('../src/lib/kaggleClient.js');

  const creds = resolveKaggleCredentials();
  if (!creds || !creds.username) fail('credentials', 'account-2 credentials did not resolve to a username');
  log(`credentials source: ${creds!.source}`);

  await initializeComputePlatforms();
  const kaggle = getPlatform('kaggle')!;
  if (!kaggle.configured) fail('cli', '`kaggle --version` failed in this process — check kaggle.exe is on PATH');

  const code = fs.readFileSync(scriptPath, 'utf-8');
  const jobId = `a2_${slug.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}`;
  const cells = args.envs.length
    ? [{ type: 'code' as const, source: envPreamble(args.envs) }, { type: 'code' as const, source: code }]
    : [{ type: 'code' as const, source: code }];
  const job = {
    id: jobId,
    platform: 'kaggle' as const,
    kind: 'notebook' as const,
    payload: { kernel: 'python3' as const, cells },
    hardware: { type: (args.gpu ? 'gpu' : 'cpu') as 'gpu' | 'cpu' },
    maxRuntimeMs: Math.max(0.25, args.hours) * 3_600_000,
    meta: { kernelSlug: slug, datasetSources: args.datasets },
  };

  const handle = await kaggle.submit(job);
  log(`submitted kernel ${handle.externalId} (id ${jobId}, ${args.gpu ? 'GPU' : 'CPU'}, <=${args.hours}h)`);

  const result = await kaggle.fetch(handle, (args.hours + 1.5) * 3_600_000);
  log(result.success ? 'kernel OK' : `kernel FAILED: ${result.error ?? 'unknown'}`);
  if (result.stdout.trim()) log(`--- stdout (tail) ---\n${result.stdout.slice(-4000)}`);
  if (result.stderr.trim()) log(`--- stderr (tail) ---\n${result.stderr.slice(-1500)}`);

  if (result.outputFiles?.length) {
    const dir = args.out ? path.resolve(args.out) : path.join(process.cwd(), 'data', 'kaggle2-output', slug);
    for (const f of result.outputFiles) {
      const dest = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(String(f.content), 'base64'));
    }
    log(`saved ${result.outputFiles.length} artifact(s) to ${dir}: ${result.outputFiles.map((f) => f.path).join(', ')}`);
  }

  const q = readQuota();
  log(`ledger ${quotaFilePath()}: gpu ${q.gpuHours.toFixed(2)}h, tpu ${q.tpuHours.toFixed(2)}h, cpu ${q.cpuHours.toFixed(2)}h, unsettled ${Object.keys(q.reserved).length}`);
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => fail('unexpected', e instanceof Error ? e.message : String(e)));
