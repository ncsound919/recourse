import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initLangfuse,
  getLangfuseStatus,
  createTrace,
  logGeneration,
  logToolCall,
  scoreTrace,
  flushLangfuse,
} from '../src/lib/langfuseIntegration';

describe('langfuseIntegration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reports inactive when not configured', () => {
    const status = initLangfuse();
    expect(status.active).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.reason).toContain('not set');
  });

  it('reports active when configured', () => {
    const status = initLangfuse({
      publicKey: 'pk-test-123',
      secretKey: 'sk-test-456',
      baseUrl: 'http://localhost:3000',
    });
    expect(status.active).toBe(true);
    expect(status.configured).toBe(true);
  });

  it('returns null trace id when inactive', () => {
    initLangfuse();
    const id = createTrace({ name: 'test' });
    expect(id).toBeNull();
  });

  it('no-ops logGeneration when inactive', () => {
    initLangfuse();
    expect(() => logGeneration('trace-1', { name: 'test', input: 'hi' })).not.toThrow();
  });

  it('no-ops logToolCall when inactive', () => {
    initLangfuse();
    expect(() => logToolCall('trace-1', { toolName: 'test', args: {}, result: {}, durationMs: 10, success: true })).not.toThrow();
  });

  it('no-ops scoreTrace when inactive', () => {
    initLangfuse();
    expect(() => scoreTrace('trace-1', { name: 'quality', value: 0.9 })).not.toThrow();
  });

  it('no-ops flush when inactive', async () => {
    initLangfuse();
    await expect(flushLangfuse()).resolves.toBeUndefined();
  });

  it('getLangfuseStatus returns current status', () => {
    initLangfuse();
    const status = getLangfuseStatus();
    expect(status.active).toBe(false);
  });
});
