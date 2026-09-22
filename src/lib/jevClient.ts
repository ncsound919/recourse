/**
 * jevClient.ts — TypeSafe Jev (System One) typed-decision client.
 *
 * Jev answers `choice` / `noul` / `score` questions over a `state` in one
 * forward pass and returns calibrated probabilities — never free text. This
 * client talks to the TypeSafe-compatible endpoint through the Vercel AI
 * Gateway (default base https://ai-gateway.vercel.sh/typesafe, model
 * `typesafe-ai/jev`).
 *
 * Honesty contract (matches modelProvider.ts): a missing key, a non-2xx
 * response, or a timeout is reported `ok:false` with the real error — this
 * module NEVER fabricates a probability. Callers keep their deterministic
 * engine and annotate the result with `source` so the live tier is always
 * visible.
 *
 * Wire shape (verified against the gateway contract):
 *   POST {base}/v1/systemone
 *   { "model": "typesafe-ai/jev", "state": "...", "questions": { "<id>": {
 *       "type": "choice|noul|score", "instructions": "...", "criteria": ... } } }
 *   -> { "model": "...", "answers": { "<id>": { ... } }, "usage": { ... } }
 */

export type JevState = string | unknown[] | Record<string, unknown>;

export interface JevChoiceQuestion {
  type: 'choice';
  instructions: unknown;
  criteria: Record<string, unknown>;
}

export interface JevNoulQuestion {
  type: 'noul';
  instructions: unknown;
  criteria?: { true: unknown; false: unknown } | null;
}

export interface JevScoreQuestion {
  type: 'score';
  instructions: unknown;
  criteria: unknown[];
}

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion | JevScoreQuestion;

export type JevAnswer =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'noul'; noul: number }
  | { type: 'score'; score: number; legend: Record<string, unknown>; probabilities: Record<string, number>; confidence: number };

export interface JevTierConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface JevConfig {
  /** Master switch: RECOURSE_JEV_ENABLED (default on). */
  enabled: boolean;
  timeoutMs: number;
  /** Tier 1 — Vercel AI Gateway TypeSafe lane (needs a key). */
  gateway: JevTierConfig;
  /** Tier 2 — LocalJev on :8080 (no key required). */
  local: JevTierConfig;
}

const GATEWAY_BASE_URL_DEFAULT = 'https://ai-gateway.vercel.sh/typesafe';
const GATEWAY_MODEL_DEFAULT = 'typesafe-ai/jev';
const LOCAL_BASE_URL_DEFAULT = 'http://127.0.0.1:8080';
const LOCAL_MODEL_DEFAULT = 'jev-latest';

export function jevConfig(): JevConfig {
  const gateway: JevTierConfig = {
    baseUrl: (process.env.TYPESAFE_BASE_URL || GATEWAY_BASE_URL_DEFAULT).replace(/\/+$/, ''),
    apiKey: (process.env.TYPESAFE_API_KEY || process.env.AI_GATEWAY_API_KEY || '').trim(),
    model: process.env.TYPESAFE_MODEL || GATEWAY_MODEL_DEFAULT,
  };
  const local: JevTierConfig = {
    baseUrl: (process.env.JEV_LOCAL_BASE_URL || LOCAL_BASE_URL_DEFAULT).replace(/\/+$/, ''),
    apiKey: '',
    model: process.env.JEV_LOCAL_MODEL || LOCAL_MODEL_DEFAULT,
  };
  const enabled = process.env.RECOURSE_JEV_ENABLED !== '0';
  const timeoutMs = Number(process.env.TYPESAFE_TIMEOUT_MS) || 10_000;
  return { enabled, timeoutMs, gateway, local };
}

/** Is any Jev tier usable (enabled + a base URL)? The gateway needs a key to be
 *  *reachable*, but the local tier is always a valid target. */
export function jevEnabled(): boolean {
  const c = jevConfig();
  return c.enabled && (Boolean(c.gateway.baseUrl) || Boolean(c.local.baseUrl));
}

export interface JevTierStatus {
  id: 'gateway' | 'local';
  baseUrl: string;
  model: string;
  online: boolean;
  error?: string;
}

export interface JevStatus {
  configured: boolean;
  enabled: boolean;
  tiers: JevTierStatus[];
  online: boolean;
  checkedAt?: number;
}

type TierCache = { online: boolean | null; at: number; error: string | undefined };
let statusCache: Record<'gateway' | 'local', TierCache> = {
  gateway: { online: null, at: 0, error: undefined },
  local: { online: null, at: 0, error: undefined },
};
const STATUS_TTL_MS = 10_000;

