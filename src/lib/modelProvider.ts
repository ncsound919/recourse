/**
 * Model Provider — single-provider OpenAI-compatible chat-completions client.
 *
 * Phoenix Grove (https://api.pgsgrove.com/v1, model deepseek-v4-flash-0731)
 * is the remote generation target. The 'local' profile points at a local
 * OpenAI-compatible endpoint (e.g. colibri serving OLMoE at
 * http://127.0.0.1:8000/v1) and is used, local-first with API fallback, for
 * non-agentic generation — see pickGenerationProfile. With no
 * LOCAL_MODEL_BASE_URL set it reports offline honestly.
 *
 * Honesty contract: when the endpoint is unreachable this module reports
 * `online: false` with the underlying error. It NEVER fabricates a response,
 * never pretends a different model answered, and never falls back to canned
 * text. Callers must surface the offline state explicitly.
 */

export interface ProviderConfig {
  kind: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  numCtx: number;
  thinking: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompleteOptions {
  temperature?: number;
  json?: boolean;
}

export interface ChatCompleteResult {
  ok: boolean;
  content: string | null;
  status: 'online' | 'offline' | 'error';
  model: string;
  error?: string;
  latencyMs: number;
  /** Real token counts when the provider reported them; estimated otherwise. */
  usage?: ModelUsageTokens;
}

export interface ModelUsageTokens {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
}

/** Emitted after every successful completion so the host can meter + debit it. */
export interface ModelUsage extends ModelUsageTokens {
  profile: ProviderProfileId;
  model: string;
  latencyMs: number;
  at: number;
}

let usageSink: ((usage: ModelUsage) => void) | null = null;

/** Install a process-wide model usage sink (null clears it). The sink must
 *  never throw; a metering failure must not break generation. */
export function setModelUsageSink(sink: ((usage: ModelUsage) => void) | null): void {
  usageSink = sink;
}

function emitUsage(usage: ModelUsage): void {
  try {
    usageSink?.(usage);
  } catch {
    /* a metering sink must never break a model call */
  }
}

/** ~4 chars/token estimate, used only when a provider omits usage counts. */
function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(0, Math.round(text.length / 4));
}

/** Strip markdown fences and pull the first JSON object/array out of a model
 *  response. */
export function extractJsonBlock(content: string | null | undefined): string | null {
  if (!content) return null;
  let text = content.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const arrStart = text.indexOf('[');
  let openIdx = -1;
  let closer: string;
  if (arrStart !== -1 && (start === -1 || arrStart < start)) {
    openIdx = arrStart;
    closer = ']';
  } else if (start !== -1) {
    openIdx = start;
    closer = '}';
  } else {
    return null;
  }
  const end = text.lastIndexOf(closer);
  if (end <= openIdx) return null;
  const block = text.slice(openIdx, end + 1);
  try {
    JSON.parse(block);
    return block;
  } catch {
    return null;
  }
}

export interface ProviderStatus {
  kind: string;
  baseUrl: string;
  model: string;
  online: boolean;
  lastError?: string;
  checkedAt?: number;
}

/** Single active profile id — always 'api'. The 'local' option remains
 *  exposed so the UI does not crash, but it reports offline when no
 *  LOCAL_MODEL_BASE_URL is configured. */
export type ProviderProfileId = 'local' | 'api';

let activeProvider: ProviderProfileId = 'api';

const onlineCache: Record<ProviderProfileId, { online: boolean | null; at: number; error: string | undefined }> = {
  local: { online: null, at: 0, error: undefined },
  api: { online: null, at: 0, error: undefined },
};
const STATUS_TTL_MS = 5000;

