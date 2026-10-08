/**
 * Parameter declarations for native tools.
 *
 * DSH's `defineTool` would normally do this from a `ParameterSchemaSpec`, but
 * this plugin builds `ToolDefinition` structurally so it can keep zero runtime
 * dependencies (see `compat.ts`). Two things are therefore ours to do by hand,
 * and both are here:
 *
 * 1. Emit the model-facing JSON Schema (`schemaOf`).
 * 2. Validate the model's arguments before the body runs (`ArgReader`).
 *
 * Step 2 is the one that matters. `defineTool` validates against the schema and
 * hands the body typed arguments; a structural definition bypasses that, so an
 * unvalidated `body.foo` would be `undefined` where a string was expected and
 * the request would fail somewhere less obvious. Every reader here throws a
 * message naming the tool and the offending key, which is what the model needs
 * to correct itself.
 */

/** One declared parameter. Mirrors the subset of zod the bridge used. */
export interface ParamDef {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  readonly description?: string;
  /** Marks the key required. Absent key or `null` is rejected when true. */
  readonly required?: boolean;
  /**
   * Closed value set. Numeric literals are supported so unions like
   * `4 | 8 | 16` can be declared directly rather than approximated with a range.
   */
  readonly enum?: readonly (string | number)[];
  /** Element schema for `type: 'array'`. */
  readonly items?: ParamDef;
  /** Inclusive lower bound for numbers/integers. */
  readonly min?: number;
  /** Inclusive upper bound for numbers/integers. */
  readonly max?: number;
}

/** A named parameter table. */
export type ParamTable = Record<string, ParamDef>;

/** Build the model-facing JSON Schema for one parameter node. */
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
 * `additionalProperties: false` is deliberate: it stops the model inventing
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
    super(`${toolName}: ${message}`);
    this.name = 'ToolArgsError';
  }
}

/** Validated, typed access to one call's arguments. */
export class ArgReader {
  readonly #tool: string;
  readonly #table: ParamTable;
  readonly #args: Record<string, unknown>;

