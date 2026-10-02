/**
 * runtime.ts — the generated bundle's spec-independent modules.
 *
 * These files are byte-identical for every bundle (bar the secret variable's
 * name), so they live here as one unit. Keeping them as real TypeScript lines
 * rather than a template literal means the generator's own typecheck covers the
 * shape of what it emits: a mistake in the generated `params.ts` shows up here,
 * not as a runtime failure inside somebody's harness.
 *
 * Everything is assembled by pushing lines, which makes the output valid
 * TypeScript by construction — no interpolation of user input can produce
 * unbalanced quotes or a half-written statement.
 */

/** The HTTP client. Forwards cancellation; reports failures verbatim. */
export function apiModule(secretEnvVar: string): string {
  return L`
/**
 * Thin, honest HTTP client for the Recourse API.
 *
 * Three properties matter more than features here:
 *
 * 1. **Cancellation is forwarded.** A tool body that ignores \`exec.signal\` keeps
 *    the harness waiting after the user has already moved on.
 * 2. **Failures are reported, never disguised.** Recourse's guarded routes answer
 *    503 when the secret is unset and 401 when it is wrong. Those are
 *    operator-actionable facts, so they surface verbatim in the thrown message
 *    instead of collapsing into "request failed".
 * 3. **No silent reshaping.** Responses are returned as parsed JSON; the
 *    context-economy projections live in \`spec.ts\`, where they are explicit.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A non-2xx or unparseable answer from Recourse. */
export class RecourseApiError extends Error {
  readonly status: number | undefined;
  readonly path: string;

  constructor(message: string, path: string, status?: number) {
    super(message);
    this.name = 'RecourseApiError';
    this.path = path;
    this.status = status;
  }
}

export interface RecourseApiOptions {
  readonly baseUrl: string;
  readonly secret: string;
  readonly defaultTimeoutMs: number;
}

/** Best-effort extraction of a human message from a Recourse error body. */
function upstreamMessage(body: Json): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const record = body as Record<string, Json>;
  for (const key of ['error', 'message', 'detail'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Client for one Recourse origin. Holds no sockets and no global state. */
export class RecourseApi {
  readonly baseUrl: string;
  readonly hasSecret: boolean;
  readonly defaultTimeoutMs: number;
  readonly #secret: string;

  constructor(options: RecourseApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#secret = options.secret;
    this.hasSecret = this.#secret.length > 0;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  #headers(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (hasBody) headers['content-type'] = 'application/json';
    if (this.hasSecret) headers.authorization = 'Bearer ' + this.#secret;
    return headers;
  }

  /** Turn an auth failure into advice the operator can act on. */
  #secretHint(status: number): string {
    if (!this.hasSecret && (status === 401 || status === 503)) {
      return ' ${secretEnvVar} is not configured for the harness, so Recourse is failing closed on its guarded routes. Set it in the DSH process environment.';
    }
    if (status === 401) {
      return ' ${secretEnvVar} is configured but was rejected; check it against recourse\\.env.';
    }
    if (status === 503) return ' Recourse reports its guarded routes unavailable.';
    return '';
  }

  /** Join the caller's cancellation with our own deadline. */
  #deadline(caller: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return caller === undefined ? timeout : AbortSignal.any([caller, timeout]);
  }

  async #request(
    method: 'GET' | 'POST',
    path: string,
    body: Json | undefined,
    caller: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<Json> {
    const signal = this.#deadline(caller, timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, {
        method,
        headers: this.#headers(body !== undefined),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
    } catch (error) {
      // "The user cancelled" and "Recourse is down" need different reactions, so
      // they must not collapse into one message.
      if (caller?.aborted === true) {
        throw new RecourseApiError('Call cancelled by the harness before Recourse answered.', path);
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new RecourseApiError(
        'Recourse is unreachable at ' + this.baseUrl + ' (' + reason + '). Is the service up?',
        path,
      );
    }

    const raw = await response.text();
    let parsed: Json;
    try {
      parsed = raw.length === 0 ? null : (JSON.parse(raw) as Json);
    } catch {
      throw new RecourseApiError(
        'Recourse ' + path + ' returned HTTP ' + response.status + ' with a non-JSON body: ' + raw.slice(0, 300),
        path,
        response.status,
      );
    }

    if (!response.ok) {
      const detail = upstreamMessage(parsed);
      throw new RecourseApiError(
        'Recourse ' + path + ' -> HTTP ' + response.status +
          (detail === undefined ? '' : ': ' + detail) +
          this.#secretHint(response.status),
        path,
        response.status,
      );
    }

    return parsed;
  }

  get(path: string, caller?: AbortSignal, timeoutMs?: number): Promise<Json> {
    return this.#request('GET', path, undefined, caller, timeoutMs ?? this.defaultTimeoutMs);
  }

  post(path: string, body: Json | undefined, caller?: AbortSignal, timeoutMs?: number): Promise<Json> {
    return this.#request('POST', path, body ?? {}, caller, timeoutMs ?? this.defaultTimeoutMs);
  }
}
`.replace(/\$\{secretEnvVar\}/g, secretEnvVar);
}

