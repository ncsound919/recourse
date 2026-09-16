/**
 * selfhosted.ts — the self-hosted tool runtime + loop supervisor (extracted from
 * the `server.ts` monolith).
 *
 * All self-hosting/sandbox/artifact logic is imported directly from the libs;
 * the only host-specific concerns injected are provenance recording, the
 * generation counter, and the registry cleanup that must run when a tool is
 * removed. The loop supervisor's own state lives here (it is not needed
 * elsewhere), and `ensureLoops()` is exposed so the host can start it at boot.
 */
import { Router } from 'express';
import {
  listSelfHostedEntries,
  getSelfHostedEntry,
  verifyAllSelfHosted,
  executeSelfHostedTool,
  removeSelfHostedTool,
  toSafeModuleName,
} from '../lib/selfHosting.js';
import { isSandboxRuntimeAvailable, getSandboxRuntime } from '../lib/selfHostSandbox.js';
import { getComponentTemplate } from '../lib/componentTemplates.js';
import { isWebCategory, htmlFromResult, pickRenderMethod } from '../lib/webArtifact.js';
import { artifactCard, resolveKind, unpackCall } from '../lib/artifactHost.js';

export interface SelfhostedDeps {
  appendProvenanceEvent(type: string, data: Record<string, unknown>): void;
  generation(): number;
  /** Registry cleanup on removal; returns whether a registry gene was removed. */
  onRemoved(name: string, removedFile?: string): { registryToolRemoved: boolean };
}

export interface SelfhostedRouter {
  router: Router;
  /** Auto-supervise every live-verified loop artifact (idempotent). */
  ensureLoops(): number;
  /** Start supervising one loop artifact (used when a build produces one). */
  startLoop(name: string, intervalMs?: number): { ok: boolean; error?: string };
  /** Number of supervised loops (diagnostics). */
  loopCount(): number;
}

interface LoopSupervisorState {
  tool: string;
  method: string;
  startedAt: number;
  intervalMs: number;
  cycles: number;
  ok: number;
  failed: number;
  lastAt: number | null;
  lastOk: boolean | null;
  lastResult?: unknown;
  lastError?: string;
}
interface LoopHeartbeat {
  at: number;
  tool: string;
  cycle: number;
  ok: boolean;
}

