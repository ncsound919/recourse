// src/lib/synergy/resolver.ts
/**
 * Resolver + admission gate. Execution decides; the model never sets status.
 * Only admissible proofs (executable_test / oracle / formal / human) promote.
 */
import { verifyCodingCode } from '../verifiers.js';
import { sha256Hex } from './manifest.js';
import { appendInsight, type LedgerInsight } from '../trendLedger.js';
import { ladderCandidates, type LadderOperator } from './adapters.js';
import type {
  TransferCandidate, TransferResult, AdmissionDecision, SynergyMap, SynergyEdge,
} from './types.js';

/** Compose a deterministic, timing-free detail string from a verifier result. */
function verifierDetail(res: {
  summary?: string;
  details?: string[];
  stderr?: string;
}): string {
  const parts: string[] = [];
  if (res.summary) parts.push(res.summary);
  if (Array.isArray(res.details)) parts.push(...res.details);
  if (res.stderr) parts.push(res.stderr);
  return parts.join(' | ').replace(/\b\d+(?:\.\d+)?ms\b/g, '<timing>');
}

export function resolveTransfer(
  candidate: TransferCandidate,
  acceptanceTest: string,
  sourceCode: string,
  adaptedBy: TransferResult['adaptedBy'] = 'operator_ladder',
): TransferResult {
  const started = Date.now();
  let passed = false;
  let detail = '';
  try {
    if (!acceptanceTest.trim()) throw new Error('acceptance test cannot be empty');
    const res = verifyCodingCode(sourceCode, acceptanceTest);
    passed = Boolean(res.passed);
    detail = verifierDetail(res) || (passed ? 'suite passed' : 'suite failed');
  } catch (err) {
    return {
      candidateId: candidate.id, outcome: 'error', proofType: 'executable_test',
      sandboxReportHash: sha256Hex(`${candidate.id}|error|${err instanceof Error ? err.message : String(err)}`),
      durationMs: Date.now() - started, adaptedBy, detail: err instanceof Error ? err.message : String(err),
    };
  }
  const outcome = passed ? 'passed' : 'failed';
  return {
    candidateId: candidate.id, outcome, proofType: 'executable_test',
    sandboxReportHash: sha256Hex(`${candidate.id}|${outcome}|${detail}`),
    durationMs: Date.now() - started, adaptedBy, detail,
  };
}

// ---------------------------------------------------------------------------
// CBR operator ladder (Plan 9): reduce dependence on caller-supplied adaptations
// ---------------------------------------------------------------------------

export interface LadderAttemptRecord {
  operator: LadderOperator | 'model';
  outcome: TransferResult['outcome'];
  detail: string;
}

export interface LadderResolution {
  result: TransferResult | null;
  /** Which step produced the returned result (null candidate => 'none'). */
  operator: LadderOperator | 'model' | 'none';
  attempts: LadderAttemptRecord[];
}

/**
 * Try deterministic ladder operators in order, then (optionally) a model
 * drafter. Every candidate is executed through `resolveTransfer`; the first
 * admissible pass wins. Never fabricates a pass — all-fail returns the last
 * executed result honestly.
 */
