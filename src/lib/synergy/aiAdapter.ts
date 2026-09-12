// src/lib/synergy/aiAdapter.ts
/**
 * AI adapter drafting. The model proposes an adaptation; ONLY the Plan 4
 * resolver's execution result sets status. Offline => honest failure, no fabrication.
 */
import { resolveTransfer, admit } from './resolver.js';
import { chatCompleteRoute } from '../modelProvider.js';
import type { TransferCandidate, TransferResult, AdmissionDecision } from './types.js';

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

export async function draftAdaptation(req: DraftRequest, drafter: Drafter): Promise<DraftResult> {
  try {
    const out = await drafter(req);
    if ('error' in out) return { ok: false, offline: true, error: out.error };
    if (!out.sourceCode || !out.sourceCode.trim()) return { ok: false, error: 'drafter returned empty source' };
    return { ok: true, sourceCode: out.sourceCode };
  } catch (err) {
    return { ok: false, offline: true, error: err instanceof Error ? err.message : String(err) };
  }
}

export function createModelDrafter(): Drafter {
  return async (req) => {
    const prompt = `You are drafting a self-contained JavaScript module to satisfy a test suite.\n` +
      `Method to adapt: ${req.methodName}\nProblem: ${req.problemStatement}\n` +
      `The module must export exactly the symbols the acceptance test references. Return ONLY code.\n` +
      `Acceptance test:\n${req.acceptanceTest}`;
    const res = await chatCompleteRoute('auto', [{ role: 'user', content: prompt }]);
    if (!res.ok || res.content === null || !res.content.trim()) {
      return { error: res.error ?? 'model returned no content' };
    }
    return { sourceCode: res.content };
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
