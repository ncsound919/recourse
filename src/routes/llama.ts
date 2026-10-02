/**
 * llama.ts — Local llama.cpp (`llama-server`) hub routes.
 *
 * WHY THIS EXISTS
 * The dashboard's model view used to call `/api/ollama/{status,chat,manage}`,
 * which no route in this server ever implemented — every button on that view
 * 404'd. The local model is a llama.cpp `llama-server` speaking the
 * OpenAI-compatible API (see src/lib/modelProvider.ts and the LOCAL_MODEL_*
 * env vars), so these routes proxy THAT server and nothing else.
 *
 *   GET  /api/llama/status   probe the server, report what it actually serves
 *   GET  /api/llama/models   models the server exposes (llama serves loaded GGUF)
 *   POST /api/llama/chat     one OpenAI-compatible chat completion + timings
 *
 * HONESTY RULES
 * - Never invent success. If llama-server is not reachable every route answers
 *   200 with `{ success: false, online: false, error }` so the UI can say
 *   "offline" instead of silently doing nothing.
 * - `llama-server` loads a GGUF at startup; there is no runtime `pull`. The
 *   models route therefore reports what is served, and the UI says so rather
 *   than pretending a download happened.
 * - Timings are llama.cpp's own numbers (prompt/sampled token counts and ms)
 *   converted to tokens/sec. No synthetic benchmark numbers.
 */
import { Router } from 'express';

const PROBE_TIMEOUT_MS = 4_000;
const CHAT_TIMEOUT_MS = 180_000;

/** Local llama.cpp profile, read from the same env the model provider uses. */
export interface LlamaProfile {
  baseUrl: string;
  model: string;
  apiKey: string;
  numCtx: number;
  configured: boolean;
}

export function llamaProfile(): LlamaProfile {
  const baseUrl = (process.env.LOCAL_MODEL_BASE_URL || '').replace(/\/+$/, '');
  return {
    baseUrl,
    model: process.env.LOCAL_MODEL_NAME || 'unconfigured',
    apiKey: process.env.LOCAL_MODEL_API_KEY || '',
    numCtx: Number(process.env.LOCAL_MODEL_NUM_CTX || process.env.MODEL_NUM_CTX || 4096),
    configured: Boolean(baseUrl),
  };
}

