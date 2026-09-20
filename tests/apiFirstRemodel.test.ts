import { describe, it, expect, afterEach } from 'vitest';
import { forgeConfig } from '../src/lib/capabilityForge';
import { getActiveModel } from '../src/dream/mutator';

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe('API-first self-improvement remodel', () => {
  it('forgeConfig defaults to the API provider, never a localhost endpoint', () => {
    delete process.env.FORGE_MODEL_BASE_URL;
    delete process.env.API_MODEL_BASE_URL;
    delete process.env.LOCAL_MODEL_BASE_URL;
    delete process.env.MODEL_BASE_URL;
    const cfg = forgeConfig();
    expect(cfg.baseUrl).toBe('https://api.pgsgrove.com/v1');
    expect(cfg.model).toBe('deepseek-v4-flash-0731');
    expect(cfg.baseUrl).not.toContain('127.0.0.1');
  });

  it('forgeConfig prefers FORGE_* then API_MODEL_*', () => {
    process.env.API_MODEL_BASE_URL = 'https://api.example.test/v1';
    process.env.API_MODEL_NAME = 'api-model';
    const cfg = forgeConfig();
    expect(cfg.baseUrl).toBe('https://api.example.test/v1');
    expect(cfg.model).toBe('api-model');
  });

  it('getActiveModel returns the configured API model, not the qwen default', () => {
    process.env.API_MODEL_NAME = 'deepseek-v4-flash-0731';
    delete process.env.MODEL_NAME;
    expect(getActiveModel()).toBe('deepseek-v4-flash-0731');
  });
});
