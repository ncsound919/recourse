import { describe, it, expect } from 'vitest';
import {
  initOssTracer,
  getOssTracerStatus,
  startOssSpan,
  endOssSpan,
  withOssSpan,
} from '../src/lib/tracingOss';

describe('tracingOss', () => {
  it('attempts initialization and returns status', () => {
    const status = initOssTracer({ serviceName: 'test-service' });
    expect(status.configured).toBe(true);
    expect(typeof status.active).toBe('boolean');
    if (!status.active) {
      expect(status.reason).toBeDefined();
    }
  });

  it('returns status', () => {
    initOssTracer({ serviceName: 'test-service' });
    const status = getOssTracerStatus();
    expect(status.configured).toBe(true);
  });

  it('starts and ends a span when active', () => {
    initOssTracer({ serviceName: 'test-service' });
    const span = startOssSpan('test-span', { key: 'value' });
    if (span) {
      endOssSpan(span, { result: 'ok' });
    }
    expect(span === null || typeof span.end === 'function').toBe(true);
  });

  it('runs a function within a span', async () => {
    initOssTracer({ serviceName: 'test-service' });
    const result = await withOssSpan('test-span', async () => {
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('handles errors in withOssSpan', async () => {
    initOssTracer({ serviceName: 'test-service' });
    await expect(
      withOssSpan('test-span', async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
  });
});
