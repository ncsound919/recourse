import { describe, it, expect, vi } from 'vitest';
import {
  Tracer,
  parseTraceparent,
  formatTraceparent,
  toOtlpPayload,
  exportOtlp,
  runInSpan,
  currentSpan,
} from '../src/lib/tracing';

describe('trace context', () => {
  it('parses and formats W3C traceparent', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    expect(parseTraceparent(tp)).toEqual({ traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7' });
    expect(parseTraceparent('garbage')).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
  });

  it('links child spans to the parent trace and formats traceparent', () => {
    const tracer = new Tracer({ now: () => 100 });
    const root = tracer.startSpan('root');
    const child = tracer.startSpan('child', { parent: root.context });
    expect(child.context.traceId).toBe(root.context.traceId);
    expect(child.context.parentSpanId).toBe(root.context.spanId);
    expect(formatTraceparent(root)).toBe(`00-${root.context.traceId}-${root.context.spanId}-01`);
  });

  it('propagates the active span through async context', () => {
    expect(currentSpan()).toBeUndefined();
    const tracer = new Tracer();
    const span = tracer.startSpan('request');
    runInSpan(span, () => {
      expect(currentSpan()?.name).toBe('request');
    });
    expect(currentSpan()).toBeUndefined();
  });
});

describe('tracer buffering', () => {
  it('records finished spans with status and bounds the buffer', () => {
    const tracer = new Tracer({ capacity: 2, now: () => 5 });
    for (const name of ['a', 'b', 'c']) {
      const s = tracer.startSpan(name);
      tracer.endSpan(s, { status: 'ok', attributes: { n: name } });
    }
    expect(tracer.count).toBe(2);
    expect(tracer.recent().map((s) => s.name)).toEqual(['b', 'c']);
    expect(tracer.recent()[0].endTimeMs).toBe(5);
    expect(tracer.recent()[0].status).toBe('ok');
  });

  it('marks a span error when an error is recorded', () => {
    const tracer = new Tracer();
    const s = tracer.startSpan('boom');
    tracer.endSpan(s, { error: 'kaboom' });
    expect(s.status).toBe('error');
    expect(s.error).toBe('kaboom');
  });
});

describe('OTLP export', () => {
  it('builds an OTLP/HTTP payload from finished spans', () => {
    const tracer = new Tracer({ now: () => 1000 });
    const s = tracer.startSpan('op', { attributes: { a: 1, b: 'x', c: true } });
    tracer.endSpan(s, { status: 'ok' });
    const payload: any = toOtlpPayload(tracer.recent(), 'recourse-test');
    const rs = payload.resourceSpans[0];
    expect(rs.resource.attributes[0]).toEqual({ key: 'service.name', value: { stringValue: 'recourse-test' } });
    const span = rs.scopeSpans[0].spans[0];
    expect(span.name).toBe('op');
    expect(span.startTimeUnixNano).toBe('1000000000');
    expect(span.status.code).toBe(1);
    const attrs = Object.fromEntries(span.attributes.map((x: any) => [x.key, x.value]));
    expect(attrs.a).toEqual({ intValue: '1' });
    expect(attrs.b).toEqual({ stringValue: 'x' });
    expect(attrs.c).toEqual({ boolValue: true });
  });

  it('reports disabled when no endpoint is configured (and does not fetch)', async () => {
    const fetchImpl = vi.fn();
    const res = await exportOtlp([], { fetchImpl: fetchImpl as unknown as typeof fetch, endpoint: '' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/disabled/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs to the collector and reports the exported count', async () => {
    const tracer = new Tracer();
    tracer.endSpan(tracer.startSpan('x'));
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, init }); return new Response('', { status: 200 }); }) as unknown as typeof fetch;
    const res = await exportOtlp(tracer.recent(), { endpoint: 'http://collector:4318', fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.exported).toBe(1);
    expect(calls[0].url).toBe('http://collector:4318/v1/traces');
    expect(JSON.parse(calls[0].init.body).resourceSpans.length).toBe(1);
  });

  it('surfaces a collector error honestly', async () => {
    const tracer = new Tracer();
    tracer.endSpan(tracer.startSpan('y'));
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const res = await exportOtlp(tracer.recent(), { endpoint: 'http://collector:4318', fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('collector HTTP 500');
  });
});
