/**
 * Translation engine bridge — runs the REAL Overlay Science Python translation
 * engines (BB-Tech basketball→biotech, golf-surgery) as stateless subprocesses.
 *
 * Recourse spawns `python python/translation_runner.py`, sends one JSON command,
 * and reads the engine's real output. Nothing is reimplemented or fabricated:
 * a missing term returns target_term "" (bidirectional_possible:false) exactly
 * as the engine reports it, and a failed spawn reports ok:false honestly.
 *
 * Engines live in the sibling repos (bb_tech_core / golf_surgery_core); their
 * module paths are env-overridable for other layouts. This is what makes the
 * bbtech→oncology (and golf→surgery) translation layers *worked* inside
 * Recourse's research loop instead of sitting idle.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

export type TranslationEngineId = 'bbtech' | 'golf-surgery';

export interface TranslationEngineConfig {
  moduleFile: string;
  className: string;
  label: string;
}

const DEFAULT_ENGINES: Record<TranslationEngineId, TranslationEngineConfig> = {
  'bbtech': {
    moduleFile: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Shared\\bb_tech_core\\translation_engine.py',
    className: 'BBTechTranslationEngine',
    label: 'BB-Tech (basketball → biotech)',
  },
  'golf-surgery': {
    moduleFile: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Shared\\golf_surgery_core\\golf_surgery_translation_engine.py',
    className: 'GolfSurgeryTranslationEngine',
    label: 'Golf-surgery',
  },
};

export function engineConfig(id: TranslationEngineId): TranslationEngineConfig {
  const envKey = id === 'bbtech' ? 'BBTECH_ENGINE_FILE' : 'GOLF_ENGINE_FILE';
  const moduleFile = process.env[envKey] || DEFAULT_ENGINES[id].moduleFile;
  return { ...DEFAULT_ENGINES[id], moduleFile };
}

export function translationPythonBin(): string {
  return process.env.TRANSLATION_PYTHON || 'python';
}

export function translationRunnerPath(): string {
  return process.env.TRANSLATION_RUNNER || path.join(process.cwd(), 'python', 'translation_runner.py');
}

export interface TranslationCommand {
  module_file: string;
  class_name: string;
  op: 'health' | 'translate_term' | 'translate_metric' | 'similar';
  term?: string;
  direction?: 'forward' | 'reverse';
  metric?: string;
  value?: number;
  from_source?: boolean;
  max_results?: number;
}

export interface TranslationRunResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface RunOptions {
  timeoutMs?: number;
  python?: string;
  runner?: string;
}

/** Spawn the runner, send the command, parse the engine's real JSON output. */
export function runTranslation(cmd: TranslationCommand, opts: RunOptions = {}): Promise<TranslationRunResult> {
  const python = opts.python ?? translationPythonBin();
  const runner = opts.runner ?? translationRunnerPath();
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(python, [runner], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: `translation spawn failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch { /* already dead */ }
      resolve({ ok: false, error: `translation engine timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    let out = '';
    let errOut = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
    proc.stderr.on('data', (d: Buffer) => { errOut += d.toString('utf-8'); });
    proc.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `translation engine error: ${e.message}` });
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const line = out.trim().split('\n').pop() || '{}';
        const parsed = JSON.parse(line) as { ok?: boolean; error?: string };
        if (parsed.ok === false) {
          resolve({ ok: false, error: parsed.error || 'translation op failed' });
          return;
        }
        resolve({ ok: true, data: parsed as Record<string, unknown> });
      } catch {
        resolve({
          ok: false,
          error: `translation engine returned non-JSON (exit ${code ?? '?'}): ${(errOut || out).slice(0, 200)}`,
        });
      }
    });

    proc.stdin.write(JSON.stringify(cmd) + '\n');
    proc.stdin.end();
  });
}

function build(id: TranslationEngineId, op: TranslationCommand['op'], extra: Record<string, unknown> = {}): TranslationCommand {
  const cfg = engineConfig(id);
  return { module_file: cfg.moduleFile, class_name: cfg.className, op, ...extra };
}

export interface TranslationTermResult {
  source_term: string;
  target_term: string;
  direction: string;
  confidence: number;
  description: string;
  domain: string;
  bidirectional_possible: boolean;
}

/** Probe the engine: real get_statistics() + mapping counts. */
export async function translationHealth(
  id: TranslationEngineId,
  opts: RunOptions = {},
): Promise<{ ok: boolean; latencyMs?: number; error?: string; online?: boolean; stats?: Record<string, unknown> }> {
  const t0 = Date.now();
  const r = await runTranslation(build(id, 'health'), opts);
  if (!r.ok) return { ok: false, online: false, latencyMs: Date.now() - t0, error: r.error };
  return { ok: true, online: true, latencyMs: Date.now() - t0, stats: r.data };
}

/** Translate a term with the REAL engine (forward or reverse direction). */
export async function translateTerm(
  id: TranslationEngineId,
  term: string,
  direction: 'forward' | 'reverse' = 'forward',
  opts: RunOptions = {},
): Promise<{ ok: boolean; result?: TranslationTermResult; error?: string }> {
  if (!term || !term.trim()) return { ok: false, error: 'term is required' };
  const r = await runTranslation(build(id, 'translate_term', { term, direction }), opts);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, result: r.data as unknown as TranslationTermResult };
}

/** Translate a metric VALUE with the REAL engine conversion table. */
export async function translateMetric(
  id: TranslationEngineId,
  metric: string,
  value: number,
  fromSource = true,
  opts: RunOptions = {},
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  if (!metric || !metric.trim()) return { ok: false, error: 'metric is required' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: 'value must be a finite number' };
  const r = await runTranslation(build(id, 'translate_metric', { metric, value, from_source: fromSource }), opts);
  if (!r.ok) return { ok: false, error: r.error };
  // Runner emits { ok:true, result: {...} } for metrics; unwrap it.
  const payload = (r.data ?? {}) as Record<string, unknown>;
  const inner = payload.result as Record<string, unknown> | undefined;
  return { ok: true, result: inner ?? payload };
}

/** Statistics from the real engine. */
export async function translationStats(
  id: TranslationEngineId,
  opts: RunOptions = {},
): Promise<{ ok: boolean; stats?: Record<string, unknown>; error?: string }> {
  const r = await runTranslation(build(id, 'health'), opts);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, stats: r.data };
}