export function createSelfhostedRouter(deps: SelfhostedDeps): SelfhostedRouter {
  const router = Router();

  const LOOP_INTERVAL_MS = Number(process.env.LOOP_TICK_MS || 5000);
  const loopSupervisors: Record<string, LoopSupervisorState> = {};
  const loopTimers: Record<string, NodeJS.Timeout> = {};
  const loopHeartbeats: LoopHeartbeat[] = [];

  const loopTickMethod = (entry: any): string | null => {
    const m = entry?.methods?.[0]?.method;
    return typeof m === 'string' ? m : null;
  };

  const tickLoop = async (name: string, state: LoopSupervisorState): Promise<void> => {
    state.cycles += 1;
    const res = await executeSelfHostedTool(name, { method: state.method, args: [] });
    state.lastAt = Date.now();
    if (res.success === false) {
      state.failed += 1;
      state.lastOk = false;
      state.lastError = res.error;
      deps.appendProvenanceEvent('loop_error', { tool: name, cycle: state.cycles, error: res.error, generation: deps.generation() });
    } else {
      state.ok += 1;
      state.lastOk = true;
      state.lastResult = res.result;
    }
    loopHeartbeats.push({ at: state.lastAt, tool: name, cycle: state.cycles, ok: state.lastOk === true });
    if (loopHeartbeats.length > 200) loopHeartbeats.shift();
  };

  const startLoopSupervisor = (name: string, intervalMs: number = LOOP_INTERVAL_MS): { ok: boolean; error?: string } => {
    const safe = toSafeModuleName(name);
    if (loopTimers[safe]) return { ok: true };
    const entry = getSelfHostedEntry(safe);
    const kind = entry?.artifactKind ?? 'function';
    const method = loopTickMethod(entry);
    if (!entry || kind !== 'loop' || !method) {
      return { ok: false, error: `"${safe}" is not a supervised loop-kind artifact` };
    }
    const state: LoopSupervisorState = {
      tool: safe, method, startedAt: Date.now(), intervalMs,
      cycles: 0, ok: 0, failed: 0, lastAt: null, lastOk: null,
    };
    loopSupervisors[safe] = state;
    deps.appendProvenanceEvent('loop_started', { tool: safe, method, intervalMs, generation: deps.generation() });
    loopTimers[safe] = setInterval(() => { tickLoop(safe, state).catch(() => {}); }, intervalMs);
    setTimeout(() => { tickLoop(safe, state).catch(() => {}); }, 100);
    return { ok: true };
  };

  const stopLoopSupervisor = (name: string): boolean => {
    const safe = toSafeModuleName(name);
    if (loopTimers[safe]) {
      clearInterval(loopTimers[safe]);
      delete loopTimers[safe];
      delete loopSupervisors[safe];
      deps.appendProvenanceEvent('loop_stopped', { tool: safe, generation: deps.generation() });
      return true;
    }
    return false;
  };

  const ensureLoops = (): number => {
    let started = 0;
    for (const entry of listSelfHostedEntries()) {
      if ((entry.artifactKind ?? 'function') !== 'loop') continue;
      if (entry.lastVerified?.passed !== true) continue;
      if (startLoopSupervisor(entry.name).ok) started += 1;
    }
    return started;
  };

  // --- Core self-hosted routes --------------------------------------------
  router.get('/selfhosted', (_req, res) => {
    const entries = listSelfHostedEntries();
    res.json({ success: true, count: entries.length, tools: entries });
  });

  router.get('/selfhosted/sandbox', async (_req, res) => {
    const runtimeAvailable = await isSandboxRuntimeAvailable();
    const requestedDefault = (process.env.SELFHOST_SANDBOX || 'auto').toLowerCase();
    const defaultMode =
      requestedDefault === 'direct' || requestedDefault === '0' ? 'direct'
      : runtimeAvailable ? 'sandbox' : 'direct';
    res.json({
      success: true,
      runtime: 'quickjs-wasm',
      runtimeAvailable,
      defaultMode,
      liveGuestContexts: runtimeAvailable ? getSandboxRuntime().liveContexts : 0,
      grantsDefault: 'deny-all',
    });
  });

  router.post('/selfhosted/verify', async (_req, res) => {
    try {
      const entries = await verifyAllSelfHosted();
      const healthy = entries.filter((e) => e.lastVerified?.passed).length;
      res.json({ success: true, count: entries.length, healthy, tools: entries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/selfhosted/:name/execute', async (req, res) => {
    try {
      const { name } = req.params;
      const { method, args = [], mode } = req.body ?? {};
      const entry = getSelfHostedEntry(name);
      if (!entry) {
        return res.status(404).json({ success: false, error: `No self-hosted tool named "${toSafeModuleName(name)}"` });
      }
      const execMode =
        mode === 'sandbox' || mode === 'direct' || mode === 'auto'
          ? mode
          : (process.env.SELFHOST_SANDBOX || 'auto').toLowerCase() === 'direct'
            ? 'direct'
            : 'auto';
      const result = await executeSelfHostedTool(entry.name, { method, args }, undefined, { mode: execMode });
      if (result.success === false) {
        return res.status(400).json({ success: false, error: result.error, mode: result.mode });
      }
      deps.appendProvenanceEvent('selfhosted_tool_called', {
        tool: entry.name, method, templateId: entry.templateId, hash: entry.hash,
        mode: result.mode, executionTimeMs: result.executionTimeMs,
      });
      res.json({
        success: true, tool: entry.name, method, mode: result.mode,
        grantUse: result.grantUse ?? [], result: result.result, executionTimeMs: result.executionTimeMs,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/selfhosted/:name/card', (req, res) => {
    const entry = getSelfHostedEntry(req.params.name);
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, card: artifactCard(entry), kind: resolveKind(entry) });
  });

  router.get('/web/artifact/:name', async (req, res) => {
    try {
      const entry = getSelfHostedEntry(req.params.name);
      if (!entry) return res.status(404).json({ success: false, error: `No self-hosted tool named "${toSafeModuleName(req.params.name)}"` });
      const tpl = getComponentTemplate(entry.templateId);
      const category = tpl?.category;
      if (!isWebCategory(category)) {
        return res.status(400).json({ success: false, error: `"${entry.name}" is not a web artifact (category: ${category ?? 'unknown'}) — only 'web' templates are served as pages` });
      }
      const method = pickRenderMethod(entry.methods)?.method;
      if (!method) {
        return res.status(400).json({ success: false, error: `"${entry.name}" exposes no renderable method` });
      }
      const result = await executeSelfHostedTool(entry.name, { method, args: [] });
      if (result.success === false) return res.status(502).json({ success: false, error: result.error });
      const decision = htmlFromResult(result.result);
      if (decision.ok === false) return res.status(406).json({ success: false, error: decision.reason });
      deps.appendProvenanceEvent('capability_served', {
        tool: entry.name, templateId: entry.templateId, method, kind: resolveKind(entry), contentType: 'text/html',
      });
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.send(decision.html);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/selfhosted/:name/call', async (req, res) => {
    try {
      const entry = getSelfHostedEntry(req.params.name);
      if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
      const inv = unpackCall(entry, req.body ?? {});
      const result = await executeSelfHostedTool(entry.name, inv);
      if (result.success === false) return res.status(400).json({ success: false, error: result.error });
      deps.appendProvenanceEvent('selfhosted_tool_called', {
        tool: entry.name, method: inv.method, kind: resolveKind(entry), hash: entry.hash,
        executionTimeMs: result.executionTimeMs,
      });
      res.json({ success: true, kind: resolveKind(entry), tool: entry.name, method: inv.method, result: result.result, executionTimeMs: result.executionTimeMs });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/selfhosted/:name/jsonrpc', async (req, res) => {
    try {
      const entry = getSelfHostedEntry(req.params.name);
      if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
      const id = (req.body ?? {})?.id ?? null;
      const method: string = (req.body ?? {})?.method ?? '';
      const params: any = (req.body ?? {})?.params ?? {};

      if (method === 'tools/list' || method === 'capabilities/list' || method === 'agent/card') {
        return res.json({ id, result: artifactCard(entry) });
      }
      if (method === 'ping') return res.json({ id, result: 'pong' });

      if (method === 'tools/call' || method === 'agent/message' || method === 'message/send' || method === 'message') {
        const name = params?.name ?? params?.method ?? null;
        const args = params?.arguments ?? params?.params ?? [];
        const inv = { method: name || (entry.methods?.[0]?.method as string), args: Array.isArray(args) ? args : [args] };
        if (!inv.method) throw new Error(`Artifact "${entry.name}" has no callable method`);
        const result = await executeSelfHostedTool(entry.name, inv);
        if (result.success === false) return res.json({ id, error: { code: -32000, message: result.error } });
        deps.appendProvenanceEvent('selfhosted_tool_called', {
          tool: entry.name, method: inv.method, kind: resolveKind(entry), hash: entry.hash, transport: 'jsonrpc',
          executionTimeMs: result.executionTimeMs,
        });
        return res.json({ id, result: result.result });
      }
      return res.json({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  });

  // --- Loop supervisor API ------------------------------------------------
  router.get('/selfhosted/loops', (_req, res) => {
    res.json({
      success: true,
      intervalMs: LOOP_INTERVAL_MS,
      running: Object.values(loopSupervisors),
      heartbeatCount: loopHeartbeats.length,
      heartbeats: loopHeartbeats.slice(-30),
    });
  });

  router.post('/selfhosted/loops/start', (req, res) => {
    const name = req.body?.name as string | undefined;
    if (name) {
      const r = startLoopSupervisor(name);
      return res.json({ success: r.ok, error: r.error, running: Object.values(loopSupervisors) });
    }
    const n = ensureLoops();
    res.json({ success: true, started: n, running: Object.values(loopSupervisors) });
  });

  router.post('/selfhosted/loops/stop', (req, res) => {
    const name = req.body?.name as string | undefined;
    if (name) {
      const stopped = stopLoopSupervisor(name);
      return res.json({ success: true, stopped, running: Object.values(loopSupervisors) });
    }
    let stopped = 0;
    for (const k of Object.keys(loopTimers)) if (stopLoopSupervisor(k)) stopped++;
    res.json({ success: true, stopped, running: Object.values(loopSupervisors) });
  });

  router.delete('/selfhosted/:name', (req, res) => {
    const safeName = toSafeModuleName(req.params.name);
    const removed = removeSelfHostedTool(safeName);
    if (!removed.success) {
      return res.status(404).json({ success: false, error: removed.error });
    }
    stopLoopSupervisor(safeName);
    const { registryToolRemoved } = deps.onRemoved(safeName, removed.removedFile);
    res.json({ success: true, removed, registryToolRemoved });
  });

  return { router, ensureLoops, startLoop: startLoopSupervisor, loopCount: () => Object.keys(loopSupervisors).length };
}
