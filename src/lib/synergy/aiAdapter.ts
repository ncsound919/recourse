// src/lib/synergy/aiAdapter.ts
/**
 * AI adapter drafting. The model proposes an adaptation; ONLY the Plan 4
 * resolver's execution result sets status. Offline => honest failure, no fabrication.
 *
 * Hardening (Plan 10): the provider call is injectable (`ChatFn`) so this is
 * testable without network; model output is fence-stripped and size-guarded;
 * nothing the model returns is trusted until the isolated sandbox passes it.
 */
import { resolveTransfer, admit } from './resolver.js';
import { skillAwareChat } from '../skillContext.js';
import type { ChatMessage } from '../modelProvider.js';
import type { TransferCandidate, TransferResult, AdmissionDecision } from './types.js';

/** Injected provider call. Matches the shape of `chatCompleteRoute`. */
export type ChatFn = (
  messages: ChatMessage[],
) => Promise<{ ok: boolean; content: string | null; error?: string; status?: string }>;

export const MAX_DRAFT_BYTES = 200_000;

export interface DraftRequest {
  candidate: TransferCandidate;
  problemStatement: string;
  acceptanceTest: string;
  methodName: string;
}
export interface DraftOk { sourceCode: string }
export interface DraftErr { error: string }
export type Drafter = (req: DraftRequest) => Promise<DraftOk | DraftErr>;
export interface DraftResult { ok: boolean; sourceCode?: string; offline?: boolean; error?: string }

/** Strip a leading/trailing ``` fence (preferring a ts/js tagged block). */
export function stripCodeFence(content: string): string {
  const fenced = /```([a-zA-Z0-9]*)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let first: string | null = null;
  let preferred: string | null = null;
  while ((match = fenced.exec(content)) !== null) {
    const lang = (match[1] || '').toLowerCase();
    if (first === null) first = match[2];
    if (!preferred && /^(ts|tsx|js|jsx|typescript|javascript|mjs)$/.test(lang)) preferred = match[2];
  }
  const chosen = preferred ?? first;
  return (chosen ?? content).trim();
}

/** Fence-strip + trim + size guard. Honest errors, never silent truncation. */
export function normalizeDraftSource(raw: string): DraftOk | DraftErr {
  const source = stripCodeFence(String(raw ?? ''));
  if (!source) return { error: 'drafter returned empty source' };
  const bytes = Buffer.byteLength(source, 'utf-8');
  if (bytes > MAX_DRAFT_BYTES) {
    return { error: `drafter output too large (${bytes} bytes > ${MAX_DRAFT_BYTES})` };
  }
  return { sourceCode: source };
}

export async function draftAdaptation(req: DraftRequest, drafter: Drafter): Promise<DraftResult> {
  try {
    const out = await drafter(req);
    if ('error' in out) return { ok: false, offline: true, error: out.error };
    const normalized = normalizeDraftSource(out.sourceCode);
    if ('error' in normalized) return { ok: false, error: normalized.error };
    return { ok: true, sourceCode: normalized.sourceCode };
  } catch (err) {
    return { ok: false, offline: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Default provider call: skill-aware, local-first with API fallback. */
const defaultChat: ChatFn = (messages) => skillAwareChat(messages);

export function createModelDrafter(chat: ChatFn = defaultChat): Drafter {
  return async (req) => {
    const prompt = `You are drafting a self-contained JavaScript module to satisfy a test suite.\n` +
      `Method to adapt: ${req.methodName}\nProblem: ${req.problemStatement}\n` +
      `The module must export exactly the symbols the acceptance test references. Return ONLY code.\n` +
      `Acceptance test:\n${req.acceptanceTest}`;
    const res = await chat([{ role: 'user', content: prompt }]);
    if (!res.ok || res.content === null || !res.content.trim()) {
      return { error: res.error ?? 'model returned no content' };
    }
    const normalized = normalizeDraftSource(res.content);
    if ('error' in normalized) return { error: normalized.error };
    return { sourceCode: normalized.sourceCode };
  };
}

export async function attemptTransfer(
  req: DraftRequest, drafter: Drafter,
): Promise<{ result: TransferResult | null; decision: AdmissionDecision | null; draft: DraftResult }> {
  const draft = await draftAdaptation(req, drafter);
  if (!draft.ok || !draft.sourceCode) return { result: null, decision: null, draft };
  const result = resolveTransfer(req.candidate, req.acceptanceTest, draft.sourceCode, 'model');
  return { result, decision: admit(result), draft };
}
