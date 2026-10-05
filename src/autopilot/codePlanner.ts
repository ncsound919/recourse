/**
 * codePlanner.ts — turns a gap into REAL code plus a machine-checkable
 * acceptance test, using the configured model.
 *
 * Honesty contract:
 *   - Offline / empty / unparseable model output => `null` (the generator then
 *     records the run as skipped). It never fabricates code.
 *   - Every path is repo-relative, traversal-free, de-duplicated and
 *     protected-path-clean; sizes are capped. Anything off-contract is rejected.
 *   - Nothing here is trusted: the pre-merge gate verifies the change for real,
 *     in one of two lanes (sandbox flatten, or a materialized typecheck+vitest
 *     run). See `preMergeGate.ts`.
 *
 * Why a change and not a file: the planner used to be told to emit "exactly ONE
 * new file" with "NO imports", so it could never call anything already in the
 * repo — which is why so few generated upgrades did anything. It may now emit
 * up to `MAX_PLANNED_FILES` files and may import from the existing modules it is
 * shown in REPO CONTEXT (see `repoIndex.ts`).
 */
import { extractJsonBlock } from '../lib/modelProvider';
import type { ChatMessage } from '../lib/modelProvider';
import type { GapT } from './loopTypes';
import type { BusinessProfileT } from './businessProfile';
import type { PlannedChange, PlannedCode } from './upgradeGenerator';
import { relevantEntries, renderRepoContext, loadRepoIndex, type IndexEntry } from './repoIndex';

/** Injected provider call. Matches the shape of `chatComplete`. */
export type PlannerChat = (
  messages: ChatMessage[],
) => Promise<{ ok: boolean; content: string | null; error?: string }>;

/** Per-file byte cap, and the total cap across all files of one change. */
export const MAX_PLANNER_BYTES = 100_000;
export const MAX_PLANNED_BYTES = MAX_PLANNER_BYTES * 2;
export const MAX_PLANNED_FILES = 8;

/** Path segments a planner change may never target. */
const FORBIDDEN_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.recourse',
  '.env',
  'secrets',
  'coverage',
  'dist',
  'build',
]);

export type PlannedChangeRejection =
  | 'unparseable'
  | 'no_files'
  | 'too_many_files'
  | 'duplicate_path'
  | 'unsafe_path'
  | 'empty_content'
  | 'no_acceptance_test'
  | 'oversize';

export interface Rejection {
  ok: false;
  reason: PlannedChangeRejection;
  detail: string;
}

export type ParsedChange =
  | { ok: true; change: PlannedChange }
  | Rejection;

