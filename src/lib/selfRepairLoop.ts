/**
 * Stuck-aware self-repair core — pure detection + escalation logic.
 *
 * Recourse watches real signals (scheduler job failures, self-hosted boot
 * re-verify failures, forge quarantine, open anomalies, verifier pass-rate,
 * repair-team reachability, failure-ledger spikes) and marks an issue "stuck"
 * when a signal keeps failing past a threshold. Stuck issues are the trigger
 * for the repair loop: report to the repair team, ask the deterministic brain
 * for a targeted fix, and apply gate-passing proposals.
 *
 * Honesty contract:
 *  - `consecutiveFailures` only increments while the source keeps failing and
 *    resets to 0 on a genuinely healthy pass — never decremented by absence.
 *  - No signal this pass = "no data": the issue keeps its last known state
 *    instead of being silently declared healthy.
 *  - Escalation is rate-limited (backoff) and every action is recorded; the
 *    operator can clear an issue via the API.
 */

export type StuckSignalKind =
  | 'job'
  | 'selfhosted'
  | 'forge'
  | 'anomaly'
  | 'verifier'
  | 'repair_team'
  | 'failure_spike'
  | 'service'
  | 'goal';

/** One observed, real signal about a subsystem. */
export interface StuckSignal {
  /** Stable slug, e.g. 'job:forge' or 'selfhosted:lr-cache'. */
  id: string;
  name: string;
  kind: StuckSignalKind;
  /** True when the subsystem is currently failing. */
  failing: boolean;
  /** Real reason (e.g. job lastError, verifier pass-rate). */
  detail: string;
  /** Consecutive failures required before the issue counts as stuck. */
  threshold: number;
}

export interface StuckIssue extends StuckSignal {
  /** Real consecutive failing passes observed so far this streak. */
  consecutiveFailures: number;
  /** True once consecutiveFailures >= threshold. */
  stuck: boolean;
  lastEscalatedAt: number | null;
  escalationCount: number;
}

export interface StuckSnapshot {
  issues: StuckIssue[];
  stuckCount: number;
  activeCount: number;
}

/** Default escalation backoff between repair-team/brain dispatches per issue. */
export const DEFAULT_ESCALATION_BACKOFF_MS = 10 * 60 * 1000;

/** Default threshold: a subsystem must fail 3 consecutive passes to be stuck. */
export const DEFAULT_STUCK_THRESHOLD = 3;

/**
 * Fold a new set of observed signals into the previous issue state. Pure and
 * deterministic. Issues with no signal this pass keep their last state.
 */
export function updateStuckIssues(
  prev: StuckIssue[],
  signals: StuckSignal[],
  now: number,
): StuckIssue[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  for (const sig of signals) {
    const existing = byId.get(sig.id);
    if (!existing) {
      byId.set(sig.id, {
        ...sig,
        consecutiveFailures: sig.failing ? 1 : 0,
        stuck: sig.failing && sig.threshold <= 1,
        lastEscalatedAt: null,
        escalationCount: 0,
      });
      continue;
    }
    const consecutive = sig.failing ? existing.consecutiveFailures + 1 : 0;
    byId.set(sig.id, {
      ...existing,
      ...sig,
      consecutiveFailures: consecutive,
      stuck: consecutive >= sig.threshold,
      lastEscalatedAt: existing.lastEscalatedAt,
      escalationCount: existing.escalationCount,
    });
  }
  const issues = [...byId.values()];
  return issues;
}

/** True when a stuck issue is past its escalation backoff. */
export function shouldEscalate(issue: StuckIssue, now: number, minGapMs = DEFAULT_ESCALATION_BACKOFF_MS): boolean {
  if (!issue.stuck) return false;
  if (issue.lastEscalatedAt == null) return true;
  return now - issue.lastEscalatedAt >= minGapMs;
}

/** The health-dossier style repair row for one stuck issue (drives the
 *  repair team's >=50 auto-dispatch band). Pure and deterministic. */
export function repairRowForIssue(issue: StuckIssue, repoUrl?: string | null): {
  component_slug: string;
  component_name: string;
  weakness_score: number;
  reasons: string[];
  proposed_action: string;
  repo_url?: string | null;
} {
  return {
    component_slug: `recourse:stuck:${issue.id}`,
    component_name: `Recourse stuck: ${issue.name}`,
    weakness_score: Math.max(60, Math.min(100, 60 + issue.consecutiveFailures * 5)),
    reasons: [
      `${issue.detail}`,
      `failing ${issue.consecutiveFailures} consecutive self-repair passes (threshold ${issue.threshold}); escalations so far: ${issue.escalationCount}`,
    ],
    proposed_action: 'Repair this subsystem so it returns to a healthy pass; Recourse will re-verify it live.',
    ...(repoUrl ? { repo_url: repoUrl } : {}),
  };
}

/** Build a targeted brain query for one stuck issue (patch-intake shape). */
export function buildStuckRepairQuery(issue: StuckIssue, repoUrl?: string | null): string {
  return (
    `Recourse is STUCK on subsystem "${issue.id}" (${issue.name}). ` +
    `Observed reason: ${issue.detail}. It has failed ${issue.consecutiveFailures} consecutive self-repair passes. ` +
    `Propose a concrete repair. Output ONE fenced JSON block per file in this exact shape:\n` +
    '```json\n{ "file": "path/relative/to/repo/root", "source": "the complete new file contents", "suite": "optional real test code that proves the fix" }\n```\n' +
    `Rules: paths are repo-relative with forward slashes; every code change MUST carry a real suite that passes; ` +
    `do not invent files outside the repo (${repoUrl ?? 'this repo'}). ` +
    `Recourse applies a patch ONLY after it passes its own sandbox verifier + lint, so correctness matters, not prose. ` +
    `If the fix is operational (restart a service, clear a quarantine), say so in a "note" block and propose no code.`
  );
}

/** Snapshot helper for dashboards. */
export function stuckSnapshot(issues: StuckIssue[]): StuckSnapshot {
  return {
    issues: [...issues].sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.consecutiveFailures - a.consecutiveFailures),
    stuckCount: issues.filter((i) => i.stuck).length,
    activeCount: issues.filter((i) => i.failing).length,
  };
}