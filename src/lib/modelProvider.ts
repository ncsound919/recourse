/**
 * Model Provider — an OpenAI-compatible chat-completions client.
 *
 * Targets any local/remote endpoint that speaks the OpenAI protocol:
 * Ollama (`http://localhost:11434/v1`), llama.cpp server, LM Studio,
 * vLLM, etc. Configured purely through environment variables.
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
  /** True when the endpoint is an Ollama instance (native /api/chat API). */
  nativeOllama: boolean;
  numCtx: number;
  thinking: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompleteOptions {
  temperature?: number;
  /** Ask the model to return strict JSON (via prompt instruction; not all
   *  local servers support response_format enforcement). */
  json?: boolean;
}

export interface ChatCompleteResult {
  ok: boolean;
  content: string | null;
  status: 'online' | 'offline' | 'error';
  model: string;
  error?: string;
  latencyMs: number;
}

/** Strip markdown fences and pull the first JSON object/array out of a model
 *  response. Local reasoning models often add a "thinking" preamble around the
 *  actual JSON, so we locate the outermost `{...}`/`[...]` block rather than
 *  requiring a clean payload. */
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

export type ProviderProfileId = 'local' | 'api';

/* Active provider profile — 'local' (Ollama) or 'api' (remote LLM API). The
 * default is 'api' so un-configured installs behave exactly as before. The
 * switch is a runtime branch (not env mutation): every readConfig() call honors
 * it, so generative features (dream/swarm/chat) pick up the change immediately.
 * The server persists the choice and reapplies it at boot. */
let activeProvider: ProviderProfileId = 'api';

function profileFor(id: ProviderProfileId): { baseUrl: string; model: string; apiKey: string; numCtx: number; thinking: boolean } {
  if (id === 'local') {
    return {
      baseUrl: (process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''),
      model: process.env.LOCAL_MODEL_NAME || 'qwen3.8-4b-distill:q4_k_m',
      apiKey: process.env.LOCAL_MODEL_API_KEY || 'ollama',
      numCtx: Number(process.env.LOCAL_MODEL_NUM_CTX || process.env.MODEL_NUM_CTX || 4096),
      thinking: (process.env.LOCAL_MODEL_THINKING ?? process.env.MODEL_THINKING) === '1',
    };
  }
  return {
    baseUrl: (process.env.API_MODEL_BASE_URL || process.env.MODEL_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''),
    model: process.env.API_MODEL_NAME || process.env.MODEL_NAME || 'qwen3.8-4b-distill:q4_k_m',
    apiKey: process.env.API_MODEL_API_KEY || process.env.MODEL_API_KEY || 'ollama',
    numCtx: Number(process.env.MODEL_NUM_CTX || 4096),
    thinking: process.env.MODEL_THINKING === '1',
  };
}

/** Set the active provider profile ('local' | 'api'). Resets the online cache so
 *  the next probe hits the newly selected endpoint. Returns the applied id. */
export function setActiveProviderProfile(id: ProviderProfileId): ProviderProfileId {
  activeProvider = id === 'local' ? 'local' : 'api';
  cachedOnline = null;
  cachedAt = 0;
  cachedError = undefined;
  return activeProvider;
}

export function activeProviderProfile(): ProviderProfileId {
  return activeProvider;
}

/** Resolved descriptors for the UI (which endpoints each profile points at). */
export function providerProfiles(): Array<{ id: ProviderProfileId; label: string; baseUrl: string; model: string }> {
  const l = profileFor('local');
  const a = profileFor('api');
  return [
    { id: 'local', label: 'Local (Ollama)', baseUrl: l.baseUrl, model: l.model },
    { id: 'api', label: 'LLM API', baseUrl: a.baseUrl, model: a.model },
  ];
}

function readConfig(): ProviderConfig {
  const p = profileFor(activeProvider);
  const driver = process.env.MODEL_DRIVER;
  const isOllamaHost =
    activeProvider === 'local' || driver === 'ollama' || /(localhost|127\.0\.0\.1|\[::1\]):11434/i.test(p.baseUrl);
  return {
    kind: 'openai_compatible',
    baseUrl: p.baseUrl,
    model: p.model,
    apiKey: p.apiKey,
    requestTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 60_000),
    nativeOllama: isOllamaHost,
    numCtx: p.numCtx,
    thinking: p.thinking,
  };
}

/* Module-level online cache so the UI never hammers the endpoint. */
let cachedOnline: boolean | null = null;
let cachedAt = 0;
let cachedError: string | undefined;
const STATUS_TTL_MS = 5000;

async function rawFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Probe GET {base}/models. Cached for STATUS_TTL_MS. */
export async function checkOnline(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && cachedOnline !== null && now - cachedAt < STATUS_TTL_MS) {
    return cachedOnline;
  }
  const cfg = readConfig();
  try {
    const res = await rawFetch(`${cfg.baseUrl}/models`, { method: 'GET' }, 2000);
    const ok = res.ok;
    cachedOnline = ok;
    cachedAt = now;
    cachedError = ok ? undefined : `GET /models -> HTTP ${res.status}`;
    return ok;
  } catch (err: any) {
    cachedOnline = false;
    cachedAt = now;
    cachedError = err?.message || 'unreachable';
    return false;
  }
}

export function providerStatus(): ProviderStatus {
  const cfg = readConfig();
  return {
    kind: cfg.kind,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    online: cachedOnline === true,
    lastError: cachedError,
    checkedAt: cachedOnline === null ? undefined : cachedAt,
  };
}

/**
 * One chat completion against the OpenAI-compatible endpoint.
 * Returns a result object — it never throws for offline/HTTP conditions.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
): Promise<ChatCompleteResult> {
  const cfg = readConfig();
  const started = Date.now();

  const online = await checkOnline();
  if (!online) {
    return {
      ok: false,
      content: null,
      status: 'offline',
      model: cfg.model,
      error: cachedError || 'model endpoint unreachable',
      latencyMs: Date.now() - started,
    };
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: false,
  };
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;

  // Ollama native API: supports options (num_ctx, think) that the /v1 shim
  // may ignore. Thinking models default to NO thinking for speed; enable with
  // MODEL_THINKING=1.
  let endpoint = `${cfg.baseUrl}/chat/completions`;
  if (cfg.nativeOllama) {
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
      cachedError = `POST ${endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`;
      return {
        ok: false,
        content: null,
        status: 'error',
        model: cfg.model,
        error: cachedError,
        latencyMs: Date.now() - started,
      };
    }

    const data: any = await res.json();
    const content: string | null = cfg.nativeOllama
      ? (data?.message?.content ?? null)
      : (data?.choices?.[0]?.message?.content ?? null);
    if (typeof content !== 'string' || content.trim().length === 0) {
      cachedError = 'model returned empty content';
      return {
        ok: false,
        content: null,
        status: 'error',
        model: cfg.model,
        error: cachedError,
        latencyMs: Date.now() - started,
      };
    }

    return {
      ok: true,
      content,
      status: 'online',
      model: cfg.model,
      error: undefined,
      latencyMs: Date.now() - started,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    // A timeout/abort is NOT an offline condition - the endpoint may simply be
    // slow. Only network/HTTP failures flip the online cache to false.
    if (!aborted) {
      cachedOnline = false;
      cachedError = err?.message || 'request failed';
    }
    return {
      ok: false,
      content: null,
      status: aborted ? 'error' : 'offline',
      model: cfg.model,
      error: (aborted ? 'request timed out after ' + cfg.requestTimeoutMs + 'ms' : cachedError),
      latencyMs: Date.now() - started,
    };
  }
}