async function probeTier(id: 'gateway' | 'local', tier: JevTierConfig, now: number, force = false): Promise<JevTierStatus> {
  const slot = statusCache[id];
  if (!force && slot.online !== null && now - slot.at < STATUS_TTL_MS) {
    return { id, baseUrl: tier.baseUrl, model: tier.model, online: slot.online === true, error: slot.error };
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tier.apiKey) headers.Authorization = `Bearer ${tier.apiKey}`;
    const res = await rawFetch(`${tier.baseUrl}/v1/models`, { method: 'GET', headers }, 3000);
    slot.online = res.ok;
    slot.at = now;
    slot.error = res.ok ? undefined : `GET /v1/models -> HTTP ${res.status}`;
  } catch (err: any) {
    slot.online = false;
    slot.at = now;
    slot.error = err?.message || 'unreachable';
  }
  return { id, baseUrl: tier.baseUrl, model: tier.model, online: slot.online === true, error: slot.error };
}

/** Probes both tiers (gateway + localjev). Reports honestly per tier — never a
 *  fabricated "ready". */
export async function jevStatus(force = false): Promise<JevStatus> {
  const c = jevConfig();
  const now = Date.now();
  const [gateway, local] = await Promise.all([
    probeTier('gateway', c.gateway, now, force),
    probeTier('local', c.local, now, force),
  ]);
  return {
    configured: true,
    enabled: c.enabled,
    tiers: [gateway, local],
    online: gateway.online || local.online,
    checkedAt: now,
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
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

export interface SystemOneInput {
  state: JevState;
  questions: Record<string, JevQuestion>;
  model?: string;
}

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface JevResult {
  ok: boolean;
  source: 'vercel' | 'localjev' | 'offline';
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: JevUsage;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
}

interface TierCallResult {
  ok: boolean;
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: JevUsage;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
}

/** One tier's POST /v1/systemone with transient-overload retry (429/529). */
async function postSystemOne(
  tier: JevTierConfig,
  input: SystemOneInput,
  timeoutMs: number,
  started: number,
): Promise<TierCallResult> {
  const endpoint = `${tier.baseUrl}/v1/systemone`;
  const body = { model: input.model ?? tier.model, state: input.state, questions: input.questions };
  const retryable = new Set([429, 529]);
  let lastStatus = 0;
  let lastError = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(Math.min(300, 200 * attempt));
    try {
      const res = await rawFetch(endpoint, { method: 'POST', headers: authHeaders(tier.apiKey), body: JSON.stringify(body) }, timeoutMs);
      lastStatus = res.status;
      if (retryable.has(res.status)) {
        lastError = `HTTP ${res.status} (transient overload; retrying)`;
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastError = `POST ${endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`;
        return { ok: false, latencyMs: Date.now() - started, error: lastError, httpStatus: res.status };
      }
      const data: any = await res.json();
      const answers: Record<string, JevAnswer> | undefined =
        data && typeof data.answers === 'object' && data.answers !== null ? data.answers : undefined;
      if (!answers) {
        return { ok: false, latencyMs: Date.now() - started, error: 'Jev response missing answers' };
      }
      const usage: JevUsage | undefined =
        data?.usage && typeof data.usage.input_tokens === 'number'
          ? { inputTokens: data.usage.input_tokens, outputTokens: Number(data.usage.output_tokens) || 0 }
          : undefined;
      return {
        ok: true,
        model: typeof data.model === 'string' ? data.model : tier.model,
        answers,
        usage,
        latencyMs: Date.now() - started,
      };
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      lastError = aborted ? `request timed out after ${timeoutMs}ms` : (err?.message || 'request failed');
      if (!aborted) break;
    }
  }
  return { ok: false, latencyMs: Date.now() - started, error: lastError, httpStatus: lastStatus || undefined };
}

/**
 * One typed decision call with a two-tier fallback chain:
 *   tier 1 = Vercel AI Gateway TypeSafe lane (used when a key is configured),
 *   tier 2 = LocalJev on :8080 (no key needed).
 * A gateway failure (no key, offline, HTTP error) falls through to localjev.
 * Only when BOTH fail is the result `source:'offline'` — nothing is fabricated.
 */
export async function decideSystemOne(input: SystemOneInput): Promise<JevResult> {
  const c = jevConfig();
  const started = Date.now();
  if (!jevEnabled()) {
    return {
      ok: false,
      source: 'offline',
      latencyMs: Date.now() - started,
      error: c.enabled ? 'no Jev tier configured' : 'Jev decision engine disabled (RECOURSE_JEV_ENABLED=0)',
    };
  }

  if (c.gateway.apiKey) {
    const r = await postSystemOne(c.gateway, input, c.timeoutMs, started);
    if (r.ok) return { ...r, source: 'vercel' };
  }

  const local = await postSystemOne(c.local, input, c.timeoutMs, started);
  if (local.ok) return { ...local, source: 'localjev' };
  return { ...local, source: 'offline' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Growth-decision advisory builder ───────────────────────────────────────

import type { GrowthDecisionReport, CandidateGrowthAction } from '../types';

/**
 * Builds the Jev `state` + a single `choice` question from a deterministic
 * growth decision. State is compact on purpose — Jev bills per input token, so
 * the full registry is never shipped, only per-action utilities + the summary.
 */
export function growthDecisionAdvisory(decision: GrowthDecisionReport): {
  state: JevState;
  questions: Record<string, JevQuestion>;
  actions: CandidateGrowthAction[];
} {
  const actions = decision.candidateActions;
  const state = {
    generation: decision.generation,
    stateVectorSummary: decision.stateVectorSummary,
    decisionEntropy: decision.decisionEntropy,
    actions: actions.map((a) => ({
      id: a.id,
      type: a.actionType,
      utility: a.computedUtilityScore,
      target: a.targetDomain ?? a.targetToolName ?? null,
    })),
  };

  const criteria: Record<string, string> = {};
  for (const a of actions) {
    const target = a.targetDomain ?? a.targetToolName ?? '';
    const title = a.title.split(':')[0].trim().slice(0, 60);
    criteria[a.id] = `${a.actionType} -> ${target || title} (deterministic utility ${a.computedUtilityScore.toFixed(3)})`;
  }
  // Jev requires 2-128 choice options; a single-action decision must still pass.
  if (Object.keys(criteria).length < 2) criteria.defer = 'Defer / no action now';

  const questions: Record<string, JevQuestion> = {
    priority: {
      type: 'choice',
      instructions: 'Which candidate growth action should be executed first?',
      criteria,
    },
  };

  return { state, questions, actions };
}

export interface JevAdvisory {
  ok: boolean;
  source: 'vercel' | 'localjev' | 'offline';
  model?: string;
  /** choice tier: the candidate action Jev ranked first. */
  recommendedActionId?: string;
  recommendedActionType?: string;
  probability?: number;
  confidence?: number;
  /** noul tier: yes/no probability + boolean decision. */
  noul?: number;
  proceed?: boolean;
  usage?: JevUsage;
  latencyMs: number;
  error?: string;
}

/** Turns a choice-tier Jev result into a clean advisory for the UI/callers.
 *  Offline/failed calls produce `{ ok:false, source:'offline' }` — never a
 *  fabricated recommendation. */
export function buildChoiceAdvisory(result: JevResult, actions: CandidateGrowthAction[]): JevAdvisory {
  if (!result.ok || !result.answers) {
    return { ok: false, source: 'offline', latencyMs: result.latencyMs, error: result.error };
  }
  const priority = result.answers.priority;
  let recommendedActionId: string | undefined;
  let probability = 0;
  let confidence: number | undefined;
  if (priority && priority.type === 'choice') {
    recommendedActionId = priority.choice;
    probability = priority.probabilities?.[priority.choice] ?? 0;
    confidence = priority.confidence;
  }
  const action = actions.find((a) => a.id === recommendedActionId);
  return {
    ok: true,
    source: result.source,
    model: result.model,
    recommendedActionId,
    recommendedActionType: action?.actionType,
    probability,
    confidence,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
}

/** Turns a noul-tier Jev result into an advisory. `questionKey` defaults to
 *  `proceed` (the growth-loop noul); pass the question id for other nouls. */
export function buildNoulAdvisory(result: JevResult, questionKey = 'proceed'): JevAdvisory {
  if (!result.ok || !result.answers) {
    return { ok: false, source: 'offline', latencyMs: result.latencyMs, error: result.error };
  }
  const answer = result.answers[questionKey];
  const noul = answer && answer.type === 'noul' ? answer.noul : undefined;
  return {
    ok: true,
    source: result.source,
    model: result.model,
    noul,
    proceed: noul === undefined ? undefined : noul >= 0.5,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
}

// ─── Chord-progression advisory ─────────────────────────────────────────────

export interface ChordAdvisoryInput {
  style: string;
  keyName: string;
  chords: string[];
  bpm: number;
  bars: number;
  mode: 'loop' | 'arr';
  /** Optional brief mood descriptor (e.g. "melancholic, warm"). */
  mood?: string;
}

/**
 * Builds a compact Jev `state` + two `score` questions (mood fit, tension) and
 * one `choice` question ("which bar is the weakest link"). State is chord
 * labels + key/bpm only — Jev bills per input token, so no voicings or events
 * are shipped. The deterministic progression stays authoritative; Jev only
 * judges it.
 */
export function chordAdvisoryQuestions(input: ChordAdvisoryInput): {
  state: JevState;
  questions: Record<string, JevQuestion>;
} {
  const state = {
    style: input.style,
    key: input.keyName,
    bpm: input.bpm,
    bars: input.bars,
    mode: input.mode,
    mood: input.mood ?? null,
    progression: input.chords,
  };

  const criteria: Record<string, string> = {};
  input.chords.forEach((c, i) => {
    criteria[`bar_${i + 1}`] = c;
  });

  const questions: Record<string, JevQuestion> = {
    fit: {
      type: 'score',
      instructions: `How well does this ${input.chords.length}-chord ${input.mode} progression express the requested mood${input.mood ? ` ("${input.mood}")` : ''}?`,
      criteria: ['Poor fit', 'Adequate', 'Good', 'Excellent'],
    },
    tension: {
      type: 'score',
      instructions: 'How harmonically tense or active is this progression?',
      criteria: ['Static / calm', 'Gentle motion', 'Moderate', 'High tension'],
    },
    swap: {
      type: 'choice',
      instructions: 'Which chord (bar) is the weakest link to reconsider for a better mood fit?',
      criteria,
    },
  };

  return { state, questions };
}

export interface ChordJevAdvisory {
  ok: boolean;
  source: 'vercel' | 'localjev' | 'offline';
  model?: string;
  /** 0..3 expected-value over the fit levels. */
  fitScore?: number;
  fitConfidence?: number;
  /** 0..3 expected-value over the tension levels. */
  tensionScore?: number;
  tensionConfidence?: number;
  /** 1-based bar Jev flags as the weakest link. */
  swapBar?: number;
  swapChord?: string;
  usage?: JevUsage;
  latencyMs: number;
  error?: string;
}

function scoreValue(answer: JevAnswer | undefined): { score?: number; confidence?: number } {
  if (!answer || answer.type !== 'score') return {};
  return { score: typeof answer.score === 'number' ? answer.score : undefined, confidence: typeof answer.confidence === 'number' ? answer.confidence : undefined };
}

/** Parses the chord advisory answers into a clean shape. Offline => ok:false. */
export function buildChordAdvisory(result: JevResult, chords?: string[]): ChordJevAdvisory {
  if (!result.ok || !result.answers) {
    return { ok: false, source: 'offline', latencyMs: result.latencyMs, error: result.error };
  }
  const fit = scoreValue(result.answers.fit);
  const tension = scoreValue(result.answers.tension);
  const swap = result.answers.swap;
  let swapBar: number | undefined;
  if (swap && swap.type === 'choice') {
    const idx = /^bar_(\d+)$/.exec(swap.choice ?? '');
    if (idx) swapBar = Number(idx[1]);
  }
  return {
    ok: true,
    source: result.source,
    model: result.model,
    fitScore: fit.score,
    fitConfidence: fit.confidence,
    tensionScore: tension.score,
    tensionConfidence: tension.confidence,
    swapBar,
    swapChord: swapBar !== undefined && chords ? chords[swapBar - 1] : undefined,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
}

export interface ChordRerankCandidate {
  seed: number;
  chords: string[];
}

/**
 * Builds the rerank advisory: Jev `choice` over N real candidate progressions
 * (same brief, different deterministic seeds). Jev only ranks real candidates —
 * it never invents a progression.
 */
export function chordRerankQuestions(candidates: ChordRerankCandidate[], mood?: string): {
  state: JevState;
  questions: Record<string, JevQuestion>;
} {
  const criteria: Record<string, string> = {};
  for (const c of candidates) {
    criteria[`seed_${c.seed}`] = c.chords.join(' | ');
  }
  const state = {
    mood: mood ?? null,
    candidates: candidates.map((c) => ({ seed: c.seed, chords: c.chords })),
  };
  const questions: Record<string, JevQuestion> = {
    best: {
      type: 'choice',
      instructions: `Which candidate progression best fits the requested mood${mood ? ` ("${mood}")` : ''}?`,
      criteria,
    },
  };
  return { state, questions };
}

export interface ChordRerankAdvisory {
  ok: boolean;
  source: 'vercel' | 'localjev' | 'offline';
  model?: string;
  bestSeed?: number;
  bestChords?: string[];
  probability?: number;
  confidence?: number;
  usage?: JevUsage;
  latencyMs: number;
  error?: string;
}

export function buildChordRerankAdvisory(result: JevResult, candidates: ChordRerankCandidate[]): ChordRerankAdvisory {
  if (!result.ok || !result.answers) {
    return { ok: false, source: 'offline', latencyMs: result.latencyMs, error: result.error };
  }
  const answer = result.answers.best;
  let bestSeed: number | undefined;
  let probability = 0;
  let confidence: number | undefined;
  if (answer && answer.type === 'choice') {
    const m = /^seed_(\d+)$/.exec(answer.choice ?? '');
    if (m) bestSeed = Number(m[1]);
    probability = answer.probabilities?.[answer.choice] ?? 0;
    confidence = answer.confidence;
  }
  const best = candidates.find((c) => c.seed === bestSeed);
  return {
    ok: true,
    source: result.source,
    model: result.model,
    bestSeed,
    bestChords: best?.chords,
    probability,
    confidence,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
}