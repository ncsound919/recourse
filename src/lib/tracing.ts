/**
 * tracing.ts — lightweight distributed tracing (Wave: observability beyond
 * Prometheus counters).
 *
 * Real spans with W3C trace context (32-hex traceId / 16-hex spanId), parent/
 * child linkage, async context propagation (so a model call made inside a
 * request handler becomes a child span), a bounded in-memory buffer for the UI,
 * and an OTLP/HTTP JSON exporter to a collector when configured. No SDK
 * dependency: the OTLP payload is built here and POSTed with `fetch`.
 *
 * Honest by construction: with no `OTEL_EXPORTER_OTLP_ENDPOINT`, export is
 * reported `disabled` (spans remain in-memory) — it never pretends to have sent
 * anything.
 */
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export type SpanStatus = 'unset' | 'ok' | 'error';

export interface Span {
  name: string;
  context: SpanContext;
  startTimeMs: number;
  endTimeMs?: number;
  attributes: Record<string, unknown>;
  status: SpanStatus;
  error?: string;
}

export interface StartSpanOptions {
  parent?: SpanContext | null;
  attributes?: Record<string, unknown>;
  now?: number;
}

const HEX = '0123456789abcdef';
function randomHex(bytes: number): string {
  const buf = crypto.randomBytes(bytes);
  let out = '';
  for (const b of buf) out += HEX[b >> 4] + HEX[b & 0x0f];
  return out;
}

export function newTraceId(): string {
  return randomHex(16);
}
export function newSpanId(): string {
  return randomHex(8);
}

/** Parse a W3C `traceparent` header (`00-<traceId>-<spanId>-<flags>`). */
export function parseTraceparent(header: string | undefined | null): SpanContext | null {
  if (!header) return null;
  const m = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(String(header).trim());
  if (!m) return null;
  return { traceId: m[1].toLowerCase(), spanId: m[2].toLowerCase() };
}

export function formatTraceparent(span: Span): string {
  return `00-${span.context.traceId}-${span.context.spanId}-01`;
}

// Async context so child spans attach to the span that started the async work.
const als = new AsyncLocalStorage<Span>();

export function currentSpan(): Span | undefined {
  return als.getStore();
}

export function runInSpan<T>(span: Span, fn: () => T): T {
  return als.run(span, fn);
}

export interface TracerOptions {
  capacity?: number;
  now?: () => number;
}

export class Tracer {
  private readonly spans: Span[] = [];
  private readonly capacity: number;
  private readonly now: () => number;

  constructor(opts: TracerOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 500);
    this.now = opts.now ?? (() => Date.now());
  }

  startSpan(name: string, opts: StartSpanOptions = {}): Span {
    const parent = opts.parent ?? null;
    const context: SpanContext = {
      traceId: parent?.traceId ?? newTraceId(),
      spanId: newSpanId(),
      ...(parent ? { parentSpanId: parent.spanId } : {}),
    };
    return {
      name,
      context,
      startTimeMs: opts.now ?? this.now(),
      attributes: { ...opts.attributes },
      status: 'unset',
    };
  }

  endSpan(span: Span, end: { status?: SpanStatus; attributes?: Record<string, unknown>; error?: string } = {}): Span {
    span.endTimeMs = this.now();
    if (end.status) span.status = end.status;
    if (end.attributes) Object.assign(span.attributes, end.attributes);
    if (end.error) {
      span.error = end.error;
      span.status = 'error';
    }
    this.spans.push(span);
    if (this.spans.length > this.capacity) this.spans.splice(0, this.spans.length - this.capacity);
    return span;
  }

  /** Recently finished spans (newest last). */
  recent(limit = 100): Span[] {
    return this.spans.slice(-limit);
  }

  get count(): number {
    return this.spans.length;
  }
}

/** Process-wide tracer. */
export const tracer = new Tracer();

// ---------------------------------------------------------------------------
// OTLP/HTTP JSON export
// ---------------------------------------------------------------------------

function otlpValue(v: unknown): Record<string, unknown> {
  if (typeof v === 'boolean') return { boolValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

function toNano(ms?: number): string {
  return String(Math.max(0, Math.round((ms ?? 0) * 1e6)));
}

/** Build an OTLP/HTTP JSON payload (resourceSpans) from finished spans. */
export function toOtlpPayload(spans: Span[], serviceName = 'recourse'): Record<string, unknown> {
  const finished = spans.filter((s) => s.endTimeMs !== undefined);
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: serviceName } }] },
        scopeSpans: [
          {
            scope: { name: 'recourse.tracing' },
            spans: finished.map((s) => ({
              traceId: s.context.traceId,
              spanId: s.context.spanId,
              ...(s.context.parentSpanId ? { parentSpanId: s.context.parentSpanId } : {}),
              name: s.name,
              kind: 1,
              startTimeUnixNano: toNano(s.startTimeMs),
              endTimeUnixNano: toNano(s.endTimeMs),
              attributes: Object.entries(s.attributes).map(([key, value]) => ({ key, value: otlpValue(value) })),
              status: { code: s.status === 'error' ? 2 : s.status === 'ok' ? 1 : 0 },
            })),
          },
        ],
      },
    ],
  };
}

export interface ExportResult {
  ok: boolean;
  exported: number;
  reason?: string;
}

/** POST finished spans to an OTLP/HTTP collector. `disabled` when unconfigured. */
export async function exportOtlp(
  spans: Span[],
  opts: { endpoint?: string; serviceName?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ExportResult> {
  const endpoint = opts.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const finished = spans.filter((s) => s.endTimeMs !== undefined);
  if (!endpoint) return { ok: false, exported: 0, reason: 'disabled: OTEL_EXPORTER_OTLP_ENDPOINT not set' };
  if (finished.length === 0) return { ok: true, exported: 0 };
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${endpoint.replace(/\/$/, '')}/v1/traces`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toOtlpPayload(finished, opts.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'recourse')),
      signal: controller.signal,
    });
    return res.ok
      ? { ok: true, exported: finished.length }
      : { ok: false, exported: 0, reason: `collector HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, exported: 0, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
