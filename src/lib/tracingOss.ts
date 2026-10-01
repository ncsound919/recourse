// src/lib/tracingOss.ts
//
// OpenTelemetry SDK backed tracer. Drop-in replacement for the custom Tracer
// in tracing.ts — same interface, mature OSS implementation.
// W3C trace context, async propagation, and OTLP export via OTel SDK.
// Honest: when OTel initialization fails, reports active:false with the reason.

import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProvider = any;

export interface OssTraceSpan {
  name: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
}

export interface OssTracerStatus {
  active: boolean;
  configured: boolean;
  reason?: string;
}

let tracer: Tracer | null = null;
let status: OssTracerStatus = { active: false, configured: false };

export function initOssTracer(config: { serviceName?: string; otlpEndpoint?: string } = {}): OssTracerStatus {
  const serviceName = config.serviceName ?? 'recourse';
  const otlpEndpoint = config.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  try {
    const contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();

    const provider = new NodeTracerProvider({
      resource: { 'service.name': serviceName },
    } as any) as AnyProvider;

    if (otlpEndpoint) {
      const exporter = new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` });
      provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    }

    provider.register({ contextManager });
    tracer = trace.getTracer(serviceName);
    status = { active: true, configured: true };
  } catch (err: any) {
    const reason = err?.message || err?.toString() || 'initialization failed';
    status = { active: false, configured: true, reason };
  }
  return status;
}

export function getOssTracerStatus(): OssTracerStatus {
  return status;
}

export function startOssSpan(name: string, attrs?: Record<string, string>): Span | null {
  if (!tracer || !status.active) return null;
  return tracer.startSpan(name, { attributes: attrs });
}

export function endOssSpan(span: Span, output?: unknown, error?: Error): void {
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
  if (output !== undefined) {
    span.setAttribute('output', JSON.stringify(output));
  }
  span.end();
}

export function logOssEvent(span: Span, name: string, attrs?: Record<string, string>): void {
  span.addEvent(name, attrs);
}

export function getCurrentOssSpan(): Span | undefined {
  return trace.getActiveSpan();
}

export function withOssSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  if (!tracer || !status.active) return fn(null as any);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.end();
      return result;
    } catch (err: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
      span.end();
      throw err;
    }
  });
}
