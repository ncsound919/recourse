// src/lib/langfuseIntegration.ts
//
// Langfuse LLM observability integration. Wraps the Langfuse SDK to provide
// prompt tracking, tool-call tracing, and evaluation scoring for Recourse's
// agent loops. Honest: when Langfuse is not configured, all operations are
// no-ops that report `active:false` — never fabricated traces.

import Langfuse from 'langfuse';

export interface LangfuseConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
}

export interface TraceEvent {
  name: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface LangfuseStatus {
  active: boolean;
  configured: boolean;
  reason?: string;
}

let client: Langfuse | null = null;
let status: LangfuseStatus = { active: false, configured: false };

export function initLangfuse(config: LangfuseConfig = {}): LangfuseStatus {
  const publicKey = config.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = config.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = config.baseUrl ?? process.env.LANGFUSE_BASE_URL;

  if (!publicKey || !secretKey) {
    status = { active: false, configured: false, reason: 'LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY not set' };
    return status;
  }

  try {
    client = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: baseUrl || 'https://cloud.langfuse.com',
    });
    status = { active: true, configured: true };
  } catch (err: any) {
    status = { active: false, configured: true, reason: err?.message || 'initialization failed' };
  }
  return status;
}

export function getLangfuseStatus(): LangfuseStatus {
  return status;
}

export function createTrace(event: TraceEvent): string | null {
  if (!client || !status.active) return null;
  const trace = client.trace({
    name: event.name,
    input: event.input,
    output: event.output,
    metadata: event.metadata,
    tags: event.tags,
  });
  return trace.id;
}

export function logGeneration(
  traceId: string,
  data: {
    name: string;
    input?: unknown;
    output?: unknown;
    model?: string;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    metadata?: Record<string, unknown>;
  },
): void {
  if (!client || !status.active) return;
  client.generation({
    traceId,
    name: data.name,
    input: data.input,
    output: data.output,
    model: data.model,
    usage: data.usage,
    metadata: data.metadata,
  });
}

export function logToolCall(
  traceId: string,
  data: {
    toolName: string;
    args: unknown;
    result: unknown;
    durationMs: number;
    success: boolean;
  },
): void {
  if (!client || !status.active) return;
  client.span({
    traceId,
    name: `tool:${data.toolName}`,
    input: data.args,
    output: { result: data.result, success: data.success },
    metadata: { durationMs: data.durationMs, toolName: data.toolName },
  });
}

export function scoreTrace(
  traceId: string,
  data: {
    name: string;
    value: number;
    comment?: string;
  },
): void {
  if (!client || !status.active) return;
  client.score({
    traceId,
    name: data.name,
    value: data.value,
    comment: data.comment,
  });
}

export function flushLangfuse(): Promise<void> {
  if (!client || !status.active) return Promise.resolve();
  return client.flushAsync();
}
