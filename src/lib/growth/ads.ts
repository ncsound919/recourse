/**
 * ads.ts — a guarded paid-acquisition PLANNER.
 *
 * It validates an objective/budget/audience and produces a deterministic channel
 * allocation with creative angles the operator can act on. It does NOT call any
 * ad network and makes NO impressions/clicks/conversions/reach estimates — those
 * require a live account and are listed as unmeasured. Any future live-spend
 * path must be explicitly enabled; this module never spends.
 */
export type AdChannel = 'search' | 'social' | 'display' | 'newsletter';
export const AD_CHANNELS: readonly AdChannel[] = ['search', 'social', 'display', 'newsletter'];

export interface AdPlanInput {
  objective: string;
  dailyBudgetCents: number;
  days?: number;
  channels: AdChannel[];
  audience: string;
  landingUrl: string;
  geo?: string;
}

export interface AdAllocation {
  channel: AdChannel;
  dailyBudgetCents: number;
  angle: string;
}

export interface AdPlan {
  objective: string;
  audience: string;
  landingUrl: string;
  geo?: string;
  dailyBudgetCents: number;
  days: number;
  totalBudgetCents: number;
  allocations: AdAllocation[];
  honestyNotes: string[];
  live: false;
}

export interface AdPlanResult {
  ok: boolean;
  errors: string[];
  plan?: AdPlan;
}

const CHANNEL_ANGLE: Record<AdChannel, string> = {
  search: 'High-intent keywords: problem-aware searchers looking for a solution now.',
  social: 'Scroll-stopping proof: a concrete result or before/after for the audience.',
  display: 'Retargeting: remind visitors who viewed the landing page but did not convert.',
  newsletter: 'Sponsorship/placement in a niche list the audience already trusts.',
};

export function validateAdPlan(input: Partial<AdPlanInput>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!String(input.objective ?? '').trim()) errors.push('objective is required');
  const budget = Number(input.dailyBudgetCents);
  if (!Number.isFinite(budget) || budget <= 0) errors.push('dailyBudgetCents must be a positive integer');
  if (!Array.isArray(input.channels) || input.channels.length === 0) errors.push('at least one channel is required');
  else if (input.channels.some((c) => !AD_CHANNELS.includes(c))) errors.push(`channels must be one of ${AD_CHANNELS.join(', ')}`);
  if (!String(input.audience ?? '').trim()) errors.push('audience is required');
  if (!/^https?:\/\//i.test(String(input.landingUrl ?? ''))) errors.push('landingUrl must be http(s)');
  const days = input.days === undefined ? 14 : Number(input.days);
  if (!Number.isFinite(days) || days <= 0) errors.push('days must be positive');
  return { ok: errors.length === 0, errors };
}

/** Split a daily budget across channels as evenly as integer cents allow. */
export function allocateBudget(dailyBudgetCents: number, channels: AdChannel[]): Array<{ channel: AdChannel; dailyBudgetCents: number }> {
  const n = channels.length;
  if (n === 0) return [];
  const base = Math.floor(dailyBudgetCents / n);
  const remainder = dailyBudgetCents - base * n;
  return channels.map((channel, i) => ({ channel, dailyBudgetCents: base + (i < remainder ? 1 : 0) }));
}

export function buildAdPlan(input: Partial<AdPlanInput>): AdPlanResult {
  const validation = validateAdPlan(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const channels = input.channels as AdChannel[];
  const days = input.days === undefined ? 14 : Number(input.days);
  const dailyBudgetCents = Number(input.dailyBudgetCents);
  const allocations: AdAllocation[] = allocateBudget(dailyBudgetCents, channels).map((a) => ({
    ...a,
    angle: CHANNEL_ANGLE[a.channel],
  }));
  return {
    ok: true,
    errors: [],
    plan: {
      objective: String(input.objective).trim(),
      audience: String(input.audience).trim(),
      landingUrl: String(input.landingUrl).trim(),
      geo: input.geo ? String(input.geo) : undefined,
      dailyBudgetCents,
      days,
      totalBudgetCents: dailyBudgetCents * days,
      allocations,
      honestyNotes: [
        'Planning only — no ad network is called and no money is spent.',
        'No impressions, clicks, CPC, reach or conversion estimates are made; those require a live account.',
      ],
      live: false,
    },
  };
}
