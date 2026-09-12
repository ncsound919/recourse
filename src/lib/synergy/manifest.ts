/**
 * Deterministic content hashing for the synergy engine. Every map/candidate
 * carries a manifest hash so re-runs are diffable bit-for-bit.
 */
import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic, key-sorted JSON. Arrays keep their given order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function manifestHash(parts: string[]): string {
  return sha256Hex(parts.map((p) => `${p.length}:${p}`).join('\n'));
}
