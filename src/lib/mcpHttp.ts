/**
 * mcpHttp.ts — a remote (HTTP) MCP transport for Recourse (Wave 3).
 *
 * `mcp-server.ts` is stdio-only, so remote agents must spawn a process. This
 * exposes the same tool surface over JSON-RPC at `POST /api/mcp`, with per-tool
 * scopes: read tools need `read`, mutating tools need `write`. The handler is
 * pure over injected operations + an authorize callback, so it is testable.
 */
import type { A2aOperation } from './a2a';

export interface McpScopeContext {
  /** Scopes the caller presented (derived from auth by the host). */
  scopes: string[];
}

export interface McpHttpDeps {
  operations: Record<string, A2aOperation>;
  authorize(ctx: McpScopeContext, requiredScope: string): boolean;
}

const PROTOCOL_VERSION = '2024-11-05';

interface JsonRpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

export interface McpHttpResult {
  status: number;
  body: unknown;
}

function result(id: unknown, value: unknown): McpHttpResult {
  return { status: 200, body: { jsonrpc: '2.0', id: id ?? null, result: value } };
}

function error(id: unknown, code: number, message: string, httpStatus = 200): McpHttpResult {
  return { status: httpStatus, body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } };
}

function requiredScope(op: A2aOperation): string {
  return op.skill.mutating ? 'write' : 'read';
}

/** Handle one MCP JSON-RPC request over HTTP. Never throws for bad input. */
export async function handleMcpHttp(
  payload: unknown,
  deps: McpHttpDeps,
  callerScopes: string[] = [],
): Promise<McpHttpResult> {
  const req = (payload ?? {}) as JsonRpc;
  const id = req.id ?? null;
  const ctx: McpScopeContext = { scopes: [...callerScopes] };

  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return error(id, -32600, 'invalid JSON-RPC request');
  }

  switch (req.method) {
    case 'initialize':
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: 'recourse', version: '1.0.0' },
        capabilities: { tools: {} },
      });

    case 'ping':
      return result(id, {});

    case 'tools/list':
      return result(id, {
        tools: Object.entries(deps.operations).map(([name, op]) => ({
          name,
          description: op.skill.description,
          inputSchema: { type: 'object', additionalProperties: true },
          annotations: { readOnlyHint: !op.skill.mutating },
        })),
      });

    case 'tools/call': {
      const name = String(req.params?.name ?? '');
      const op = deps.operations[name];
      if (!op) return error(id, -32602, `unknown tool "${name}"`);
      const scope = requiredScope(op);
      if (!deps.authorize(ctx, scope)) {
        return error(id, -32001, `missing required scope "${scope}" for tool "${name}"`, 401);
      }
      try {
        const value = await op.run((req.params?.arguments ?? {}) as Record<string, unknown>);
        return result(id, { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return result(id, { content: [{ type: 'text', text: message }], isError: true });
      }
    }

    default:
      return error(id, -32601, `method not found: ${req.method}`);
  }
}
