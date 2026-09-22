/**
 * FieldBridge bridge — stateless reader for the FieldBridge batch artifact.
 *
 * FieldBridge (`02_Pillars/Overlay Science/fieldbridge`, Vercel-deployed) is a
 * BATCH tool, not a live service: its runnable artifact is the TS CLI
 * (`npm run matrix -- --snapshot <snapshot>.json`) + the Python pipeline, and
 * its durable outputs are the checked-in JSON snapshots in `public/`
 * (`fieldbridge-matrix.json`, `benchmark.json`, `validation.json`) plus the
 * SQLite history store in `data/fieldbridge.db`. There is NO HTTP server on
 * port 3070 (that is overlay-oncology) — an HTTP default for FieldBridge would
 * 404 or return another app's HTML, so this bridge reads the artifact files
 * directly instead of POSTing/GETting a URL.
 *
 * Honesty contract (same as `oncologyEngineBridge.ts` / `kgSidecarClient.ts`):
 * every call returns `{ ok: true, data }` with REAL artifact content, or
 * `{ ok: false, reason: 'unavailable' }` with the underlying error. Nothing is
 * ever fabricated; the benchmark gate is reported as whatever the artifact
 * says (PENDING until it is not).
 *
 * Env:
 *   FIELDBRIDGE_DIR            — FieldBridge repo root (default the local clone)
 *   FIELDBRIDGE_ARTIFACT_DIR   — dir holding the JSON snapshot (default <root>/public)
 *   FIELDBRIDGE_DATA_DIR       — dir holding the SQLite/durable store (default <root>/data)
 *   FIELDBRIDGE_MATRIX_FILE    — matrix artifact filename (default fieldbridge-matrix.json)
 *   FIELDBRIDGE_BENCHMARK_FILE — benchmark artifact filename (default benchmark.json)
 */

import fs from 'node:fs';
import path from 'node:path';

export const FIELDBRIDGE_DEFAULT_DIR =
  process.env.FIELDBRIDGE_DIR ||
  'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\fieldbridge';

export const FIELDBRIDGE_DEFAULT_ARTIFACT_DIR =
  process.env.FIELDBRIDGE_ARTIFACT_DIR || path.join(FIELDBRIDGE_DEFAULT_DIR, 'public');

export const FIELDBRIDGE_DEFAULT_DATA_DIR =
  process.env.FIELDBRIDGE_DATA_DIR || path.join(FIELDBRIDGE_DEFAULT_DIR, 'data');

export const FIELDBRIDGE_DEFAULT_MATRIX_FILE =
  process.env.FIELDBRIDGE_MATRIX_FILE || 'fieldbridge-matrix.json';

export const FIELDBRIDGE_DEFAULT_BENCHMARK_FILE =
  process.env.FIELDBRIDGE_BENCHMARK_FILE || 'benchmark.json';

/** Bridge options — every field is overridable per call so tests can point at
 *  a fixture directory without touching env. */
export interface FieldbridgeBridgeOpts {
  artifactDir?: string;
  dataDir?: string;
  matrixFile?: string;
  benchmarkFile?: string;
}

export interface FieldbridgeResult<T = unknown> {
  ok: boolean;
  data?: T;
  /** Present only when ok:false — a short, honest reason (e.g. 'unavailable'). */
  reason?: string;
  error?: string;
  latencyMs: number;
}

export interface FieldbridgeManifestData {
  engine: string;
  configHash: string;
  generatedAt: string;
  snapshot: string;
  works: number;
  fields: string[];
  years: number[];
}

export interface FieldbridgeHealthData {
  artifactPresent: boolean;
  artifactPath: string;
  artifactBytes: number;
  matrixUpdatedAtIso: string | null;
  benchmarkPresent: boolean;
  benchmarkPath: string | null;
  /** The benchmark gate exactly as the artifact declares it (PENDING until real). */
  benchmarkStatus: string | null;
  benchmarkPassed: boolean | null;
  benchmarkReason: string | null;
  note: string;
}

function ok<T>(data: T, latencyMs: number): FieldbridgeResult<T> {
  return { ok: true, data, latencyMs };
}

function fail<T = unknown>(reason: string, error: string, latencyMs: number): FieldbridgeResult<T> {
  return { ok: false, reason, error, latencyMs };
}

/** Resolve the artifact dir for a call: per-call override, else live env,
 *  else the import-time default. Resolving env at call time keeps the bridge
 *  responsive to runtime configuration (and lets tests stub the env). */
export function fieldbridgeArtifactDir(opts: FieldbridgeBridgeOpts = {}): string {
  return opts.artifactDir || process.env.FIELDBRIDGE_ARTIFACT_DIR || FIELDBRIDGE_DEFAULT_ARTIFACT_DIR;
}

function matrixPath(opts: FieldbridgeBridgeOpts = {}): string {
  return path.join(fieldbridgeArtifactDir(opts), opts.matrixFile || FIELDBRIDGE_DEFAULT_MATRIX_FILE);
}

function benchmarkPath(opts: FieldbridgeBridgeOpts = {}): string {
  return path.join(fieldbridgeArtifactDir(opts), opts.benchmarkFile || FIELDBRIDGE_DEFAULT_BENCHMARK_FILE);
}

function dataDirPath(opts: FieldbridgeBridgeOpts = {}): string {
  return opts.dataDir || process.env.FIELDBRIDGE_DATA_DIR || FIELDBRIDGE_DEFAULT_DATA_DIR;
}

async function readJson(
  file: string,
  label: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `${label} (${file}): ${msg}` };
  }
}