/** Reject an absolute path, any `..` traversal, or a forbidden segment. */
export function isSafeRepoPath(raw: string): boolean {
  const file = raw.replace(/\\/g, '/').trim();
  if (file === '' || file.length > 240) return false;
  if (file.startsWith('/') || /^[a-zA-Z]:\//.test(file)) return false;
  const segments = file.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  if (segments.some((s) => FORBIDDEN_SEGMENTS.has(s.toLowerCase()))) return false;
  // A protected secret-ish basename is refused whatever directory it is in.
  return !/^(\.env|.*\.(pem|key|p12|pfx))$/i.test(segments[segments.length - 1] ?? '');
}

function normalizeAction(raw: unknown): 'create' | 'modify' | undefined {
  if (raw === 'create' || raw === 'modify') return raw;
  return undefined;
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
}

/**
 * Validate an already-parsed JSON value into a `PlannedChange`, or explain why
 * it is not one. Accepts both the multi-file `{files:[...]}` shape and the
 * legacy single `{file, content}` shape.
 */
export function validatePlannedChange(parsed: unknown, limits: { maxFiles?: number; maxTotalBytes?: number; maxFileBytes?: number } = {}): ParsedChange {
  const maxFiles = limits.maxFiles ?? MAX_PLANNED_FILES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_PLANNED_BYTES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_PLANNER_BYTES;
  const reject = (reason: PlannedChangeRejection, detail: string): Rejection => ({ ok: false, reason, detail });

  if (!parsed || typeof parsed !== 'object') return reject('unparseable', 'not a JSON object');
  const obj = parsed as Record<string, unknown>;

  const acceptanceTest = typeof obj.acceptanceTest === 'string' ? obj.acceptanceTest.trim() : '';
  if (!acceptanceTest) return reject('no_acceptance_test', 'acceptanceTest missing or empty');

  // Legacy single-file JSON is wrapped into the multi-file shape.
  const rawFiles: unknown[] = Array.isArray(obj.files)
    ? (obj.files as unknown[])
    : typeof obj.file === 'string'
      ? [{ file: obj.file, content: obj.content, action: obj.action }]
      : [];

  if (rawFiles.length === 0) return reject('no_files', 'neither `files[]` nor `file` present');
  if (rawFiles.length > maxFiles) return reject('too_many_files', `${rawFiles.length} files > ${maxFiles} allowed`);

  const files: PlannedChange['files'] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const entry of rawFiles) {
    if (!entry || typeof entry !== 'object') return reject('no_files', 'files[] contains a non-object entry');
    const rec = entry as Record<string, unknown>;
    const rawPath = typeof rec.file === 'string' ? rec.file : typeof rec.rel === 'string' ? rec.rel : '';
    const file = rawPath.replace(/\\/g, '/').trim();
    if (!isSafeRepoPath(file)) return reject('unsafe_path', `refused path '${rawPath}'`);
    const key = file.toLowerCase();
    if (seen.has(key)) return reject('duplicate_path', `duplicate path '${file}'`);
    seen.add(key);
    const content = typeof rec.content === 'string' ? rec.content : typeof rec.source === 'string' ? rec.source : '';
    if (!content.trim()) return reject('empty_content', `'${file}' has no content`);
    const bytes = Buffer.byteLength(content, 'utf-8');
    if (bytes > maxFileBytes) return reject('oversize', `'${file}' is ${bytes} bytes > ${maxFileBytes}`);
    totalBytes += bytes;
    const action = normalizeAction(rec.action);
    files.push({ file, content, ...(action ? { action } : {}) });
  }
  if (totalBytes > maxTotalBytes) return reject('oversize', `total ${totalBytes} bytes > ${maxTotalBytes}`);

  const functionName = typeof obj.functionName === 'string' && obj.functionName.trim() ? obj.functionName.trim() : undefined;
  const testFileRaw = typeof obj.testFile === 'string' ? obj.testFile.trim() : '';
  if (testFileRaw && !isSafeRepoPath(testFileRaw)) return reject('unsafe_path', `refused testFile '${testFileRaw}'`);

  const change: PlannedChange = {
    files,
    acceptanceTest,
    ...(functionName ? { functionName } : {}),
    ...(testFileRaw ? { testFile: testFileRaw } : {}),
    ...(asStringArray(obj.imports).length > 0 ? { imports: asStringArray(obj.imports) } : {}),
  };
  return { ok: true, change };
}

/**
 * Parse a model response into a validated `PlannedChange`, or null when the
 * response is not one. The rejection reason is logged by callers that want it;
 * this function stays a pure boolean-ish gate for its callers.
 */
export function parsePlannedChange(text: string | null | undefined): PlannedChange | null {
  const parsed = tryParsePlannedChange(text);
  return parsed.ok ? parsed.change : null;
}

/** `parsePlannedChange` with the rejection reason attached. */
export function tryParsePlannedChange(text: string | null | undefined): ParsedChange {
  if (!text || !text.trim()) return { ok: false, reason: 'unparseable', detail: 'empty response' };
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlock(text) ?? text);
  } catch (err) {
    return { ok: false, reason: 'unparseable', detail: err instanceof Error ? err.message : String(err) };
  }
  return validatePlannedChange(json);
}

/**
 * Legacy single-file view of a change. Retained so older callers and tests keep
 * working; returns null for a multi-file change, which has no single `file`.
 */
export function parsePlannedCode(text: string | null | undefined): PlannedCode | null {
  const change = parsePlannedChange(text);
  if (!change || change.files.length !== 1) return null;
  const only = change.files[0];
  return {
    file: only.file,
    content: only.content,
    acceptanceTest: change.acceptanceTest,
    ...(change.functionName ? { functionName: change.functionName } : {}),
  };
}