async function llamaGet(path: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const profile = llamaProfile();
  if (!profile.configured) {
    return { ok: false, status: 503, body: null, error: 'no local model configured (set LOCAL_MODEL_BASE_URL)' };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${profile.baseUrl}${path}`, {
      signal: ac.signal,
      headers: profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {},
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err: any) {
    const reason = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : String(err?.message || err);
    return { ok: false, status: 0, body: null, error: `llama-server unreachable at ${profile.baseUrl}: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

interface LlamaTiming {
  promptTokens?: number;
  sampledTokens?: number;
  promptMs?: number;
  sampledMs?: number;
  tokensPerSec?: number;
  promptTokensPerSec?: number;
  totalMs?: number;
}

/** llama.cpp reports timings in the OpenAI-compatible body when asked. */
function readTimings(body: any): LlamaTiming | null {
  const t = body?.timings;
  const usage = body?.usage;
  if (!t && !usage) return null;
  const promptTokens = t?.prompt_n ?? usage?.prompt_tokens;
  const sampledTokens = t?.predicted_n ?? usage?.completion_tokens;
  const promptMs = t?.prompt_ms;
  const sampledMs = t?.predicted_ms;
  const out: LlamaTiming = { promptTokens, sampledTokens, promptMs, sampledMs };
  if (typeof promptMs === 'number' && promptMs > 0 && typeof promptTokens === 'number') {
    out.promptTokensPerSec = Math.round((promptTokens / promptMs) * 1000);
  }
  if (typeof sampledMs === 'number' && sampledMs > 0 && typeof sampledTokens === 'number') {
    out.tokensPerSec = Math.round((sampledTokens / sampledMs) * 1000);
  }
  const totalMs = typeof promptMs === 'number' && typeof sampledMs === 'number' ? promptMs + sampledMs : undefined;
  if (totalMs !== undefined) out.totalMs = totalMs;
  return out;
}

export function createLlamaRouter(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    const profile = llamaProfile();
    if (!profile.configured) {
      return res.json({
        success: false,
        online: false,
        baseUrl: '',
        configuredModel: '',
        error: 'no local model configured (set LOCAL_MODEL_BASE_URL to your llama-server /v1 URL)',
      });
    }
    // /models proves the OpenAI-compatible surface answers; /props (llama.cpp
    // extension) adds the served context size and build when available.
    const models = await llamaGet('/models');
    const props = await llamaGet('/props');
    if (!models.ok && !props.ok) {
      return res.json({
        success: false,
        online: false,
        baseUrl: profile.baseUrl,
        configuredModel: profile.model,
        error: models.error || props.error || `llama-server returned HTTP ${models.status}`,
      });
    }
    const servedModel: string | undefined =
      props.body?.model_path?.split(/[\\/]/).pop() ??
      (Array.isArray(models.body?.data) ? models.body.data[0]?.id : undefined);
    return res.json({
      success: true,
      online: true,
      baseUrl: profile.baseUrl,
      configuredModel: profile.model,
      servedModel: servedModel ?? 'unknown',
      numCtx: props.body?.default_generation_settings?.n_ctx ?? profile.numCtx,
      build: props.body?.build_info ?? null,
      totalSlots: props.body?.total_slots ?? null,
    });
  });

  router.get('/models', async (_req, res) => {
    const profile = llamaProfile();
    const probe = await llamaGet('/models');
    if (!probe.ok) {
      return res.json({ success: false, models: [], error: probe.error || `HTTP ${probe.status}` });
    }
    const ids: string[] = Array.isArray(probe.body?.data)
      ? probe.body.data.map((m: any) => String(m?.id ?? '')).filter(Boolean)
      : [];
    return res.json({
      success: true,
      models: ids,
      // llama-server binds the GGUF it was started with; there is no pull API.
      note: 'llama-server serves the GGUF it was started with. Restart it with a different -m to switch models.',
      configuredModel: profile.model,
    });
  });

  router.post('/chat', async (req, res) => {
    const profile = llamaProfile();
    const { prompt, system, model, temperature, maxTokens } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }
    const messages = [
      ...(typeof system === 'string' && system.trim() ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ];
    if (!profile.configured) {
      return res.json({ success: false, error: 'no local model configured (set LOCAL_MODEL_BASE_URL)' });
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);
    let body: any;
    try {
      const res2 = await fetch(`${profile.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: typeof model === 'string' && model ? model : profile.model,
          messages,
          stream: false,
          timings_per_token: true,
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
        }),
      });
      const text = await res2.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        return res.status(502).json({ success: false, error: `llama-server returned non-JSON (HTTP ${res2.status})` });
      }
      if (!res2.ok) {
        return res.status(502).json({ success: false, error: body?.error?.message || `llama-server HTTP ${res2.status}` });
      }
    } catch (err: any) {
      clearTimeout(timer);
      const reason = err?.name === 'AbortError' ? `timeout after ${CHAT_TIMEOUT_MS}ms` : String(err?.message || err);
      return res.json({ success: false, error: `llama-server unreachable at ${profile.baseUrl}: ${reason}` });
    }
    clearTimeout(timer);

    const reply = body?.choices?.[0]?.message?.content ?? '';
    if (!reply) {
      return res.json({ success: false, error: 'llama-server returned no completion content', model: body?.model ?? profile.model });
    }
    return res.json({
      success: true,
      reply,
      model: body?.model ?? profile.model,
      timings: readTimings(body),
      usage: body?.usage ?? null,
    });
  });

  return router;
}
