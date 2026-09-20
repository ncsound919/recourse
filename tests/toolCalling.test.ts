import { describe, it, expect, vi } from 'vitest';
import { runToolCallingAgent, parseToolArguments } from '../src/lib/toolCalling.js';
import type { AgentToolRegistry, AgentToolResult, AgentToolSpec } from '../src/lib/agentTools.js';

const SPEC: AgentToolSpec = {
  name: 'system_status',
  description: 'System status',
  parameters: { type: 'object', properties: {} },
  source: 'system',
  target: 'status',
};

function registry(invoke?: (name: string, args: Record<string, unknown>) => Promise<AgentToolResult>): AgentToolRegistry & { invoke: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(invoke ?? (async (name: string) => ({ ok: true, result: { ran: name }, source: 'system' })));
  return {
    list: async () => [SPEC],
    invoke: fn,
  } as any;
}

const toolTurn = (name = 'system_status', args = '{}') => ({
  ok: true as const,
  status: 'online' as const,
  model: 'minicpm5-2b',
  latencyMs: 1,
  content: null,
  finishReason: 'tool_calls',
  toolCalls: [{ id: 'call_1', type: 'function' as const, function: { name, arguments: args } }],
});

const finalTurn = (content = 'final answer') => ({
  ok: true as const,
  status: 'online' as const,
  model: 'minicpm5-2b',
  latencyMs: 1,
  content,
  finishReason: 'stop',
});

describe('runToolCallingAgent', () => {
  it('executes a tool call, feeds the result back, and returns the final answer', async () => {
    let n = 0;
    const chat = vi.fn(async () => (++n === 1 ? toolTurn('system_status', '{"q":"x"}') : finalTurn()));
    const reg = registry();

    const res = await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat, registry: reg, maxTurns: 4 });

    expect(res.status).toBe('completed');
    expect(res.ok).toBe(true);
    expect(res.content).toBe('final answer');
    expect(res.turns).toBe(2);
    expect(res.model).toBe('minicpm5-2b');
    expect(reg.invoke).toHaveBeenCalledWith('system_status', { q: 'x' });
    expect(res.toolInvocations).toHaveLength(1);
    expect(res.toolInvocations[0]).toMatchObject({ name: 'system_status', ok: true, source: 'system' });
    expect(res.transcript.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(String(res.transcript[2].content)).toContain('"ran":"system_status"');
  });

  it('stops at the turn cap when the model keeps calling tools', async () => {
    const chat = vi.fn(async () => toolTurn());
    const res = await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat, registry: registry(), maxTurns: 2 });
    expect(res.status).toBe('max_turns');
    expect(res.ok).toBe(false);
    expect(res.turns).toBe(2);
    expect(res.toolInvocations).toHaveLength(2);
    expect(res.error).toMatch(/2-turn/);
  });

  it('reports offline honestly and does not fabricate an answer', async () => {
    const chat = vi.fn(async () => ({ ok: false, status: 'offline' as const, model: 'minicpm5-2b', latencyMs: 1, content: null, error: 'ECONNREFUSED' }));
    const res = await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat, registry: registry() });
    expect(res.status).toBe('offline');
    expect(res.ok).toBe(false);
    expect(res.content).toBeNull();
    expect(res.error).toMatch(/ECONNREFUSED/);
    expect(res.toolInvocations).toHaveLength(0);
  });

  it('returns an unknown-tool error to the model and keeps going', async () => {
    let n = 0;
    const chat = vi.fn(async () => (++n === 1 ? toolTurn('nope') : finalTurn('recovered')));
    const reg = registry(async () => ({ ok: false, error: 'Unknown tool "nope"', source: 'unknown' }));
    const res = await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat, registry: reg });
    expect(res.status).toBe('completed');
    expect(res.toolInvocations[0]).toMatchObject({ name: 'nope', ok: false });
    expect(String(res.transcript[2].content)).toContain('Unknown tool');
  });

  it('does not invoke a tool when its arguments are invalid JSON', async () => {
    let n = 0;
    const chat = vi.fn(async () => (++n === 1 ? toolTurn('system_status', '{not json') : finalTurn()));
    const reg = registry();
    const res = await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat, registry: reg });
    expect(reg.invoke).not.toHaveBeenCalled();
    expect(res.toolInvocations[0].error).toMatch(/invalid JSON/);
    expect(res.toolInvocations[0].source).toBe('unknown');
  });

  it('forwards temperature and cap the tool result size', async () => {
    const chat = vi.fn(async () => finalTurn());
    await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat, registry: registry(), temperature: 0.2, maxTurns: 1 });
    expect(chat).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ temperature: 0.2, toolChoice: 'auto' }));

    const chatRequired = vi.fn(async () => finalTurn());
    await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat: chatRequired, registry: registry(), toolChoice: 'required' });
    expect(chatRequired).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ toolChoice: 'required' }));

    let n = 0;
    const big = 'x'.repeat(9000);
    const chat2 = vi.fn(async () => (++n === 1 ? toolTurn('system_status', '{}') : finalTurn()));
    const reg2 = registry(async () => ({ ok: true, result: { big }, source: 'system' }));
    const res = await runToolCallingAgent([{ role: 'user', content: 'hi' }], { chat: chat2, registry: reg2, maxToolResultChars: 500 });
    expect(String(res.transcript[2].content)).toContain('truncated');
  });
});

