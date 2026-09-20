/**
 * federationTools — exposes signed peer skills (and this node's published skills)
 * from the skill registry to the model's tool loop, so federation actually
 * reaches decision-time tool selection.
 *
 * A federated entry is metadata unless it maps to a live self-hosted tool
 * (`toolName`); when it does, invocation runs that sandboxed tool. Otherwise the
 * honest result is the entry metadata with an explicit "no executable tool" note
 * — never a fabricated execution.
 */
import type { SkillRegistry, SkillRegistryEntry } from './skillRegistry.js';
import { executeSelfHostedTool, getSelfHostedEntry } from './selfHosting.js';
import type { AgentToolProvider } from './agentTools.js';

export interface FederationToolProviderOptions {
  registry: SkillRegistry;
}

const EMPTY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    method: { type: 'string', description: 'Self-hosted method to call, when the skill maps to a live tool.' },
    args: { type: 'array', items: {}, description: 'Positional arguments for that method.' },
  },
  additionalProperties: false,
};

export function createFederationToolProvider(opts: FederationToolProviderOptions): AgentToolProvider {
  const { registry } = opts;

  const entryFor = (id: string): SkillRegistryEntry | undefined => registry.list().find((e) => e.id === id);

  return {
    source: 'federation',

    async list() {
      return registry.list().map((e) => ({
        name: e.name,
        description: (e.description || `Federated skill ${e.name} v${e.version}`) + (e.signature ? ' [signed]' : ''),
        parameters: EMPTY_SCHEMA,
        target: e.id,
        // Executing a mapped self-hosted tool is a state change; metadata reads are not.
        mutating: Boolean(e.toolName),
      }));
    },

    async invoke(target, args) {
      const entry = entryFor(target);
      if (!entry) return { ok: false, error: `unknown federated skill "${target}"` };

      const info = {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        domain: entry.domain,
        toolName: entry.toolName,
        author: entry.author,
        publishedAt: entry.publishedAt,
        signed: Boolean(entry.signature),
      };

      if (entry.toolName && getSelfHostedEntry(entry.toolName)) {
        const method = typeof args.method === 'string' ? args.method : undefined;
        const positional = Array.isArray(args.args) ? args.args : [];
        const res = await executeSelfHostedTool(entry.toolName, { method: method as string, args: positional });
        if (res.success === false) return { ok: false, error: res.error };
        return { ok: true, result: { skill: info, executed: true, result: res.result } };
      }

      return {
        ok: true,
        result: {
          skill: info,
          executed: false,
          note: entry.toolName
            ? `skill maps to "${entry.toolName}", which is not a live self-hosted tool here`
            : 'metadata only — this entry ships no executable source',
        },
      };
    },
  };
}
