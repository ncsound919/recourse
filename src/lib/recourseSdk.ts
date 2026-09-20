/**
 * Typed Recourse SDK — a small, dependency-free client for the documented API
 * surface (`src/lib/openapi.ts`). Runs in Node or the browser: the transport is
 * injectable, so it is testable without a live server.
 *
 * Every call returns `{ ok, status, data, error }`; it never throws on an HTTP
 * error and never fabricates a body. Mutating calls attach the secret when one
 * is configured (the server fails closed when it is required but missing).
 */

export interface RecourseSdkOptions {
  baseUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SdkCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

type Query = Record<string, string | number | boolean | undefined>;

export interface RecourseSdk {
  baseUrl: string;
  status(): Promise<SdkCall<any>>;
  registry(): Promise<SdkCall<any>>;
  selfhosted(): Promise<SdkCall<any>>;
  sandboxStatus(): Promise<SdkCall<any>>;
  executeSelfhosted(name: string, method: string, args?: unknown[], mode?: 'auto' | 'sandbox' | 'direct'): Promise<SdkCall<any>>;
  memoryTiered(): Promise<SdkCall<any>>;
  consolidateMemory(minClusterSize?: number): Promise<SdkCall<any>>;
  promoteSkills(opts?: { minDistinctProblemWins?: number; maxPerRun?: number }): Promise<SdkCall<any>>;
  recall(q: string, opts?: { kind?: string; topK?: number }): Promise<SdkCall<any>>;
  benchmarkLeaderboard(): Promise<SdkCall<any>>;
  benchmarkLedger(): Promise<SdkCall<any>>;
  replay(stream: 'trend' | 'goals' | 'selfhosted'): Promise<SdkCall<any>>;
  wallet(): Promise<SdkCall<any>>;
  setWalletBudget(token: string, capCents: number, description?: string): Promise<SdkCall<any>>;
  telemetry(): Promise<SdkCall<any>>;
  audioStatus(): Promise<SdkCall<any>>;
  transcribe(body: { url?: string; dataBase64?: string; filename?: string; language?: string; model?: string }): Promise<SdkCall<any>>;
  voiceStatus(): Promise<SdkCall<any>>;
  voiceProfiles(): Promise<SdkCall<any>>;
  saveVoiceProfile(body: {
    name: string;
    referenceBase64: string;
    filename?: string;
    language?: string;
    referenceText?: string;
    durationSec?: number;
    sampleRate?: number;
  }): Promise<SdkCall<any>>;
  deleteVoiceProfile(id: string): Promise<SdkCall<any>>;
  speakInVoice(body: {
    text: string;
    profileId: string;
    engine?: 'xtts' | 'f5tts';
    language?: string;
    speed?: number;
  }): Promise<SdkCall<any>>;
  fleetVoice(): Promise<SdkCall<any>>;
  exportableSkills(): Promise<SdkCall<any>>;
  exportSkill(toolName: string, outRoot?: string): Promise<SdkCall<any>>;
  a2a(payload: unknown): Promise<SdkCall<any>>;
  agentCard(): Promise<SdkCall<any>>;
}

function buildQuery(q?: Query): string {
  if (!q) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createRecourseSdk(opts: RecourseSdkOptions = {}): RecourseSdk {
  const baseUrl = (opts.baseUrl ?? process.env.RECOURSE_API_URL ?? 'http://127.0.0.1:3050').replace(/\/$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15000;

  async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, mutating = false): Promise<SdkCall<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (mutating && opts.secret) headers['x-api-secret'] = opts.secret;
    try {
      const res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let data: T | null = null;
      try { data = (await res.json()) as T; } catch { data = null; }
      return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : (data as any)?.error ?? `HTTP ${res.status}` };
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, data: null, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    baseUrl,
    status: () => request('GET', '/api/recourse/status'),
    registry: () => request('GET', '/api/recourse/registry'),
    selfhosted: () => request('GET', '/api/recourse/selfhosted'),
    sandboxStatus: () => request('GET', '/api/recourse/selfhosted/sandbox'),
    executeSelfhosted: (name, method, args = [], mode) =>
      request('POST', `/api/recourse/selfhosted/${encodeURIComponent(name)}/execute`, { method, args, mode }, true),
    memoryTiered: () => request('GET', '/api/recourse/memory/tiered'),
    consolidateMemory: (minClusterSize) => request('POST', '/api/recourse/memory/consolidate', { minClusterSize }, true),
    promoteSkills: (o) => request('POST', '/api/recourse/memory/promote-skills', o ?? {}, true),
    recall: (q, o = {}) => request('GET', `/api/recourse/memory/recall${buildQuery({ q, kind: o.kind, topK: o.topK })}`),
    benchmarkLeaderboard: () => request('GET', '/api/recourse/benchmark/leaderboard'),
    benchmarkLedger: () => request('GET', '/api/recourse/benchmark/ledger'),
    replay: (stream) => request('POST', '/api/recourse/replay', { stream }),
    wallet: () => request('GET', '/api/recourse/wallet'),
    setWalletBudget: (token, capCents, description) => request('POST', '/api/recourse/wallet/budget', { token, capCents, description }, true),
    telemetry: () => request('GET', '/api/recourse/telemetry'),
    audioStatus: () => request('GET', '/api/recourse/audio/status'),
    transcribe: (body) => request('POST', '/api/recourse/audio/transcribe', body),
    voiceStatus: () => request('GET', '/api/recourse/voice/status'),
    voiceProfiles: () => request('GET', '/api/recourse/voice/profiles'),
    saveVoiceProfile: (body) => request('POST', '/api/recourse/voice/profiles', body, true),
    deleteVoiceProfile: (id) => request('DELETE', `/api/recourse/voice/profiles/${encodeURIComponent(id)}`, undefined, true),
    speakInVoice: (body) => request('POST', '/api/recourse/voice/speak', body, true),
    fleetVoice: () => request('GET', '/api/recourse/fleet/voice'),
    exportableSkills: () => request('GET', '/api/recourse/skills/exportable'),
    exportSkill: (toolName, outRoot) => request('POST', '/api/recourse/skills/export', { toolName, outRoot }, true),
    a2a: (payload) => request('POST', '/api/a2a', payload),
    agentCard: () => request('GET', '/.well-known/agent.json'),
  };
}