function profileFor(id: ProviderProfileId): { baseUrl: string; model: string; apiKey: string; numCtx: number; thinking: boolean } {
  if (id === 'local') {
    const localUrl = (process.env.LOCAL_MODEL_BASE_URL || '').replace(/\/+$/, '');
    if (!localUrl) {
      return { baseUrl: '', model: '', apiKey: '', numCtx: 0, thinking: false };
    }
    return {
      baseUrl: localUrl,
      model: process.env.LOCAL_MODEL_NAME || 'unconfigured',
      apiKey: process.env.LOCAL_MODEL_API_KEY || '',
      numCtx: Number(process.env.LOCAL_MODEL_NUM_CTX || process.env.MODEL_NUM_CTX || 4096),
      thinking: (process.env.LOCAL_MODEL_THINKING ?? process.env.MODEL_THINKING) === '1',
    };
  }
  return {
    baseUrl: (process.env.API_MODEL_BASE_URL || process.env.MODEL_BASE_URL || 'https://api.pgsgrove.com/v1').replace(/\/+$/, ''),
    model: process.env.API_MODEL_NAME || process.env.MODEL_NAME || 'deepseek-v4-flash-0731',
    apiKey: process.env.API_MODEL_API_KEY || process.env.MODEL_API_KEY || '',
    numCtx: Number(process.env.MODEL_NUM_CTX || 4096),
    thinking: process.env.MODEL_THINKING === '1',
  };
}

export function setActiveProviderProfile(id: ProviderProfileId): ProviderProfileId {
  activeProvider = id === 'local' ? 'local' : 'api';
  onlineCache[activeProvider] = { online: null, at: 0, error: undefined };
  return activeProvider;
}

export function activeProviderProfile(): ProviderProfileId {
  return activeProvider;
}

export type ChatRoute = 'local' | 'api' | 'auto';

/** Preference for NON-AGENTIC GENERATION (dream, mutation, forge, chat,
 *  reports, hypotheses). Agentic codegen (tool loop, project loop, compiler)
 *  does NOT call chatComplete — it goes through the harness LLM / LiteLLM — so
 *  this policy never changes agentic routing.
 *
 *  'auto' (default) prefers the local colibri model when one is configured,
 *  and falls back to the API profile when local is offline or the prompt is too
 *  large for a CPU-streamed model. Force with RECOURSE_GENERATION_PROFILE. */
export type GenerationProfilePreference = 'auto' | 'local' | 'api';

function generationPreference(): GenerationProfilePreference {
  const v = (process.env.RECOURSE_GENERATION_PROFILE || 'auto').trim().toLowerCase();
  return v === 'local' || v === 'api' ? v : 'auto';
}

/** Is a local endpoint configured? Empty base URL => local is unavailable. */
export function localModelConfigured(): boolean {
  return Boolean((process.env.LOCAL_MODEL_BASE_URL || '').trim());
}

/** Very large prompts on a disk-streamed CPU model can cost minutes of prefill,
 *  so 'auto' sends those to the API profile. Tune with LOCAL_AUTO_MAX_CHARS. */
function localAutoMaxChars(): number {
  return Number(process.env.LOCAL_AUTO_MAX_CHARS || 12_000);
}

/** Resolve the profile for non-agentic generation. Never returns a profile
 *  whose endpoint is unconfigured. */
export function pickGenerationProfile(messages: ChatMessage[]): ProviderProfileId {
  const pref = generationPreference();
  if (pref === 'api') return 'api';
  if (pref === 'local') return localModelConfigured() ? 'local' : 'api';
  if (!localModelConfigured()) return 'api';
  const chars = messages.reduce((n, m) => n + (m.content ? m.content.length : 0), 0);
  if (chars > localAutoMaxChars()) return 'api';
  // Always try local; chatComplete falls back to api if it turns out to be
  // offline. (Do NOT gate on a cached offline probe here — that would pin
  // generation to api forever after a single transient probe failure.)
  return 'local';
}

/** Route to a specific profile. 'local'/'api' force it (honest: 'local' falls
 *  back to api when no local endpoint is configured); 'auto' uses the
 *  generation policy above. */
export function pickProfileForRoute(
  route: ChatRoute,
  messages: ChatMessage[],
  _explicit: ProviderProfileId = activeProvider,
): ProviderProfileId {
  if (route === 'local') return localModelConfigured() ? 'local' : 'api';
  if (route === 'api') return 'api';
  return pickGenerationProfile(messages);
}

