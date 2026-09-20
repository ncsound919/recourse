/**
 * Fleet voice — spoken summaries and transition events for the Axiom and
 * OpenHub integration surfaces.
 *
 * Pure and deterministic: given the same observed state it returns the same
 * brief and the same events. It never invents a grade, a loop result, or a
 * connection that was not actually probed — an absent audit snapshot says so
 * rather than guessing a score.
 *
 * Used by both sides of the wire:
 *   - `GET /api/recourse/fleet/voice` (server) builds the briefs;
 *   - `useFleetVoiceMonitor` (browser) diffs consecutive snapshots so the
 *     narration engine can speak real transitions.
 */

import type { ReporterAuditFact } from './selfReporter.js';

export type FleetAuth = 'token' | 'keywire' | 'none';

export interface FleetAxiomLoop {
  id: string;
  status: string | null;
  iteration: number | null;
  goal: string | null;
}

export interface FleetAxiomState {
  online: boolean;
  url: string;
  auth: FleetAuth;
  /** Axiom's most recent project loop, when one could be read. */
  loop: FleetAxiomLoop | null;
  /** True when the loop probe ran and Axiom simply has no loop yet. */
  noLoopYet: boolean;
  /** Why the loop is unavailable (probe failed / bridge offline). */
  loopError: string | null;
}

export interface FleetOpenHubState {
  /** False when no audit snapshot has been recorded at all. */
  recorded: boolean;
  audit: ReporterAuditFact | null;
}

export interface FleetVoiceState {
  axiom: FleetAxiomState;
  openhub: FleetOpenHubState;
}

export interface FleetVoiceBriefs {
  axiom: string;
  openhub: string;
}

export type FleetEventKind = 'critical' | 'major' | 'minor' | 'milestone';

export interface FleetVoiceEvent {
  kind: FleetEventKind;
  text: string;
}

function authPhrase(auth: FleetAuth): string {
  return auth === 'none' ? 'no auth' : `${auth} auth`;
}

/** One spoken sentence (or three) describing what Axiom is actually doing. */
export function summarizeAxiom(state: FleetAxiomState): string {
  if (!state.online) {
    return `Axiom bridge is offline at ${state.url || 'its configured URL'}. Tool builds and repair loops cannot leave Recourse.`;
  }
  // A missing loop is not a failure — say which of the two it is, plainly.
  if (!state.loop && state.noLoopYet) {
    return `Axiom bridge is online with ${authPhrase(state.auth)}. No project loop has been recorded yet.`;
  }
  if (!state.loop) {
    return state.loopError
      ? `Axiom bridge is online with ${authPhrase(state.auth)}, but its latest loop could not be read: ${state.loopError}.`
      : `Axiom bridge is online with ${authPhrase(state.auth)}. No project loop has been recorded yet.`;
  }
  const iteration = state.loop.iteration !== null ? ` at iteration ${state.loop.iteration}` : '';
  const goal = state.loop.goal ? ` on ${state.loop.goal}` : '';
  return `Axiom bridge is online with ${authPhrase(state.auth)}. Loop ${state.loop.id} is ${state.loop.status ?? 'in an unknown state'}${iteration}${goal}.`;
}

/** One spoken paragraph describing OpenHub's real audit numbers. */
export function summarizeOpenHub(state: FleetOpenHubState): string {
  const audit = state.audit;
  if (!state.recorded || !audit) {
    return 'OpenHub has not recorded an audit snapshot, so no grade can be reported.';
  }
  const score = audit.score === null ? '' : ` (${audit.score} out of 100)`;
  const covered = audit.dimensions.filter((d) => d.status === 'covered').length;
  const findings = audit.findings;
  const parts = [
    `OpenHub's last audit graded the work ${audit.grade}${score}.`,
    `Coverage was ${audit.coveragePercent} percent over a ${audit.scope} pass, ${covered} of ${audit.dimensions.length} dimensions covered.`,
    `Findings stand at ${findings.total}: ${findings.new} new, ${findings.fixed} fixed, ${findings.persisted} persisted.`,
  ];
  if (audit.reasons.length) parts.push(`The grade moved because ${audit.reasons.join('; ')}.`);
  return parts.join(' ');
}

export function buildFleetBriefs(state: FleetVoiceState): FleetVoiceBriefs {
  return { axiom: summarizeAxiom(state.axiom), openhub: summarizeOpenHub(state.openhub) };
}

// --- transition detection -------------------------------------------------

