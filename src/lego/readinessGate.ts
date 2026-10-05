/**
 * LEGO registry-commit readiness gate.
 *
 * The gate that decides whether a LEGO assembly may be committed to the durable
 * registry defaulted to `1` when readiness had never been measured. That failed
 * OPEN: `status.readinessScore` is only assigned by `runServerTickOnce()`, so on
 * a fresh boot — or from any state file predating the field — an HTTP
 * `POST /api/recourse/lego/assemble` opened the commit gate to maximum readiness
 * on a system whose stability had never been checked.
 *
 * Every sibling consumer of the same field defaults the other way
 * (`engine.ts` initialises the gate to 0, and two other call sites use `?? 0`).
 * Unmeasured must never read as "fully stable", so this resolves to 0.
 */
export const LEGO_COMMIT_READINESS_THRESHOLD = 0.7;

/**
 * Resolve the readiness score to hand the LEGO gate.
 *
 * Returns 0 for anything that is not a finite number — undefined, null, NaN or
 * Infinity — because a non-number is precisely the "never measured" case that
 * must fail closed.
 */
export function resolveLegoReadinessGate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** True when a resolved score clears the commit threshold. */
export function leyoCommitGateOpen(score: unknown): boolean {
  return resolveLegoReadinessGate(score) >= LEGO_COMMIT_READINESS_THRESHOLD;
}
