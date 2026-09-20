/**
 * toolArgs — argument normalization, schema validation and off-cap repair for
 * model tool calls.
 *
 * Small models frequently get the shape right but the key names slightly wrong
 * (`q` vs `query`, `path` vs `file`). Rather than burn a recovery turn, we
 * normalize common aliases and validate against the declared schema; a failed
 * validation can be repaired with a dedicated strict-JSON call that does NOT
 * count against the agent loop's turn cap.
 */
import type { ChatMessage } from './modelProvider.js';

export interface ArgValidation {
  ok: boolean;
  errors: string[];
  value: Record<string, unknown>;
}

const SYNONYM_GROUPS: string[][] = [
  ['query', 'q', 'search', 'term', 'keywords', 'text'],
  ['path', 'file', 'filename', 'filepath', 'dir', 'directory'],
  ['name', 'id', 'identifier', 'tool', 'toolname', 'skill'],
  ['args', 'arguments', 'params', 'parameters', 'inputs', 'input'],
  ['method', 'action', 'command', 'operation', 'op', 'func', 'function'],
  ['limit', 'max', 'maximum', 'topk', 'top_k', 'count', 'n'],
  ['content', 'body', 'message', 'prompt', 'instruction', 'instructions'],
  ['url', 'uri', 'link', 'endpoint'],
  ['script', 'program', 'entrypoint'],
  ['timeoutms', 'timeout', 'ttl'],
  ['value', 'val', 'arg'],
];

function canonicalKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map a supplied key onto a declared property name, or null if unknown. */
export function matchProperty(key: string, properties: string[]): string | null {
  const canon = canonicalKey(key);
  for (const p of properties) if (canonicalKey(p) === canon) return p;
  // camel/snake/plural tolerance
  for (const p of properties) {
    const pc = canonicalKey(p);
    if (pc === canon.replace(/s$/, '') || pc.replace(/s$/, '') === canon) return p;
  }
  // synonym groups
  for (const group of SYNONYM_GROUPS) {
    if (group.includes(canon)) {
      for (const p of properties) if (group.includes(canonicalKey(p))) return p;
    }
  }
  return null;
}

/**
 * Move aliased keys onto their canonical property names and (when the schema
 * forbids extra properties) drop unknown keys. Never invents values.
 */
export function normalizeToolArgs(schema: Record<string, unknown>, args: Record<string, unknown>): Record<string, unknown> {
  const props = (schema?.properties ?? {}) as Record<string, unknown>;
  const propertyNames = Object.keys(props);
  const strict = schema?.additionalProperties === false;
  const out: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args ?? {})) {
    const direct = propertyNames.find((p) => p === key);
    if (direct) { out[direct] = value; continue; }
    const mapped = matchProperty(key, propertyNames);
    if (mapped && out[mapped] === undefined) { out[mapped] = value; continue; }
    extras[key] = value;
  }

  if (!strict) {
    for (const [k, v] of Object.entries(extras)) if (out[k] === undefined) out[k] = v;
  }
  return out;
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'null': return value === null;
    default: return true;
  }
}

/** Minimal, honest schema validation: required, top-level types, enums, extras. */
export function validateToolArgs(schema: Record<string, unknown>, args: Record<string, unknown>): ArgValidation {
  const errors: string[] = [];
  const props = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(schema?.required) ? (schema!.required as string[]) : [];
  const value = args ?? {};

  for (const key of required) {
    if (value[key] === undefined || value[key] === null) errors.push(`missing required argument "${key}"`);
  }
  for (const [key, prop] of Object.entries(props)) {
    if (value[key] === undefined) continue;
    const types = Array.isArray(prop.type) ? (prop.type as string[]) : typeof prop.type === 'string' ? [prop.type as string] : [];
    if (types.length && !types.some((t) => typeMatches(value[key], t))) {
      errors.push(`argument "${key}" has the wrong type (expected ${types.join('|')})`);
    }
    if (Array.isArray(prop.enum) && !(prop.enum as unknown[]).includes(value[key])) {
      errors.push(`argument "${key}" must be one of: ${(prop.enum as unknown[]).join(', ')}`);
    }
  }
  if (schema?.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in props)) errors.push(`unknown argument "${key}"`);
    }
  }
  return { ok: errors.length === 0, errors, value };
}

/** Prompt pair for a strict-JSON repair call (formatting fix, not a turn). */
export function buildRepairMessages(
  toolName: string,
  schema: Record<string, unknown>,
  rawArgs: string,
  error: string,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You fix malformed tool-call arguments. Return ONLY a JSON object with the correct keys and types for the ' +
        'given schema. No prose, no markdown fences.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        tool: toolName,
        schema,
        received: rawArgs,
        problem: error,
        instruction: 'Return the corrected arguments as a single JSON object.',
      }),
    },
  ];
}
