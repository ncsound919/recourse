import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initE2b,
  getE2bStatus,
  executeInSandbox,
  checkE2bHealth,
} from '../src/lib/e2bSandbox';

describe('e2bSandbox', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.E2B_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reports inactive when not configured', () => {
    const status = initE2b();
    expect(status.active).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.reason).toContain('not set');
  });

  it('reports active when configured', () => {
    const status = initE2b({ apiKey: 'e2b-test-key' });
    expect(status.active).toBe(true);
    expect(status.configured).toBe(true);
  });

  it('returns error when executing without config', async () => {
    initE2b();
    const result = await executeInSandbox('print("hello")');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('getE2bStatus returns current status', () => {
    initE2b();
    const status = getE2bStatus();
    expect(status.active).toBe(false);
  });

  it('checkE2bHealth reports unhealthy when not configured', async () => {
    initE2b();
    const health = await checkE2bHealth();
    expect(health.ok).toBe(false);
    expect(health.error).toContain('not configured');
  });
});
