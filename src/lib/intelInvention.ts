/**
 * Intel → Invention ingestion — Recourse borrows the ecosystem's strengths to
 * invent new ideas, insights, techniques and tools.
 *
 * Sources (each availability-gated; unreachable/absent is an honest no-op):
 *   - bbtech         : experiment/archetype pipeline. GET /api/v1/pipeline/archetypes
 *                      returns recurring solution patterns ("techniques") across
 *                      scanned products. Auth X-API-Key.
 *   - omniresearch   : deep-research app (no stable REST contract locally). It is
 *                      only surfaced when a research-ask endpoint is configured;
 *                      otherwise it reports 'unconfigured' — never fabricated ideas.
 *   - strategy       : dev-brain /api/strategy/decide ranks candidate ideas by value
 *                      so Recourse pursues the highest-value invention first.
 *
 * Honesty contract:
 *   - Every intel item lands in a durable PROPOSAL store (idea, not a built tool).
 *   - An idea only becomes a buildable Capability Forge spec when it carries a
 *     real, testable reference suite (the operator supplies one at adoption). Until
 *     then it stays a proposal — we never claim a research idea is a working tool.
 *   - Ranking reward is real: strategy/dev-brain matrix when reachable, else a
 *     transparent local heuristic score. Nothing is fabricated as "selected by AI".
 */

import type { ToolDomain } from '../types';

export type IntelSourceId = 'bbtech' | 'omniresearch' | 'strategy';

export interface IntelIdea {
  title: string;
  description: string;
  domain?: ToolDomain;
  url?: string;
  tags?: string[];
  score?: number;
}

export interface IntelProposal {
  id: string;
  source: IntelSourceId;
  title: string;
  description: string;
  domain: ToolDomain;
  url?: string;
  tags: string[];
  rationale: string;
  score: number;
  createdAt: number;
  status: 'new' | 'ranked' | 'adopted' | 'declined';
  adoptedSpecId?: string;
  adoptedAt?: number;
}

export interface IntelSourceStatus {
  id: IntelSourceId;
  configured: boolean;
  online: boolean;
  baseUrl: string;
  note: string;
}

const CODING_HINTS = ['algorithm', 'sort', 'cache', 'search', 'hash', 'tree', 'graph', 'encode', 'parse', 'data structure', 'bloom', 'lru', 'dedup', 'route'];
const MATH_HINTS = ['math', 'prime', 'gcd', 'fibonacci', 'interpolat', 'integral', 'derivative', 'matrix', 'number', 'eigen'];
const SECURITY_HINTS = ['secur', 'cipher', 'hash', 'sanitiz', 'threat', 'vuln', 'cyber', 'auth', 'key'];
const SYSTEMIC_HINTS = ['agent', 'plan', 'orchestrat', 'workflow', 'system', 'distributed', 'queue', 'pipeline'];
const QUANTUM_HINTS = ['quantum', 'qubit', 'superposition', 'entangl'];
const BIOTECH_HINTS = ['biolog', 'gene', 'protein', 'clinical', 'cell'];

/** Best-guess capability domain for an idea. Transparent heuristic. */
export function guessDomain(title: string, description = ''): ToolDomain {
  const text = `${title} ${description}`.toLowerCase();
  const hit = (list: string[]) => list.some((k) => text.includes(k));
  if (hit(QUANTUM_HINTS)) return 'quantum_sim';
  if (hit(BIOTECH_HINTS)) return 'biotech';
  if (hit(SECURITY_HINTS)) return 'cyber_defense';
  if (hit(MATH_HINTS)) return 'math';
  if (hit(SYSTEMIC_HINTS)) return 'systemic';
  if (hit(CODING_HINTS)) return 'coding';
  return 'coding';
}

export function bbtchIdeaToProposal(id: string, idea: IntelIdea, source: IntelSourceId): IntelProposal {
  return {
    id,
    source,
    title: idea.title.slice(0, 140),
    description: idea.description.slice(0, 2000),
    domain: idea.domain ?? guessDomain(idea.title, idea.description),
    url: idea.url,
    tags: (idea.tags ?? []).slice(0, 8),
    rationale: `Intel from ${source}${idea.score != null ? ` (source score ${idea.score})` : ''}`,
    score: idea.score ?? 0,
    createdAt: Date.now(),
    status: 'new',
  };
}

/** Transparent local ranking (used when the strategy brain is unreachable). */
export function heuristicScore(p: IntelProposal): number {
  const length = p.description.length;
  const domainCoverage = p.domain ? 1 : 0;
  const tagBoost = p.tags.length;
  return Math.min(100, Math.round(20 + length * 0.02 + domainCoverage * 20 + tagBoost * 3));
}

export interface IntelProposalStore {
  items: IntelProposal[];
}

export function sortProposals(items: IntelProposal[]): IntelProposal[] {
  return [...items].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
}

/** Top unadopted proposal id, if any. */
export function nextProposalToPursue(items: IntelProposal[]): IntelProposal | null {
  return sortProposals(items).find((p) => p.status === 'new' || p.status === 'ranked') ?? null;
}
