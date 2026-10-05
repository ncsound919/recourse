/**
 * providerChat.ts — model-provider chat + settings routes extracted from
 * `server.ts`: POST /api/recourse/provider/chat, POST /v1/chat/completions,
 * GET/POST /api/recourse/settings/provider.
 *
 * Paths span `/api/recourse` and the app-root `/v1`, so the router is mounted
 * at app root. `chatComplete`, `providerProfiles`, and `setActiveProviderProfile`
 * are pure lib imports; the host's provider mode (`let`), online-status cache,
 * provenance/log persistence, and generation counter are injected.
 */
import { Router } from 'express';
import {
  chatComplete,
  providerProfiles,
  setActiveProviderProfile,
} from '../lib/modelProvider.js';
import type { ProviderProfileId } from '../lib/modelProvider.js';
import { parseArmId } from '../lib/roleRouter.js';

export interface ProviderChatRouterDeps {
  currentProviderStatus(): {
    baseUrl: string;
    model: string;
    online: boolean;
    /** Proof level for `online`: 'deep' | 'reachability' | 'none'. */
    verified: 'deep' | 'reachability' | 'none';
    lastError?: string;
  };
  refreshModelStatus(force?: boolean, deep?: boolean): Promise<void>;
  providerModeRef(): ProviderProfileId;
  setProviderMode(mode: ProviderProfileId): void;
  saveState(): void;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  currentGeneration(): number;
  /** Role-aware routing state: one arm record per (role, profile) pair. */
  roleRouterSnapshot(): Array<{ id: string; plays: number; mean: number }>;
  /** The observed-mean bar a profile must clear to take a judgement role. */
  roleJudgementFloor(): number;
}

