import { describe, it, expect } from 'vitest';
import { unstructuredSidecarHealth, unstructuredIngest, unstructuredChunks } from '../src/lib/unstructuredSidecarClient';

describe('unstructuredSidecarClient', () => {
  it('health check returns ok when sidecar is down', async () => {
    const result = await unstructuredSidecarHealth('http://127.0.0.1:59997', 1000);
    expect(result.ok).toBeFalsy();
  });

  it('ingest returns error when sidecar is down', async () => {
    const result = await unstructuredIngest('dGVzdA==', { base: 'http://127.0.0.1:59997', timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('chunks returns error when sidecar is down', async () => {
    const result = await unstructuredChunks('test text', { base: 'http://127.0.0.1:59997', timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
