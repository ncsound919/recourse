import { describe, it, expect, vi, afterEach } from 'vitest';

// The online cache, active profile, and env-derived config are module state.
// Re-import a fresh module for each test so every branch starts clean.
async function load() {
  vi.resetModules();
  return import('../src/lib/modelProvider.js');
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

type Handler = (url: string, init?: RequestInit) => unknown;
function installFetch(handler: Handler): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: unknown, init?: unknown) => handler(String(url), init as RequestInit));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const msg = (content: string) => [{ role: 'user' as const, content }];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('extractJsonBlock', () => {
  it('returns null for empty / nullish input', async () => {
    const m = await load();
    expect(m.extractJsonBlock(null)).toBeNull();
    expect(m.extractJsonBlock(undefined)).toBeNull();
    expect(m.extractJsonBlock('')).toBeNull();
  });

  it('strips markdown fences and returns the JSON object', async () => {
    const m = await load();
    expect(m.extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(m.extractJsonBlock('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('finds a bare object embedded in prose', async () => {
    const m = await load();
    expect(m.extractJsonBlock('Here you go: {"a":1} done')).toBe('{"a":1}');
  });

  it('picks an array when it opens before an object', async () => {
    const m = await load();
    expect(m.extractJsonBlock('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it('picks the object when it opens before an array closer', async () => {
    const m = await load();
    expect(m.extractJsonBlock('{"a":[1,2]}')).toBe('{"a":[1,2]}');
  });

  it('returns null when there is no JSON delimiter', async () => {
    const m = await load();
    expect(m.extractJsonBlock('plain text only')).toBeNull();
  });

  it('returns null for an unbalanced object', async () => {
    const m = await load();
    expect(m.extractJsonBlock('{"a":1')).toBeNull();
  });

  it('returns null when the block does not parse', async () => {
    const m = await load();
    expect(m.extractJsonBlock('{a:1}')).toBeNull();
  });
});

describe('configuration + profile selection', () => {
  it('detects a configured local endpoint (whitespace is not enough)', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '  http://local.test/v1  ');
    let m = await load();
    expect(m.localModelConfigured()).toBe(true);

    vi.stubEnv('LOCAL_MODEL_BASE_URL', '   ');
    m = await load();
    expect(m.localModelConfigured()).toBe(false);
  });

  it('switches and sanitizes the active profile', async () => {
    const m = await load();
    expect(m.activeProviderProfile()).toBe('api');
    expect(m.setActiveProviderProfile('local')).toBe('local');
    expect(m.activeProviderProfile()).toBe('local');
    expect(m.setActiveProviderProfile('something-else' as any)).toBe('api');
    expect(m.activeProviderProfile()).toBe('api');
  });

  it('auto prefers local when configured and the prompt fits', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    const m = await load();
    expect(m.pickGenerationProfile(msg('short'))).toBe('local');
  });

  it('auto routes oversized prompts to the api profile', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('LOCAL_AUTO_MAX_CHARS', '10');
    const m = await load();
    expect(m.pickGenerationProfile(msg('x'.repeat(50)))).toBe('api');
  });

  it('treats an unknown preference as auto', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'BANANA');
    const m = await load();
    expect(m.pickGenerationProfile(msg('x'))).toBe('local');
  });

  it('forces api even when local is configured', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    const m = await load();
    expect(m.pickGenerationProfile(msg('x'))).toBe('api');
  });

  it('falls back to api when local is forced but unconfigured', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'local');
    const m = await load();
    expect(m.pickGenerationProfile(msg('x'))).toBe('api');
  });

  it('pickProfileForRoute honors each route', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'auto');
    const m = await load();
    expect(m.pickProfileForRoute('api', msg('x'))).toBe('api');
    expect(m.pickProfileForRoute('local', msg('x'))).toBe('local');
    expect(m.pickProfileForRoute('auto', msg('x'))).toBe('local');

    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    const m2 = await load();
    expect(m2.pickProfileForRoute('local', msg('x'))).toBe('api');
  });

  it('lists both profiles with honest local defaults', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    let m = await load();
    let profiles = m.providerProfiles();
    expect(profiles.map((p) => p.id)).toEqual(['api', 'local']);
    expect(profiles[0]).toMatchObject({ label: 'Phoenix Grove', baseUrl: 'http://api.test/v1', model: 'api-model' });
    expect(profiles[1]).toMatchObject({ label: 'Local (not configured)', baseUrl: 'http://127.0.0.1:8000/v1', model: 'no local model' });

    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('LOCAL_MODEL_NAME', 'olmoe');
    m = await load();
    profiles = m.providerProfiles();
    expect(profiles[1]).toMatchObject({ label: 'Local (configured)', baseUrl: 'http://local.test/v1', model: 'olmoe' });
  });
});

