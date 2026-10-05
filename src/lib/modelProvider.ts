/**
 * Model Provider — single-provider OpenAI-compatible chat-completions client.
 *
 * Phoenix Grove (https://api.pgsgrove.com/v1, model deepseek-v4-flash-0731)
 * is the remote generation target. The 'local' profile points at a local
 * OpenAI-compatible endpoint (the llama.cpp `llama-server` serving the MiniCPM5
 * model at http://127.0.0.1:11434/v1) and is used, local-first with API
 * fallback, for non-agentic generation — see pickGenerationProfile. With no
 * LOCAL_MODEL_BASE_URL set it reports offline honestly.
 *
 * Honesty contract: when the endpoint is unreachable this module reports
 * `online: false` with the underlying error. It NEVER fabricates a response,
 * never pretends a different model answered, and never falls back to canned
 * text. Callers must surface the offline state explicitly.
 */

import { modelSelection, rewardForOutcome } from './modelSelection.js';
import { CompletionCache, type CacheMessage } from './completionCache.js';
import { longFetch } from './httpClient.js';

export interface ProviderConfig {
  kind: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  numCtx: number;
  thinking: boolean;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A model-requested function call (OpenAI-compatible shape). */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** An OpenAI-compatible function tool the model may call. */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant turns that invoke tools carry the requested calls here. */
  tool_calls?: ToolCall[];
  /** Set on `role: 'tool'` messages; matches the assistant's tool_call id. */
  tool_call_id?: string;
  /** Optional function name on a tool message. */
  name?: string;
}

