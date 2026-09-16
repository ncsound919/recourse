/**
 * canonical.ts — deterministic JSON serialization for signing.
 *
 * Signatures are computed over bytes, so the signed representation must be
 * stable regardless of key insertion order or object identity. `canonicalize`
 * recursively sorts object keys (arrays keep their order) and emits a compact
 * JSON string; `undefined` values are dropped, matching JSON semantics.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = sortValue(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex of a UTF-8 string (used for content-addressing). */
import crypto from 'node:crypto';
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}
