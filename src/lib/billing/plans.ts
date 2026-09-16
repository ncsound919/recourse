/**
 * plans.ts — the loadable pricing catalogue. A plan bundles a price, a Stripe
 * price id, a scope set and the monthly quotas the metering layer enforces.
 *
 * Plans live as JSON files under `data/plans/` so pricing can change without a
 * deploy. When the directory is missing or empty (fresh checkout, hermetic
 * tests) a single built-in free plan is returned, so the quota layer always has
 * something safe and permissive-but-bounded to enforce.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../durableJson.js';

export interface PlanQuotas {
  requestsPerMonth: number;
  tokensPerMonth: number;
  centsPerMonth: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  interval: 'month';
  /** Stripe Price id; empty/undefined means "not for sale" (e.g. free). */
  stripePriceId?: string;
  quotas: PlanQuotas;
  scopes: string[];
  features?: string[];
}

export const FREE_PLAN: Plan = {
  id: 'free',
  name: 'Free',
  description: 'Evaluation tier for local and hobby use.',
  priceCents: 0,
  currency: 'usd',
  interval: 'month',
  quotas: { requestsPerMonth: 10_000, tokensPerMonth: 2_000_000, centsPerMonth: 500 },
  scopes: ['read', 'write'],
  features: ['Metered API access', 'Community support'],
};

export function plansDir(): string {
  return process.env.RECOURSE_PLANS_DIR || path.join(process.cwd(), 'data', 'plans');
}

function isPlan(x: unknown): x is Plan {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.trim() !== '' && typeof p.name === 'string';
}

function normalizePlan(raw: Partial<Plan>): Plan {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: String(raw.description ?? ''),
    priceCents: Number.isFinite(raw.priceCents) ? Math.max(0, Math.round(raw.priceCents as number)) : 0,
    currency: String(raw.currency ?? 'usd'),
    interval: 'month',
    stripePriceId: typeof raw.stripePriceId === 'string' && raw.stripePriceId ? raw.stripePriceId : undefined,
    quotas: {
      requestsPerMonth: Math.max(0, Math.round(Number(raw.quotas?.requestsPerMonth ?? FREE_PLAN.quotas.requestsPerMonth))),
      tokensPerMonth: Math.max(0, Math.round(Number(raw.quotas?.tokensPerMonth ?? FREE_PLAN.quotas.tokensPerMonth))),
      centsPerMonth: Math.max(0, Math.round(Number(raw.quotas?.centsPerMonth ?? FREE_PLAN.quotas.centsPerMonth))),
    },
    scopes: Array.isArray(raw.scopes) && raw.scopes.length ? raw.scopes.map(String) : [...FREE_PLAN.scopes],
    features: Array.isArray(raw.features) ? raw.features.map(String) : undefined,
  };
}

/** Load every plan JSON from the directory. Empty/missing dir -> [FREE_PLAN]. */
export function loadPlans(dir = plansDir()): Plan[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [{ ...FREE_PLAN }];
  }
  const plans: Plan[] = [];
  for (const f of files.sort()) {
    const parsed = readJsonFile<Partial<Plan> | null>(path.join(dir, f), null);
    if (isPlan(parsed)) plans.push(normalizePlan(parsed));
  }
  return plans.length ? plans : [{ ...FREE_PLAN }];
}

/** Look up a plan by id, falling back to the free plan (never undefined). */
export function getPlan(id: string | undefined, dir?: string): Plan {
  const plans = loadPlans(dir);
  return plans.find((p) => p.id === id) ?? plans.find((p) => p.id === 'free') ?? { ...FREE_PLAN };
}

/** The cheapest non-free plan for sale, if any — used by checkout defaults. */
export function defaultPaidPlan(dir?: string): Plan | undefined {
  return loadPlans(dir)
    .filter((p) => p.priceCents > 0)
    .sort((a, b) => a.priceCents - b.priceCents)[0];
}
