import { describe, it, expect } from 'vitest';
import { inspectSidecarHealth, inspectEval, inspectScore } from '../src/lib/inspectSidecarClient';

describe('inspectSidecarClient', () => {
  it('health check returns ok when sidecar is down', async () => {
    const result = await inspectSidecarHealth('http://127.0.0.1:59998', 1000);
    expect(result.ok).toBeFalsy();
  });

  it('eval returns error when sidecar is down', async () => {
    const result = await inspectEval('test-eval', { base: 'http://127.0.0.1:59998', timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('score returns error when sidecar is down', async () => {
    const result = await inspectScore('test-eval', [], { base: 'http://127.0.0.1:59998', timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
