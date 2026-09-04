import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  setActiveProviderProfile,
  activeProviderProfile,
  providerProfiles,
  providerStatus,
} from '../src/lib/modelProvider';

const ENV = [
  'MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY',
  'LOCAL_MODEL_BASE_URL', 'LOCAL_MODEL_NAME', 'LOCAL_MODEL_API_KEY',
] as const;
let prev: Record<string, string | undefined> = {};
beforeEach(() => {
  prev = {};
  for (const k of ENV) prev[k] = process.env[k];
  process.env.MODEL_BASE_URL = 'https://api.example.test/v1';
  process.env.MODEL_NAME = 'api-model';
  process.env.LOCAL_MODEL_BASE_URL = 'http://localhost:11434/v1';
  process.env.LOCAL_MODEL_NAME = 'qwen-local';
});
afterEach(() => {
  for (const k of ENV) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});

describe('model provider profile switching', () => {
  it('defaults to the api profile and lists both profiles', () => {
    expect(activeProviderProfile()).toBe('api');
    const ps = providerProfiles();
    expect(ps.map((p) => p.id)).toEqual(['local', 'api']);
    const api = ps.find((p) => p.id === 'api')!;
    expect(api.baseUrl).toBe('https://api.example.test/v1');
    expect(api.model).toBe('api-model');
    const local = ps.find((p) => p.id === 'local')!;
    expect(local.baseUrl).toBe('http://localhost:11434/v1');
    expect(local.model).toBe('qwen-local');
  });

  it('switches the live provider endpoint between local and api', () => {
    // api (default): provider resolves to the remote API endpoint.
    expect(providerStatus().baseUrl).toBe('https://api.example.test/v1');
    expect(providerStatus().model).toBe('api-model');

    // switch to local Ollama
    expect(setActiveProviderProfile('local')).toBe('local');
    expect(activeProviderProfile()).toBe('local');
    expect(providerStatus().baseUrl).toBe('http://localhost:11434/v1');
    expect(providerStatus().model).toBe('qwen-local');

    // back to api
    setActiveProviderProfile('api');
    expect(providerStatus().baseUrl).toBe('https://api.example.test/v1');
    expect(providerStatus().model).toBe('api-model');
  });
});