export interface ChatCompleteOptions {
  temperature?: number;
  json?: boolean;
  /** Function tools the model may call. When present, `json` is ignored. */
  tools?: OpenAITool[];
  toolChoice?: ToolChoice;
  /** Set false to bypass the completion cache for this call (default: cached). */
  cache?: boolean;
  /** Distinguishes caches that share a prompt shape (e.g. 'forge' vs 'dream'). */
  cacheNamespace?: string;
  /**
   * Explicit output cap for this call. Omit to use MODEL_MAX_TOKENS (default
   * 4096). Never omit the cap entirely — see the note where the body is built.
   */
  maxTokens?: number;
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
  /** Tool calls the model requested on this turn (empty/absent when none). */
  toolCalls?: ToolCall[];
  /** Provider finish_reason, e.g. 'stop' | 'tool_calls' | 'length'. */
  finishReason?: string;
  /** Separate reasoning text some servers emit (e.g. llama-server). */
  reasoning?: string;
  /** True when this result was served from the completion cache (no model call,
   *  no token spend, latency ~0). */
  cached?: boolean;
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

/* ------------------------- completion cache (P0.3) ------------------------ */
// Exact + semantic cache for non-agentic, non-tool completions. A hit skips the
// network entirely (no tokens, ~0 latency) and returns the exact text a model
// previously produced. Kill-switch: MODEL_CACHE_DISABLED=1. Per-call bypass:
// pass `{ cache: false }`. Tool-calling turns are never cached.
let completionCacheSingleton: CompletionCache | null = null;

function completionCache(): CompletionCache {
  if (!completionCacheSingleton) {
    completionCacheSingleton = new CompletionCache({
      max: Math.max(1, Number(process.env.MODEL_CACHE_MAX) || 500),
      similarity: Number(process.env.MODEL_CACHE_SIM) || 0.97,
      ttlMs: Math.max(0, Number(process.env.MODEL_CACHE_TTL_MS) || 0),
    });
  }
  return completionCacheSingleton;
}

/** Cache observability for status/UI. */
export function completionCacheSnapshot(): {
  size: number; max: number; hits: number; misses: number; stores: number;
  evictions: number; expired: number; hitRate: number; disabled: boolean;
} {
  return { ...completionCache().stats(), disabled: process.env.MODEL_CACHE_DISABLED === '1' };
}

export function clearCompletionCache(): void {
  completionCache().clear();
}

function cacheEnabledFor(opts: ChatCompleteOptions): boolean {
  if (process.env.MODEL_CACHE_DISABLED === '1') return false;
  if (opts.cache === false) return false;
  return !(opts.tools && opts.tools.length > 0);
}

function cacheKeyOptions(opts: ChatCompleteOptions): { temperature?: number; json?: boolean; namespace?: string } {
  return { temperature: opts.temperature, json: opts.json, namespace: opts.cacheNamespace };
}

/** Cache-aware wrapper around chatCompleteFor. */
async function cachedComplete(
  profileId: ProviderProfileId,
  messages: ChatMessage[],
  opts: ChatCompleteOptions,
): Promise<ChatCompleteResult> {
  if (!cacheEnabledFor(opts)) return chatCompleteFor(profileId, messages, opts);
  const kopts = cacheKeyOptions(opts);
  const hit = completionCache().lookup(messages as CacheMessage[], kopts);
  if (hit) {
    return { ok: true, content: hit.value, status: 'online', model: hit.model, latencyMs: 0, cached: true };
  }
  const result = await chatCompleteFor(profileId, messages, opts);
  if (result.ok && result.content) {
    completionCache().store(messages as CacheMessage[], kopts, result.content, result.model);
  }
  return result;
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
  /**
   * How far `online` was actually verified.
   *  - `deep`         — a completion was produced. `online` means usable.
   *  - `reachability` — only `GET /models` answered 200. `online` means the
   *                     endpoint is up, NOT that the key can generate.
   *  - `none`         — never probed; `online` is false and says nothing.
   * Reading `online` without this field is how a provider that answers /models
   * and rejects /chat/completions gets reported as healthy.
   */
  verified: 'deep' | 'reachability' | 'none';
  lastError?: string;
  checkedAt?: number;
}

/** Single active profile id — always 'api'. The 'local' option remains
 *  exposed so the UI does not crash, but it reports offline when no
 *  LOCAL_MODEL_BASE_URL is configured. */
export type ProviderProfileId = 'local' | 'api';

let activeProvider: ProviderProfileId = 'api';

/**
 * One slot per profile, but a `deep` discriminator alongside the value.
 *
 * Both probe tiers used to write the same `online` field with no record of which
 * wrote it, so the two could not be told apart and either could win. Two
 * consequences, both observed:
 *  - A hot-path shallow probe (every completion consults it) overwrote a deep
 *    `false` verdict within the TTL, re-reporting an unkeyed provider as online.
 *  - `providerStatus().online` could not say whether it meant "reachable" or
 *    "produced a completion", which is the exact ambiguity the module's own
 *    docstring says caused 58 forge failures against a "healthy" provider.
 * `deep: true` means the value came from a real completion attempt.
 */
const onlineCache: Record<ProviderProfileId, { online: boolean | null; at: number; error: string | undefined; deep: boolean }> = {
  local: { online: null, at: 0, error: undefined, deep: false },
  api: { online: null, at: 0, error: undefined, deep: false },
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
  onlineCache[activeProvider] = { online: null, at: 0, error: undefined, deep: false };
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
 *  'auto' (default) prefers the local MiniCPM5 model when one is configured,
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
  // Learned routing (Phase 2 #9): once enough real outcomes have accrued, let
  // the bandit choose among the configured profiles. A cold bandit returns null
  // and we keep the local-first default below — so nothing changes until the
  // system has actually observed which profile works on this box.
  const learned = modelSelection().choose(['local', 'api']);
  if (learned) return learned;
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
    { id: 'local', label: localModelConfigured() ? 'Local (configured)' : 'Local (not configured)', baseUrl: l.baseUrl || 'http://127.0.0.1:11434/v1', model: l.model || 'no local model' },
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

async function chatCompleteForRaw(
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
    // Always send an explicit output cap.
    //
    // With no `max_tokens`, OpenAI-compatible gateways fall back to the model's
    // maximum output, and deepseek-v4.1-flash advertises 131072. The provider
    // then rejects the request before generating anything:
    //   HTTP 402 "You requested up to 131072 tokens, but can only afford 239"
    // A tool build needs on the order of 1-2k tokens, so the cap is both
    // cheaper and what was actually wanted. An explicit per-call value still
    // wins when a caller knows it needs more.
    max_tokens: opts.maxTokens ?? (Number(process.env.MODEL_MAX_TOKENS) || 4096),
  };
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;

  const endpoint = `${cfg.baseUrl}/chat/completions`;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? 'auto';
  } else if (opts.json) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await rawFetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
          ...providerExtraHeaders(cfg.baseUrl),
        },
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
    const choice = data?.choices?.[0];
    const message = choice?.message ?? {};
    const content: string | null = typeof message.content === 'string' ? message.content : null;
    const toolCalls: ToolCall[] | undefined = Array.isArray(message.tool_calls) && message.tool_calls.length
      ? message.tool_calls
          .filter((t: any) => t && t.type === 'function' && t.function && typeof t.function.name === 'string')
          .map((t: any) => ({
            id: String(t.id ?? ''),
            type: 'function' as const,
            function: {
              name: String(t.function.name),
              arguments: typeof t.function.arguments === 'string'
                ? t.function.arguments
                : JSON.stringify(t.function.arguments ?? {}),
            },
          }))
      : undefined;
    const finishReason: string | undefined = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
    const reasoning: string | undefined =
      typeof message.reasoning_content === 'string' && message.reasoning_content.trim()
        ? message.reasoning_content
        : undefined;

    // A turn that requests tools legitimately has empty content; only content-less
    // turns with no tool calls are an honest error.
    if ((content === null || content.trim().length === 0) && !(toolCalls && toolCalls.length)) {
      // "model returned empty content" is not a diagnosis. The common cause is a
      // reasoning model spending the ENTIRE output budget on reasoning and
      // hitting the cap before writing an answer (space-bunny-free emits
      // `reasoning_content` and returns `finish_reason: 'length'`), which looks
      // identical to an empty response unless the reason is reported.
      const reasoningTokens = (data?.usage as any)?.completion_tokens_details?.reasoning_tokens;
      let error = 'model returned empty content';
      if (finishReason === 'length' && reasoning) {
        error =
          `model used its entire output budget on reasoning and produced no answer ` +
          `(finish_reason=length, reasoning ${reasoning.length} chars` +
          (typeof reasoningTokens === 'number' ? `, ${reasoningTokens} reasoning tokens` : '') +
          `). Raise MODEL_MAX_TOKENS.`;
      } else if (reasoning) {
        error = `model returned only reasoning and no answer (finish_reason=${finishReason ?? 'unknown'})`;
      }
      onlineCache[profileId].error = error;
      return {
        ok: false,
        content: null,
        status: 'error',
        model: cfg.model,
        error,
        latencyMs: Date.now() - started,
      };
    }

    // Token accounting: prefer the provider's real OpenAI `usage` counts, fall
    // back to a length estimate clearly flagged as such.
    let promptTokens = Number(data?.usage?.prompt_tokens) || 0;
    let completionTokens = Number(data?.usage?.completion_tokens) || 0;
    let estimated = false;
    if (promptTokens === 0 && completionTokens === 0) {
      promptTokens = messages.reduce((n, m) => n + estimateTokens(m.content), 0);
      const completionText = content && content.trim() ? content : (toolCalls ? JSON.stringify(toolCalls) : '');
      completionTokens = estimateTokens(completionText);
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
      toolCalls,
      finishReason,
      reasoning,
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

/** Record the real outcome of a generation call so routing learns over time.
 *  Never lets a learning failure break generation. */
async function chatCompleteFor(
  profileId: ProviderProfileId,
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
): Promise<ChatCompleteResult> {
  const result = await chatCompleteForRaw(profileId, messages, opts);
  try {
    modelSelection().record(
      profileId,
      rewardForOutcome({ ok: result.ok, status: result.status, latencyMs: result.latencyMs }),
    );
  } catch {
    /* learning must never break a model call */
  }
  return result;
}

/**
 * Extra headers a specific gateway requires.
 *
 * opencode.ai's Zen gateway refuses requests without `x-opencode-session`
 * ("Request is missing x-opencode-session and cannot be routed efficiently"),
 * which surfaced as HTTP 429 on the `zen/go` tier. The header is gateway
 * policy, not a secret, so it is derived from the base URL rather than being
 * smuggled through the API-key field.
 *
 * Set OPENCODE_SESSION_ID to name the session; the default identifies Recourse
 * so the gateway can attribute usage.
 */
function providerExtraHeaders(baseUrl: string): Record<string, string> {
  if (!/opencode\.ai/i.test(baseUrl)) return {};
  const session = (process.env.OPENCODE_SESSION_ID || 'recourse').trim();
  return session ? { 'x-opencode-session': session } : {};
}

async function rawFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // longFetch, not fetch: undici's own 300s headersTimeout fires before this
    // AbortSignal on a slow local model, and the resulting bare "fetch failed"
    // is indistinguishable from the server being offline.
    return await longFetch(url, { ...init, signal: controller.signal }, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

/** Probe whether a profile can actually GENERATE, not merely be reached.
 *
 *  WHY THIS IS NOT JUST `GET /models`
 *  `GET /models` answers 200 on hosts whose chat endpoint rejects the
 *  configured key — api.pgsgrove.com does exactly that. The old probe therefore
 *  reported `online: true` while every real completion returned
 *  `HTTP 401: plan tier does not include API access`, which is how 58 forge
 *  attempts failed against a provider the dashboard called healthy. "Online"
 *  has to mean "a completion can be produced", so the probe now spends one
 *  token to find out.
 *
 *  Cached for STATUS_TTL_MS, so the cost is one token per profile per TTL.
 *  Reachable-but-unusable is the state this exists to distinguish.
 */
export async function checkOnline(
  force = false,
  profileId: ProviderProfileId = activeProvider,
  opts: { deep?: boolean } = {},
): Promise<boolean> {
  const slot = onlineCache[profileId];
  const now = Date.now();
  if (!force && slot.online !== null && now - slot.at < STATUS_TTL_MS) {
    // A cached DEEP verdict is strictly more informative than a reachability
    // probe, so answer from it rather than letting the hot path downgrade it —
    // that downgrade is how a provider that answers /models and rejects
    // /chat/completions got re-reported as online minutes after being caught.
    // The reverse does not hold: a cached reachability `true` cannot answer a
    // deep question, so a deep request must re-probe, never inherit the weaker claim.
    if (slot.deep || !opts.deep) return slot.online;
  }
  const p = profileFor(profileId);
  const baseUrl = p.baseUrl;
  if (!baseUrl) {
    slot.online = false;
    slot.at = now;
    slot.error = 'local model not configured';
    slot.deep = false;
    return false;
  }
  // Step 1: is the endpoint reachable at all? Cheap, and it distinguishes
  // "server down" from "server up but refusing us".
  try {
    const res = await rawFetch(`${baseUrl}/models`, { method: 'GET' }, 2000);
    if (!res.ok) {
      slot.online = false;
      slot.at = now;
      slot.error = `GET /models -> HTTP ${res.status}`;
      // Step 1 failing is a definitive negative at any depth — nothing is
      // reachable at all — so this answer is as strong as a deep one and may be
      // reused by a later caller regardless of the depth it asked for.
      slot.deep = true;
      return false;
    }
  } catch (err: any) {
    slot.online = false;
    slot.at = now;
    slot.error = err?.message || 'unreachable';
    slot.deep = true;
    return false;
  }

  // Step 2 (opt-in): can it actually complete?
  //
  // Only run for an explicit status READ. This costs a real model call, and
  // `chatCompleteForRaw` consults this probe before every completion — running
  // it there doubled the model's call count on the hot path and broke the
  // completion-cache contract ("the second identical completion never hits the
  // network"). A completion is its own proof of usability, so the hot path only
  // needs the cheap reachability check; the honest "online" that dashboards
  // show is produced by `checkOnline(..., { deep: true })`.
  if (!opts.deep) {
    slot.online = true;
    slot.at = now;
    slot.error = undefined;
    // Explicitly NOT deep. /models answering 200 proves reachability only; this
    // is the state that reads as "healthy" when the key cannot generate.
    slot.deep = false;
    return true;
  }
  try {
    const res = await rawFetch(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
          ...providerExtraHeaders(baseUrl),
        },
        body: JSON.stringify({
          model: p.model,
          messages: [{ role: 'user', content: 'ok' }],
          max_tokens: 1,
          stream: false,
        }),
      },
      // A CPU-streamed 2B model needs seconds of prefill before its first
      // token; the old 2s ceiling was too tight and reported a healthy local
      // llama-server as offline.
      30_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      slot.online = false;
      slot.at = now;
      // Keep the server's own words: "plan tier does not include API access"
      // is the actionable part, and "HTTP 401" alone is not.
      const detail = extractProviderError(text) ?? `HTTP ${res.status}`;
      slot.error = `POST /chat/completions -> ${detail}`;
      slot.deep = true;
      return false;
    }
    slot.online = true;
    slot.at = now;
    slot.error = undefined;
    slot.deep = true;
    return true;
  } catch (err: any) {
    slot.online = false;
    slot.at = now;
    slot.error = `POST /chat/completions -> ${err?.message || 'failed'}`;
    slot.deep = true;
    return false;
  }
}

