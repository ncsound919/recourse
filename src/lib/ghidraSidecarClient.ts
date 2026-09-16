/**
 * Recourse Ghidra sidecar client.
 *
 * The sidecar (`python/ghidra_service/main.py`) is STATELESS: it hands the raw
 * binary to the NSA Ghidra headless analyzer, runs real auto-analysis + the
 * bundled decompiler post-script, and returns real functions / imports /
 * strings / sections / decompiled C. Recourse never sends state, so nothing
 * drifts.
 *
 * Honesty contract: when Ghidra (or its JRE) is not installed the sidecar
 * reports `available:false` + the real reason, and analysis returns `ok:false`.
 * It NEVER fabricates a disassembly. Findings are deterministic heuristics over
 * the real Ghidra output, labelled as such.
 *
 * Env: GHIDRA_SIDECAR_URL (default http://127.0.0.1:8510).
 */

export const GHIDRA_SIDECAR_DEFAULT_URL = process.env.GHIDRA_SIDECAR_URL || 'http://127.0.0.1:8510';

export interface GhidraFunction {
  name: string;
  entry: string;
  size: number;
  isThunk: boolean;
  isExternal: boolean;
}

export interface GhidraSymbol {
  name: string;
  address: string;
  type: string;
  namespace: string;
  external: boolean;
}

export interface GhidraString {
  address: string;
  value: string;
  length: number;
}

export interface GhidraSection {
  name: string;
  start: string;
  size: number;
  read: boolean;
  write: boolean;
  execute: boolean;
  initialized: boolean;
}

export interface GhidraDecompiledFunction {
  name: string;
  entry: string;
  c: string;
}

export interface GhidraAnalysis {
  ok?: boolean;
  program: string;
  language: string;
  compiler: string;
  imageBase: string;
  md5: string;
  sha256: string;
  format: string;
  functions: GhidraFunction[];
  functionCount: number;
  symbols: GhidraSymbol[];
  symbolCount: number;
  strings: GhidraString[];
  stringCount: number;
  sections: GhidraSection[];
  decompiled: GhidraDecompiledFunction[];
  decompilerError?: string;
}

export interface GhidraFindingIndicator {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

export interface GhidraFindings {
  heuristic: true;
  note: string;
  riskScore: number;
  indicatorCount: number;
  indicators: GhidraFindingIndicator[];
  suspiciousImports: string[];
  counts: {
    functions: number;
    symbols: number;
    strings: number;
    sections: number;
    decompiled: number;
  };
}

export interface GhidraHealthResult {
  ok: boolean;
  available: boolean;
  service?: string;
  ghidra_home?: string;
  analyze_headless?: string;
  java?: string;
  java_version?: string;
  supported_formats?: string[];
  reason?: string;
  error?: string;
  latencyMs?: number;
}

export interface GhidraAnalyzeResult {
  ok: boolean;
  available?: boolean;
  elapsedMs?: number;
  ghidra_home?: string;
  java_version?: string;
  analysis?: GhidraAnalysis;
  findings?: GhidraFindings;
  error?: string;
  returncode?: number;
  log_tail?: string[];
  latencyMs?: number;
}

export interface GhidraEntropyResult {
  ok: boolean;
  bytes?: number;
  entropy_bits_per_byte?: number;
  max_entropy?: number;
  packing_hint?: boolean;
  note?: string;
  error?: string;
  latencyMs?: number;
}

export interface GhidraSidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function getGhidra<T>(path: string, base: string, timeoutMs: number): Promise<GhidraSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `ghidra sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `ghidra sidecar timed out after ${timeoutMs}ms` : err?.message || 'ghidra sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postGhidra<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<GhidraSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, data: null, latencyMs, error: `ghidra sidecar HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `ghidra sidecar timed out after ${timeoutMs}ms` : err?.message || 'ghidra sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function ghidraHealth(base = GHIDRA_SIDECAR_DEFAULT_URL, timeoutMs = 3000): Promise<GhidraHealthResult> {
  const call = await getGhidra<GhidraHealthResult>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, available: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function ghidraFormats(base = GHIDRA_SIDECAR_DEFAULT_URL, timeoutMs = 3000): Promise<{ ok: boolean; formats?: string[]; error?: string; latencyMs: number }> {
  const call = await getGhidra<{ ok: boolean; formats: string[] }>('/ghidra/formats', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function ghidraAnalyze(
  dataBase64: string,
  opts: { filename?: string; analysisTimeoutSec?: number; timeoutMs?: number; base?: string } = {},
): Promise<GhidraAnalyzeResult> {
  const { filename = 'sample.bin', analysisTimeoutSec, base = GHIDRA_SIDECAR_DEFAULT_URL } = opts;
  // The client must wait at least as long as the analyzer allows, plus launch slack.
  const timeoutMs = opts.timeoutMs ?? ((analysisTimeoutSec ?? 300) + 180) * 1000;
  const body: Record<string, unknown> = { data_base64: dataBase64, filename };
  if (analysisTimeoutSec) body.analysis_timeout_sec = analysisTimeoutSec;
  const call = await postGhidra<GhidraAnalyzeResult>('/ghidra/analyze', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function ghidraEntropy(
  dataBase64: string,
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<GhidraEntropyResult> {
  const { timeoutMs = 15000, base = GHIDRA_SIDECAR_DEFAULT_URL } = opts;
  const call = await postGhidra<GhidraEntropyResult>('/ghidra/entropy', { data_base64: dataBase64 }, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}
