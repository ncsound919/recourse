// v5/skilltechBridge.ts — the Skilltech fleet inside the no-LLM pipeline.
//
// Business-Logic-MCP, OG-Glass, Middle-Man and BigBack are wired in as
// UNTRUSTED proposers, verifiers and generators: the kernel decides what to do
// with every answer. An unreachable server is always an honest skip with its
// reason recorded — never a fabricated pass, never a silent omission.

import type { Decider, DeciderContext, Question } from './deciders';

export interface McpCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Structural view of the Recourse MCP server registry (mcpToolProvider). */
export interface McpLike {
  call(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
  servers?(): Array<{ id: string; connected: boolean; lastError?: string; tools: number }>;
}

export interface GateResult {
  gate: string;
  /** true only when the gate actually verified and found nothing wrong. */
  ok: boolean;
  /** Heuristic gates that never issue a verdict (per the tool's own contract). */
  advisory: boolean;
  /** The gate could not run — unverified, with `reason` saying why. */
  skipped: boolean;
  reason?: string;
  evidence?: unknown;
  ms: number;
}

export interface GenResult {
  ok: boolean;
  generator: string;
  untrusted: true;
  via?: 'middleman' | 'direct' | 'stdio';
  artifact?: unknown;
  error?: string;
  ms: number;
}

export interface SkilltechStatus {
  wired: boolean;
  disabled: boolean;
  reason?: string;
  gateway?: { url: string; ok: boolean; services: string[]; error?: string };
  stdio?: Array<{ id: string; connected: boolean; lastError?: string; tools: number }>;
  skips: Array<{ id: string; reason: string }>;
}

export interface GenerateRequest {
  generator: 'bigback' | 'og_glass';
  spec?: Record<string, unknown>;
  materialize?: boolean;
  target_dir?: string;
  tool?: string;
  goal?: string;
  preset_id?: string;
}

export interface SkilltechBridgeOptions {
  mcp?: McpLike | null;
  middlemanUrl?: string;
  bigbackUrl?: string;
  fetchImpl?: typeof fetch;
  onEvent?: (event: string, data: Record<string, unknown>) => void;
  timeoutMs?: number;
  disabled?: boolean;
}

export interface SkilltechBridge {
  status(): Promise<SkilltechStatus>;
  footgunGate(plan: string): Promise<GateResult>;
  uiGate(code: string): Promise<GateResult>;
  runSynthesisGates(input: { name: string; program: string; source: string }): Promise<GateResult[]>;
  generate(req: GenerateRequest): Promise<GenResult>;
  decide(q: Question, ctx: DeciderContext): Promise<string | null>;
}

export const HONEST_SKIPS = [
  { id: 'math-x', reason: 'LLM-routed (/api/verify calls Claude) — never gates the no-LLM kernel' },
  { id: 'bobby-breakdown', reason: 'VS Code extension — not a pipeline surface' },
  { id: 'the-beta-team', reason: 'needs its own built app — honest SKIP' },
  { id: 'truth-chain', reason: 'workspace is empty — nothing to wire' },
];

const NS = '__';
const BL = 'business_logic_mcp';
const OG = 'og_glass';
const OG_GENERATE_TOOLS = ['design_brief', 'generate_ui_kit', 'export_design_markdown', 'decide_design_direction'];

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseJson(v: unknown): any {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function summarize(v: unknown): unknown {
  if (typeof v === 'string') return v.length > 300 ? `${v.slice(0, 300)}…` : v;
  if (v && typeof v === 'object') {
    try {
      const s = JSON.stringify(v);
      return s.length > 600 ? `${s.slice(0, 600)}…` : JSON.parse(s);
    } catch { return String(v); }
  }
  return v;
}

function extractMatches(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const key of ['matches', 'footguns', 'hits', 'results', 'items']) {
      const x = (v as Record<string, unknown>)[key];
      if (Array.isArray(x)) return x;
    }
    for (const key of ['data', 'result']) {
      const x = (v as Record<string, unknown>)[key];
      if (x && typeof x === 'object') {
        const m = extractMatches(x);
        if (m) return m;
      }
    }
  }
  return null;
}