export function providerProfiles(): Array<{ id: ProviderProfileId; label: string; baseUrl: string; model: string }> {
  const a = profileFor('api');
  const l = profileFor('local');
  return [
    { id: 'api', label: 'Phoenix Grove', baseUrl: a.baseUrl, model: a.model },
    { id: 'local', label: localModelConfigured() ? 'Local (configured)' : 'Local (not configured)', baseUrl: l.baseUrl || 'http://127.0.0.1:8000/v1', model: l.model || 'no local model' },
  ];
}

function readConfig(profileId: ProviderProfileId = activeProvider): ProviderConfig {
  const p = profileFor(profileId);
  return {
    kind: 'openai_compatible',
    baseUrl: p.baseUrl,
    model: p.model,
    apiKey: p.apiKey,
    requestTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 60_000),
    numCtx: p.numCtx,
    thinking: p.thinking,
  };
}

async function chatCompleteFor(
  profileId: ProviderProfileId,
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
): Promise<ChatCompleteResult> {
  const cfg = readConfig(profileId);
  const started = Date.now();

  const online = await checkOnline(false, profileId);
  if (!online) {
    const slot = onlineCache[profileId];
    return {
      ok: false,
      content: null,
      status: 'offline',
      model: cfg.model,
      error: slot.error || 'model endpoint unreachable',
      latencyMs: Date.now() - started,
    };
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: false,
  };
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;

  let endpoint = `${cfg.baseUrl}/chat/completions`;
  const isNativeOllama = cfg.baseUrl.includes(':11434') || (cfg.baseUrl.includes('localhost') && !cfg.baseUrl.includes('v1'));
  if (isNativeOllama && cfg.baseUrl) {
    const nativeBase = cfg.baseUrl.replace(/\/v1$/, '');
    endpoint = `${nativeBase}/api/chat`;
    body.options = {
      num_ctx: cfg.numCtx,
      think: cfg.thinking,
    };
  } else if (opts.json) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await rawFetch(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
      },
      cfg.requestTimeoutMs,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const errMsg = `POST ${endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`;
      onlineCache[profileId].error = errMsg;
      return {
        ok: false,
        content: null,
        status: 'error',
        model: cfg.model,
        error: errMsg,
        latencyMs: Date.now() - started,
      };
    }

    const data: any = await res.json();
    const isNativeOllama = cfg.baseUrl.includes(':11434') || (cfg.baseUrl.includes('localhost') && !cfg.baseUrl.includes('v1'));
    const content: string | null = isNativeOllama && cfg.baseUrl
      ? (data?.message?.content ?? null)
      : (data?.choices?.[0]?.message?.content ?? null);
    if (typeof content !== 'string' || content.trim().length === 0) {
      onlineCache[profileId].error = 'model returned empty content';
      return {
        ok: false,
        content: null,
        status: 'error',
        model: cfg.model,
        error: 'model returned empty content',
        latencyMs: Date.now() - started,
      };
    }

    // Token accounting: prefer the provider's real counts (OpenAI `usage`, or
    // Ollama's `prompt_eval_count`/`eval_count`), fall back to a length estimate
    // clearly flagged as such.
    let promptTokens = 0;
    let completionTokens = 0;
    let estimated = false;
    if (isNativeOllama && cfg.baseUrl) {
      promptTokens = Number(data?.prompt_eval_count) || 0;
      completionTokens = Number(data?.eval_count) || 0;
    } else {
      promptTokens = Number(data?.usage?.prompt_tokens) || 0;
      completionTokens = Number(data?.usage?.completion_tokens) || 0;
    }
    if (promptTokens === 0 && completionTokens === 0) {
      promptTokens = messages.reduce((n, m) => n + estimateTokens(m.content), 0);
      completionTokens = estimateTokens(content);
      estimated = true;
    }
    const usage: ModelUsageTokens = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimated,
    };

    const latencyMs = Date.now() - started;
    emitUsage({ ...usage, profile: profileId, model: cfg.model, latencyMs, at: Date.now() });

    return {
      ok: true,
      content,
      status: 'online',
      model: cfg.model,
      error: undefined,
      latencyMs,
      usage,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    if (!aborted) {
      onlineCache[profileId].online = false;
      onlineCache[profileId].error = err?.message || 'request failed';
    }
    return {
      ok: false,
      content: null,
      status: aborted ? 'error' : 'offline',
      model: cfg.model,
      error: (aborted ? `request timed out after ${cfg.requestTimeoutMs}ms` : onlineCache[profileId].error),
      latencyMs: Date.now() - started,
    };
  }
}