/** Pull the provider's own error message out of an error body, when present. */
function extractProviderError(text: string): string | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const msg = parsed?.error?.message ?? parsed?.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 200);
  } catch {
    // not JSON — fall through to the raw text
  }
  const trimmed = text.trim().slice(0, 200);
  return trimmed && !trimmed.startsWith('<') ? trimmed : null;
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
    // Surface how far `online` was proven, so a caller cannot read a bare
    // reachability probe as a health verdict. See ProviderStatus.verified.
    verified: slot.online === null ? 'none' : slot.deep ? 'deep' : 'reachability',
    lastError: slot.error,
    checkedAt: slot.online === null ? undefined : slot.at,
  };
}

/** Status for both profiles — used by UI to show local+api independently. */
export function providerStatuses(): Record<ProviderProfileId, ProviderStatus> {
  return { local: providerStatus('local'), api: providerStatus('api') };
}

/** Learned model-routing state for operators/UI. Honest: an unwarmed bandit
 *  reports `warmed: false` and the static heuristic is still in force. */
export function modelSelectionSnapshot(): {
  warmed: boolean;
  plays: number;
  arms: Array<{ id: string; plays: number; mean: number; ucb: number }>;
} {
  const s = modelSelection();
  return { warmed: s.warmed(), plays: s.playCount, arms: s.snapshot() };
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
  const result = await cachedComplete(profile, messages, opts);
  if (profile === 'local' && result.status !== 'online') {
    // Local failed (offline or error) — fall back to the API profile for this
    // generation. The returned result reports the profile that actually answered.
    return cachedComplete('api', messages, opts);
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
  return cachedComplete(profileId === 'local' ? 'local' : 'api', messages, opts);
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
  return cachedComplete(profile, messages, opts);
}
