/**
 * Multi-file forge specs — a prototype path from single-function genes to
 * larger, multi-file tools.
 *
 * A `MultiFileSpec` is a `ForgeSpec` plus an explicit `files` manifest. The
 * hidden `refSuite` may import across any of those files (unlike the current
 * single-export contract), so a spec can describe a small module rather than a
 * lone function.
 */

import type { ForgeSpec } from './capabilityForge';

export interface MultiFileFile {
  /** Path relative to the spec root, using `/` separators. */
  rel: string;
  /** What this file is for in the plan (e.g. 'entrypoint', 'helper', 'types'). */
  role: string;
  /** Optional per-file instruction for the builder. */
  prompt?: string;
}

export interface MultiFileSpec extends ForgeSpec {
  files: MultiFileFile[];
}

export type SpecValidationCode =
  | 'invalid_spec'
  | 'no_files'
  | 'invalid_file'
  | 'empty_path'
  | 'absolute_path'
  | 'escaping_path'
  | 'duplicate_path'
  | 'refsuite_missing';

export interface SpecValidationError {
  code: SpecValidationCode;
  message: string;
  path?: string;
  index?: number;
}

export interface SpecValidationResult {
  valid: boolean;
  errors: SpecValidationError[];
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/');
}

function isAbsoluteRel(norm: string): boolean {
  if (norm.startsWith('/')) return true;
  return /^[a-zA-Z]:\//.test(norm);
}

/**
 * Validate a multi-file spec: at least one file, unique relative paths, no
 * absolute or escaping paths, and a non-empty reference suite. Returns every
 * problem found (never throws) so a caller can report all of them at once.
 */
export function validateMultiFileSpec(spec: unknown): SpecValidationResult {
  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: [{ code: 'invalid_spec', message: 'spec must be an object' }] };
  }

  const candidate = spec as Partial<MultiFileSpec>;
  const errors: SpecValidationError[] = [];

  if (typeof candidate.refSuite !== 'string' || candidate.refSuite.trim() === '') {
    errors.push({ code: 'refsuite_missing', message: 'refSuite must be a non-empty string' });
  }

  const files = candidate.files;
  if (!Array.isArray(files) || files.length === 0) {
    errors.push({ code: 'no_files', message: 'files must contain at least one entry' });
  } else {
    const seen = new Map<string, number>();
    files.forEach((file, index) => {
      if (!file || typeof file !== 'object') {
        errors.push({ code: 'invalid_file', index, message: `files[${index}] must be an object` });
        return;
      }
      const rel = (file as MultiFileFile).rel;
      if (typeof rel !== 'string' || rel.trim() === '') {
        errors.push({
          code: 'empty_path',
          index,
          path: typeof rel === 'string' ? rel : '',
          message: `files[${index}].rel must be a non-empty string`
        });
        return;
      }
      const norm = normalizeRel(rel);
      if (isAbsoluteRel(norm)) {
        errors.push({
          code: 'absolute_path',
          index,
          path: rel,
          message: `files[${index}].rel must be a relative path, got "${rel}"`
        });
        return;
      }
      if (norm.split('/').some((segment) => segment === '..')) {
        errors.push({
          code: 'escaping_path',
          index,
          path: rel,
          message: `files[${index}].rel must not escape the spec root, got "${rel}"`
        });
        return;
      }
      const dedupeKey = norm.toLowerCase();
      const prior = seen.get(dedupeKey);
      if (prior !== undefined) {
        errors.push({
          code: 'duplicate_path',
          index,
          path: rel,
          message: `files[${index}].rel duplicates files[${prior}].rel ("${rel}")`
        });
      } else {
        seen.set(dedupeKey, index);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Deterministic plan/prompt renderer. Same spec in, byte-identical string out
 * (no clocks, no randomness, manifest order preserved).
 */
export function describeSpec(spec: MultiFileSpec): string {
  const kind = spec.kind ?? 'function';
  const lines: string[] = [
    `# ${spec.title}`,
    '',
    `- id: ${spec.id}`,
    `- name: ${spec.name}`,
    `- domain: ${spec.domain}`,
    `- kind: ${kind}`,
    '',
    '## Contract',
    spec.prompt,
    '',
    `## Files (${spec.files.length})`
  ];
  spec.files.forEach((file, index) => {
    lines.push(`${index + 1}. ${file.rel} [${file.role}]`);
    if (file.prompt && file.prompt.trim() !== '') lines.push(`   ${file.prompt.trim()}`);
  });
  lines.push('', '## Reference suite', spec.refSuite);
  return lines.join('\n');
}
