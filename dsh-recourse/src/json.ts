/**
 * Safe readers for a parsed JSON value.
 *
 * Recourse's routes return deeply nested, loosely-typed JSON. Every access goes
 * through these helpers rather than property access, because `Json` is a union
 * that includes `string | number | null` and TypeScript is right to refuse
 * `body.success`. A missing hop yields `undefined`, which `compact` then drops,
 * so a projection with an absent field produces exactly the JSON the MCP bridge
 * produced (`JSON.stringify` also omits `undefined` members).
 */

import type { Json } from './api.js';

/** Walk a parsed JSON value by key, yielding `undefined` for any missing hop. */
export function at(value: Json | undefined, ...path: readonly string[]): Json | undefined {
  let cursor: Json | undefined = value;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, Json>)[key];
  }
  return cursor;
}

/** Read a nested field as a JSON array, or `undefined`. */
export function arrayAt(value: Json | undefined, ...path: readonly string[]): Json[] | undefined {
  const found = at(value, ...path);
  return Array.isArray(found) ? found : undefined;
}

/** Read a nested field as a JSON record, or `undefined`. */
export function recordAt(
  value: Json | undefined,
  ...path: readonly string[]
): Record<string, Json> | undefined {
  const found = at(value, ...path);
  if (typeof found !== 'object' || found === null || Array.isArray(found)) return undefined;
  return found as Record<string, Json>;
}

/** Read a nested field as a string, or `undefined`. */
export function stringAt(value: Json | undefined, ...path: readonly string[]): string | undefined {
  const found = at(value, ...path);
  return typeof found === 'string' ? found : undefined;
}

/** Read a nested field as a number, or `undefined`. */
export function numberAt(value: Json | undefined, ...path: readonly string[]): number | undefined {
  const found = at(value, ...path);
  return typeof found === 'number' ? found : undefined;
}

/** Read a nested field as a boolean, or `undefined`. */
export function booleanAt(value: Json | undefined, ...path: readonly string[]): boolean | undefined {
  const found = at(value, ...path);
  return typeof found === 'boolean' ? found : undefined;
}

/**
 * Drop `undefined` members from a projection.
 *
 * This is what keeps native output byte-comparable with the bridge: the bridge
 * builds a plain object and hands it to `JSON.stringify`, which omits undefined
 * members, and `compact` reproduces that.
 */
export function compact<T extends Record<string, Json | undefined>>(value: T): Json {
  const out: Record<string, Json> = {};
  for (const [key, member] of Object.entries(value)) {
    if (member !== undefined) out[key] = member;
  }
  return out;
}

/** Convenience for a projection that forwards an upstream body unchanged. */
export function whole(body: Json): Json {
  return body;
}

/** Convenience for a projection that forwards specific upstream fields. */
export function pick(body: Json, ...keys: readonly string[]): Json {
  return compact(Object.fromEntries(keys.map((key) => [key, at(body, key)])));
}