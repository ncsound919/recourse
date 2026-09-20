/**
 * mcpToolProvider — lets Recourse's agent loop call MCP tools over a real stdio
 * MCP handshake. Two levels:
 *
 *   createMcpToolProvider()     one server (the repo's mcp-server.ts by default)
 *   createMcpServerRegistry()   N servers from RECOURSE_MCP_SERVERS, namespaced
 *                               as mcp_<serverId>__<tool>
 *
 * Servers are separate stdio processes; each is spawned lazily, cached, and —
 * like every other sidecar client in the repo — reports `ok:false` with the
 * underlying reason when unavailable. It never fabricates a tool list/result.
 *
 * Env:
 *   RECOURSE_MCP_DISABLED=1     -> all MCP tools skipped (honest).
 *   RECOURSE_MCP_SERVERS        -> JSON array of {id,command,args?,cwd?,env?,disabled?}.
 *   RECOURSE_MCP_COMMAND        -> launcher override for the default server.
 *   RECOURSE_MCP_ARGS           -> JSON args array for the default server.
 *   RECOURSE_MCP_CWD            -> working dir (default: repo root).
 *   RECOURSE_MCP_TIMEOUT_MS     -> per-operation timeout (default 15000).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface McpServerConfig {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpClientLike {
  listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }>;
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpToolProviderOptions {
  /** Inject a client (tests). Defaults to a lazy stdio connection. */
  clientFactory?: () => Promise<McpClientLike>;
  /** Server launch config (multi-server registry passes one per server). */
  server?: McpServerConfig;
  /** Per-operation timeout in ms. */
  timeoutMs?: number;
  /** How long a failed connection is remembered before retrying (ms). */
  retryCooldownMs?: number;
}