  constructor(toolName: string, table: ParamTable, args: unknown) {
    this.#tool = toolName;
    this.#table = table;
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      throw new ToolArgsError(toolName, `expected an object of arguments, received ${typeof args}.`);
    }
    this.#args = args as Record<string, unknown>;
  }

  /** True when the model supplied this key with a non-null value. */
  has(key: string): boolean {
    const value = this.#args[key];
    return value !== undefined && value !== null;
  }

  #require(key: string): void {
    if (!this.has(key)) {
      const param = this.#table[key];
      throw new ToolArgsError(this.#tool, `"${key}" is required.`);
    }
  }

  /** Read a required string. */
  str(key: string): string {
    this.#require(key);
    const value = this.#args[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ToolArgsError(this.#tool, `"${key}" must be a non-empty string.`);
    }
    return value;
  }

  /** Read an optional string. */
  optStr(key: string): string | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#args[key];
    if (typeof value !== 'string') {
      throw new ToolArgsError(this.#tool, `"${key}" must be a string.`);
    }
    return value;
  }

  /** Read a bounded integer, optional unless declared required. */
  optInt(key: string): number | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#args[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new ToolArgsError(this.#tool, `"${key}" must be an integer.`);
    }
    this.#bounds(key, value);
    return value;
  }

  /** Read a bounded number, optional unless declared required. */
  optNum(key: string): number | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#args[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ToolArgsError(this.#tool, `"${key}" must be a number.`);
    }
    this.#bounds(key, value);
    return value;
  }

  #bounds(key: string, value: number): void {
    const param = this.#table[key];
    if (param === undefined) return;
    this.#checkBounds(key, param, value);
  }

  /** Read an optional boolean. */
  optBool(key: string): boolean | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#args[key];
    if (typeof value !== 'boolean') {
      throw new ToolArgsError(this.#tool, `"${key}" must be a boolean.`);
    }
    return value;
  }

  /** Read an optional array, element-checking it against the declared items. */
  optArray(key: string): JsonValue[] | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#args[key];
    if (!Array.isArray(value)) {
      throw new ToolArgsError(this.#tool, `"${key}" must be an array.`);
    }
    const items = this.#table[key]?.items;
    if (items === undefined) return value as JsonValue[];
    for (const entry of value) {
      if (items.type === 'string' && typeof entry !== 'string') {
        throw new ToolArgsError(this.#tool, `"${key}" must contain only strings.`);
      }
      if (items.type === 'number' && typeof entry !== 'number') {
        throw new ToolArgsError(this.#tool, `"${key}" must contain only numbers.`);
      }
      if (items.enum !== undefined && !items.enum.includes(entry as string)) {
        throw new ToolArgsError(
          this.#tool,
          `"${key}" entries must be one of ${items.enum.join(', ')}.`,
        );
      }
    }
    return value as JsonValue[];
  }

  /** Read an arbitrary JSON object (used for plugin manifests). */
  obj(key: string): Record<string, JsonValue> {
    this.#require(key);
    const value = this.#args[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ToolArgsError(this.#tool, `"${key}" must be an object.`);
    }
    return value as Record<string, JsonValue>;
  }

  /** Every supplied argument that is not a long free-text field. */
  salient(): Record<string, JsonValue> {
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(this.#args)) {
      if (value === undefined || value === null) continue;
      const param = this.#table[key];
      // Long prose is already visible in the pending call's own input; keeping
      // it in the card header would crowd out everything else.
      if (param?.type === 'string' && typeof value === 'string' && value.length > 80) continue;
      out[key] = value as JsonValue;
    }
    return out;
  }

  /**
   * Validate every declared key and return the ones the model actually
   * supplied.
   *
   * This is the general path, driven entirely by the declared table, so a spec
   * cannot forget to forward an argument. It runs before a POST body is built
   * and before a query string is assembled, so a missing required key fails
   * with a message naming the tool rather than Recourse answering an opaque 400.
   */
  validated(): Record<string, JsonValue> {
    const out: Record<string, JsonValue> = {};
    for (const [key, param] of Object.entries(this.#table)) {
      if (!this.has(key)) {
        if (param.required === true) {
          throw new ToolArgsError(this.#tool, `"${key}" is required.`);
        }
        continue;
      }
      const value = this.#args[key];
      this.#checkType(key, param, value);
      out[key] = value as JsonValue;
    }
    return out;
  }

  /** Type, enum, bound, and item checks for one supplied value. */
  #checkType(key: string, param: ParamDef, value: unknown): void {
    const fail = (expectation: string): never => {
      throw new ToolArgsError(this.#tool, `"${key}" ${expectation}.`);
    };

    switch (param.type) {
      case 'string': {
        if (typeof value !== 'string') return fail('must be a string');
        if (param.enum !== undefined && !param.enum.includes(value)) {
          throw new ToolArgsError(this.#tool, `"${key}" must be one of ${param.enum.join(', ')}.`);
        }
        if (param.required === true && value.trim().length === 0) {
          throw new ToolArgsError(this.#tool, `"${key}" must be a non-empty string.`);
        }
        return;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') return fail('must be a boolean');
        return;
      }
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fail('must be a number');
        this.#checkEnum(key, param, value);
        this.#checkBounds(key, param, value);
        return;
      }
      case 'integer': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fail('must be a number');
        if (!Number.isInteger(value)) return fail('must be an integer');
        this.#checkEnum(key, param, value);
        this.#checkBounds(key, param, value);
        return;
      }
      case 'array': {
        if (!Array.isArray(value)) return fail('must be an array');
        if (param.items === undefined) return;
        for (const entry of value) this.#checkType(`${key}[]`, param.items, entry);
        return;
      }
      case 'object': {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return fail('must be an object');
        }
        return;
      }
    }
  }

  /** Enum membership check for a scalar parameter. */
  #checkEnum(key: string, param: ParamDef, value: unknown): void {
    if (param.enum === undefined) return;
    if (!param.enum.includes(value as string | number)) {
      throw new ToolArgsError(this.#tool, `"${key}" must be one of ${param.enum.join(', ')}.`);
    }
  }

  #checkBounds(key: string, param: ParamDef, value: number): void {
    if (typeof param.min === 'number' && value < param.min) {
      throw new ToolArgsError(this.#tool, `"${key}" must be >= ${param.min}.`);
    }
    if (typeof param.max === 'number' && value > param.max) {
      throw new ToolArgsError(this.#tool, `"${key}" must be <= ${param.max}.`);
    }
  }
}

/** Structural JSON value used for argument projection. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };