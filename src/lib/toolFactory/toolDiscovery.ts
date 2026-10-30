/**
 * Semantic tool discovery — the "search_tools / execute_tool" meta-tool pattern.
 *
 * Instead of shipping thousands of tool schemas into an agent's context, the
 * factory indexes every tool's (name + description + tags) into a small
 * deterministic hashed embedding space and exposes two meta-tools:
 *   - search_tools(query, limit)  -> top-k tool names + schemas
 *   - execute_tool(name, args)    -> runs a previously discovered tool
 *
 * No external embedding model is required: a 64-dim hashed bag-of-words
 * embedding (the same family the agent-support hub uses) keeps retrieval
 * deterministic and offline. LanceDB is available for persistent scale; this
 * module keeps an in-memory index that is rebuilt from the registries on
 * demand so it stays honest about what is actually registered.
 */

import { healthBoost } from './toolHealth.js';

const DIM = 64;

/** Deterministic hashed bag-of-words embedding (no model, no network). */
export function embedText(text: string): number[] {
  const vec = Array.from({ length: DIM }, () => 0);
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || [];
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    const idx = h % DIM;
    vec[idx] += 1;
  }
  // L2 normalize
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < DIM; i++) dot += a[i] * b[i];
  return dot;
}

export interface ToolIndexEntry {
  name: string;
  description: string;
  tags: string[];
  schema: Record<string, unknown>;
  vector: number[];
}

const INDEX: Map<string, ToolIndexEntry> = new Map();

// Learner-driven ranking weights: tool name -> multiplier (default 1.0).
const RANKING_WEIGHTS: Map<string, number> = new Map();

export function setRankingWeights(weights: Record<string, number>): void {
  RANKING_WEIGHTS.clear();
  for (const [k, v] of Object.entries(weights)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) RANKING_WEIGHTS.set(k, v);
  }
}

export function getRankingWeight(name: string): number {
  return RANKING_WEIGHTS.get(name) ?? 1.0;
}

export function clearRankingWeights(): void {
  RANKING_WEIGHTS.clear();
}

export function indexTool(entry: { name: string; description: string; tags?: string[]; schema?: Record<string, unknown> }): void {
  const text = [entry.name, entry.description, ...(entry.tags ?? [])].join(' ');
  INDEX.set(entry.name, {
    name: entry.name,
    description: entry.description,
    tags: entry.tags ?? [],
    schema: entry.schema ?? { type: 'object', additionalProperties: true },
    vector: embedText(text),
  });
}

export function clearIndex(): void {
  INDEX.clear();
}

export function searchTools(query: string, limit = 5): ToolIndexEntry[] {
  const qv = embedText(query);
  const scored = Array.from(INDEX.values()).map((e) => ({
    entry: e,
    score: (cosine(qv, e.vector) + healthBoost(e.name)) * getRankingWeight(e.name),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit)).map((s) => s.entry);
}

export function getIndexedTool(name: string): ToolIndexEntry | undefined {
  return INDEX.get(name);
}

export function indexedCount(): number {
  return INDEX.size;
}

/** Meta-tool descriptors for agent tool catalogs. */
export const META_TOOLS = {
  search_tools: {
    name: 'factory.search_tools',
    description: 'Semantic search over the factory tool catalogue. Returns top-k tools with names, descriptions and schemas. Use before execute_tool.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language description of the capability needed.' },
        limit: { type: 'number', description: 'Max results (default 5).', default: 5 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  execute_tool: {
    name: 'factory.execute_tool',
    description: 'Execute a previously discovered factory tool by name with the given arguments.',
    parameters: {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: 'Tool name returned by search_tools.' },
        arguments: { type: 'object', description: 'Arguments for the tool.' },
      },
      required: ['tool_name', 'arguments'],
      additionalProperties: false,
    },
  },
};
