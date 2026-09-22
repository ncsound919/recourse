/**
 * Honesty metrics (P1) — pure gates that stop the system from presenting
 * volume as progress. Four concerns, one place:
 *
 *  P1.4 Registry quality gate — reject sub-substance implementations before they
 *       are promoted (the forge mass-produced 9-LOC stubs and scraped headings).
 *  P1.5 Dream novelty gate — a hypothesis already in the recent window is not new.
 *  P1.6 Domain honesty — a domain with ~no genes / ~no pass rate is BROKEN, not
 *       "covered".
 *  P1.7 Capability readiness — a number derived from the benchmark + verified
 *       repairs, distinct from the recursive-math convergence score.
 *
 * Pure and deterministic: no clock, no randomness.
 */

// ---------------------------------------------------------------------------
// P1.4 — registry quality gate
// ---------------------------------------------------------------------------

export interface SubstanceVerdict {
  ok: boolean;
  reason?: string;
  meaningfulLines: number;
}

const COMMENT_PREFIXES = ['//', '/*', '*', '*/', '#'];

/** Lines that carry code (non-blank, non-comment, non-brace-only). */
function meaningfulLines(source: string): string[] {
  return String(source ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !COMMENT_PREFIXES.some((p) => l.startsWith(p)))
    .filter((l) => !/^[{}()[\];,]+$/.test(l));
}

/**
 * Is this implementation substantive enough to promote? A pass on a trivial
 * suite does not make a trivial tool useful — and a registry full of stubs is
 * volume, not capability. Targets stubs (empty body, declaration-only, no
 * callable), not brevity: a concise one-line implementation is fine.
 */
export function assessSourceSubstance(source: string): SubstanceVerdict {
  const s = String(source ?? '');
  const lines = meaningfulLines(s);
  const n = lines.length;
  if (n === 0) return { ok: false, reason: 'substance: empty (no code)', meaningfulLines: 0 };
  const hasExport = /\bexport\s+(default\s+)?(async\s+)?(function|const|let|var|class)\b/.test(s);
  if (!hasExport) return { ok: false, reason: 'substance: no exported function/const/class', meaningfulLines: n };
  const hasCallable = /\bfunction\b|=>|\bclass\b/.test(s);
  if (!hasCallable) return { ok: false, reason: 'substance: no function/arrow/class — a bare constant is not a tool', meaningfulLines: n };
  const hasBody = /\breturn\b|=>|\bif\b|\bfor\b|\bwhile\b|\bswitch\b|\bthrow\b|\bnew\b|\w+\s*=[^=]/.test(s);
  if (!hasBody) return { ok: false, reason: 'substance: declaration only — no body', meaningfulLines: n };
  return { ok: true, meaningfulLines: n };
}

// ---------------------------------------------------------------------------
// P1.5 — dream novelty gate
// ---------------------------------------------------------------------------

/** Normalize a hypothesis for comparison (case/punctuation/space-insensitive). */
export function normalizeHypothesis(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when `hypothesis` is not already in the recent window. A dream that
 * re-derives the same idea is looping, not discovering.
 */
export function isNovelHypothesis(
  hypothesis: string,
  recent: Array<{ hypothesis?: string; premise?: string }>,
  window = 24,
): boolean {
  const h = normalizeHypothesis(hypothesis);
  if (!h) return false;
  return !recent
    .slice(0, Math.max(0, window))
    .some((r) => normalizeHypothesis(r.hypothesis || r.premise || '') === h);
}

// ---------------------------------------------------------------------------
// P1.6 — domain honesty
// ---------------------------------------------------------------------------

export const DOMAIN_BROKEN_PASS_RATE = 0.25;
export const DOMAIN_BROKEN_MIN_GENES = 3;

export interface DomainHealth {
  broken: boolean;
  note?: string;
}

/** A domain with too few live genes or too low a pass rate is broken, not covered. */
export function domainHealth(activeGenes: number, passRate: number): DomainHealth {
  const genes = Number.isFinite(activeGenes) ? activeGenes : 0;
  const rate = Number.isFinite(passRate) ? passRate : 0;
  if (genes < DOMAIN_BROKEN_MIN_GENES || rate < DOMAIN_BROKEN_PASS_RATE) {
    return { broken: true, note: `broken: ${genes} gene(s) @ ${Math.round(rate * 100)}% — not covered` };
  }
  return { broken: false };
}

// ---------------------------------------------------------------------------
// P1.7 — capability readiness
// ---------------------------------------------------------------------------

export interface CapabilityReadiness {
  score: number;
  basis: string;
}

/**
 * A capability number that can actually move: the mean of the benchmark's
 * solved fraction and the verified-repair rate. Pending repairs are excluded
 * (they are not outcomes). Distinct from the recursive-math `readinessScore`,
 * which measures the math loop's convergence, not the system's capability.
 */
export function capabilityReadiness(input: {
  benchmarkSolved: number;
  benchmarkTotal: number;
  verified: number;
  regressed: number;
}): CapabilityReadiness {
  const bench = input.benchmarkTotal > 0 ? input.benchmarkSolved / input.benchmarkTotal : 0;
  const resolved = input.verified + input.regressed;
  const repair = resolved > 0 ? input.verified / resolved : 0;
  return {
    score: Math.round(((bench + repair) / 2) * 100) / 100,
    basis: 'mean(benchmark solved%, verified-repair rate); pending repairs excluded',
  };
}
