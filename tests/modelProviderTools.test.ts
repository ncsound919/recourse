import { describe, it, expect, vi, afterEach } from 'vitest';

async function load() {
  vi.resetModules();
  return import('../src/lib/modelProvider.js');
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const weatherTool = {
  type: 'function' as const,
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city',
    parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  },
};

describe('chatComplete — OpenAI tool calling', () => {
  it('sends tools + tool_choice and ignores response_format for tool turns', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    let chatBody: any;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/models')) return ok({ data: [] });
      chatBody = JSON.parse(String(init?.body));
      return ok({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }] } }] });
    }));

    const m = await load();
    const r = await m.chatComplete([{ role: 'user', content: 'weather in Paris?' }], {
      json: true,
      tools: [weatherTool],
      toolChoice: 'auto',
    });

    expect(chatBody.tools).toEqual([weatherTool]);
    expect(chatBody.tool_choice).toBe('auto');
    expect(chatBody.response_format).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.finishReason).toBe('tool_calls');
    expect(r.content).toBeNull();
    expect(r.toolCalls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
    ]);
  });

  it('round-trips an assistant tool_calls turn plus its tool result', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    let chatBody: any;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/models')) return ok({ data: [] });
      chatBody = JSON.parse(String(init?.body));
      return ok({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'It is 18C in Paris.' } }] });
    }));

    const m = await load();
    const r = await m.chatComplete([
      { role: 'user', content: 'weather in Paris?' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', name: 'get_weather', content: '{"ok":true,"result":{"tempC":18}}' },
    ], { tools: [weatherTool] });

    expect(chatBody.messages[1].tool_calls).toHaveLength(1);
    expect(chatBody.messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect(r.content).toBe('It is 18C in Paris.');
    expect(r.toolCalls).toBeUndefined();
  });

  it('drops malformed tool_calls rather than surfacing a broken call', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/models')) return ok({ data: [] });
      void init;
      return ok({ choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [{ type: 'function' }, { type: 'function', function: { name: 'good' } }] } }] });
    }));
    const m = await load();
    const r = await m.chatComplete([{ role: 'user', content: 'x' }], { tools: [weatherTool] });
    expect(r.ok).toBe(true);
    expect(r.toolCalls).toEqual([{ id: '', type: 'function', function: { name: 'good', arguments: '{}' } }]);
  });

  it('still reports empty content honestly when there are no tool calls', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] });
    }));
    const m = await load();
    const r = await m.chatComplete([{ role: 'user', content: 'x' }]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('model returned empty content');
  });

  it('captures separate reasoning_content when present', async () => {
    vi.stubEnv('API_MODEL_BASE_URL', 'http://api.test/v1');
    vi.stubEnv('RECOURSE_GENERATION_PROFILE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/models')) return ok({ data: [] });
      return ok({ choices: [{ finish_reason: 'stop', message: { content: 'done', reasoning_content: 'thinking...' } }] });
    }));
    const m = await load();
    const r = await m.chatComplete([{ role: 'user', content: 'x' }]);
    expect(r.reasoning).toBe('thinking...');
  });
});
