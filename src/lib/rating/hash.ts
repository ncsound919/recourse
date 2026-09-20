/**
 * Canonical hashing for the rating ledger.
 *
 * `paramHash` must be identical across processes and platforms for the same
 * parameter object, so it cannot depend on key insertion order. We canonicalize
 * recursively (object keys sorted) before hashing.
 */
import crypto from 'node:crypto';

/** Deterministic JSON: object keys sorted recursively, undefined -> null. */
export function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    const json = JSON.stringify(value);
    return json === undefined ? 'null' : json;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  // Mirror JSON.stringify: object properties whose value is `undefined` are
  // omitted, so a hashed object and its JSON round-trip agree.
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

/** 16-char stable fingerprint of a parameter object. */
export function hashParams(params: unknown): string {
  return crypto.createHash('sha256').update(canonicalize(params)).digest('hex').slice(0, 16);
}

/** Full 64-char hash-chain link: H(prevHash + '\n' + canonical(payload)). */
export function chainHash(prevHash: string, payload: unknown): string {
  return crypto.createHash('sha256').update(`${prevHash}\n${canonicalize(payload)}`).digest('hex');
}

export const GENESIS_HASH = '0'.repeat(64);
