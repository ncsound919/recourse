/**
 * Patch-mode editing — the fix for whole-file rewrites breaking large files.
 *
 * The overnight audit's headline finding: when asked to improve a large
 * existing file, the raw generator rewrote the whole file, silently deleted
 * functions other code depended on, and passed only because the task's tests
 * did not cover them. The structural fix is to let the generator emit a
 * TARGETED search/replace — an exact unique snippet and its replacement — and
 * apply it to the original so everything else is byte-for-byte preserved.
 *
 * `runPatchAttempt` does exactly that, then runs the caller's real verifier
 * (sandbox suite / lint / boot gate) before the caller's `apply` writes it. A
 * search string that is missing or ambiguous is refused — never guessed.
 *
 * Honesty contract:
 *  - A patch is applied only when its `search` occurs exactly once in the
 *    original. Missing/ambiguous matches are errors, not best-effort edits.
 *  - Nothing is written unless `verify` (when supplied) passes AND `apply`
 *    (when supplied) reports applied. The result reports which ran.
 */

import { stripFences, lenientJsonParse } from './problemMint.js';

export interface SearchReplacePatch {
  file: string;
  search: string;
  replace: string;
  rationale?: string;
}

interface ParseResult {
  ok: boolean;
  patch?: SearchReplacePatch;
  error?: string;
}

/** Strictly parse a model search/replace response. Pure. */
export function parseSearchReplace(raw: string, expectFile?: string): ParseResult {
  const text = stripFences(raw);
  if (!text) return { ok: false, error: 'empty model response' };
  const parsed = lenientJsonParse(text);
  if (parsed === null) return { ok: false, error: 'not valid JSON (even after lenient repair)' };
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'response is not an object' };
  const o = parsed as Record<string, unknown>;
  const file = typeof o.file === 'string' ? o.file.trim() : expectFile ?? '';
  const search = typeof o.search === 'string' ? o.search : '';
  const replace = typeof o.replace === 'string' ? o.replace : '';
  const rationale = typeof o.rationale === 'string' ? o.rationale.trim() : undefined;
  if (!search) return { ok: false, error: 'patch.search is required and must be non-empty' };
  if (search === replace) return { ok: false, error: 'patch.search and patch.replace are identical (no-op)' };
  if (!file) return { ok: false, error: 'patch.file is required' };
  return { ok: true, patch: { file, search, replace, ...(rationale ? { rationale } : {}) } };
}

export interface ApplyResult {
  ok: boolean;
  output?: string;
  occurrences?: number;
  error?: string;
}

/**
 * Apply a search/replace to `original`. The search must occur exactly once;
 * everything outside the matched span is preserved byte-for-byte.
 */
export function applySearchReplace(original: string, search: string, replace: string): ApplyResult {
  if (!search) return { ok: false, error: 'empty search string' };
  const first = original.indexOf(search);
  if (first === -1) return { ok: false, occurrences: 0, error: 'search string not found in target file' };
  const second = original.indexOf(search, first + search.length);
  if (second !== -1) {
    const count = original.split(search).length - 1;
    return { ok: false, occurrences: count, error: `search string is ambiguous (${count} matches) — include more context` };
  }
  const output = original.slice(0, first) + replace + original.slice(first + search.length);
  return { ok: true, output, occurrences: 1 };
}

export interface PatchAttemptInput {
  file: string;
  goal: string;
  original: string;
  /** Injected model seam. */
  draft: (system: string, user: string) => Promise<string>;
  /** Real verifier over the patched full source (sandbox suite + lint). */
  verify?: (output: string) => { ok: boolean; detail: string };
  /** Real writer (e.g. verifyAndApplyPatch). */
  apply?: (patch: SearchReplacePatch & { output: string }) => Promise<{ applied: boolean; error?: string; revertToken?: string }>;
  maxTries?: number;
  temperature?: number;
}

export interface PatchAttemptResult {
  ok: boolean;
  file: string;
  output?: string;
  attempts: number;
  applied: boolean;
  revertToken?: string;
  detail: string;
  failures: string[];
}

/** Prompt pair for the patch drafter. The contract forbids whole-file output. */
export function patchPrompt(file: string, goal: string, original: string): { system: string; user: string } {
  const system =
    'You edit existing source files with surgical search/replace patches. ' +
    'Return ONLY JSON with keys "file", "search", "replace" (and optional "rationale"). ' +
    'The "search" string MUST be copied verbatim from the file and must occur exactly once. ' +
    'Change ONLY what the goal requires; never reformat, reorder, or delete unrelated code.';
  const user =
    `File: ${file}\n\nGoal:\n${goal}\n\nFile contents:\n---BEGIN FILE---\n${original}\n---END FILE---\n\n` +
    'Return the minimal unique search/replace JSON patch. No Markdown, no commentary.';
  return { system, user };
}

export async function runPatchAttempt(input: PatchAttemptInput): Promise<PatchAttemptResult> {
  const maxTries = Math.max(1, input.maxTries ?? 3);
  const failures: string[] = [];
  const { system, user } = patchPrompt(input.file, input.goal, input.original);

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    let raw: string;
    try {
      raw = await input.draft(system, user);
    } catch (err) {
      failures.push(`draft error: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const parsed = parseSearchReplace(raw, input.file);
    const patch = parsed.patch;
    if (!parsed.ok || !patch) {
      failures.push(`parse: ${parsed.error ?? 'missing patch'}`);
      continue;
    }
    const applied = applySearchReplace(input.original, patch.search, patch.replace);
    if (!applied.ok || applied.output === undefined) {
      failures.push(`apply: ${applied.error}`);
      continue;
    }
    if (input.verify) {
      const v = input.verify(applied.output);
      if (!v.ok) {
        failures.push(`verify: ${v.detail}`);
        continue;
      }
    }
    let revertToken: string | undefined;
    let appliedOk = true;
    if (input.apply) {
      const res = await input.apply({ ...patch, output: applied.output });
      appliedOk = res.applied;
      revertToken = res.revertToken;
      if (!res.applied) {
        failures.push(`writer: ${res.error ?? 'apply failed'}`);
        continue;
      }
    }
    return {
      ok: true,
      file: input.file,
      output: applied.output,
      attempts: attempt,
      applied: Boolean(input.apply) && appliedOk,
      ...(revertToken ? { revertToken } : {}),
      detail: input.apply
        ? 'patch applied and verified'
        : input.verify
          ? 'patch produced and verified (not written)'
          : 'patch produced (not written)',
      failures,
    };
  }

  return {
    ok: false,
    file: input.file,
    attempts: maxTries,
    applied: false,
    detail: failures[failures.length - 1] ?? 'patch failed',
    failures,
  };
}