async function fileStat(file: string): Promise<{ exists: boolean; size: number; mtimeIso: string | null }> {
  try {
    const st = await fs.promises.stat(file);
    return { exists: true, size: st.size, mtimeIso: st.mtime.toISOString() };
  } catch {
    return { exists: false, size: 0, mtimeIso: null };
  }
}

/**
 * GET — FieldBridge run manifest (engine, config hash, provenance, field list).
 * Reads the matrix artifact's `manifest` block. Guarded: missing file or
 * invalid JSON → ok:false with reason 'unavailable'. NEVER fabricates a
 * manifest.
 */
export async function fieldbridgeManifest(
  opts: FieldbridgeBridgeOpts = {},
): Promise<FieldbridgeResult<FieldbridgeManifestData>> {
  const started = Date.now();
  const read = await readJson(matrixPath(opts), 'fieldbridge matrix artifact');
  if (!read.ok) return fail('unavailable', read.error ?? 'fieldbridge matrix artifact read failed', Date.now() - started);
  const artifact = read.data as Record<string, unknown>;
  const manifest = artifact.manifest as
    | { engine?: unknown; configHash?: unknown; generatedAt?: unknown; snapshot?: unknown; works?: unknown }
    | undefined;
  if (!manifest || typeof manifest !== 'object') {
    return fail('unavailable', 'fieldbridge matrix artifact has no manifest block', Date.now() - started);
  }
  const fields = Array.isArray(artifact.fields) ? (artifact.fields as unknown[]) : [];
  const years = Array.isArray(artifact.years) ? (artifact.years as unknown[]) : [];
  return ok(
    {
      engine: String(manifest.engine ?? 'unknown'),
      configHash: String(manifest.configHash ?? ''),
      generatedAt: String(manifest.generatedAt ?? ''),
      snapshot: String(manifest.snapshot ?? ''),
      works: Number(manifest.works ?? 0),
      fields: fields.map(String),
      years: years.map(Number),
    },
    Date.now() - started,
  );
}

/**
 * GET — the latest FieldBridge matrix/artifact JSON snapshot. Resolves from
 * `public/` first, then the `data/` snapshot dir (the durable SQLite store is
 * binary and skipped — this reads the JSON artifact only). Guarded: missing
 * file or invalid JSON → ok:false with reason 'unavailable'.
 */
export async function fieldbridgeMatrix(
  opts: FieldbridgeBridgeOpts = {},
): Promise<FieldbridgeResult<unknown>> {
  const started = Date.now();
  const candidates = [matrixPath(opts), path.join(dataDirPath(opts), opts.matrixFile || FIELDBRIDGE_DEFAULT_MATRIX_FILE)];
  for (const file of candidates) {
    const read = await readJson(file, 'fieldbridge matrix artifact');
    if (read.ok) return ok(read.data, Date.now() - started);
    const stat = await fileStat(file);
    if (stat.exists) {
      return fail('unavailable', `fieldbridge matrix artifact is not valid JSON: ${file}`, Date.now() - started);
    }
  }
  return fail(
    'unavailable',
    `fieldbridge matrix artifact not found (tried ${candidates.join('; ')})`,
    Date.now() - started,
  );
}

/**
 * Health probe — does the FieldBridge snapshot exist, and what does the
 * benchmark gate actually say? Reads `public/benchmark.json`'s
 * `primary.verdict` and reports it VERBATIM (PENDING per the README until the
 * rolling-origin benchmark earns a predictive claim). ok:true means the real
 * artifact state was read; it is NOT a green-light.
 */
export async function fieldbridgeHealth(
  opts: FieldbridgeBridgeOpts = {},
): Promise<FieldbridgeResult<FieldbridgeHealthData>> {
  const started = Date.now();
  const matrix = await fileStat(matrixPath(opts));
  const bench = await fileStat(benchmarkPath(opts));

  let benchmarkStatus: string | null = null;
  let benchmarkPassed: boolean | null = null;
  let benchmarkReason: string | null = null;
  let benchmarkReadError: string | null = null;
  if (bench.exists) {
    const read = await readJson(benchmarkPath(opts), 'fieldbridge benchmark artifact');
    if (read.ok) {
      const verdict = (read.data as Record<string, unknown>).primary as
        | { verdict?: { state?: unknown; passed?: unknown; reason?: unknown } }
        | undefined;
      const v = verdict?.verdict;
      if (v) {
        benchmarkStatus = String(v.state ?? 'unknown');
        benchmarkPassed = typeof v.passed === 'boolean' ? v.passed : null;
        benchmarkReason = typeof v.reason === 'string' ? v.reason : null;
      } else {
        benchmarkReadError = 'benchmark artifact has no primary.verdict block';
      }
    } else {
      benchmarkReadError = read.error ?? 'benchmark read failed';
    }
  }

  if (!matrix.exists) {
    return fail(
      'unavailable',
      `fieldbridge matrix artifact not found at ${matrixPath(opts)}`,
      Date.now() - started,
    );
  }

  return ok(
    {
      artifactPresent: true,
      artifactPath: matrixPath(opts),
      artifactBytes: matrix.size,
      matrixUpdatedAtIso: matrix.mtimeIso,
      benchmarkPresent: bench.exists,
      benchmarkPath: bench.exists ? benchmarkPath(opts) : null,
      benchmarkStatus,
      benchmarkPassed,
      benchmarkReason,
      note:
        benchmarkStatus === 'PENDING'
          ? 'FieldBridge benchmark gate reads PENDING — it maps cross-disciplinary structure; it does not yet claim prediction.'
          : benchmarkReadError
            ? `benchmark gate unreadable: ${benchmarkReadError}`
            : 'benchmark gate read from the artifact',
    },
    Date.now() - started,
  );
}