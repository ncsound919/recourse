import { describe, it, expect } from 'vitest';
import { createOssMetricsRegistry } from '../src/lib/metricsOss';

describe('metricsOss', () => {
  it('creates a counter and increments it', () => {
    const registry = createOssMetricsRegistry();
    const counter = registry.counter('test_counter', 'A test counter', ['method']);
    counter.inc({ method: 'GET' });
    counter.inc({ method: 'GET' });
    expect(counter).toBeDefined();
  });

  it('creates a gauge and sets it', () => {
    const registry = createOssMetricsRegistry();
    const gauge = registry.gauge('test_gauge', 'A test gauge');
    gauge.set(42);
    expect(gauge).toBeDefined();
  });

  it('creates a histogram and observes values', () => {
    const registry = createOssMetricsRegistry();
    const histogram = registry.histogram('test_histogram', 'A test histogram');
    histogram.observe(0.5);
    histogram.observe(1.5);
    expect(histogram).toBeDefined();
  });

  it('exports Prometheus text format', async () => {
    const registry = createOssMetricsRegistry();
    registry.counter('export_test', 'Test counter').inc();
    const metrics = await registry.getMetrics();
    expect(metrics).toContain('export_test');
    expect(metrics).toContain('# HELP');
    expect(metrics).toContain('# TYPE');
  });

  it('returns the correct content type', () => {
    const registry = createOssMetricsRegistry();
    expect(registry.getContentType()).toContain('text/plain');
  });

  it('resets metrics', async () => {
    const registry = createOssMetricsRegistry();
    registry.counter('reset_test', 'Test counter').inc();
    registry.resetMetrics();
    const metrics = await registry.getMetrics();
    expect(metrics).toContain('reset_test');
  });
});
