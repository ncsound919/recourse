// src/lib/synergy/graph.ts
/**
 * Controlled-token weighted graph. Nodes are method/problem doc ids and
 * `term:<vocab>` nodes. Edges are tf-normalized weights; df is tracked for the
 * generalness filter. Only PRIMITIVES become bridge terms — this is the
 * precision lever from the spec's representation-bottleneck warning.
 */
import { bridgeTerms } from './vocabulary.js';

export interface GraphDoc {
  id: string;
  /** Provenance only; buildGraph does not key on domain (used by callers). */
  domain: string;
  text: string;
}

export interface WeightedGraph {
  nodes: string[];
  adjacency: Map<string, Map<string, number>>;
  docFrequency: Map<string, number>;
  docCount: number;
}

export function controlledTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const term of bridgeTerms()) {
    const re = new RegExp(`\\b${term.replace(/_/g, '[_ ]?')}\\b`, 'g');
    const matches = lower.match(re);
    if (matches) for (let i = 0; i < matches.length; i++) out.push(term);
  }
  return out;
}

export function buildGraph(docs: GraphDoc[]): WeightedGraph {
  const adjacency = new Map<string, Map<string, number>>();
  const docFrequency = new Map<string, number>();
  const seen = new Set<string>();
  for (const doc of docs) {
    if (seen.has(doc.id)) throw new Error(`buildGraph: duplicate doc id "${doc.id}"`);
    seen.add(doc.id);
    const counts = new Map<string, number>();
    for (const t of controlledTokens(doc.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    const row = new Map<string, number>();
    for (const [t, c] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      const key = `term:${t}`;
      row.set(key, Math.round((c / max) * 1000) / 1000);
      docFrequency.set(key, (docFrequency.get(key) ?? 0) + 1);
    }
    adjacency.set(doc.id, row);
  }
  const nodes = [...new Set([...adjacency.keys(), ...docFrequency.keys()])].sort();
  return { nodes, adjacency, docFrequency, docCount: docs.length };
}

export function edgeWeight(g: WeightedGraph, a: string, b: string): number {
  return g.adjacency.get(a)?.get(b) ?? 0;
}

export function termDocFrequency(g: WeightedGraph, term: string): number {
  return g.docFrequency.get(term) ?? 0;
}
