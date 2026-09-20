/**
 * agentTools — the unified tool surface Recourse exposes to a model's native
 * function calling. Sources, one OpenAI-compatible spec list:
 *
 *   selfhosted  sandboxed self-hosted tools (executeSelfHostedTool)
 *   system      read-only host operations injected by server.ts
 *   mcp         one or more MCP servers (mcpToolProvider; namespaced)
 *   skills      on-disk skill libraries (skills_list/read/file/run)
 *   route       live REST operations from the OpenAPI index (routeTools)
 *   federation  signed peer skills from the skill registry (federationTools)
 *
 * Names are sanitized to the OpenAI function-name charset and mapped back to the
 * source-native identifier at invoke time. `mutating` marks tools that change
 * state so the loop can gate them on mutation authorization. Nothing is
 * fabricated: a missing source is simply absent; unknown/denied tools return
 * `{ok:false,error}` to the model.
 */
import type { OpenAITool } from './modelProvider.js';
import { listSelfHostedEntries, executeSelfHostedTool } from './selfHosting.js';
import type { McpToolProvider } from './mcpToolProvider.js';
import type { SkillToolProvider } from './skillTools.js';

export type AgentToolSource = 'selfhosted' | 'system' | 'mcp' | 'skills' | 'route' | 'federation';

export interface AgentToolSpec {
  /** OpenAI-safe function name (unique within a registry snapshot). */
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  source: AgentToolSource;
  /** Source-native identifier used to invoke. */
  target: string;
  /** True when invoking changes state (gated by mutation authorization). */
  mutating?: boolean;
}

export interface AgentToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  source: AgentToolSource | 'unknown';
}

