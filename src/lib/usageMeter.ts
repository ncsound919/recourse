/**
 * usageMeter — the durable usage + cost ledger that makes Recourse chargeable.
 *
 * Every metered unit of work (a model call, a tool/execution, an authenticated
 * API request) appends one JSONL event with its REAL token counts and a
 * computed cost. Unlike the budget wallet — which enforces a pre-funded cap —
 * the meter is the raw, append-only record of what was actually consumed. The
 * quota layer (`metering.ts`) sums this ledger per billing period; the billing
 * layer (`billing/`) turns it into invoices.
 *
 * Honesty contract: costs are computed from token counts reported by the
 * provider, never invented. When a provider omits usage we fall back to a
 * clearly-labeled estimate (`estimated: true`) derived from character length,
 * so downstream totals can distinguish billed truth from an approximation.
 * Amounts are integer-or-fractional CENTS (the repo's accounting unit); a
 * sub-cent call is kept, not rounded away, because thousands of them add up.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type UsageKind = 'model_call' | 'tool_call' | 'execution' | 'api_request';

export interface UsageEvent {
  id: string;
  at: number;
  tenantId: string;
  apiKeyId?: string;
  kind: UsageKind;
  provider?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cents: number;
  /** True when tokens were estimated (provider omitted usage) rather than reported. */
  estimated: boolean;
  requestId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** Caller-supplied event; id/at/totalTokens/estimated defaulted by `record`. */
export interface UsageEventInput {
  tenantId: string;
  kind: UsageKind;
  apiKeyId?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cents?: number;
  estimated?: boolean;
  at?: number;
  id?: string;
  requestId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageFilter {
  tenantId?: string;
  apiKeyId?: string;
  kind?: UsageKind;
  model?: string;
  since?: number;
  until?: number;
}

export interface UsageSummary {
  events: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cents: number;
  estimatedEvents: number;
  /** Oldest/newest event timestamps included in the summary (undefined if empty). */
  firstAt?: number;
  lastAt?: number;
}

export interface UsageBreakdown {
  key: string;
  summary: UsageSummary;
}

const PRICE_TABLE_ENV = 'RECOURSE_MODEL_PRICES_JSON';

export interface ModelPrice {
  /** Cents per one million input (prompt) tokens. */
  inputCentsPerMTok: number;
  /** Cents per one million output (completion) tokens. */
  outputCentsPerMTok: number;
}

/** Cents/MTok. Conservative public list prices; override with
 *  RECOURSE_MODEL_PRICES_JSON='{"model":{"inputCentsPerMTok":...,"...":...}}'. */
export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  default: { inputCentsPerMTok: 14, outputCentsPerMTok: 28 },
  'deepseek-v4-flash-0731': { inputCentsPerMTok: 14, outputCentsPerMTok: 28 },
  'deepseek-v4-flash': { inputCentsPerMTok: 14, outputCentsPerMTok: 28 },
  'deepseek-v4.1-flash': { inputCentsPerMTok: 14, outputCentsPerMTok: 28 },
  olmoe: { inputCentsPerMTok: 0, outputCentsPerMTok: 0 },
};

function configuredPriceTable(): Record<string, ModelPrice> {
  const raw = process.env[PRICE_TABLE_ENV];
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, ModelPrice> = {};
    for (const [model, price] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof price !== 'object' || price === null) continue;
      const p = price as Record<string, unknown>;
      const inC = Number(p.inputCentsPerMTok);
      const outC = Number(p.outputCentsPerMTok);
      if (!Number.isFinite(inC) || !Number.isFinite(outC)) continue;
      out[model] = { inputCentsPerMTok: inC, outputCentsPerMTok: outC };
    }
    return out;
  } catch {
    return {};
  }
}

/** Resolve the price for a model, honoring env overrides then the built-ins. */
export function priceForModel(model: string | undefined, table?: Record<string, ModelPrice>): ModelPrice {
  const merged = { ...DEFAULT_MODEL_PRICES, ...configuredPriceTable(), ...table };
  if (model && merged[model]) return merged[model];
  return merged.default;
}

/** Round to 6 decimals — a cent has 6 sub-cent digits of headroom here. */
export function roundCents(cents: number): number {
  return Math.round(cents * 1_000_000) / 1_000_000;
}

/** Cost in cents for a token count under a price. Never negative. */
export function tokenCostCents(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  const inTok = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const outTok = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  const cents = (inTok / 1_000_000) * price.inputCentsPerMTok + (outTok / 1_000_000) * price.outputCentsPerMTok;
  return roundCents(cents);
}

/** Character-based token estimate (~4 chars/token) used only when a provider
 *  omits real usage. Always paired with `estimated: true` at the call site. */
export function estimateTokensFromText(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(0, Math.round(text.length / 4));
}

export function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

export function usageLedgerFile(): string {
  return process.env.RECOURSE_USAGE_LEDGER_FILE || path.join(process.cwd(), 'data', 'usage-ledger.jsonl');
}