/** Model-facing JSON Schema plus argument validation. */
export const paramsModule = L`
/**
 * Parameter declarations for native tools.
 *
 * Two things are ours to do by hand:
 *
 * 1. Emit the model-facing JSON Schema (\`schemaOf\`).
 * 2. Validate the model's arguments before the body runs (\`ArgReader\`).
 *
 * Step 2 is the one that matters. A structural definition bypasses the host's
 * validation, so an unvalidated \`body.foo\` would be \`undefined\` where a string
 * was expected and the request would fail somewhere less obvious. Every reader
 * here throws a message naming the tool and the offending key, which is what the
 * model needs in order to correct itself.
 */

/** One declared parameter. */
export interface ParamDef {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  readonly description?: string;
  readonly required?: boolean;
  /** Closed value set. */
  readonly enum?: readonly (string | number)[];
  /** Element schema for \`type: 'array'\`. */
  readonly items?: ParamDef;
  readonly min?: number;
  readonly max?: number;
}

export type ParamTable = Record<string, ParamDef>;

function schemaOfParam(param: ParamDef): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: param.type };
  if (param.description !== undefined) schema.description = param.description;
  if (param.enum !== undefined) schema.enum = [...param.enum];
  if (param.items !== undefined) schema.items = schemaOfParam(param.items);
  return schema;
}

/**
 * Compile a parameter table into the implicit open object root DSH expects.
 *
 * \`additionalProperties: false\` is deliberate: it stops the model inventing
 * arguments the tool does not read, which otherwise round-trips as noise in the
 * transcript.
 */
export function schemaOf(table: ParamTable): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, param] of Object.entries(table)) {
    properties[key] = schemaOfParam(param);
    if (param.required === true) required.push(key);
  }
  const schema: Record<string, unknown> = { type: 'object', properties, additionalProperties: false };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** Raised when model-supplied arguments violate the declaration. */
export class ToolArgsError extends Error {
  constructor(toolName: string, message: string) {
    super(toolName + ': ' + message);
    this.name = 'ToolArgsError';
  }
}

/** Validated, typed access to one call's arguments. */
export class ArgReader {
  readonly #tool: string;
  readonly #table: ParamTable;
  readonly #raw: Record<string, unknown>;

  constructor(tool: string, table: ParamTable, raw: unknown) {
    this.#tool = tool;
    this.#table = table;
    if (raw === undefined || raw === null) {
      this.#raw = {};
    } else if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ToolArgsError(tool, 'arguments must be an object, got ' + (Array.isArray(raw) ? 'array' : typeof raw));
    } else {
      this.#raw = raw as Record<string, unknown>;
    }
  }

  /** Check every declared key up front, so a missing required one fails by name. */
  validated(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(this.#table)) {
      const value = this.#raw[key];
      if (value === undefined || value === null) {
        if (param.required === true) throw new ToolArgsError(this.#tool, '"' + key + '" is required');
        continue;
      }
      out[key] = this.#coerce(key, param, value);
    }
    for (const key of Object.keys(this.#raw)) {
      if (!(key in this.#table)) {
        throw new ToolArgsError(this.#tool, 'unknown argument "' + key + '"');
      }
    }
    return out;
  }

  /** A small, transcript-friendly view of the salient arguments for the call card. */
  salient(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.#table)) {
      const value = this.#raw[key];
      if (value === undefined || value === null) continue;
      out[key] = typeof value === 'string' && value.length > 120 ? value.slice(0, 117) + '...' : value;
    }
    return out;
  }

  #coerce(key: string, param: ParamDef, value: unknown): unknown {
    const fail = (want: string): never => {
      throw new ToolArgsError(this.#tool, '"' + key + '" must be ' + want + ', got ' + typeof value);
    };
    switch (param.type) {
      case 'string': {
        if (typeof value !== 'string') return fail('a string');
        if (param.enum && !param.enum.includes(value)) {
          throw new ToolArgsError(this.#tool, '"' + key + '" must be one of ' + param.enum.join(', '));
        }
        return value;
      }
      case 'integer': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fail('a number');
        if (!Number.isInteger(value)) throw new ToolArgsError(this.#tool, '"' + key + '" must be an integer');
        return this.#range(key, param, value);
      }
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fail('a number');
        return this.#range(key, param, value);
      }
      case 'boolean': {
        if (typeof value !== 'boolean') return fail('a boolean');
        return value;
      }
      case 'array': {
        if (!Array.isArray(value)) return fail('an array');
        return value;
      }
      case 'object': {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('an object');
        return value;
      }
    }
  }

  #range(key: string, param: ParamDef, value: number): number {
    if (param.min !== undefined && value < param.min) {
      throw new ToolArgsError(this.#tool, '"' + key + '" must be >= ' + param.min);
    }
    if (param.max !== undefined && value > param.max) {
      throw new ToolArgsError(this.#tool, '"' + key + '" must be <= ' + param.max);
    }
    return value;
  }
}
`;

