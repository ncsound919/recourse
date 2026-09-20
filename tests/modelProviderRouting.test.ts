import { describe, it, expect, vi, afterEach } from 'vitest';

// Fresh module state per test (the online cache is module-level).
async function freshProvider() {
  vi.resetModules();
  return import('../src/lib/modelProvider.js');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const msg = (content: string) => [{ role: 'user' as const, content }];

describe('pickGenerationProfile — local-first for non-agentic generation', () => {
  it('uses api when no local endpoint is configured', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    const m = await freshProvider();
    expect(m.localModelConfigured()).toBe(false);
    expect(m.pickGenerationProfile(msg('hi'))).toBe('api');
  });

  it('prefers local when configured and the prompt fits', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    const m = await freshProvider();
    expect(m.pickGenerationProfile(msg('short prompt'))).toBe('local');
  });

  it('honors explicit local/api preferences', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434/v1');
    let m = await freshProvider();
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    m = await freshProvider();
    expect(m.pickGenerationProfile(msg('hi'))).toBe('api');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'local');
    m = await freshProvider();
    expect(m.pickGenerationProfile(msg('hi'))).toBe('local');
  });

  it('falls back to api when a local profile is requested but not configured', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'local');
    const m = await freshProvider();
    expect(m.pickGenerationProfile(msg('hi'))).toBe('api');
  });

  it('sends oversized prompts to api in auto mode (CPU prefill guard)', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    vi.stubEnv('LOCAL_AUTO_MAX_CHARS', '50');
    const m = await freshProvider();
    expect(m.pickGenerationProfile(msg('x'.repeat(100)))).toBe('api');
    expect(m.pickGenerationProfile(msg('short'))).toBe('local');
  });
});

describe('pickProfileForRoute', () => {
  it('forces api / local and delegates auto to the generation policy', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    const m = await freshProvider();
    expect(m.pickProfileForRoute('api', msg('hi'))).toBe('api');
    expect(m.pickProfileForRoute('local', msg('hi'))).toBe('local');
    expect(m.pickProfileForRoute('auto', msg('hi'))).toBe('local');
  });
});

describe('chatComplete — local-first with honest API fallback', () => {
  it('answers from local when it is online', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.stubEnv('LOCAL_MODEL_NAME', 'local-model');
    vi.stubEnv('LOCAL_MODEL_API_KEY', 'local');
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith('/models')) return jsonResponse({ data: [{ id: 'local-model' }] });
      return jsonResponse({ choices: [{ message: { content: 'local-answer' } }] });
    }));
    const m = await freshProvider();
    const r = await m.chatComplete(msg('hello'));
    expect(r.ok).toBe(true);
    expect(r.model).toBe('local-model');
    expect(r.content).toBe('local-answer');
    expect(calls.some((u) => u.includes('api.test'))).toBe(false); // never touched the API
  });

  it('falls back to the API profile when local is offline, reporting the API model', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434/v1');
    vi.stubEnv('LOCAL_MODEL_NAME', 'local-model');
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('127.0.0.1:11434')) throw new Error('ECONNREFUSED'); // local down
      if (u.endsWith('/models')) return jsonResponse({ data: [{ id: 'api-model' }] });
      return jsonResponse({ choices: [{ message: { content: 'api-answer' } }] });
    }));
    const m = await freshProvider();
    const r = await m.chatComplete(msg('hello'));
    expect(r.ok).toBe(true);
    expect(r.model).toBe('api-model');
    expect(r.content).toBe('api-answer');
  });
});
