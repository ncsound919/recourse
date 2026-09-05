/**
 * Genome Council client — Recourse → deterministic-brain `/genome-council/*`.
 *
 * The deterministic brain (the Deep, BRAIN_URL default :3210) hosts a local,
 * LLM-free genome-council decision engine (leader archetypes) with a durable
 * believability ledger. A post-mortem records a real outcome; the brain then
 * compounds (persists) the believability of the leaders implicated so the next
 * council weighs what it has learned. This module is Recourse's client for that
 * capability — consult the council, read what it has learned, and record
 * outcomes.
 *
 * Honesty contract (mirrors fleetDevelopment):
 *  - Every function probes/attempts the real HTTP endpoint and returns an
 *    honest `ok:false` when the brain is unreachable or not configured. No
 *    fabricated council output, no invented belief weights.
 *  - The council's output is advisory strategy/approach guidance over leader
 *    archetypes. It does NOT verify Recourse code. Recourse's own sandbox
 *    verifier + lint gate remain the only thing that can promote a change.
 *    Recording an outcome here only updates the brain's believability.
 */

export interface GenomeCouncilResult {
  ok: boolean;
  error?: string;
  status?: number;
  // full council trace (present only when ok)
  result?: Record<string, unknown>;
}

export interface CouncilStateResult {
  ok: boolean;
  error?: string;
  status?: number;
  overview?: Record<string, unknown>;
  learnedWeights?: Record<string, number>;
}

export interface CouncilLessonsResult {
  ok: boolean;
  error?: string;
  status?: number;
  total?: number;
  lessons?: Array<Record<string, unknown>>;
}

export type CouncilOutcome = 'success' | 'partial' | 'failure';

export interface CouncilPostMortemInput {
  decisionTitle: string;
  sector?: string;
  chosenOption?: string;
  predictedProbability: number;
  actualOutcome: CouncilOutcome;
  /** Leader genome ids the decision leaned on (must exist in the brain canon). */
  leaderIds: string[];
  rootCauses?: string[];
  keyLessons?: string[];
  metricVariances?: Array<Record<string, unknown>>;
  retrospectiveSummary?: string;
}

export interface CouncilPostMortemResult {
  ok: boolean;
  error?: string;
  status?: number;
  record?: Record<string, unknown>;
  adjustmentsApplied?: number;
  lessonsStored?: number;
  durable?: boolean;
  overview?: Record<string, unknown>;
}

function baseUrlOf(url?: string): string {
  return (url ?? process.env.BRAIN_URL ?? '').replace(/\/+$/, '');
}

