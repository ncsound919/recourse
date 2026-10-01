import { describe, it, expect } from 'vitest';
import { kagSidecarHealth, kagReason, kagInfer } from '../src/lib/kagSidecarClient';

describe('kagSidecarClient', () => {
  it('health check returns ok when sidecar is down', async () => {
    const result = await kagSidecarHealth('http://127.0.0.1:59999', 1000);
    expect(result.ok).toBeFalsy();
  });

  it('reason returns error when sidecar is down', async () => {
    const result = await kagReason('test query', { base: 'http://127.0.0.1:59999', timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('infer returns error when sidecar is down', async () => {
    const result = await kagInfer('subject', 'predicate', undefined, { base: 'http://127.0.0.1:59999', timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