/** Parse a JSONL usage ledger, skipping malformed lines (never throws). */
export function readUsage(file: string): UsageEvent[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    const out: UsageEvent[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as UsageEvent;
        if (e && typeof e === 'object' && typeof e.at === 'number') out.push(e);
      } catch {
        // corrupt line — skip; the ledger is append-only and must stay readable
      }
    }
    return out;
  } catch {
    return [];
  }
}

function inFilter(e: UsageEvent, f: UsageFilter): boolean {
  if (f.tenantId !== undefined && e.tenantId !== f.tenantId) return false;
  if (f.apiKeyId !== undefined && e.apiKeyId !== f.apiKeyId) return false;
  if (f.kind !== undefined && e.kind !== f.kind) return false;
  if (f.model !== undefined && e.model !== f.model) return false;
  if (f.since !== undefined && e.at < f.since) return false;
  if (f.until !== undefined && e.at >= f.until) return false;
  return true;
}

const EMPTY_SUMMARY: UsageSummary = {
  events: 0,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cents: 0,
  estimatedEvents: 0,
};

/** Pure aggregation over already-read events (testable without any IO). */
export function summarizeUsage(events: readonly UsageEvent[], filter: UsageFilter = {}): UsageSummary {
  const s: UsageSummary = { ...EMPTY_SUMMARY };
  for (const e of events) {
    if (!inFilter(e, filter)) continue;
    s.events += 1;
    s.inputTokens += e.inputTokens || 0;
    s.outputTokens += e.outputTokens || 0;
    s.totalTokens += e.totalTokens || 0;
    s.cents += e.cents || 0;
    s.estimatedEvents += e.estimated ? 1 : 0;
    if (e.kind === 'api_request') s.requests += 1;
    if (s.firstAt === undefined || e.at < s.firstAt) s.firstAt = e.at;
    if (s.lastAt === undefined || e.at > s.lastAt) s.lastAt = e.at;
  }
  s.cents = roundCents(s.cents);
  return s;
}

/** Group matched events by a key extracted from each event, with per-key summaries. */
export function groupUsage(
  events: readonly UsageEvent[],
  keyOf: (e: UsageEvent) => string,
  filter: UsageFilter = {},
): UsageBreakdown[] {
  const groups = new Map<string, UsageEvent[]>();
  for (const e of events) {
    if (!inFilter(e, filter)) continue;
    const k = keyOf(e);
    const arr = groups.get(k);
    if (arr) arr.push(e);
    else groups.set(k, [e]);
  }
  return Array.from(groups.entries())
    .map(([key, evs]) => ({ key, summary: summarizeUsage(evs) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface UsageMeter {
  file(): string;
  events(filter?: UsageFilter): UsageEvent[];
  record(input: UsageEventInput): UsageEvent;
  summary(filter?: UsageFilter): UsageSummary;
  /** Cost-only convenience: total cents matching the filter. */
  totalCents(filter?: UsageFilter): number;
  byTenant(filter?: UsageFilter): UsageBreakdown[];
  byModel(filter?: UsageFilter): UsageBreakdown[];
  byKind(filter?: UsageFilter): UsageBreakdown[];
  byKey(filter?: UsageFilter): UsageBreakdown[];
}

export function openUsageMeter(file = usageLedgerFile()): UsageMeter {
  const record = (input: UsageEventInput): UsageEvent => {
    const inputTokens = Number.isFinite(input.inputTokens) ? Math.max(0, Math.round(input.inputTokens as number)) : 0;
    const outputTokens = Number.isFinite(input.outputTokens) ? Math.max(0, Math.round(input.outputTokens as number)) : 0;
    const event: UsageEvent = {
      id: input.id ?? `u_${crypto.randomBytes(8).toString('hex')}`,
      at: input.at ?? Date.now(),
      tenantId: input.tenantId,
      apiKeyId: input.apiKeyId,
      kind: input.kind,
      provider: input.provider,
      model: input.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cents: roundCents(Number.isFinite(input.cents) ? Math.max(0, input.cents as number) : 0),
      estimated: input.estimated === true,
      requestId: input.requestId,
      description: input.description,
      metadata: input.metadata,
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf-8');
    return event;
  };

  return {
    file: () => file,
    events: (filter) => readUsage(file).filter((e) => inFilter(e, filter ?? {})),
    record,
    summary: (filter) => summarizeUsage(readUsage(file), filter),
    totalCents: (filter) => summarizeUsage(readUsage(file), filter).cents,
    byTenant: (filter) => groupUsage(readUsage(file), (e) => e.tenantId, filter),
    byModel: (filter) => groupUsage(readUsage(file), (e) => e.model ?? '(none)', filter),
    byKind: (filter) => groupUsage(readUsage(file), (e) => e.kind, filter),
    byKey: (filter) => groupUsage(readUsage(file), (e) => e.apiKeyId ?? '(system)', filter),
  };
}
