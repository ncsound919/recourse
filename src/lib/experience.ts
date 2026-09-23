/**
 * experience.ts — experience self-distillation (P1).
 *
 * Research basis: EvolveR (arXiv:2510.16079) — an offline stage distills an
 * agent's interaction trajectories into a compact repository of abstract,
 * reusable strategic principles; the online stage retrieves them to guide
 * decisions. Recourse's forge already records real outcomes per builder
 * strategy; this module distills those into per-(domain, strategy) success
 * beliefs so generation can be steered by what actually worked, instead of
 * rediscovering it every cycle.
 *
 * Honesty: a principle is a Laplace-smoothed pass rate over *real* recorded
 * outcomes only. It is an advisory hint, never a promotion gate. An empty store
 * yields no hint.
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson.js';

export interface ExperiencePrinciple {
  id: string;
  domain: string;
  strategy: string;
  wins: number;
  losses: number;
  /** Laplace-smoothed pass rate (wins+1)/(n+2), in (0,1). */
  passRate: number;
  updatedAt: number;
}

export interface ExperienceStore {
  version: 1;
  principles: ExperiencePrinciple[];
  updatedAt: number;
}

export function experiencePath(): string {
  return process.env.EXPERIENCE_FILE || path.join(process.cwd(), 'data', 'experience.json');
}

function emptyStore(): ExperienceStore {
  return { version: 1, principles: [], updatedAt: 0 };
}

export function readExperienceStore(): ExperienceStore {
  const doc = readJsonFile<ExperienceStore>(experiencePath(), emptyStore());
  if (!doc || doc.version !== 1 || !Array.isArray(doc.principles)) return emptyStore();
  return doc;
}

function writeExperienceStore(doc: ExperienceStore): void {
  try {
    writeJsonFile(experiencePath(), doc);
  } catch (err) {
    console.warn('[experience] persist failed:', err instanceof Error ? err.message : String(err));
  }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function principleId(domain: string, strategy: string): string {
  return `${domain}::${strategy}`;
}

/**
 * Record one real outcome and distill it into the (domain, strategy) belief.
 * Returns the updated principle. Pure-ish: reads/writes the durable store.
 */
export function recordExperience(domain: string, strategy: string, passed: boolean, now = Date.now()): ExperiencePrinciple {
  const doc = readExperienceStore();
  const id = principleId(domain, strategy);
  let p = doc.principles.find((x) => x.id === id);
  if (!p) {
    p = { id, domain, strategy, wins: 0, losses: 0, passRate: 0.5, updatedAt: now };
    doc.principles.push(p);
  }
  if (passed) p.wins += 1;
  else p.losses += 1;
  p.passRate = round3((p.wins + 1) / (p.wins + p.losses + 2));
  p.updatedAt = now;
  doc.updatedAt = now;
  // Bound: keep the most-observed principles.
  doc.principles = doc.principles
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses) || a.id.localeCompare(b.id))
    .slice(0, 200);
  writeExperienceStore(doc);
  return p;
}

/** Principles for a domain, highest pass-rate first (ties: most observed). */
export function principlesFor(domain: string): ExperiencePrinciple[] {
  return readExperienceStore()
    .principles.filter((p) => p.domain === domain)
    .sort((a, b) => b.passRate - a.passRate || (b.wins + b.losses) - (a.wins + a.losses) || a.id.localeCompare(b.id));
}

/**
 * A one-line advisory hint for a domain, or null when no real outcome exists.
 * Only emitted once a strategy has at least `minObservations` real outcomes.
 */
export function experienceHint(domain: string, minObservations = 3): string | null {
  const principles = principlesFor(domain).filter((p) => p.wins + p.losses >= minObservations);
  if (!principles.length) return null;
  const top = principles[0];
  const total = principles.reduce((n, p) => n + p.wins + p.losses, 0);
  return (
    `Distilled experience for ${domain} (${total} real outcomes): strategy "${top.strategy}" ` +
    `passes ${(top.passRate * 100).toFixed(0)}% (n=${top.wins + top.losses}); prefer it.`
  );
}

export function experienceSnapshot(): { principles: number; domains: string[]; updatedAt: number } {
  const doc = readExperienceStore();
  return {
    principles: doc.principles.length,
    domains: [...new Set(doc.principles.map((p) => p.domain))].sort(),
    updatedAt: doc.updatedAt,
  };
}
