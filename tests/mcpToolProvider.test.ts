import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMcpToolProvider, createMcpServerRegistry, parseMcpServers } from '../src/lib/mcpToolProvider.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function fakeClient(overrides: any = {}) {
  return {
    listTools: vi.fn(async () => ({ tools: [{ name: 'recourse.status', description: 'Live status', inputSchema: { type: 'object', properties: {} } }] })),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: '{"success":true,"value":1}' }] })),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('createMcpToolProvider', () => {
  it('lists tools from an injected client', async () => {
    const provider = createMcpToolProvider({ clientFactory: async () => fakeClient() as any });
    const res = await provider.list();
    expect(res.ok).toBe(true);
    expect(res.tools).toEqual([
      { name: 'recourse.status', description: 'Live status', inputSchema: { type: 'object', properties: {} } },
    ]);
    expect(provider.status().connected).toBe(true);
  });

  it('calls a tool and parses the MCP text content as JSON', async () => {
    const client = fakeClient();
    const provider = createMcpToolProvider({ clientFactory: async () => client as any });
    const res = await provider.call('recourse.status', {});
    expect(client.callTool).toHaveBeenCalledWith({ name: 'recourse.status', arguments: {} });
    expect(res).toEqual({ ok: true, result: { success: true, value: 1 } });
  });

  it('passes through non-JSON tool text and flags isError', async () => {
    const provider = createMcpToolProvider({
      clientFactory: async () => fakeClient({ callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'plain note' }] })) }) as any,
    });
    expect(await provider.call('recourse.status', {})).toEqual({ ok: true, result: 'plain note' });

    const errProvider = createMcpToolProvider({
      clientFactory: async () => fakeClient({ callTool: vi.fn(async () => ({ isError: true, content: [] })) }) as any,
    });
    const err = await errProvider.call('recourse.status', {});
    expect(err.ok).toBe(false);
    expect(err.error).toMatch(/reported an error/);
  });

  it('reports connection failure honestly and honors the retry cooldown', async () => {
    let attempts = 0;
    const provider = createMcpToolProvider({
      clientFactory: async () => { attempts += 1; throw new Error('boom'); },
      retryCooldownMs: 60000,
      timeoutMs: 200,
    });
    const first = await provider.list();
    expect(first.ok).toBe(false);
    expect(first.error).toMatch(/boom/);
    const second = await provider.list();
    expect(second.ok).toBe(false);
    expect(attempts).toBe(1);
    expect(provider.status().connected).toBe(false);
    expect(provider.status().lastError).toMatch(/boom/);
  });

  it('is disabled by RECOURSE_MCP_DISABLED=1 without touching the client', async () => {
    vi.stubEnv('RECOURSE_MCP_DISABLED', '1');
    const factory = vi.fn(async () => fakeClient() as any);
    const provider = createMcpToolProvider({ clientFactory: factory });
    const res = await provider.list();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/disabled/);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe('createMcpServerRegistry (multi-server)', () => {
  const servers = [
    { id: 'alpha', command: 'x' },
    { id: 'beta', command: 'y' },
  ];

  const clientFactoryFor = (server: { id: string }) => async () => ({
    listTools: async () => ({ tools: [{ name: 'ping', description: `${server.id} ping`, inputSchema: { type: 'object', properties: {} } }] }),
    callTool: async () => ({ content: [{ type: 'text', text: `pong-${server.id}` }] }),
    close: async () => {},
  });

  it('namespaces tools by server and dispatches calls', async () => {
    const reg = createMcpServerRegistry({ servers: servers as any, clientFactoryFor: clientFactoryFor as any });
    const list = await reg.list();
    expect(list.ok).toBe(true);
    expect(list.tools.map((t) => t.name).sort()).toEqual(['alpha__ping', 'beta__ping']);

    const res = await reg.call('beta__ping', {});
    expect(res).toEqual({ ok: true, result: 'pong-beta' });
    expect(reg.servers().map((s) => s.id).sort()).toEqual(['alpha', 'beta']);
    expect(reg.statusDetailed().servers).toHaveLength(2);
  });

  it('parses RECOURSE_MCP_SERVERS and rejects junk', () => {
    expect(parseMcpServers('[{"id":"a","command":"cmd","args":["-x"]}]')).toEqual([
      { id: 'a', command: 'cmd', args: ['-x'], cwd: undefined, env: undefined, disabled: false },
    ]);
    expect(parseMcpServers('nope')).toBeNull();
    expect(parseMcpServers('[{"id":"","command":"x"}]')).toBeNull();
  });
});