async function fetchJson(
  base: string,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    const data = (await res.json().catch(() => null)) as unknown;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/** Build the advisory problem statement the council reasons over. When a top
 *  finding is supplied the problem names the real weakness Recourse measures;
 *  otherwise it is a generic next-step question. Pure + deterministic. */
export function buildCouncilProblem(topFinding?: { name?: string; reasons?: string[] }): string {
  if (topFinding && topFinding.name) {
    const reasons = (topFinding.reasons ?? []).slice(0, 4).map((r) => `- ${r}`).join('\n');
    return (
      `Recourse self-development: choose the leader-archetype strategy lens to apply to ` +
      `"${topFinding.name}". Weakness reasons:\n${reasons || '(none recorded)'}\n` +
      `Recommend the primary approach (mental model + toolchain) to guide this repair, ` +
      `with a cross-validation and a tertiary insight.`
    );
  }
  return (
    `Recourse self-development: given the current health dossier, recommend the ` +
    `leader-archetype strategy lens for the single highest-value next repair, plus ` +
    `how to cross-validate it.`
  );
}

/** Run the deterministic brain's genome council over `problem`. */
export async function councilDecide(opts: {
  url?: string;
  problem: string;
  selectedGenomes?: string[];
  activeSectors?: string[];
  timeoutMs?: number;
}): Promise<GenomeCouncilResult> {
  const base = baseUrlOf(opts.url);
  if (!base) return { ok: false, error: 'BRAIN_URL not configured' };
  try {
    const { ok, status, data } = await fetchJson(
      base,
      '/genome-council/decide',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: opts.problem,
          selected_genomes: opts.selectedGenomes ?? undefined,
          active_sectors: opts.activeSectors ?? undefined,
        }),
      },
      opts.timeoutMs ?? 30_000,
    );
    if (!ok) return { ok: false, status, error: `genome-council/decide HTTP ${status}` };
    return { ok: true, result: (data ?? {}) as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Read the brain's genome-council ledger: learned believability + overview. */
export async function councilState(opts: { url?: string; timeoutMs?: number } = {}): Promise<CouncilStateResult> {
  const base = baseUrlOf(opts.url);
  if (!base) return { ok: false, error: 'BRAIN_URL not configured' };
  try {
    const { ok, status, data } = await fetchJson(base, '/genome-council/state', { method: 'GET' }, opts.timeoutMs ?? 15_000);
    if (!ok) return { ok: false, status, error: `genome-council/state HTTP ${status}` };
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      overview: d,
      learnedWeights: (d.learned_weights ?? {}) as Record<string, number>,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Read recent lessons the deterministic brain has learned from outcomes. */
export async function councilLessons(opts: { url?: string; limit?: number; timeoutMs?: number } = {}): Promise<CouncilLessonsResult> {
  const base = baseUrlOf(opts.url);
  if (!base) return { ok: false, error: 'BRAIN_URL not configured' };
  try {
    const qs = opts.limit ? `?limit=${Math.max(1, Math.floor(opts.limit))}` : '';
    const { ok, status, data } = await fetchJson(base, `/genome-council/lessons${qs}`, { method: 'GET' }, opts.timeoutMs ?? 15_000);
    if (!ok) return { ok: false, status, error: `genome-council/lessons HTTP ${status}` };
    const d = (data ?? {}) as { lessons?: Array<Record<string, unknown>>; total?: number };
    return { ok: true, total: d.total ?? 0, lessons: d.lessons ?? [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Record a real Recourse outcome so the brain compounds leader believability.
 *  `leaderIds` must name leaders present in the brain's genome canon; this is
 *  the caller's honest attribution of which strategy lens was used. */
export async function councilPostMortem(opts: {
  url?: string;
  input: CouncilPostMortemInput;
  timeoutMs?: number;
}): Promise<CouncilPostMortemResult> {
  const base = baseUrlOf(opts.url);
  const { input } = opts;
  if (!input.decisionTitle || input.leaderIds.length === 0) {
    return { ok: false, error: 'decisionTitle and at least one leaderIds entry are required' };
  }
  if (!base) return { ok: false, error: 'BRAIN_URL not configured' };
  try {
    const { ok, status, data } = await fetchJson(
      base,
      '/genome-council/post-mortem',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision_title: input.decisionTitle,
          sector: input.sector ?? 'dev',
          chosen_option: input.chosenOption ?? '',
          predicted_probability: input.predictedProbability,
          actual_outcome: input.actualOutcome,
          leader_ids: input.leaderIds,
          metric_variances: input.metricVariances ?? [],
          root_causes: input.rootCauses ?? [],
          key_lessons: input.keyLessons ?? [],
          retrospective_summary: input.retrospectiveSummary ?? '',
        }),
      },
      opts.timeoutMs ?? 20_000,
    );
    if (!ok) return { ok: false, status, error: `genome-council/post-mortem HTTP ${status}` };
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      record: (d.record ?? {}) as Record<string, unknown>,
      adjustmentsApplied: d.adjustments_applied as number | undefined,
      lessonsStored: d.lessons_stored as number | undefined,
      durable: d.durable as boolean | undefined,
      overview: (d.overview ?? {}) as Record<string, unknown>,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
