/**
 * observability.ts — one boot point for the OSS observability modules.
 *
 * `langfuseIntegration`, `tracingOss` and `metricsOss` were each fully
 * implemented, each env-gated to a no-op, and each reachable only from its own
 * test file — so a process configured with `LANGFUSE_*` still traced nothing.
 * This module initialises them once and exports their live status so
 * `/api/recourse/ops/tracing/status` can report what is ACTUALLY initialised
 * rather than whether an env var happens to be set.
 *
 * Every function here is safe to call with nothing configured: each returns an
 * "inactive" status and no-ops.
 */
import { initLangfuse, getLangfuseStatus, flushLangfuse } from './langfuseIntegration';
import { initOssTracer, getOssTracerStatus } from './tracingOss';
import { createOssMetricsRegistry, type OssMetricsRegistry } from './metricsOss';

let metricsRegistry: OssMetricsRegistry | null = null;
let booted = false;

/**
 * Initialise the three OSS integrations from the environment.
 *
 * Idempotent: a second call is a no-op, so a reload cannot stack providers.
 * Never throws — an observability backend that is unreachable must not stop the
 * service from booting.
 */
export function bootObservability(): void {
  if (booted) return;
  booted = true;
  const langfuse = safeCall('langfuse', () => initLangfuse());
  const otel = safeCall('otel', () => initOssTracer());
  const metrics = safeCall('metrics', () => createOssMetricsRegistry());
  metricsRegistry = metrics ?? null;
  console.log(
    `[observability] langfuse=${langfuse?.active ? 'on' : 'off'} ` +
      `otlp=${otel?.active ? 'on' : 'off'} ` +
      `metrics=${metricsRegistry ? 'on' : 'off'}` +
      // Say WHY when something is configured but did not come up. A silent
      // "off" is indistinguishable from "nobody asked for it".
      (langfuse?.configured && !langfuse.active ? ` [langfuse configured but inactive: ${langfuse.reason ?? 'unknown'}]` : ''),
  );
}

/** The prom-client registry, or null when it could not be created. */
export function ossMetrics(): OssMetricsRegistry | null {
  return metricsRegistry;
}

function safeCall<T>(name: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    console.warn(`[observability] ${name} init failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export { getLangfuseStatus, getOssTracerStatus, flushLangfuse };