export interface FleetVoiceSnapshot {
  axiomOnline: boolean;
  axiomUrl: string;
  axiomLoopId: string | null;
  axiomLoopStatus: string | null;
  axiomLoopIteration: number | null;
  auditRecorded: boolean;
  auditGrade: string | null;
  auditScore: number | null;
  auditFindingsTotal: number | null;
  auditFixedFindings: number | null;
}

export function takeFleetSnapshot(state: FleetVoiceState): FleetVoiceSnapshot {
  const audit = state.openhub.audit;
  return {
    axiomOnline: state.axiom.online,
    axiomUrl: state.axiom.url,
    axiomLoopId: state.axiom.loop?.id ?? null,
    axiomLoopStatus: state.axiom.loop?.status ?? null,
    axiomLoopIteration: state.axiom.loop?.iteration ?? null,
    auditRecorded: state.openhub.recorded,
    auditGrade: audit?.grade ?? null,
    auditScore: audit?.score ?? null,
    auditFindingsTotal: audit?.findings.total ?? null,
    auditFixedFindings: audit?.findings.fixed ?? null,
  };
}

function isTerminalOk(status: string | null): boolean {
  return status === 'done' || status === 'complete' || status === 'completed';
}

function isFailure(status: string | null): boolean {
  return status === 'failed' || status === 'error';
}

/**
 * Events worth speaking between two real snapshots. Returns an empty list when
 * nothing meaningful changed — callers seed the baseline silently on first poll.
 */
export function diffFleetVoice(prev: FleetVoiceSnapshot, next: FleetVoiceSnapshot): FleetVoiceEvent[] {
  const events: FleetVoiceEvent[] = [];

  if (next.axiomOnline && !prev.axiomOnline) {
    events.push({ kind: 'major', text: 'Axiom bridge is reachable again.' });
  } else if (!next.axiomOnline && prev.axiomOnline) {
    events.push({ kind: 'critical', text: `Axiom bridge went unreachable at ${next.axiomUrl || 'its configured URL'}.` });
  }

  const loopChanged = next.axiomLoopId !== prev.axiomLoopId || next.axiomLoopStatus !== prev.axiomLoopStatus;
  if (loopChanged && next.axiomLoopId) {
    const iterations = next.axiomLoopIteration !== null ? ` after ${next.axiomLoopIteration} iterations` : '';
    if (isTerminalOk(next.axiomLoopStatus)) {
      events.push({ kind: 'major', text: `Axiom loop ${next.axiomLoopId} finished${iterations}.` });
    } else if (isFailure(next.axiomLoopStatus)) {
      events.push({ kind: 'critical', text: `Axiom loop ${next.axiomLoopId} failed${iterations}.` });
    } else if (next.axiomLoopStatus === 'running' && prev.axiomLoopId !== next.axiomLoopId) {
      events.push({ kind: 'minor', text: `Axiom started project loop ${next.axiomLoopId}.` });
    }
  } else if (
    next.axiomLoopId &&
    next.axiomLoopId === prev.axiomLoopId &&
    next.axiomLoopIteration !== null &&
    prev.axiomLoopIteration !== null &&
    next.axiomLoopIteration > prev.axiomLoopIteration
  ) {
    events.push({ kind: 'minor', text: `Axiom loop iteration ${next.axiomLoopIteration}.` });
  }

  if (next.auditRecorded && !prev.auditRecorded) {
    events.push({ kind: 'major', text: `OpenHub recorded an audit${next.auditGrade ? `: grade ${next.auditGrade}` : ''}.` });
  } else if (next.auditGrade && prev.auditGrade && next.auditGrade !== prev.auditGrade) {
    const score = next.auditScore !== null ? ` (${next.auditScore} out of 100)` : '';
    events.push({ kind: 'major', text: `OpenHub audit grade moved from ${prev.auditGrade} to ${next.auditGrade}${score}.` });
  }

  if (
    next.auditFindingsTotal !== null &&
    prev.auditFindingsTotal !== null &&
    next.auditFindingsTotal > prev.auditFindingsTotal
  ) {
    events.push({ kind: 'minor', text: `OpenHub audit findings rose to ${next.auditFindingsTotal}.` });
  }

  if (
    next.auditFixedFindings !== null &&
    prev.auditFixedFindings !== null &&
    next.auditFixedFindings > prev.auditFixedFindings
  ) {
    const fixed = next.auditFixedFindings - prev.auditFixedFindings;
    events.push({ kind: 'major', text: `OpenHub fixed ${fixed} finding${fixed === 1 ? '' : 's'}.` });
  }

  return events;
}
