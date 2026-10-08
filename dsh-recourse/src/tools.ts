/**
 * Native Recourse tool surface.
 *
 * The 46 tools live as declarative entries in `catalog.ts`; this module turns
 * that catalog into `ToolDefinition`s. Behavioural parity with the `mcp-recourse`
 * bridge this replaces is the contract -- see `catalog.ts` for the per-tool
 * notes, and `scripts/parity.mjs` for the check that enforces it.
 *
 * ## Why the surface is split into native tools + a dispatcher
 *
 * Every registered tool is a schema the harness ships to the model on *every*
 * request. Measured on this profile, tool schemas were 82% of a 40,244-token
 * first turn, and this plugin alone was 46 of them (~21.5KB of JSON, ~5.4k
 * tokens). That cost is paid whether or not a tool is used, so a 46-tool
 * surface charged ~5.4k tokens to every turn including "what's the status".
 *
 * So the catalog is no longer registered wholesale:
 *   - `NATIVE_TOOL_NAMES` are registered directly -- the handful that daily
 *     work actually calls, each with its real typed schema and projection.
 *   - everything else is reachable through `recourse_call`, a single tool whose
 *     `name` enum lists the whole catalog and whose handler delegates to the
 *     same `ToolDefinition` the native entry would have been.
 *
 * Nothing about behaviour changes: a dispatched call runs the identical
 * `execute`, argument validation, cancellation and projection, because it *is*
 * the same definition. Only the number of schemas the model must carry drops.
 *
 * `TOOL_SPECS` stays complete and unchanged, which keeps `scripts/contract.test.mjs`
 * (spec <-> bridge coverage) and `scripts/parity.mjs` (live bridge comparison)
 * meaningful rather than needing to be weakened to match a smaller surface.
 *
 * ## Why the definitions are structural rather than `defineTool`
 *
 * `defineTool` from `@deepseek-ai/dsh-tools` is the ergonomic path, but it is a
 * runtime import. Every `@deepseek-ai/*` package under
 * `~/.dsh/profiles/node_modules/` was, on this machine, a dangling junction into
 * a deleted source checkout, so a runtime import of a host package cannot be
 * relied upon from this plugin's location. Building `ToolDefinition` structurally
 * keeps the plugin at **zero runtime dependencies** -- the host owns
 * `@deepseek-ai/*`; this file only needs shapes.
 *
 * The cost is that argument validation is ours rather than the host's, which is
 * what `params.ts` exists to pay: `ArgReader.validated()` checks every declared
 * key before any request is built.
 */

import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { RecourseApi } from './api.js';
import { TOOL_SPECS } from './catalog.js';
import { schemaOf } from './params.js';
import { defineTool, renderOutput } from './spec.js';

/**
 * Tools registered as first-class entries, i.e. the ones the model sees a full
 * schema for. Chosen as the set daily work reaches for: where things stand, what
 * exists, the two capability flows, and the memory a session writes back to.
 *
 * Everything else in the catalog stays one `recourse_call` away. Adding a name
 * here costs ~110 tokens on every request, so this list is a budget, not a
 * convenience -- see the header.
 */
export const NATIVE_TOOL_NAMES: readonly string[] = [
  'recourse_status',
  'recourse_registry',
  'recourse_inspect_gene',
  'recourse_selfhosted',
  'recourse_problems',
  'recourse_evolve',
  'recourse_run_forge',
  'recourse_promote',
  'recourse_recall_memory',
  'recourse_benchmark',
  'recourse_slopbench_status',
  'recourse_slopbench_run',
];

/** The one tool that fronts the rest of the catalog. */
export const DISPATCH_TOOL_NAME = 'recourse_call';

/**
 * One line per catalog tool for the dispatcher's description: name and the
 * first sentence of its title/description, which is enough for the model to
 * choose without a per-tool schema.
 */
function catalogMenu(): string {
  return TOOL_SPECS.map((spec) => `- ${spec.name}: ${spec.title}`).join('\n');
}