describe('checkOnline + providerStatus', () => {
  it('reports false and an honest error when local is not configured', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    const m = await load();
    expect(await m.checkOnline(false, 'local')).toBe(false);
    const status = m.providerStatus('local');
    expect(status.online).toBe(false);
    expect(status.lastError).toMatch(/not configured/);
    // The failed probe is still a probe: checkedAt records when it happened.
    expect(typeof status.checkedAt).toBe('number');
  });

  it('providerStatus omits checkedAt before any probe has run', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    const m = await load();
    const status = m.providerStatus('local');
    expect(status.online).toBe(false);
    expect(status.checkedAt).toBeUndefined();
  });

  it('probes /models, caches the result, and force re-probes', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    let n = 0;
    installFetch(async () => {
      n += 1;
      if (n === 1) return ok({ data: [] });
      throw new Error('down');
    });
    const m = await load();
    expect(await m.checkOnline()).toBe(true);
    expect(m.providerStatus().online).toBe(true);
    expect(m.providerStatus().checkedAt).toBeGreaterThan(0);

    // Cached within the TTL — no second network call.
    expect(await m.checkOnline()).toBe(true);
    expect(n).toBe(1);

    // Force bypasses the cache and records the failure.
    expect(await m.checkOnline(true)).toBe(false);
    expect(n).toBe(2);
    expect(m.providerStatus().lastError).toBe('down');
  });

  it('records an HTTP status in lastError', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    installFetch(async () => new Response('', { status: 503 }));
    const m = await load();
    expect(await m.checkOnline(true)).toBe(false);
    expect(m.providerStatus().lastError).toMatch(/HTTP 503/);
  });

  it('providerStatuses covers both profiles by default', async () => {
    const m = await load();
    const all = m.providerStatuses();
    expect(Object.keys(all).sort()).toEqual(['api', 'local']);
    expect(all.api.online).toBe(false);
    expect(all.local.online).toBe(false);
  });
});

describe('chatComplete — success paths', () => {
  it('posts an OpenAI-compatible request and returns online content', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    vi.stubEnv('API_MODEL_API_KEY', 'secret');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    let chatBody: any;
    installFetch(async (url, init) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      chatBody = JSON.parse(String(init?.body));
      return ok({ choices: [{ message: { content: 'hello back' } }] });
    });
    const m = await load();
    const r = await m.chatComplete(msg('hi'), { temperature: 0.2, json: true });
    expect(r).toMatchObject({ ok: true, status: 'online', model: 'api-model', content: 'hello back' });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(chatBody.model).toBe('api-model');
    expect(chatBody.temperature).toBe(0.2);
    expect(chatBody.response_format).toEqual({ type: 'json_object' });
    expect(chatBody.stream).toBe(false);
  });

  it('omits optional fields when not requested', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    let chatBody: any;
    installFetch(async (url, init) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      chatBody = JSON.parse(String(init?.body));
      return ok({ choices: [{ message: { content: 'x' } }] });
    });
    const m = await load();
    await m.chatComplete(msg('hi'));
    expect(chatBody.temperature).toBeUndefined();
    expect(chatBody.response_format).toBeUndefined();
  });

  it('uses the native Ollama /api/chat shape (num_ctx + think)', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434');
    vi.stubEnv('LOCAL_MODEL_NAME', 'olmo');
    vi.stubEnv('LOCAL_MODEL_NUM_CTX', '2048');
    vi.stubEnv('LOCAL_MODEL_THINKING', '1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'local');
    let chatUrl = '';
    let chatBody: any;
    installFetch(async (url, init) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      chatUrl = url;
      chatBody = JSON.parse(String(init?.body));
      return ok({ message: { content: 'native answer' } });
    });
    const m = await load();
    const r = await m.chatCompleteProfile('local', msg('hi'));
    expect(r.ok).toBe(true);
    expect(r.content).toBe('native answer');
    expect(chatUrl).toBe('http://127.0.0.1:11434/api/chat');
    expect(chatBody.options).toEqual({ num_ctx: 2048, think: true });
  });
});