function extractTables(v: unknown): Array<Record<string, unknown>> {
  const p = parseJson(v);
  if (Array.isArray(p)) return p.filter((t) => t && typeof t === 'object') as Array<Record<string, unknown>>;
  if (p && typeof p === 'object') {
    for (const key of ['tables', 'decision_tables', 'list', 'items']) {
      const x = (p as Record<string, unknown>)[key];
      if (Array.isArray(x)) return x.filter((t) => t && typeof t === 'object') as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function tableId(t: Record<string, unknown>): string {
  for (const key of ['id', 'table_id', 'name']) {
    const v = t[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

function pickOutput(v: unknown): string | null {
  const p = parseJson(v);
  if (p === null || p === undefined) return null;
  if (typeof p === 'string') return p;
  if (typeof p === 'number' || typeof p === 'boolean') return JSON.stringify(p);
  if (Array.isArray(p)) return JSON.stringify(p);
  if (typeof p === 'object') {
    for (const key of ['output', 'value', 'result', 'decision', 'chosen']) {
      const x = (p as Record<string, unknown>)[key];
      if (typeof x === 'string') return x;
      if (typeof x === 'number' || typeof x === 'boolean') return JSON.stringify(x);
      if (Array.isArray(x)) return JSON.stringify(x);
    }
  }
  return null;
}

export function createSkilltechBridge(opts: SkilltechBridgeOptions = {}): SkilltechBridge {
  const disabled = opts.disabled === true || process.env.RECOURSE_MCP_DISABLED === '1';
  const timeoutMs = opts.timeoutMs ?? 12000;
  const middleman = (opts.middlemanUrl || process.env.SKILLTECH_MIDDLEMAN_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
  const bigback = (opts.bigbackUrl || process.env.SKILLTECH_BIGBACK_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  const fetchImpl: typeof fetch = opts.fetchImpl ?? ((input, init) => fetch(input as any, init));

  const emit = (event: string, data: Record<string, unknown>): void => {
    try { opts.onEvent?.(event, data); } catch { /* provenance must never break the kernel */ }
  };

  const mcpCall = async (tool: string, args: Record<string, unknown>): Promise<McpCallResult & { ms: number }> => {
    const t0 = Date.now();
    const finish = (r: McpCallResult): McpCallResult & { ms: number } => {
      const ms = Date.now() - t0;
      emit('skilltech_call', { tool, ok: r.ok, ms, ...(r.ok ? {} : { error: r.error ?? 'unknown' }) });
      return { ...r, ms };
    };
    if (disabled) return finish({ ok: false, error: 'skilltech disabled (RECOURSE_MCP_DISABLED=1)' });
    if (!opts.mcp) return finish({ ok: false, error: 'mcp registry not wired' });
    try {
      const r = await opts.mcp.call(tool, args);
      return finish({ ok: r.ok, result: r.result, error: r.error });
    } catch (e) {
      return finish({ ok: false, error: msg(e) });
    }
  };

  const gateResult = (g: GateResult): GateResult => {
    emit('v5_gate_run', { gate: g.gate, ok: g.ok, advisory: g.advisory, skipped: g.skipped, ...(g.reason ? { reason: g.reason } : {}) });
    return g;
  };

  const footgunGate = async (plan: string): Promise<GateResult> => {
    const gate = 'blmcp_check_plan_footguns';
    const r = await mcpCall(`${BL}${NS}check_plan_footguns`, { plan });
    if (!r.ok) {
      return gateResult({ gate, ok: false, advisory: false, skipped: true, reason: r.error ?? 'unavailable', ms: r.ms });
    }
    const matches = extractMatches(parseJson(r.result));
    if (!matches) {
      return gateResult({ gate, ok: false, advisory: false, skipped: true, reason: 'unrecognized response shape', evidence: summarize(r.result), ms: r.ms });
    }
    return gateResult({ gate, ok: matches.length === 0, advisory: true, skipped: false, evidence: { matches: summarize(matches) }, ms: r.ms });
  };

  const uiGate = async (code: string): Promise<GateResult> => {
    const gate = 'og_glass_validate_ui';
    const r = await mcpCall(`${OG}${NS}validate_ui`, { code, include_suggestions: false });
    if (!r.ok) {
      return gateResult({ gate, ok: false, advisory: false, skipped: true, reason: r.error ?? 'unavailable', ms: r.ms });
    }
    const p = parseJson(r.result);
    if (!p || typeof p !== 'object' || typeof (p as Record<string, unknown>).valid !== 'boolean') {
      return gateResult({ gate, ok: false, advisory: false, skipped: true, reason: 'unrecognized response shape', evidence: summarize(r.result), ms: r.ms });
    }
    const pr = p as Record<string, unknown>;
    return gateResult({
      gate,
      ok: pr.valid === true,
      advisory: false,
      skipped: false,
      evidence: { score: pr.score, presetUsed: pr.presetUsed, issues: summarize(pr.issues) },
      ms: r.ms,
    });
  };

  const bigbackGenerate = async (req: GenerateRequest, t0: number): Promise<GenResult> => {
    const generator = 'bigback';
    const path = req.materialize ? '/api/v1/generator/materialize' : '/api/v1/generator/plan';
    const body: Record<string, unknown> = { ...req.spec };
    if (req.materialize) body.target_dir = req.target_dir || 'out';

    let gatewayError: string | undefined;
    if (disabled) {
      gatewayError = 'skilltech disabled (RECOURSE_MCP_DISABLED=1)';
    } else {
      try {
        const res = await fetchImpl(`${middleman}/api/mcp-registry/relay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'bigback', path, body }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = parseJson(await res.json().catch(() => null));
        if (res.ok && data && typeof data === 'object' && (data as any).ok !== false && !(data as any).error) {
          return { ok: true, generator, untrusted: true, via: 'middleman', artifact: (data as any).data ?? data, ms: Date.now() - t0 };
        }
        gatewayError = (data && typeof data === 'object' && (data as any).error) || `relay HTTP ${res.status}`;
      } catch (e) {
        gatewayError = msg(e);
      }
    }

    try {
      const res = await fetchImpl(`${bigback}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = parseJson(await res.json().catch(() => null));
      const dataError = data && typeof data === 'object' ? (data as any).detail ?? (data as any).error : undefined;
      const ok = res.ok && (data as any)?.ok !== false && !dataError;
      if (ok) return { ok: true, generator, untrusted: true, via: 'direct', artifact: data, ms: Date.now() - t0 };
      return {
        ok: false, generator, untrusted: true, via: 'direct',
        error: `gateway: ${gatewayError ?? 'unavailable'}; direct: ${dataError ?? `HTTP ${res.status}`}`,
        ms: Date.now() - t0,
      };
    } catch (e) {
      return {
        ok: false, generator, untrusted: true,
        error: `gateway: ${gatewayError ?? 'unavailable'}; direct: ${msg(e)}`,
        ms: Date.now() - t0,
      };
    }
  };

  const ogGlassGenerate = async (req: GenerateRequest, t0: number): Promise<GenResult> => {
    const generator = 'og_glass';
    const tool = req.tool || (req.goal ? 'design_brief' : 'export_design_markdown');
    if (!OG_GENERATE_TOOLS.includes(tool)) {
      return { ok: false, generator, untrusted: true, error: `unknown og_glass tool "${tool}" (allowed: ${OG_GENERATE_TOOLS.join(', ')})`, ms: Date.now() - t0 };
    }
    const args: Record<string, unknown> = {};
    if (tool === 'design_brief' || tool === 'decide_design_direction') {
      if (!req.goal) return { ok: false, generator, untrusted: true, error: `${tool} requires goal`, ms: Date.now() - t0 };
      args.goal = req.goal;
    } else {
      if (!req.preset_id) return { ok: false, generator, untrusted: true, error: `${tool} requires preset_id`, ms: Date.now() - t0 };
      args.preset_id = req.preset_id;
    }
    const r = await mcpCall(`${OG}${NS}${tool}`, args);
    if (!r.ok) {
      return { ok: false, generator, untrusted: true, error: r.error ?? 'unavailable', ms: Date.now() - t0 };
    }
    const artifact = parseJson(r.result);
    const toolReportedFailure = Boolean(artifact && typeof artifact === 'object' && (artifact as any).ok === false);
    return {
      ok: !toolReportedFailure,
      generator,
      untrusted: true,
      via: 'stdio',
      artifact,
      error: toolReportedFailure ? String((artifact as any).error ?? 'tool reported ok:false') : undefined,
      ms: Date.now() - t0,
    };
  };

  const generate = async (req: GenerateRequest): Promise<GenResult> => {
    const t0 = Date.now();
    const generator = String(req?.generator ?? '');
    if (disabled && req?.generator !== 'bigback') {
      return { ok: false, generator, untrusted: true, error: 'skilltech disabled (RECOURSE_MCP_DISABLED=1)', ms: Date.now() - t0 };
    }
    if (req?.generator === 'bigback') return bigbackGenerate(req, t0);
    if (req?.generator === 'og_glass') return ogGlassGenerate(req, t0);
    return { ok: false, generator, untrusted: true, error: 'unknown generator (allowed: bigback, og_glass)', ms: Date.now() - t0 };
  };

  const status = async (): Promise<SkilltechStatus> => {
    if (disabled) return { wired: false, disabled: true, reason: 'RECOURSE_MCP_DISABLED=1', skips: HONEST_SKIPS };
    if (!opts.mcp) return { wired: false, disabled: false, reason: 'mcp registry not wired', skips: HONEST_SKIPS };
    const stdio = opts.mcp.servers?.() ?? [];
    let gateway: NonNullable<SkilltechStatus['gateway']>;
    try {
      const res = await fetchImpl(`${middleman}/api/mcp-registry`, { signal: AbortSignal.timeout(2000) });
      const data = parseJson(await res.json().catch(() => null));
      const raw = data && typeof data === 'object' ? (data as any).services : null;
      const services = Array.isArray(raw)
        ? raw.map((s: any) => (typeof s === 'string' ? s : s?.name)).filter((s: any): s is string => typeof s === 'string')
        : [];
      gateway = { url: middleman, ok: res.ok, services };
    } catch (e) {
      gateway = { url: middleman, ok: false, services: [], error: msg(e) };
    }
    return { wired: true, disabled: false, gateway, stdio, skips: HONEST_SKIPS };
  };

  const decide = async (q: Question, ctx: DeciderContext): Promise<string | null> => {
    if (disabled || !opts.mcp) return null;
    const designIntent = /\b(design|ui|style|preset|palette|theme|typography|component)\b/i.test(ctx.intent);
    if (designIntent) {
      const r = await mcpCall(`${OG}${NS}decide_design_direction`, { goal: ctx.intent });
      if (!r.ok) return null;
      const p = parseJson(r.result);
      const chosen = p && typeof p === 'object' ? (p as any).chosen : null;
      return typeof chosen === 'string' ? chosen : null;
    }
    const list = await mcpCall(`${BL}${NS}list_decision_tables`, {});
    if (!list.ok) return null;
    const tables = extractTables(list.result);
    if (!tables.length) return null;
    const words = ctx.intent.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const table = tables.find((t) => {
      const id = tableId(t).toLowerCase();
      return id && words.some((w) => id.includes(w));
    });
    if (!table) return null;
    const ev = await mcpCall(`${BL}${NS}evaluate_realtime_decision`, {
      table_id: tableId(table),
      inputs: { input: q.input, intent: ctx.intent },
    });
    if (!ev.ok) return null;
    return pickOutput(ev.result);
  };

  return {
    status,
    footgunGate,
    uiGate,
    runSynthesisGates: async (input) => [await footgunGate(input.source)],
    generate,
    decide,
  };
}

export class SkilltechDecider implements Decider {
  name = 'skilltech';
  private bridge: SkilltechBridge;

  constructor(bridge: SkilltechBridge) {
    this.bridge = bridge;
  }

  async answer(q: Question, ctx: DeciderContext): Promise<string | null> {
    try {
      return await this.bridge.decide(q, ctx);
    } catch {
      return null;
    }
  }
}