export interface CodePlannerOptions {
  /** Total byte cap across all files of one change. */
  maxBytes?: number;
  /** Repo root to index for REPO CONTEXT. Omitted => no context, honestly. */
  repoRoot?: string;
  /** A pre-built index, to skip the walk (and to make tests hermetic). */
  repoIndex?: IndexEntry[];
  /** How many ranked entries to inject into the prompt. */
  contextEntries?: number;
}

const DEFAULT_CONTEXT_ENTRIES = 25;

/**
 * Build a planner from an injected chat function. Returns null (never throws)
 * when the model is offline or produces nothing usable.
 *
 * The prompt carries the ranked REPO CONTEXT when an index is available; that
 * is what lets a plan modify or call existing modules instead of reinventing
 * them in a sealed single file.
 */
export function createCodePlanner(
  chat: PlannerChat,
  opts: CodePlannerOptions = {},
): (gap: GapT, profile: BusinessProfileT) => Promise<PlannedChange | null> {
  const contextK = opts.contextEntries ?? DEFAULT_CONTEXT_ENTRIES;
  let index: IndexEntry[] | null = opts.repoIndex ?? null;

  const contextFor = (gap: GapT): string => {
    if (index === null && opts.repoRoot) {
      // Built once per planner, then ranked per gap.
      index = loadRepoIndex(opts.repoRoot);
    }
    if (index === null || index.length === 0) return '';
    const query = `${gap.description} ${gap.affectedDimensions.join(' ')}`.trim();
    return renderRepoContext(relevantEntries(index, query, contextK));
  };

  return async (gap, profile) => {
    const repoHint =
      (profile as any)?.repo?.githubUrl ||
      (profile as any)?.repo?.localPath ||
      profile?.business?.name ||
      'this repository';
    const repoContext = contextFor(gap);
    const prompt =
      `You are a code planner for an autonomous, verified improvement loop.\n` +
      `Gap to resolve: ${gap.description}\n` +
      `Tier: ${gap.tier}\n` +
      `Target repository: ${repoHint}\n` +
      (repoContext
        ? `\n## REPO CONTEXT (existing exports you MAY import and extend)\n${repoContext}\n`
        : `\n## REPO CONTEXT\n(unavailable — emit a self-contained change)\n`) +
      `\nProduce a change of up to ${MAX_PLANNED_FILES} files that resolves the gap. Rules:\n` +
      `- "files" is [{file, content, action?}]; "file" is repo-relative with forward slashes\n` +
      `  (no "..", not absolute). action is "create" or "modify" and defaults to "create".\n` +
      `- You MAY import from the modules listed in REPO CONTEXT (list them in "imports").\n` +
      `  Only import what you actually use, and only from paths that exist there.\n` +
      `- "content" is TypeScript/ESM source. Keep it self-consistent across the files you emit.\n` +
      `- "acceptanceTest" is a body of \`assert <cond>;\` statements that proves the change works.\n` +
      (repoContext
        ? `  It is executed against your change in a sandbox that has no module loader, so it\n` +
          `  must only call symbols defined in your own files.\n`
        : `  It will be executed against your change in a sandbox.\n`) +
      `- Optionally add "testFile" (a vitest file path you also emit) when the change needs\n` +
      `  the repo's real typecheck + vitest to prove it.\n` +
      `Return ONLY one fenced json block:\n` +
      '```json\n' +
      '{ "files": [ { "file": "src/autopilot/calibrate.ts", "action": "create", "content": "export function calibrate(){ return 1; }" } ],' +
      ' "acceptanceTest": "assert calibrate() === 1;", "functionName": "calibrate", "imports": ["src/lib/calibration.ts"] }\n' +
      '```';
    try {
      const res = await chat([{ role: 'user', content: prompt }]);
      if (!res.ok || !res.content) return null;
      const cap = opts.maxBytes ?? MAX_PLANNED_BYTES;
      let json: unknown;
      try {
        json = JSON.parse(extractJsonBlock(res.content) ?? res.content);
      } catch {
        return null;
      }
      const parsed = validatePlannedChange(json, { maxTotalBytes: cap });
      if (!parsed.ok) return null;
      return parsed.change;
    } catch {
      return null;
    }
  };
}