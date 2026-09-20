/**
 * toolSelect — per-turn tool retrieval.
 *
 * Exposing a whole registry (we can have 60+ tools across self-hosted, system,
 * MCP and skills) measurably degrades small-model tool choice: accuracy drops
 * past ~15–20 tools and collapses past ~50. This module ranks the registry
 * against the task text and hands the model a small shortlist, with an
 * `agent_search_tools` meta-tool so it can pull more on demand.
 */
import type { AgentToolSpec } from './agentTools.js';
import { cleanTaskQuery, queryWords, wordMatches } from './textQuery.js';

export const SEARCH_TOOLS_NAME = 'agent_search_tools';

/** The meta-tool spec the model can call to expand its active tool set. */
export function searchToolsSpec(): AgentToolSpec {
  return {
    name: SEARCH_TOOLS_NAME,
    description:
      'Search the full tool catalog for tools relevant to a query and add them to the active tool set. ' +
      'Use when the tools you have do not cover the task.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you are trying to do.' },
        limit: { type: 'number', description: 'Maximum tools to add (default 5).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    source: 'system',
    target: SEARCH_TOOLS_NAME,
  };
}

export function isSearchTool(name: string): boolean {
  return name === SEARCH_TOOLS_NAME;
}

/** Relevance score of one tool spec against cleaned query tokens. */
export function scoreToolSpec(spec: AgentToolSpec, tokens: string[]): number {
  if (!tokens.length) return 0;
  const nameWords = queryWords(spec.name);
  const targetWords = queryWords(spec.target);
  const descWords = queryWords(spec.description).filter((w) => w.length >= 3);
  let score = 0;
  for (const t of tokens) {
    if (nameWords.some((w) => wordMatches(t, w))) score += 5;
    if (targetWords.some((w) => wordMatches(t, w))) score += 4;
    if (descWords.some((w) => wordMatches(t, w))) score += 2;
  }
  return score;
}

export interface SelectToolsOptions {
  limit?: number;
  /** Tool names always kept active. */
  always?: string[];
  /** Prepend the agent_search_tools meta-tool. */
  includeSearch?: boolean;
}

/**
 * Select a small relevant subset. Tools with no relevance are only included
 * when the catalog is small enough to fit the budget entirely.
 */
export function selectTools(specs: AgentToolSpec[], query: string, opts: SelectToolsOptions = {}): AgentToolSpec[] {
  const limit = Math.max(1, opts.limit ?? 8);
  const always = new Set(opts.always ?? []);
  const tokens = cleanTaskQuery(query).split(' ').filter(Boolean);

  const scored = specs
    .map((s) => ({ s, score: scoreToolSpec(s, tokens) }))
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));

  const picked: AgentToolSpec[] = [];
  const seen = new Set<string>();
  const push = (s: AgentToolSpec) => {
    if (seen.has(s.name)) return;
    seen.add(s.name);
    picked.push(s);
  };

  for (const name of always) {
    const hit = specs.find((s) => s.name === name);
    if (hit) push(hit);
  }
  for (const { s, score } of scored) {
    if (picked.length >= limit) break;
    if (score > 0) push(s);
  }
  // If nothing matched (or budget remains and the catalog is tiny), fill with
  // the first tools so the model is never left with zero tools.
  if (picked.length === 0 && specs.length) {
    for (const { s } of scored) {
      if (picked.length >= Math.min(limit, specs.length)) break;
      push(s);
    }
  }
  if (opts.includeSearch) picked.unshift(searchToolsSpec());
  return picked.slice(0, limit + (opts.includeSearch ? 1 : 0));
}

/** Find additional tools for the meta-tool (excluding ones already active). */
export function findMoreTools(
  specs: AgentToolSpec[],
  query: string,
  exclude: Set<string>,
  limit = 5,
): AgentToolSpec[] {
  const tokens = cleanTaskQuery(query).split(' ').filter(Boolean);
  return specs
    .filter((s) => !exclude.has(s.name) && !isSearchTool(s.name))
    .map((s) => ({ s, score: scoreToolSpec(s, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, Math.max(1, limit))
    .map((x) => x.s);
}
