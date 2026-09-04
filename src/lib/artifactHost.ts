/**
 * Artifact host — runtime transport for self-hosted modules beyond the base
 * `function` adapter.
 *
 * Every self-hosted module already exposes a JSON-callable `execute({method,
 * args})` adapter and a method whitelist. The artifact KIND only changes the
 * *transport* on top of that same call:
 *  - function — direct method call
 *  - cli      — subcommand semantics (argv → method/args)
 *  - api      — mounted HTTP routes per method
 *  - mcp      — JSON-RPC 2.0 tool server (tools/list, tools/call)
 *  - a2a      — Agent-to-Agent JSON-RPC message endpoint + capability card
 *  - loop     — supervised periodic worker calling a `tick` method
 *
 * This module is pure (no fs, no server). All helpers are deterministic and
 * unit-testable; the server wires real module execution + routes on top.
 */

import type { ArtifactKind, ToolDomain } from '../types';

export type { ArtifactKind } from '../types';

export interface HostEntryLike {
  name: string;
  templateId: string;
  domain: ToolDomain | string;
  summary?: string;
  methods?: Array<{ method: string; label?: string }>;
  artifactKind?: ArtifactKind;
}

export function resolveKind(entry: HostEntryLike): ArtifactKind {
  return entry.artifactKind ?? 'function';
}

/** Default method if none supplied (first declared on the whitelist). */
export function defaultMethod(entry: HostEntryLike): string | null {
  const m = entry.methods?.[0]?.method;
  return m || null;
}

/**
 * Human/agent-readable card describing a self-hosted artifact and what it can
 * do. Used for the A2A card, MCP tools/list, and the generic GET inspect route.
 */
export function artifactCard(entry: HostEntryLike) {
  return {
    name: entry.name,
    kind: resolveKind(entry),
    templateId: entry.templateId,
    domain: entry.domain,
    summary: entry.summary ?? '',
    methods: (entry.methods ?? []).map((m) => ({
      name: m.method,
      description: m.label ?? m.method,
    })),
  };
}

/**
 * Turn a generic call envelope ({method?, args?}) into an invocation. The
 * default method is the first whitelisted one (a single-method artifact can be
 * called without naming it). Returns {method,args}.
 */
export function unpackCall(entry: HostEntryLike, body: any): { method: string; args: any[] } {
  const method = body?.method ?? defaultMethod(entry);
  if (!method) throw new Error(`Artifact "${entry.name}" has no callable method`);
  const args = Array.isArray(body?.args) ? body.args : [];
  return { method, args };
}

/** Map CLI argv (after the script) onto a method invocation: [method, ...args]. */
export function unpackCliArgv(entry: HostEntryLike, argv: string[]): { method: string; args: any[] } {
  const [rawMethod, ...rest] = argv;
  const method = rawMethod || defaultMethod(entry);
  if (!method) throw new Error(`Artifact "${entry.name}" requires a subcommand`);
  const args: any[] = [];
  for (const token of rest) {
    try { args.push(JSON.parse(token)); } catch { args.push(token); }
  }
  return { method, args };
}

export type JsonRpcResult =
  | { id: unknown; result: unknown }
  | { id: unknown; error: { code: number; message: string } };

/**
 * A2A-style agent card + message envelope (version-neutral shape alignment).
 *
 * The official A2A spec is Python-first; its JS surface is immature. Rather than
 * claim a protocol version we cannot verify, Recourse exposes its a2a artifacts
 * in the A2A *shape* (name/description/url/skills/capabilities card + a message
 * with role/parts text) so they can be wired into an A2A gateway without faking
 * a version string.
 */
export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
}
export function toA2ACard(entry: HostEntryLike, baseUrl: string) {
  return {
    name: entry.name,
    description: entry.summary ?? `${entry.name} (${resolveKind(entry)})`,
    url: `${baseUrl}/api/recourse/selfhosted/${encodeURIComponent(entry.name)}`,
    version: '1',
    skills: (entry.methods ?? []).map((m) => ({ id: m.method, name: m.label ?? m.method, description: m.label ?? m.method }) as A2ASkill),
    capabilities: { streaming: false, pushNotifications: false, statePropagation: false },
    kind: resolveKind(entry),
  };
}
export interface A2AMessage { role: string; parts: Array<{ type: string; text: string }>; }
/** Build an A2A-shaped agent reply from a text result. */
export function toA2AReply(text: string): A2AMessage {
  return { role: 'agent', parts: [{ type: 'text', text: String(text) }] };
}

/** Handle a JSON-RPC 2.0 request against a self-hosted artifact. Supports the
 * MCP-style discovery/call methods plus a generic `message` for A2A. Returns a
 * response envelope; `call` is invoked synchronously with a JSON-safe result.
 */
export function handleJsonRpc(
  entry: HostEntryLike,
  body: any,
  call: (method: string, args: any[]) => unknown
): JsonRpcResult {
  const id = body?.id ?? null;
  const method: string = body?.method ?? '';
  const params: any = body?.params ?? {};

  try {
    if (method === 'tools/list' || method === 'capabilities/list' || method === 'agent/card') {
      return { id, result: artifactCard(entry) };
    }
    if (method === 'tools/call' || method === 'agent/message' || method === 'message/send' || method === 'message') {
      const name = params?.name ?? params?.method ?? null;
      const args = params?.arguments ?? params?.params ?? [];
      const out = call(name || defaultMethod(entry)!, Array.isArray(args) ? args : [args]);
      return { id, result: out };
    }
    if (method === 'ping') {
      return { id, result: 'pong' };
    }
    return { id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (err: any) {
    return { id, error: { code: -32000, message: err?.message || String(err) } };
  }
}
