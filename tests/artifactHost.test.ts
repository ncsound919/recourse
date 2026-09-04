import { describe, it, expect } from 'vitest';
import {
  resolveKind,
  artifactCard,
  unpackCall,
  unpackCliArgv,
  handleJsonRpc,
  HostEntryLike,
} from '../src/lib/artifactHost';

const apiEntry: HostEntryLike = {
  name: 'echo_api',
  templateId: 'tpl_art_api',
  domain: 'coding',
  summary: 'Echo',
  methods: [{ method: 'echo', label: 'Echo' }],
  artifactKind: 'api',
};

describe('artifact host transport', () => {
  it('resolves kind with a function default', () => {
    expect(resolveKind(apiEntry)).toBe('api');
    expect(resolveKind({ name: 'x', templateId: 'y', domain: 'math', methods: [] })).toBe('function');
  });

  it('builds a capability card for discovery', () => {
    const card = artifactCard(apiEntry);
    expect(card.kind).toBe('api');
    expect(card.methods).toEqual([{ name: 'echo', description: 'Echo' }]);
  });

  it('unpacks a generic call, defaulting the method to the first whitelisted', () => {
    expect(unpackCall(apiEntry, {})).toEqual({ method: 'echo', args: [] });
    expect(unpackCall(apiEntry, { method: 'echo', args: ['x'] })).toEqual({ method: 'echo', args: ['x'] });
  });

  it('unpacks CLI argv into a method invocation, parsing JSON args', () => {
    expect(unpackCliArgv(apiEntry, ['echo', '"hi"'])).toEqual({ method: 'echo', args: ['hi'] });
    expect(unpackCliArgv(apiEntry, ['echo', '42'])).toEqual({ method: 'echo', args: [42] });
  });

  it('answers MCP/A2A discovery + ping over JSON-RPC', () => {
    const list = handleJsonRpc(apiEntry, { id: 1, method: 'tools/list' }, (m, a) => a);
    expect((list as any).result.kind).toBe('api');
    const ping = handleJsonRpc(apiEntry, { id: 2, method: 'ping' }, (m, a) => a);
    expect((ping as any).result).toBe('pong');
  });

  it('routes a tools/call over JSON-RPC to the execute call', () => {
    const out = handleJsonRpc(apiEntry, { id: 3, method: 'tools/call', params: { arguments: [{ a: 1 }] } }, (method, args) => {
      expect(method).toBe('echo');
      expect(args).toEqual([{ a: 1 }]);
      return { ok: true };
    });
    expect((out as any).result).toEqual({ ok: true });
  });

  it('returns a method-not-found error envelope for unknown RPC methods', () => {
    const out = handleJsonRpc(apiEntry, { id: 4, method: 'nope' }, (m, a) => a) as any;
    expect(out.error.code).toBe(-32601);
  });
});