/**
 * Build the dispatcher.
 *
 * Holds every already-built definition and delegates to the matching one, so a
 * dispatched call is not a re-implementation: it is the same `execute` closure,
 * with the same validation and cancellation semantics.
 */
function buildDispatcher(all: readonly ToolDefinition[]): ToolDefinition {
  const byName = new Map(all.map((def) => [def.name, def]));
  const names = all.map((def) => def.name);

  return {
    name: DISPATCH_TOOL_NAME,
    description:
      'Call any Recourse tool by name. Use this for everything not already ' +
      'offered as its own tool; behaviour is identical to calling that tool ' +
      "directly. Pass the tool's arguments under `args`.\n\nAvailable tools:\n" +
      catalogMenu(),
    parameters: schemaOf({
      name: {
        type: 'string',
        required: true,
        enum: names,
        description: 'Which Recourse tool to call.',
      },
      args: {
        type: 'object',
        description:
          "Arguments for that tool, matching the tool's own parameters. Omit for tools that take none.",
      },
    }),
    output: { schema: {}, render: renderOutput },
    execute: async (rawArgs: unknown, exec: ToolRunContext): Promise<unknown> => {
      const envelope = (rawArgs ?? {}) as { name?: unknown; args?: unknown };
      const name = typeof envelope.name === 'string' ? envelope.name : '';
      const target = byName.get(name);
      if (!target) {
        // Naming the valid set beats letting an unknown name fail opaquely, and
        // it is only ever paid on a wrong call.
        throw new Error(
          `${DISPATCH_TOOL_NAME}: unknown tool "${name}". Valid names: ${names.join(', ')}`,
        );
      }
      const inner = envelope.args === undefined || envelope.args === null ? {} : envelope.args;
      if (typeof inner !== 'object' || Array.isArray(inner)) {
        throw new Error(
          `${DISPATCH_TOOL_NAME}: "args" must be an object, got ${Array.isArray(inner) ? 'array' : typeof inner}`,
        );
      }
      // Delegate: the inner definition validates its own arguments and owns its
      // projection, so a dispatched call cannot drift from a native one.
      return target.execute(inner, exec);
    },
    presentCall: (rawArgs: unknown) => {
      const envelope = (rawArgs ?? {}) as { name?: unknown };
      const inner = typeof envelope.name === 'string' ? byName.get(envelope.name) : undefined;
      return {
        card: 'generic',
        title: inner?.name ?? DISPATCH_TOOL_NAME,
        kind: 'execute',
        rawInput: undefined,
      };
    },
    presentResult: (_args: unknown, result: { content?: unknown; isError?: boolean }) => ({
      card: 'generic',
      title: result.isError === true ? `${DISPATCH_TOOL_NAME} - failed` : DISPATCH_TOOL_NAME,
      content: Array.isArray(result.content) ? result.content : undefined,
    }),
  } as ToolDefinition;
}

/**
 * Build the registered surface: the native subset plus the dispatcher.
 *
 * `buildCatalogDefinitions` is exported separately so tooling (and tests) can
 * reach every definition without registering them.
 */
export function buildCatalogDefinitions(api: RecourseApi, longTimeoutMs: number): ToolDefinition[] {
  return TOOL_SPECS.map((spec) => defineTool(api, spec, longTimeoutMs));
}

/** Build the tool surface for one configured Recourse client. */
export function buildToolDefinitions(api: RecourseApi, longTimeoutMs: number): ToolDefinition[] {
  const all = buildCatalogDefinitions(api, longTimeoutMs);
  const byName = new Map(all.map((def) => [def.name, def]));

  const native = NATIVE_TOOL_NAMES.map((name) => {
    const def = byName.get(name);
    // A native name that is not in the catalog is a build-time mistake: fail
    // loudly here rather than silently registering a smaller surface.
    if (!def) throw new Error(`NATIVE_TOOL_NAMES lists "${name}", which is not in the catalog`);
    return def;
  });

  return [...native, buildDispatcher(all)];
}