export function createProviderChatRouter(deps: ProviderChatRouterDeps): Router {
  const router = Router();

  async function providerSettingsView() {
    // Force AND deep. This is the explicit status read the modelProvider probe
    // was designed for, so it must spend the one token: `force` alone still only
    // runs the reachability check, which reports `online: true` for a provider
    // that serves /models and rejects /chat/completions — the exact 58-forge-failure
    // regression the probe's own docstring describes.
    await deps.refreshModelStatus(true, true);
    const ps = deps.currentProviderStatus();
    return {
      mode: deps.providerModeRef(),
      profiles: providerProfiles(),
      current: {
        baseUrl: ps.baseUrl,
        model: ps.model,
        online: ps.online,
        // Proof level for `online`, so the UI cannot render a bare reachability
        // probe as a health verdict.
        verified: ps.verified,
        lastError: ps.lastError,
      },
    };
  }

  // Role-aware routing state. Shows which model is eligible for which ROLE and
  // the measured evidence behind it, so "the 2B model planned that" is visible
  // rather than inferred. Arms with no plays are reported as no-data, never as
  // a mean of 0.
  router.get('/api/recourse/provider/roles', async (_req, res) => {
    const arms = deps.roleRouterSnapshot();
    const byRole: Record<string, Array<{ profile: string; plays: number; mean: number | null; eligibleForJudgement: boolean }>> = {};
    for (const a of arms) {
      const parsed = parseArmId(a.id);
      if (!parsed) continue;
      const row = byRole[parsed.role] ?? (byRole[parsed.role] = []);
      row.push({
        profile: parsed.profile,
        plays: a.plays,
        // A never-played arm has NO measured quality. Reporting 0 would be a
        // fabricated verdict in the opposite direction.
        mean: a.plays > 0 ? a.mean : null,
        eligibleForJudgement: a.plays > 0 && a.mean >= deps.roleJudgementFloor(),
      });
    }
    res.json({
      success: true,
      judgementFloor: deps.roleJudgementFloor(),
      roles: byRole,
      note: 'A role with no played arm has no measured evidence; judgement roles refuse rather than guess.',
    });
  });

  // Non-agentic chat against the configured provider: the local Spark model
  // (llama-server) first, with an automatic API fallback. Online only if the
  // endpoint answers; offline/error are reported honestly, never fabricated.
  router.post('/api/recourse/provider/chat', async (req, res) => {
    const { model, prompt, system = '' } = req.body;
    const effectiveModel = model || deps.currentProviderStatus().model;
    const started = Date.now();
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, status: 'error', error: 'prompt is required' });
    }
    const result = await chatComplete([
      { role: 'system', content: system || ('You are a helpful assistant running on ' + effectiveModel + '.') },
      { role: 'user', content: prompt }
    ], { temperature: 0.6 });
    const elapsed = Date.now() - started;
    const completionTokens = result.usage?.completionTokens ?? (result.content ? Math.max(1, Math.round(result.content.length / 4)) : 0);
    res.json({
      success: true,
      status: result.status,
      model: result.model || effectiveModel,
      response: result.content || '',
      error: result.error || undefined,
      metrics: {
        totalDurationMs: result.latencyMs || elapsed,
        promptEvalCount: result.usage?.promptTokens ?? 0,
        evalCount: completionTokens,
        tokensPerSec: completionTokens ? Math.round(completionTokens / ((elapsed / 1000) || 1)) : 0
      }
    });
  });

  // OpenAI-compatible chat shim for external bot clients (Open-Chat). Wraps the
  // same provider chain as /api/recourse/provider/chat (local model first, then
  // the API fallback) so Open-Chat's generic HTTP protocol works unchanged.
  // JSON by default; SSE when `stream:true`. Honest on failure — never fabricates.
  router.post('/v1/chat/completions', async (req, res) => {
    // Bearer gate (RECOURSE_CHAT_TOKEN). This endpoint is reachable through the
    // public Cloudflare tunnel, so it must not be an open model proxy. Mirrors
    // OpenHub's fail-closed pattern: unset token => endpoint refuses.
    const expected = (process.env.RECOURSE_CHAT_TOKEN || '').trim();
    if (!expected) {
      return res.status(401).json({ error: { message: 'Chat endpoint disabled: set RECOURSE_CHAT_TOKEN.', type: 'invalid_request_error' } });
    }
    const authHeader = String(req.headers['authorization'] || '');
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    const got = bearer ? bearer[1].trim() : '';
    let diff = got.length === expected.length ? 0 : 1;
    for (let i = 0; i < got.length && got.length === expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) {
      return res.status(401).json({ error: { message: 'unauthorized', type: 'invalid_request_error' } });
    }

    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const textOf = (m: any) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''));
    const system = messages.filter((m: any) => m?.role === 'system').map(textOf).join('\n').trim();
    const user = messages.filter((m: any) => m?.role !== 'system').map(textOf).filter((s: string) => s && s.trim()).join('\n\n').trim();

    if (!user) {
      return res.status(400).json({ error: { message: 'messages must include a non-empty user message.', type: 'invalid_request_error' } });
    }

    const model = (typeof body.model === 'string' && body.model.trim())
      ? body.model.trim()
      : deps.currentProviderStatus().model;
    const created = Math.floor(Date.now() / 1000);
    const id = `chatcmpl-recourse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await chatComplete([
        { role: 'system', content: system || ('You are a helpful assistant running on ' + model + '.') },
        { role: 'user', content: user },
      ], { temperature: 0.6 });
      const content = result.content || '';

      if (body.stream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        const frame = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
        frame({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] });
        frame({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      res.json({
        id,
        object: 'chat.completion',
        created,
        model: result.model || model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      });
    } catch (err: any) {
      res.status(502).json({ error: { message: String(err?.message || err).slice(0, 300) || 'chat failed', type: 'upstream_error' } });
    }
  });

  router.get('/api/recourse/settings/provider', async (req, res) => {
    try {
      const v = await providerSettingsView();
      res.json({ success: true, ...v });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/recourse/settings/provider', async (req, res) => {
    try {
      const mode = req.body?.mode;
      if (mode !== 'local' && mode !== 'api') {
        return res.status(400).json({ success: false, error: 'mode must be "local" or "api"' });
      }
      deps.setProviderMode(mode);
      setActiveProviderProfile(mode);
      deps.saveState();
      deps.appendProvenance('system_tick', { action: 'provider_mode_change', mode, generation: deps.currentGeneration() });
      const v = await providerSettingsView();
      res.json({ success: true, applied: mode, ...v });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