export interface McpToolProvider {
  list(): Promise<{ ok: boolean; tools: McpToolDef[]; error?: string }>;
  call(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  status(): { connected: boolean; lastError?: string; lastCheckedAt?: number };
  close(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.RECOURSE_MCP_TIMEOUT_MS || 15000);
const DEFAULT_RETRY_COOLDOWN_MS = 30000;

function repoRoot(): string {
  // src/lib -> repo root (dev: tsx server.ts). Built dist falls back to cwd.
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  } catch {
    return process.cwd();
  }
}

function launchFor(server?: McpServerConfig): { command: string; args: string[]; cwd: string; env?: Record<string, string> } {
  if (server) {
    return { command: server.command, args: server.args ?? [], cwd: server.cwd || repoRoot(), env: server.env };
  }
  const cwd = process.env.RECOURSE_MCP_CWD || repoRoot();
  if (process.env.RECOURSE_MCP_COMMAND) {
    let args: string[] = [];
    try {
      const parsed = JSON.parse(process.env.RECOURSE_MCP_ARGS || '[]');
      if (Array.isArray(parsed)) args = parsed.map(String);
    } catch {
      args = [];
    }
    return { command: process.env.RECOURSE_MCP_COMMAND, args, cwd };
  }
  const tsxCli = path.join(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return { command: process.execPath, args: [tsxCli, path.join(cwd, 'mcp-server.ts')], cwd };
}

/** Parse `RECOURSE_MCP_SERVERS` (JSON array). Returns null when unset/invalid. */
export function parseMcpServers(raw: string | undefined = process.env.RECOURSE_MCP_SERVERS): McpServerConfig[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: McpServerConfig[] = [];
    for (const s of parsed) {
      if (!s || typeof s.id !== 'string' || !s.id.trim() || typeof s.command !== 'string' || !s.command.trim()) continue;
      out.push({
        id: s.id.trim(),
        command: s.command.trim(),
        args: Array.isArray(s.args) ? s.args.map(String) : undefined,
        cwd: typeof s.cwd === 'string' ? s.cwd : undefined,
        env: s.env && typeof s.env === 'object' ? s.env as Record<string, string> : undefined,
        disabled: s.disabled === true,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** The configured MCP servers: env list, else the single built-in server. */
export function defaultMcpServers(): McpServerConfig[] {
  const configured = parseMcpServers();
  if (configured) return configured;
  const launch = launchFor();
  return [{ id: 'recourse', command: launch.command, args: launch.args, cwd: launch.cwd }];
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Extract plain text from an MCP tool result's content array. */
function mcpText(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const r = result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  if (Array.isArray(r.content)) {
    const text = r.content
      .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n');
    if (text) {
      try { return JSON.parse(text); } catch { return text; }
    }
  }
  return result;
}

export function createMcpToolProvider(options: McpToolProviderOptions = {}): McpToolProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryCooldownMs = options.retryCooldownMs ?? DEFAULT_RETRY_COOLDOWN_MS;
  let client: McpClientLike | null = null;
  let connecting: Promise<McpClientLike> | null = null;
  let lastError: string | undefined;
  let lastCheckedAt: number | undefined;
  let failedAt = 0;

  const factory = options.clientFactory ?? (async (): Promise<McpClientLike> => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const launch = launchFor(options.server);
    const transport = new StdioClientTransport({
      command: launch.command,
      args: launch.args,
      cwd: launch.cwd,
      stderr: 'pipe',
      env: {
        ...(process.env as Record<string, string>),
        ...launch.env,
        RECOURSE_API_URL: launch.env?.RECOURSE_API_URL || process.env.RECOURSE_API_URL || `http://127.0.0.1:${process.env.PORT || 3050}`,
      },
    });
    const c = new Client({ name: 'recourse-agent', version: '0.1.0' });
    try {
      // Own the connect timeout here so a failure closes the spawned child
      // instead of leaking an orphan process.
      await withTimeout(c.connect(transport), timeoutMs, 'MCP connect');
    } catch (err) {
      try { await c.close(); } catch { /* best effort */ }
      try { await transport.close(); } catch { /* best effort */ }
      throw err;
    }
    return c as unknown as McpClientLike;
  });

  /** Close and forget a client whose transport is broken. */
  const dropClient = async (): Promise<void> => {
    const c = client;
    client = null;
    if (c) { try { await c.close(); } catch { /* best effort */ } }
  };

  const getClient = async (): Promise<McpClientLike> => {
    if (client) return client;
    if (process.env.RECOURSE_MCP_DISABLED === '1') throw new Error('MCP tools disabled (RECOURSE_MCP_DISABLED=1)');
    if (connecting) return connecting;
    if (failedAt && Date.now() - failedAt < retryCooldownMs) {
      throw new Error(lastError || 'MCP server unavailable');
    }
    connecting = (async () => {
      try {
        const c = await factory();
        client = c;
        lastError = undefined;
        return c;
      } catch (err: any) {
        lastError = err?.message || String(err);
        failedAt = Date.now();
        throw err;
      } finally {
        connecting = null;
        lastCheckedAt = Date.now();
      }
    })();
    return connecting;
  };

  return {
    async list() {
      try {
        const c = await getClient();
        const res = await withTimeout(c.listTools(), timeoutMs, 'MCP tools/list');
        const tools: McpToolDef[] = (res?.tools ?? [])
          .filter((t) => t && typeof t.name === 'string')
          .map((t) => ({
            name: t.name,
            description: typeof t.description === 'string' ? t.description : '',
            inputSchema: t.inputSchema && typeof t.inputSchema === 'object'
              ? (t.inputSchema as Record<string, unknown>)
              : { type: 'object', properties: {} },
          }));
        lastError = undefined;
        lastCheckedAt = Date.now();
        return { ok: true, tools };
      } catch (err: any) {
        lastError = err?.message || String(err);
        lastCheckedAt = Date.now();
        failedAt = Date.now();
        await dropClient();
        return { ok: false, tools: [], error: lastError };
      }
    },

    async call(name, args) {
      try {
        const c = await getClient();
        const res = await withTimeout(c.callTool({ name, arguments: args ?? {} }), timeoutMs, `MCP tools/call ${name}`);
        const isError = Boolean(res && typeof res === 'object' && (res as { isError?: boolean }).isError);
        if (isError) return { ok: false, error: `MCP tool ${name} reported an error` };
        return { ok: true, result: mcpText(res) };
      } catch (err: any) {
        lastError = err?.message || String(err);
        lastCheckedAt = Date.now();
        failedAt = Date.now();
        await dropClient();
        return { ok: false, error: lastError };
      }
    },

    status() {
      return { connected: client !== null, lastError, lastCheckedAt };
    },

    async close() {
      // An in-flight connect can still resolve after this call; close whatever
      // it produces too so no child process is left running and no stale client
      // is left looking connected.
      const pending = connecting;
      const c = client;
      client = null;
      if (pending) {
        try { const late = await pending; client = null; try { await late.close(); } catch { /* best effort */ } } catch { /* connect already failed */ }
      }
      if (c) {
        try { await c.close(); } catch { /* best effort */ }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-server registry: several MCP servers, namespaced tool names.
// ---------------------------------------------------------------------------

export interface McpServerStatus {
  id: string;
  connected: boolean;
  lastError?: string;
  tools: number;
}

export interface McpServerRegistry extends McpToolProvider {
  servers(): McpServerStatus[];
  statusDetailed(): { connected: boolean; servers: McpServerStatus[] };
}

export interface McpServerRegistryOptions {
  servers?: McpServerConfig[];
  timeoutMs?: number;
  retryCooldownMs?: number;
  /** Inject a per-server client factory (tests). Return undefined for stdio. */
  clientFactoryFor?: (server: McpServerConfig) => (() => Promise<McpClientLike>) | undefined;
}

/** `serverId__toolName` — namespacing separator (unlikely in ids). */
const NS = '__';

export function safeServerId(id: string): string {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'server';
}

export function createMcpServerRegistry(options: McpServerRegistryOptions = {}): McpServerRegistry {
  const servers = (options.servers ?? defaultMcpServers()).filter((s) => !s.disabled);
  const usedIds = new Set<string>();
  const entries = servers.map((server) => {
    let safeId = safeServerId(server.id);
    while (usedIds.has(safeId)) safeId = `${safeId}_2`;
    usedIds.add(safeId);
    const provider = createMcpToolProvider({
      server,
      timeoutMs: options.timeoutMs,
      retryCooldownMs: options.retryCooldownMs,
      clientFactory: options.clientFactoryFor?.(server),
    });
    return { server, safeId, provider };
  });

  const routeMap = new Map<string, { provider: McpToolProvider; native: string }>();
  const toolCount = new Map<string, number>();

  const listFn = async (): Promise<{ ok: boolean; tools: McpToolDef[]; error?: string }> => {
    if (process.env.RECOURSE_MCP_DISABLED === '1') {
      return { ok: false, tools: [], error: 'MCP tools disabled (RECOURSE_MCP_DISABLED=1)' };
    }
    if (!entries.length) return { ok: true, tools: [] };
    const tools: McpToolDef[] = [];
    const errors: string[] = [];
    const localMap = new Map<string, { provider: McpToolProvider; native: string }>();
    for (const e of entries) {
      const res = await e.provider.list();
      toolCount.set(e.safeId, res.ok ? res.tools.length : 0);
      if (!res.ok) { errors.push(`${e.server.id}: ${res.error}`); continue; }
      for (const t of res.tools) {
        const name = `${e.safeId}${NS}${t.name}`;
        localMap.set(name, { provider: e.provider, native: t.name });
        tools.push({ ...t, name });
      }
    }
    // Swap the routing table atomically (no awaits between clear and set) so a
    // concurrent call() can never observe a half-populated map.
    routeMap.clear();
    for (const [k, v] of localMap) routeMap.set(k, v);
    if (!tools.length && errors.length) return { ok: false, tools: [], error: errors.join('; ') };
    return { ok: true, tools };
  };

  const callFn = async (name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
    if (!routeMap.has(name)) await listFn();
    const hit = routeMap.get(name);
    if (!hit) return { ok: false, error: `unknown MCP tool "${name}"` };
    return hit.provider.call(hit.native, args);
  };

  const statusFn = () => {
    const any = entries.some((e) => e.provider.status().connected);
    const firstErr = entries.map((e) => e.provider.status().lastError).find(Boolean);
    return { connected: any, lastError: firstErr as string | undefined };
  };

  const serversFn = (): McpServerStatus[] =>
    entries.map((e) => ({
      id: e.server.id,
      connected: e.provider.status().connected,
      lastError: e.provider.status().lastError,
      tools: toolCount.get(e.safeId) ?? 0,
    }));

  return {
    list: listFn,
    call: callFn,
    status: statusFn,
    servers: serversFn,
    statusDetailed: () => ({ connected: statusFn().connected, servers: serversFn() }),
    async close() {
      for (const e of entries) {
        try { await e.provider.close(); } catch { /* best effort */ }
      }
    },
  };
}