async function rawFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Probe GET {base}/models. Cached for STATUS_TTL_MS.
 *  `profileId` defaults to the active profile; pass 'local' or 'api' to probe
 *  a specific endpoint independently. */
export async function checkOnline(
  force = false,
  profileId: ProviderProfileId = activeProvider,
): Promise<boolean> {
  const slot = onlineCache[profileId];
  const now = Date.now();
  if (!force && slot.online !== null && now - slot.at < STATUS_TTL_MS) {
    return slot.online;
  }
  const p = profileFor(profileId);
  const baseUrl = p.baseUrl;
  if (!baseUrl) {
    slot.online = false;
    slot.at = now;
    slot.error = 'local model not configured';
    return false;
  }
  try {
    const res = await rawFetch(`${baseUrl}/models`, { method: 'GET' }, 2000);
    const ok = res.ok;
    slot.online = ok;
    slot.at = now;
    slot.error = ok ? undefined : `GET /models -> HTTP ${res.status}`;
    return ok;
  } catch (err: any) {
    slot.online = false;
    slot.at = now;
    slot.error = err?.message || 'unreachable';
    return false;
  }
}

export function providerStatus(profileId?: ProviderProfileId): ProviderStatus {
  const id = profileId ?? activeProvider;
  const p = profileFor(id);
  const slot = onlineCache[id];
  return {
    kind: 'openai_compatible',
    baseUrl: p.baseUrl,
    model: p.model,
    online: slot.online === true,
    lastError: slot.error,
    checkedAt: slot.online === null ? undefined : slot.at,
  };
}

/** Status for both profiles — used by UI to show local+api independently. */
export function providerStatuses(): Record<ProviderProfileId, ProviderStatus> {
  return { local: providerStatus('local'), api: providerStatus('api') };
}

/** Chat completion for a NON-AGENTIC generation call. Routes by the generation
 *  policy (see pickGenerationProfile): local-first when a local model is
 *  configured, with an automatic, honest fallback to the API profile when local
 *  is offline. The result reports which profile actually answered via `model`.
 *  Callers that need explicit targeting use chatCompleteProfile/chatCompleteRoute. */
export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
): Promise<ChatCompleteResult> {
  const profile = pickGenerationProfile(messages);
  const result = await chatCompleteFor(profile, messages, opts);
  if (profile === 'local' && result.status !== 'online') {
    // Local failed (offline or error) — fall back to the API profile for this
    // generation. The returned result reports the profile that actually answered.
    return chatCompleteFor('api', messages, opts);
  }
  return result;
}

/** Chat completion against a specific profile ('local' or 'api'), regardless of
 *  what the active profile is. Use this when the caller knows which endpoint
 *  should answer. */
export async function chatCompleteProfile(
  profileId: ProviderProfileId,
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
): Promise<ChatCompleteResult> {
  return chatCompleteFor(profileId === 'local' ? 'local' : 'api', messages, opts);
}

/** Chat completion routed by policy. `route`:
 *   - 'local' forces the qwen3 0.6B endpoint
 *   - 'api'   forces the Phoenix Grove / remote API endpoint
 *   - 'auto'  picks local for small messages (<= LOCAL_AUTO_MAX_CHARS total),
 *             api otherwise. Conservative default for callers that don't care.
 *  The result reports the actual profile that answered in `model` / `error`. */
export async function chatCompleteRoute(
  route: ChatRoute,
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
): Promise<ChatCompleteResult> {
  const profile = pickProfileForRoute(route, messages);
  return chatCompleteFor(profile, messages, opts);
}