describe('parseToolArguments', () => {
  it('parses objects, wraps arrays, and flags bad JSON', () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ value: { a: 1 } });
    expect(parseToolArguments('')).toEqual({ value: {} });
    expect(parseToolArguments('[1,2]')).toEqual({ value: { args: [1, 2] } });
    expect(parseToolArguments('{bad').error).toMatch(/invalid JSON/);
  });
});

const spec = (name: string, description: string, parameters: Record<string, unknown> = { type: 'object', properties: {} }): AgentToolSpec => ({
  name,
  description,
  parameters,
  source: 'system',
  target: name,
});

const strictSearchSpec = spec('search_docs', 'Search documentation', {
  type: 'object',
  properties: { query: { type: 'string' } },
  required: ['query'],
  additionalProperties: false,
});

function multiRegistry(specs: AgentToolSpec[]) {
  const invoke = vi.fn(async () => ({ ok: true, result: { ran: true }, source: 'system' }));
  return { list: async () => specs, invoke } as any;
}

describe('runToolCallingAgent — tool shortlist, search meta, repair', () => {
  it('exposes only task-relevant tools plus the search meta-tool', async () => {
    const reg = multiRegistry([
      spec('get_weather', 'Get the current weather for a city'),
      spec('send_email', 'Send an email to a recipient'),
      spec('search_docs', 'Search documentation'),
    ]);
    let seenNames: string[] = [];
    const chat = vi.fn(async (_m: any, o: any) => {
      if (o?.tools) seenNames = o.tools.map((t: any) => t.function.name);
      return finalTurn('done');
    });
    const res = await runToolCallingAgent([{ role: 'user', content: 'What is the weather in Paris?' }], { chat, registry: reg });
    expect(res.status).toBe('completed');
    expect(seenNames).toContain('get_weather');
    expect(seenNames).toContain('agent_search_tools');
    expect(seenNames).not.toContain('send_email');
  });

  it('expands the tool set when the model calls agent_search_tools', async () => {
    const reg = multiRegistry([
      spec('get_weather', 'Get the current weather for a city'),
      spec('send_email', 'Send an email to a recipient'),
    ]);
    const toolsPerTurn: string[][] = [];
    let n = 0;
    const chat: any = vi.fn(async (_m: any, o: any) => {
      if (o?.tools) toolsPerTurn.push(o.tools.map((t: any) => t.function.name));
      n += 1;
      if (n === 1) {
        return {
          ok: true, status: 'online', model: 't', latencyMs: 1, content: null, finishReason: 'tool_calls',
          toolCalls: [{ id: 'c1', type: 'function', function: { name: 'agent_search_tools', arguments: '{"query":"email"}' } }],
        };
      }
      return finalTurn('done');
    });
    const res = await runToolCallingAgent([{ role: 'user', content: 'do something vague' }], { chat, registry: reg });
    expect(res.status).toBe('completed');
    expect(res.toolInvocations[0]).toMatchObject({ name: 'agent_search_tools', ok: true, source: 'meta' });
    expect(toolsPerTurn[1]).toContain('send_email');
  });

  it('repairs malformed arguments with one off-cap call and does not count it malformed', async () => {
    const reg = multiRegistry([strictSearchSpec]);
    let n = 0;
    const chat = vi.fn(async (_m: any, o: any) => {
      n += 1;
      if (n === 1) return toolTurn('search_docs', '{bad json');
      if (o?.json) return finalTurn('{"query":"fixed"}'); // repair call
      return finalTurn('done');
    });
    const res = await runToolCallingAgent([{ role: 'user', content: 'search docs' }], { chat, registry: reg, maxTurns: 3 });
    expect(reg.invoke).toHaveBeenCalledWith('search_docs', { query: 'fixed' });
    expect(res.malformed).toBe(0);
  });

  it('normalizes aliased argument keys before invoking', async () => {
    const reg = multiRegistry([strictSearchSpec]);
    let n = 0;
    const chat = vi.fn(async () => (++n === 1 ? toolTurn('search_docs', '{"q":"hello"}') : finalTurn('done')));
    await runToolCallingAgent([{ role: 'user', content: 'search docs' }], { chat, registry: reg });
    expect(reg.invoke).toHaveBeenCalledWith('search_docs', { query: 'hello' });
  });

  it('counts a malformed call when repair is disabled', async () => {
    const reg = multiRegistry([strictSearchSpec]);
    let n = 0;
    const chat = vi.fn(async () => (++n === 1 ? toolTurn('search_docs', '{bad') : finalTurn('done')));
    const res = await runToolCallingAgent([{ role: 'user', content: 'search docs' }], { chat, registry: reg, repairArgs: false });
    expect(reg.invoke).not.toHaveBeenCalled();
    expect(res.malformed).toBe(1);
  });

  it('gates mutating tools on authorization', async () => {
    const mutatingSpec: AgentToolSpec = {
      name: 'delete_thing',
      description: 'Delete a thing',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      source: 'route',
      target: 'DELETE /thing',
      mutating: true,
    };
    const reg = multiRegistry([mutatingSpec]);

    let n = 0;
    const deniedChat = vi.fn(async () => (++n === 1 ? toolTurn('delete_thing', '{}') : finalTurn('done')));
    const denied = await runToolCallingAgent([{ role: 'user', content: 'delete thing' }], { chat: deniedChat, registry: reg, authorized: false });
    expect(reg.invoke).not.toHaveBeenCalled();
    expect(denied.toolInvocations[0]).toMatchObject({ name: 'delete_thing', ok: false });
    expect(denied.toolInvocations[0].error).toMatch(/requires mutation authorization/);

    n = 0;
    const allowedChat = vi.fn(async () => (++n === 1 ? toolTurn('delete_thing', '{}') : finalTurn('done')));
    await runToolCallingAgent([{ role: 'user', content: 'delete thing' }], { chat: allowedChat, registry: reg, authorized: true });
    expect(reg.invoke).toHaveBeenCalledWith('delete_thing', {});
  });

  it('gates a mutating tool even when it was not in the shortlist', async () => {
    const readSpec = spec('read_thing', 'Read a thing');
    const mutatingSpec: AgentToolSpec = {
      name: 'delete_thing',
      description: 'Delete a thing',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      source: 'route',
      target: 'DELETE /thing',
      mutating: true,
    };
    const reg = multiRegistry([readSpec, mutatingSpec]);
    let n = 0;
    const chat = vi.fn(async () => (++n === 1 ? toolTurn('delete_thing', '{}') : finalTurn('done')));
    // limit 1 + no search meta so only read_thing is shortlisted; the model still
    // calls the mutating tool by name and must be refused.
    const res = await runToolCallingAgent([{ role: 'user', content: 'read thing' }], {
      chat, registry: reg, authorized: false, toolLimit: 1, toolSearch: false,
    });
    expect(reg.invoke).not.toHaveBeenCalled();
    expect(res.toolInvocations[0]).toMatchObject({ name: 'delete_thing', ok: false });
    expect(res.toolInvocations[0].error).toMatch(/requires mutation authorization/);
  });
});