export async function resolveWithLadder(
  candidate: TransferCandidate,
  acceptanceTest: string,
  input: { sourceCode?: string },
  drafter?: () => Promise<{ ok: boolean; sourceCode?: string; error?: string }>,
): Promise<LadderResolution> {
  const attempts: LadderAttemptRecord[] = [];
  const candidates = ladderCandidates({ sourceCode: input.sourceCode, acceptanceTest });
  let last: TransferResult | null = null;
  let lastOperator: LadderOperator | 'model' | 'none' = 'none';

  for (const c of candidates) {
    const result = resolveTransfer(candidate, acceptanceTest, c.sourceCode, 'operator_ladder');
    attempts.push({ operator: c.operator, outcome: result.outcome, detail: c.note });
    last = result;
    lastOperator = c.operator;
    if (result.outcome === 'passed') return { result, operator: c.operator, attempts };
  }

  if (drafter) {
    try {
      const draft = await drafter();
      if (draft.ok && draft.sourceCode) {
        const result = resolveTransfer(candidate, acceptanceTest, draft.sourceCode, 'model');
        attempts.push({ operator: 'model', outcome: result.outcome, detail: 'model-drafted adaptation' });
        last = result;
        lastOperator = 'model';
        if (result.outcome === 'passed') return { result, operator: 'model', attempts };
      } else {
        attempts.push({ operator: 'model', outcome: 'error', detail: draft.error ?? 'drafter produced no source' });
      }
    } catch (err) {
      attempts.push({ operator: 'model', outcome: 'error', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return { result: last, operator: lastOperator, attempts };
}

// ---------------------------------------------------------------------------
// Additional admissible proofs (Plan 9): oracle metric + human signoff
// ---------------------------------------------------------------------------

/** Oracle proof: a pre-registered metric must clear a threshold. */
export function resolveOracle(
  candidate: TransferCandidate,
  metricValue: number,
  threshold: number,
  label = 'oracle_metric',
): TransferResult {
  const passed = metricValue >= threshold;
  const outcome = passed ? 'passed' : 'failed';
  return {
    candidateId: candidate.id,
    outcome,
    proofType: 'oracle_metric',
    sandboxReportHash: sha256Hex(`${candidate.id}|oracle_metric|${label}|${metricValue}|${threshold}|${outcome}`),
    durationMs: 0,
    adaptedBy: 'none',
    detail: `${label}: ${metricValue} ${passed ? '>=' : '<'} ${threshold}`,
  };
}

export interface HumanSignoff {
  operatorId: string;
  accepted: boolean;
  /** Deterministic timestamp source; defaults to wall clock (evidence only). */
  timestamp?: number;
  note?: string;
}

/** Human signoff proof: an accountable operator accepted/rejected the transfer. */
export function recordHumanSignoff(candidate: TransferCandidate, signoff: HumanSignoff): TransferResult {
  const ts = signoff.timestamp ?? Date.now();
  const outcome = signoff.accepted ? 'passed' : 'failed';
  return {
    candidateId: candidate.id,
    outcome,
    proofType: 'human_signoff',
    sandboxReportHash: sha256Hex(`${candidate.id}|human_signoff|${signoff.operatorId}|${ts}|${outcome}|${signoff.note ?? ''}`),
    durationMs: 0,
    adaptedBy: 'none',
    detail: `human signoff by ${signoff.operatorId} at ${new Date(ts).toISOString()}${signoff.note ? `: ${signoff.note}` : ''}`,
  };
}

/** Admission gate: only passing admissible proofs promote to reproduced. */
export function admit(result: TransferResult): AdmissionDecision {
  const admissible = result.proofType === 'executable_test' || result.proofType === 'oracle_metric'
    || result.proofType === 'formal_proof' || result.proofType === 'human_signoff';
  if (!admissible) return { candidateId: result.candidateId, status: 'tested', admitted: false, reason: 'non-admissible proof' };
  if (result.outcome === 'passed') return { candidateId: result.candidateId, status: 'reproduced', admitted: true, reason: 'admissible proof passed' };
  if (result.outcome === 'failed') return { candidateId: result.candidateId, status: 'refuted', admitted: false, reason: 'admissible proof failed' };
  return { candidateId: result.candidateId, status: 'tested', admitted: false, reason: 'execution error' };
}

/** Add/update a resolved edge (directed) on the map; candidates are preserved. */
export function applyTransferResult(map: SynergyMap, result: TransferResult, candidate?: TransferCandidate): SynergyMap {
  const c = candidate ?? map.candidates.find((x) => x.id === result.candidateId);
  if (!c) return map;
  const edges = map.edges.map((e) => ({ ...e, backingIds: [...e.backingIds] }));
  const existing = edges.find((e) => e.from === c.fromDomain && e.to === c.toDomain && e.kind === 'resolved');
  const passed = result.outcome === 'passed' ? 1 : 0;
  if (existing) {
    existing.passes += passed;
    existing.attempts += 1;
    existing.backingIds.push(result.candidateId);
  } else {
    const edge: SynergyEdge = {
      from: c.fromDomain, to: c.toDomain, kind: 'resolved',
      score: result.outcome === 'passed' ? c.score : 0, passes: passed, attempts: 1,
      backingIds: [result.candidateId],
    };
    edges.push(edge);
  }
  edges.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return { ...map, edges };
}

/** Ledger template id for a transfer outcome, labeled by proof type. */
function transferTemplateId(result: TransferResult): string {
  if (result.proofType === 'oracle_metric') return `crossdomain_transfer_oracle_${result.outcome}`;
  if (result.proofType === 'human_signoff') return `crossdomain_transfer_signoff_${result.outcome}`;
  if (result.proofType === 'formal_proof') return `crossdomain_transfer_formal_${result.outcome}`;
  return result.outcome === 'passed' ? 'crossdomain_transfer_passed' : 'crossdomain_transfer_refuted';
}

/** Append a ledger insight recording the transfer outcome (hash-chained). */
export function recordTransferResult(result: TransferResult, manifestRoot: string): LedgerInsight | null {
  return appendInsight({
    createdRun: 'synergy:resolve',
    hypothesisId: result.candidateId,
    templateId: transferTemplateId(result),
    statement: `Transfer ${result.candidateId} ${result.outcome} via ${result.proofType} (${result.detail.slice(0, 120)})`,
    confidence: result.outcome === 'passed' ? 1 : 0,
    provenanceRoot: manifestRoot,
    payload: { proofType: result.proofType, sandboxReportHash: result.sandboxReportHash, adaptedBy: result.adaptedBy },
  });
}
