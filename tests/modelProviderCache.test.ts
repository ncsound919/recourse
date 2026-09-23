import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { chatCompleteProfile, clearCompletionCache, completionCacheSnapshot } from '../src/lib/modelProvider';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => '',
  } as unknown as Response;
}

let chatCalls = 0;

beforeEach(() => {
  clearCompletionCache();
  chatCalls = 0;
  process.env.API_MODEL_BASE_URL = 'http://cache-test.local/v1';
  process.env.API_MODEL_NAME = 'test-model';
  process.env.API_MODEL_API_KEY = 'k';
  delete process.env.MODEL_CACHE_DISABLED;
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url);
    if (u.endsWith('/models')) return jsonResponse({ data: [] });
    if (u.includes('/chat/completions')) {
      chatCalls += 1;
      return jsonResponse({
        choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 1 },
      });
    }
    return jsonResponse({}, 404);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_MODEL_BASE_URL;
  delete process.env.API_MODEL_NAME;
  delete process.env.API_MODEL_API_KEY;
  delete process.env.MODEL_CACHE_DISABLED;
});

const messages = [{ role: 'user' as const, content: 'write a fibonacci function' }];

describe('modelProvider completion cache (P0.3)', () => {
  it('serves the second identical completion from cache with no second model call', async () => {
    const first = await chatCompleteProfile('api', messages);
    expect(first.ok).toBe(true);
    expect(first.cached).toBeFalsy();
    const second = await chatCompleteProfile('api', messages);
    expect(second.ok).toBe(true);
    expect(second.cached).toBe(true);
    expect(second.content).toBe('hello');
    expect(chatCalls).toBe(1); // second call never hit the network
  });

  it('honors the per-call bypass', async () => {
    await chatCompleteProfile('api', messages, { cache: false });
    await chatCompleteProfile('api', messages, { cache: false });
    expect(chatCalls).toBe(2);
  });

  it('honors the global kill-switch', async () => {
    process.env.MODEL_CACHE_DISABLED = '1';
    clearCompletionCache();
    await chatCompleteProfile('api', messages);
    await chatCompleteProfile('api', messages);
    expect(chatCalls).toBe(2);
    expect(completionCacheSnapshot().disabled).toBe(true);
  });
});