/** The tool-definition factory. */
export function specModule(secretEnvVar: string): string {
  return L`
/**
 * The tool-definition factory.
 *
 * A \`ToolSpec\` is a declarative record of one Recourse route: where it lives,
 * what it takes, and how its response reaches the model. Turning that into a
 * \`ToolDefinition\` happens once, here, so every tool in this bundle shares one
 * contract for argument validation, cancellation, output rendering, and card
 * presentation.
 *
 * Definitions are built structurally rather than via the host's \`defineTool\` so
 * the bundle keeps zero runtime dependencies (see README). \`params.ts\` pays for
 * that by taking over argument validation.
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { Json, RecourseApi } from './api.js';
import { RecourseApiError } from './api.js';
import { ArgReader, schemaOf, type ParamTable } from './params.js';

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

export type ToolKind = 'fetch' | 'execute';

export interface ToolSpec {
  /** DeepSeek function name: \`[A-Za-z0-9_-]\`, <= 64 chars. */
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
  /** Cooperative deadline override; long operations opt into the long budget. */
  readonly long?: boolean;
  /** Append a fail-closed warning to the description when no secret is set. */
  readonly needsSecret?: boolean;
  /** Value to return when the route answers 404. */
  readonly notFound?: (args: ArgReader) => Json;
}

/** Return the upstream body unchanged. */
export const passthrough = (body: Json): Json => body;

/**
 * Append fixed query parameters to a validated argument map.
 *
 * Generated bundles use this for the "route takes one id" case: the value is a
 * literal the operator chose at scaffold time, not something the model supplies,
 * so it does not belong in the tool's schema.
 */
export const pathWith = (base: string, fixed: Record<string, string>) => (args: ArgReader): string => {
  const merged: Record<string, unknown> = { ...args.validated(), ...fixed };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) continue;
    query.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const suffix = query.toString();
  return suffix.length > 0 ? base + '?' + suffix : base;
};

/** Warning appended to a mutating tool's description when no secret is set. */
export const NO_SECRET_WARNING = '${secretEnvVar} is not configured';

export function noSecretNote(): string {
  return (
    NO_SECRET_WARNING + ' in this harness, so this call will fail closed on ' +
    "Recourse's guarded route until it is set."
  );
}

/** Build the structural definition handed to \`ctx.tools.register\`. */
export function defineTool(api: RecourseApi, spec: ToolSpec, longTimeoutMs: number): ToolDefinition {
  const table = spec.params ?? {};
  const description =
    spec.needsSecret === true && api.hasSecret === false
      ? spec.description + ' NOTE: ' + noSecretNote()
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
      title: result.isError === true ? spec.title + ' - failed' : spec.title,
      content: Array.isArray(result.content) ? result.content : undefined,
    }),
  };
}
`.replace(/\$\{secretEnvVar\}/g, secretEnvVar);
}

/**
 * Line-literal helper: emits a template block as generated source.
 *
 * Three jobs, all of them about not corrupting the output:
 *
 * 1. **Interpolate `values` into the gaps between raw chunks.** Because the
 *    chunks come from `strings.raw`, a `${x}` written in the block is emitted
 *    literally — which is what generated code needs, since it is full of its own
 *    template literals.
 * 2. **Unescape the two escapes used for those literals.** `\`` becomes a
 *    backtick and `\${` becomes `${`.
 * 3. **Strip common indentation** and add a trailing newline, so the block can
 *    be indented to match its surroundings in this file.
 *
 * A value substituted in step 1 is inserted verbatim. Callers that interpolate
 * untrusted text (a description, a title) pass it through `JSON.stringify`
 * first, which is also valid TypeScript.
 */
export function L(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings.raw[0];
  for (let i = 0; i < values.length; i += 1) {
    out += String(values[i]) + (strings.raw[i + 1] ?? '');
  }
  return dedent(out).replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
}

/** Substitute `{{KEY}}` placeholders. Values are inserted verbatim. */
export function fill(source: string, values: Record<string, string>): string {
  return source.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

/** Remove the common leading indentation from a template block. */
export function dedent(text: string): string {
  const lines = text.replace(/^\n/, '').replace(/\n[ \t]*$/, '').split('\n');
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.length - l.replace(/^[ \t]*/, '').length);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n') + '\n';
}