/**
 * codePlanner.ts — turns a gap into REAL code + a machine-checkable acceptance
 * test, using the configured model. This is the planner that the rule-based
 * `upgradeGenerator` intentionally lacks: it is the honest source of Tier A
 * source, and its acceptance test is what the pre-merge gate runs in the
 * sandbox.
 *
 * Honesty contract:
 *   - Offline / empty / unparseable model output => `null` (the generator then
 *     falls back to its honest placeholder). It never fabricates code.
 *   - The produced file path must be repo-relative and traversal-free, and the
 *     content is size-capped. Anything off-contract is rejected.
 *   - Nothing here is trusted: the gate verifies the acceptance test for real.
 */
import path from 'node:path';
import { extractJsonBlock } from '../lib/modelProvider';
import type { ChatMessage } from '../lib/modelProvider';
import type { GapT } from './loopTypes';
import type { BusinessProfileT } from './businessProfile';
import type { PlannedCode } from './upgradeGenerator';

/** Injected provider call. Matches the shape of `chatComplete`. */
export type PlannerChat = (
  messages: ChatMessage[],
) => Promise<{ ok: boolean; content: string | null; error?: string }>;

export const MAX_PLANNER_BYTES = 100_000;

/** Parse a model response into PlannedCode, or null when it is not valid. */
export function parsePlannedCode(text: string | null | undefined): PlannedCode | null {
  if (!text || !text.trim()) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonBlock(text) ?? text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const file = typeof parsed.file === 'string' ? parsed.file.replace(/\\/g, '/').trim() : '';
  if (!file || path.isAbsolute(file) || file.includes('..')) return null;
  const content = typeof parsed.content === 'string' ? parsed.content : '';
  const acceptanceTest = typeof parsed.acceptanceTest === 'string' ? parsed.acceptanceTest.trim() : '';
  if (!content.trim() || !acceptanceTest) return null;
  if (Buffer.byteLength(content, 'utf-8') > MAX_PLANNER_BYTES) return null;
  const functionName = typeof parsed.functionName === 'string' && parsed.functionName.trim() ? parsed.functionName.trim() : undefined;
  return { file, content, acceptanceTest, ...(functionName ? { functionName } : {}) };
}

export interface CodePlannerOptions {
  maxBytes?: number;
}

/**
 * Build a planner from an injected chat function. Returns null (never throws)
 * when the model is offline or produces nothing usable.
 */
export function createCodePlanner(
  chat: PlannerChat,
  opts: CodePlannerOptions = {},
): (gap: GapT, profile: BusinessProfileT) => Promise<PlannedCode | null> {
  return async (gap, profile) => {
    const repoHint =
      (profile as any)?.repo?.githubUrl ||
      (profile as any)?.repo?.localPath ||
      profile?.business?.name ||
      'this repository';
    const prompt =
      `You are a code planner for an autonomous, verified improvement loop.\n` +
      `Gap to resolve: ${gap.description}\n` +
      `Target repository: ${repoHint}\n\n` +
      `Produce exactly ONE new file that resolves the gap. Rules:\n` +
      `- "file" is a repo-relative path with forward slashes (no "..", not absolute).\n` +
      `- "content" is a self-contained JavaScript ES module with NO imports and no Node APIs read from the host.\n` +
      `- "acceptanceTest" is a body of \`assert <cond>;\` statements that proves the exported symbol(s) work; ` +
      `it will be executed against "content" in a sandbox.\n` +
      `Return ONLY one fenced json block:\n` +
      '```json\n{ "file": "src/example.js", "content": "export function f(x){ return x; }", "acceptanceTest": "assert f(2) === 2;", "functionName": "f" }\n```';
    try {
      const res = await chat([{ role: 'user', content: prompt }]);
      if (!res.ok || !res.content) return null;
      const planned = parsePlannedCode(res.content);
      if (!planned) return null;
      const cap = opts.maxBytes ?? MAX_PLANNER_BYTES;
      if (Buffer.byteLength(planned.content, 'utf-8') > cap) return null;
      return planned;
    } catch {
      return null;
    }
  };
}