export interface SystemTool {
  /** Native name; exposed to the model as `system_<name>`. */
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

/** A pluggable source of tools (routes, federation, …). */
export interface AgentToolProvider {
  source: AgentToolSource;
  list(): Promise<Array<{ name: string; description: string; parameters?: Record<string, unknown>; target: string; mutating?: boolean }>>;
  invoke(target: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }>;
}

export interface AgentToolRegistryDeps {
  /** Include sandboxed self-hosted tools (default true). */
  selfHosted?: boolean;
  /** Include read-only host operations. */
  systemTools?: SystemTool[];
  /** Include MCP tools when the provider is reachable. */
  mcp?: McpToolProvider;
  /** Include the on-disk skill libraries (list/read/file/run). */
  skills?: SkillToolProvider;
  /** Additional sources (live routes, federation, …). */
  extra?: AgentToolProvider[];
}

export interface AgentToolRegistry {
  list(): Promise<AgentToolSpec[]>;
  invoke(name: string, args: Record<string, unknown>): Promise<AgentToolResult>;
}

/** OpenAI function names are limited to this charset/length. */
export function sanitizeToolName(raw: string): string {
  const cleaned = String(raw || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned.slice(0, 64) || 'tool';
}

const EMPTY_SCHEMA: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false };

/** Conservative heuristic: does this tool name read like a state change? */
export function isLikelyMutating(name: string): boolean {
  return /(evolve|promote|publish|revert|import|export|execute|forge|remediate|consolidate|build|write|delete|remove|create|update|set_?|run_?|ingest|sync|dispatch|approve|repair|reload|halt|toggle|spend|store|apply|patch|commit|push|reset|clear|mint|transfer|grant|revoke|start|stop|kill|deploy|launch|rate)/i.test(
    String(name || ''),
  );
}

function selfHostedSpec(entry: { name: string; description?: string; summary?: string; methods?: Array<{ method: string; label?: string }> }): AgentToolSpec {
  const methods = (entry.methods ?? []).map((m) => m.method).filter(Boolean);
  return {
    name: sanitizeToolName(`selfhosted_${entry.name}`),
    description:
      (entry.summary || entry.description || `Self-hosted sandboxed tool "${entry.name}".`) +
      (methods.length ? ` Methods: ${methods.join(', ')}.` : ''),
    parameters: {
      type: 'object',
      properties: {
        method: methods.length
          ? { type: 'string', enum: methods, description: 'Which method to call (defaults to the first).' }
          : { type: 'string', description: 'Which method to call.' },
        args: {
          type: 'array',
          items: {},
          description: 'Positional arguments for the method. For a single input object, pass [ {...} ].',
        },
      },
      additionalProperties: false,
    },
    source: 'selfhosted',
    target: entry.name,
    mutating: true,
  };
}

/** Decode a model-supplied argument object into the tool's positional args. */
function decodeSelfHostedArgs(raw: Record<string, unknown>): { method?: string; args: unknown[] } {
  const method = typeof raw.method === 'string' && raw.method.trim() ? raw.method.trim() : undefined;
  if (Array.isArray(raw.args)) return { method, args: raw.args };
  if (raw.args !== undefined) return { method, args: [raw.args] };
  const rest: Record<string, unknown> = { ...raw };
  delete rest.method;
  return { method, args: Object.keys(rest).length ? [rest] : [] };
}

export function createAgentToolRegistry(deps: AgentToolRegistryDeps = {}): AgentToolRegistry {
  const includeSelfHosted = deps.selfHosted !== false;
  const systemTools = deps.systemTools ?? [];
  const mcp = deps.mcp;
  const skills = deps.skills;
  const extras = deps.extra ?? [];

  let specs: AgentToolSpec[] = [];
  const byName = new Map<string, AgentToolSpec>();

  async function refresh(): Promise<void> {
    const next: AgentToolSpec[] = [];
    const seen = new Set<string>();
    const add = (spec: AgentToolSpec) => {
      let name = spec.name.slice(0, 64);
      for (let n = 2; seen.has(name) && n < 1000; n++) {
        const suffix = `_${n}`;
        name = `${spec.name.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
      }
      if (seen.has(name)) name = `${spec.name.slice(0, 52)}_${Date.now().toString(36)}`.slice(0, 64);
      seen.add(name);
      next.push({ ...spec, name });
    };

    if (includeSelfHosted) {
      try {
        for (const entry of listSelfHostedEntries()) add(selfHostedSpec(entry));
      } catch {
        /* a manifest read failure simply omits self-hosted tools (honest) */
      }
    }

    for (const t of systemTools) {
      add({
        name: sanitizeToolName(`system_${t.name}`),
        description: t.description,
        parameters: t.parameters ?? EMPTY_SCHEMA,
        source: 'system',
        target: t.name,
      });
    }

    if (mcp) {
      const listed = await mcp.list();
      if (listed.ok) {
        for (const t of listed.tools) {
          add({
            name: sanitizeToolName(`mcp_${t.name}`),
            description: t.description || `MCP tool ${t.name}.`,
            parameters: t.inputSchema ?? EMPTY_SCHEMA,
            source: 'mcp',
            target: t.name,
            mutating: isLikelyMutating(t.name),
          });
        }
      }
    }

    if (skills) {
      try {
        for (const t of await skills.list()) {
          add({
            name: sanitizeToolName(`skills_${t.name}`),
            description: t.description,
            parameters: t.parameters ?? EMPTY_SCHEMA,
            source: 'skills',
            target: t.target,
            mutating: t.target === 'run',
          });
        }
      } catch {
        /* a skill-library failure simply omits the skills tools (honest) */
      }
    }

    for (const provider of extras) {
      try {
        for (const t of await provider.list()) {
          add({
            name: sanitizeToolName(`${provider.source}_${t.name}`),
            description: t.description,
            parameters: t.parameters ?? EMPTY_SCHEMA,
            source: provider.source,
            target: t.target,
            mutating: t.mutating === true,
          });
        }
      } catch {
        /* a provider failure simply omits that source (honest) */
      }
    }

    specs = next;
    byName.clear();
    for (const s of specs) byName.set(s.name, s);
  }

  return {
    async list() {
      await refresh();
      return specs;
    },

    async invoke(name, args) {
      if (!byName.has(name)) await refresh();
      const spec = byName.get(name);
      const callArgs: Record<string, unknown> = args && typeof args === 'object' ? args : {};
      if (!spec) return { ok: false, error: `Unknown tool "${name}"`, source: 'unknown' };

      if (spec.source === 'selfhosted') {
        const { method, args: positional } = decodeSelfHostedArgs(callArgs);
        try {
          const res = await executeSelfHostedTool(spec.target, { method: method as string, args: positional });
          if (res.success === false) return { ok: false, error: res.error, source: 'selfhosted' };
          return { ok: true, result: res.result, source: 'selfhosted' };
        } catch (err: any) {
          return { ok: false, error: `self-hosted tool threw: ${err?.message || String(err)}`, source: 'selfhosted' };
        }
      }

      if (spec.source === 'system') {
        const tool = systemTools.find((t) => t.name === spec.target);
        if (!tool) return { ok: false, error: `System tool "${spec.target}" is no longer registered`, source: 'system' };
        try {
          return { ok: true, result: await tool.invoke(callArgs), source: 'system' };
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), source: 'system' };
        }
      }

      // mcp
      if (spec.source === 'mcp') {
        if (!mcp) return { ok: false, error: 'MCP provider is not configured', source: 'mcp' };
        const res = await mcp.call(spec.target, callArgs);
        if (!res.ok) return { ok: false, error: res.error || 'MCP call failed', source: 'mcp' };
        return { ok: true, result: res.result, source: 'mcp' };
      }

      // skills
      if (spec.source === 'skills') {
        if (!skills) return { ok: false, error: 'skill library provider is not configured', source: 'skills' };
        const res = await skills.invoke(spec.target, callArgs);
        if (!res.ok) return { ok: false, error: res.error || 'skill tool failed', source: 'skills' };
        return { ok: true, result: res.result, source: 'skills' };
      }

      // extra providers (route, federation, …)
      const provider = extras.find((p) => p.source === spec.source);
      if (!provider) return { ok: false, error: `no provider configured for source "${spec.source}"`, source: spec.source };
      try {
        const res = await provider.invoke(spec.target, callArgs);
        if (!res.ok) return { ok: false, error: res.error || 'tool failed', source: spec.source };
        return { ok: true, result: res.result, source: spec.source };
      } catch (err: any) {
        return { ok: false, error: `provider "${spec.source}" threw: ${err?.message || String(err)}`, source: spec.source };
      }
    },
  };
}

/** Convert agent specs into the OpenAI tool envelope for a chat request. */
export function toOpenAITools(specs: AgentToolSpec[]): OpenAITool[] {
  return specs.map((s) => ({
    type: 'function' as const,
    function: {
      name: s.name,
      description: s.description,
      parameters: s.parameters,
    },
  }));
}
