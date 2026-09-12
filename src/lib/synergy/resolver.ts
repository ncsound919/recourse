// src/lib/synergy/resolver.ts
/**
 * Resolver + admission gate. Execution decides; the model never sets status.
 * Only admissible proofs (executable_test / oracle / formal / human) promote.
 */
import { verifyCodingCode } from '../verifiers.js';
import { sha256Hex } from './manifest.js';
import { appendInsight, type LedgerInsight } from '../trendLedger.js';
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
  return parts.join(' | ');
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

/** Append a ledger insight recording the transfer outcome (hash-chained). */
export function recordTransferResult(result: TransferResult, manifestRoot: string): LedgerInsight | null {
  return appendInsight({
    createdRun: 'synergy:resolve',
    hypothesisId: result.candidateId,
    templateId: result.outcome === 'passed' ? 'crossdomain_transfer_passed' : 'crossdomain_transfer_refuted',
    statement: `Transfer ${result.candidateId} ${result.outcome} via ${result.proofType} (${result.detail.slice(0, 120)})`,
    confidence: result.outcome === 'passed' ? 1 : 0,
    provenanceRoot: manifestRoot,
    payload: { proofType: result.proofType, sandboxReportHash: result.sandboxReportHash, adaptedBy: result.adaptedBy },
  });
}
