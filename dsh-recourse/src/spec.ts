/**
 * The tool-definition factory.
 *
 * A `ToolSpec` is a declarative record of one Recourse route: where it lives,
 * what it takes, and how its response is projected down for the model. Turning
 * that into a `ToolDefinition` happens once, here, so all 46 tools share one
 * contract for argument validation, cancellation, output rendering, and card
 * presentation.
 *
 * The design goal is that adding a 47th tool is a table entry, not 30 lines.
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { Json, RecourseApi } from './api.js';
import { RecourseApiError } from './api.js';
import { ArgReader, schemaOf, type ParamTable } from './params.js';

/**
 * Canonical output schema.
 *
 * Unconstrained by design. These tools project whatever Recourse returns, and a
 * narrowing schema would turn a legitimate upstream addition into a harness tool
 * failure. `render` is where the shape the model sees is actually decided.
 */
const OUTPUT_SCHEMA: Record<string, unknown> = {};

/** Render a canonical value as the single text block the model reads. */
export function renderOutput(_args: unknown, value: unknown): ContentBlock[] {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2) ?? 'null';
    } catch {
      text = String(value);
    }
  }
  return [{ type: 'text', text }];
}

/** How a tool presents itself in the transcript. */
export type ToolKind = 'fetch' | 'execute';

/** One tool's declarative definition. */
export interface ToolSpec {
  /** DeepSeek function name: `[A-Za-z0-9_-]`, <= 64 chars. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly kind: ToolKind;
  readonly method: 'GET' | 'POST';
  /** Fixed path, or one built from validated arguments (for query strings). */
  readonly path: string | ((args: ArgReader) => string);
  readonly params?: ParamTable;
  /** Reduce an upstream body to the value the model should see. */
  readonly project: (body: Json, args: ArgReader) => Json;
  /** Whether Recourse treats this route as a guarded mutation. */
  readonly mutating?: boolean;
  /**
   * Marks a POST route that does not change state.
   *
   * Recourse uses POST for several read endpoints (validate_plugin, the whole
   * oncology evidence layer) because they take a request body. Without this flag
   * the parity harness would have to treat every POST as unsafe to call, which
   * would leave a third of the catalog unverified.
   */
  readonly readOnly?: boolean;
  /** Cooperative deadline override; long operations opt into `longTimeoutMs`. */
  readonly long?: boolean;
  /** Append a fail-closed warning to the description when no secret is set. */
  readonly needsSecret?: boolean;
  /**
   * Value to return when the route answers 404.
   *
   * Some Recourse collections legitimately do not exist yet -- a fresh install
   * has no nightly self-improvement report. Without this the tool raises a
   * failure for what is really an answered question with an empty answer, and
   * the model has to guess whether the absence is a bug.
   */
  readonly notFound?: (args: ArgReader) => Json;
}

/**
 * Marker appended to a mutating tool's description when the harness holds no
 * RECOURSE_API_SECRET.
 *
 * Exported because the contract tests assert on its presence, and a test that
 * greps for wording duplicated in two places is a test that rots the moment
 * either copy is edited.
 */
export const NO_SECRET_WARNING = 'RECOURSE_API_SECRET is not configured';

/** Build the failure note shown when a guarded call cannot authenticate. */
export function noSecretNote(): string {
  return (
    `${NO_SECRET_WARNING} in this harness, so this call will fail closed on ` +
    "Recourse's guarded route until it is set."
  );
}

/** Build the structural definition handed to `ctx.tools.register`. */
export function defineTool(api: RecourseApi, spec: ToolSpec, longTimeoutMs: number): ToolDefinition {
  const table = spec.params ?? {};
  const description =
    spec.needsSecret === true && api.hasSecret === false
      ? `${spec.description} NOTE: ${noSecretNote()}`
      : spec.description;

  return {
    name: spec.name,
    description,
    parameters: schemaOf(table),
    output: { schema: OUTPUT_SCHEMA, render: renderOutput },
    timeoutMs: spec.long === true ? longTimeoutMs : undefined,
    execute: async (rawArgs: unknown, exec: ToolRunContext): Promise<unknown> => {
      const args = new ArgReader(spec.name, table, rawArgs);
      // Validate the whole declared table first, so a missing required key fails
      // naming the tool rather than becoming an opaque upstream 400.
      const supplied = args.validated();
      const path = typeof spec.path === 'function' ? spec.path(args) : spec.path;
      const deadline = spec.long === true ? longTimeoutMs : undefined;
      let body: Json;
      try {
        body =
          spec.method === 'POST'
            ? await api.post(path, supplied as Record<string, Json>, exec.signal, deadline)
            : await api.get(path, exec.signal, deadline);
      } catch (error) {
        if (spec.notFound !== undefined && error instanceof RecourseApiError && error.status === 404) {
          return spec.notFound(args);
        }
        throw error;
      }
      return spec.project(body, args);
    },
    presentCall: (rawArgs: unknown) => {
      let salient: unknown;
      try {
        salient = new ArgReader(spec.name, table, rawArgs ?? {}).salient();
      } catch {
        salient = undefined;
      }
      return {
        card: 'generic',
        title: spec.title,
        kind: spec.kind,
        rawInput: Object.keys(salient as object ?? {}).length === 0 ? undefined : salient,
      };
    },
    presentResult: (_args: unknown, result: { content?: ContentBlock[]; isError?: boolean }) => ({
      card: 'generic',
      title: result.isError === true ? `${spec.title} - failed` : spec.title,
      content: Array.isArray(result.content) ? result.content : undefined,
    }),
  };
}