describe('chatComplete — failure paths', () => {
  it('reports an HTTP error from the chat endpoint', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return new Response('server exploded', { status: 500 });
    });
    const m = await load();
    const r = await m.chatComplete(msg('hi'));
    expect(r.ok).toBe(false);
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/HTTP 500/);
    expect(r.content).toBeNull();
  });

  it('rejects empty content honestly', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: '   ' } }] });
    });
    const m = await load();
    const r = await m.chatComplete(msg('hi'));
    expect(r.ok).toBe(false);
    expect(r.status).toBe('error');
    expect(r.error).toBe('model returned empty content');
  });

  it('reports offline when the endpoint is unreachable', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async () => { throw new Error('ECONNREFUSED'); });
    const m = await load();
    const r = await m.chatComplete(msg('hi'));
    expect(r.ok).toBe(false);
    expect(r.status).toBe('offline');
    expect(r.error).toMatch(/ECONNREFUSED/);
  });

  it('reports a timeout as an error, not offline', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('MODEL_TIMEOUT_MS', '1234');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      const err: any = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const m = await load();
    const r = await m.chatComplete(msg('hi'));
    expect(r.ok).toBe(false);
    expect(r.status).toBe('error');
    expect(r.error).toMatch(/timed out after 1234ms/);
  });

  it('reports offline when local is requested but not configured', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', '');
    const m = await load();
    const r = await m.chatCompleteProfile('local', msg('hi'));
    expect(r.ok).toBe(false);
    expect(r.status).toBe('offline');
    expect(r.model).toBe('');
    expect(r.error).toMatch(/not configured/);
  });
});

describe('chatComplete routing + fallback', () => {
  it('falls back to the api profile when local is offline', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('LOCAL_MODEL_NAME', 'olmoe');
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'local');
    installFetch(async (url) => {
      if (url.includes('local.test')) throw new Error('ECONNREFUSED');
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'api answer' } }] });
    });
    const m = await load();
    const r = await m.chatComplete(msg('hi'));
    expect(r.ok).toBe(true);
    expect(r.model).toBe('api-model');
    expect(r.content).toBe('api answer');
  });

  it('chatCompleteProfile coerces an unknown id to api', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'x' } }] });
    });
    const m = await load();
    const r = await m.chatCompleteProfile('weird' as any, msg('hi'));
    expect(r.model).toBe('api-model');
  });

  it('chatCompleteRoute forces api regardless of local config', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    const touched: string[] = [];
    installFetch(async (url) => {
      touched.push(url);
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'x' } }] });
    });
    const m = await load();
    const r = await m.chatCompleteRoute('api', msg('hi'));
    expect(r.model).toBe('api-model');
    expect(touched.some((u) => u.includes('local.test'))).toBe(false);
  });

  it('chatCompleteRoute auto prefers the configured local profile', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://local.test/v1');
    vi.stubEnv('LOCAL_MODEL_NAME', 'olmoe');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'local x' } }] });
    });
    const m = await load();
    const r = await m.chatCompleteRoute('auto', msg('hi'));
    expect(r.model).toBe('olmoe');
  });
});

describe('usage accounting + sink', () => {
  it('reports provider usage and emits it to the installed sink', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('API_MODEL_NAME', 'api-model');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'hello back' } }], usage: { prompt_tokens: 12, completion_tokens: 34 } });
    });
    const m = await load();
    const events: any[] = [];
    m.setModelUsageSink((u: any) => events.push(u));
    const r = await m.chatComplete(msg('hi'));
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 34, totalTokens: 46, estimated: false });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ profile: 'api', model: 'api-model', promptTokens: 12, completionTokens: 34, estimated: false });
  });

  it('estimates usage when the provider omits it, flagged estimated', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'x'.repeat(40) } }] });
    });
    const m = await load();
    const r = await m.chatComplete(msg('a'.repeat(40)));
    expect(r.usage!.estimated).toBe(true);
    expect(r.usage!.totalTokens).toBe(20); // (40 prompt + 40 output) / 4
  });

  it('parses native Ollama eval counts', async () => {
    vi.stubEnv('LOCAL_MODEL_BASE_URL', 'http://127.0.0.1:11434');
    vi.stubEnv('LOCAL_MODEL_NAME', 'olmo');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'local');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ message: { content: 'native answer' }, prompt_eval_count: 7, eval_count: 11 });
    });
    const m = await load();
    const r = await m.chatCompleteProfile('local', msg('hi'));
    expect(r.usage).toEqual({ promptTokens: 7, completionTokens: 11, totalTokens: 18, estimated: false });
  });

  it('a throwing sink never breaks generation', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    installFetch(async (url) => {
      if (url.endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ message: { content: 'still works' } }] });
    });
    const m = await load();
    m.setModelUsageSink(() => { throw new Error('metering exploded'); });
    const r = await m.chatComplete(msg('hi'));
    expect(r.ok).toBe(true);
    expect(r.content).toBe('still works');
  });
});
