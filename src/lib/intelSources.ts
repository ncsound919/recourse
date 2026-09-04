/**
 * Intel source connectors — real, availability-gated HTTP access to the
 * ecosystem intel that feeds Recourse's invention proposals.
 */
import { callDevBrain } from './fleetDevelopment';
import type { IntelIdea, IntelProposal, IntelSourceId, IntelSourceStatus } from './intelInvention';

function bbtchConfig() {
  return {
    baseUrl: (process.env.BBTECH_URL || 'http://localhost:8005').replace(/\/+$/, ''),
    apiKey: process.env.BBTECH_API_KEY || 'pipeline-key-dev',
  };
}
function devBrainConfig() {
  return (process.env.DEV_BRAIN_URL || 'http://localhost:3450').replace(/\/+$/, '');
}
function omniresearchConfig() {
  return (process.env.OMNIRESEARCH_URL || '').replace(/\/+$/, '');
}

async function probe(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method: 'GET', signal: controller.signal });
      return r.ok;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

/** Availability of each intel source (honest: configured + health). */
export async function intelSourceStatuses(): Promise<IntelSourceStatus[]> {
  const bb = bbtchConfig();
  const db = devBrainConfig();
  const om = omniresearchConfig();
  return [
    { id: 'bbtech', configured: true, baseUrl: bb.baseUrl, online: await probe(`${bb.baseUrl}/health`), note: 'experiment/archetype pipeline (techniques)' },
    { id: 'strategy', configured: true, baseUrl: db, online: await probe(`${db}/api/health`), note: 'dev-brain /api/strategy/decide ranks inventions' },
    { id: 'omniresearch', configured: Boolean(om), baseUrl: om || '(unset)', online: om ? await probe(`${om}/api/health`) : false, note: 'deep-research app — surfaced only when OMNIRESEARCH_URL is configured' },
  ];
}

/** Real fetch of BBTech solution archetypes (recurring techniques). */
export async function pullBbtchArchetypes(): Promise<{ ok: boolean; ideas: IntelIdea[]; error?: string }> {
  const bb = bbtchConfig();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    try {
      const r = await fetch(`${bb.baseUrl}/api/v1/pipeline/archetypes`, {
        method: 'GET',
        headers: { 'X-API-Key': bb.apiKey, 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (!r.ok) return { ok: false, ideas: [], error: `bbtech archetypes HTTP ${r.status}` };
      const data = (await r.json()) as unknown;
      const raw = Array.isArray(data) ? data : (data as { archetypes?: unknown[]; items?: unknown[] }).archetypes ?? (data as { items?: unknown[] }).items;
      const ideas: IntelIdea[] = [];
      if (Array.isArray(raw)) {
        for (const it of raw.slice(0, 50)) {
          if (!it || typeof it !== 'object') continue;
          const o = it as Record<string, unknown>;
          const title = (o.name ?? o.archetype ?? o.title ?? o.label ?? '') as string;
          if (!title) continue;
          ideas.push({
            title: String(title).slice(0, 140),
            description: String(o.description ?? o.summary ?? o.rationale ?? JSON.stringify(o).slice(0, 2000)).slice(0, 2000),
            tags: Array.isArray(o.tags) ? (o.tags as unknown[]).map(String) : [],
            score: typeof o.score === 'number' ? o.score : typeof o.confidence === 'number' ? (o.confidence as number) : undefined,
          });
        }
      }
      return { ok: true, ideas };
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    return { ok: false, ideas: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Rank proposals via the strategy team (dev-brain /api/strategy/decide). */
export async function rankProposalsWithStrategy(
  proposals: IntelProposal[],
  problem = 'Rank these Recourse invention proposals by expected value; return the best first.',
): Promise<{ ok: boolean; orderedIds: string[]; error?: string }> {
  if (proposals.length < 2) {
    return { ok: proposals.length === 1, orderedIds: proposals.map((p) => p.id), error: proposals.length < 1 ? 'no proposals to rank' : undefined };
  }
  const res = await callDevBrain({
    action: 'strategy',
    problem,
    candidates: proposals.map((p) => ({ name: p.id, description: `${p.title}: ${p.description.slice(0, 300)}`, tags: ['recourse-proposal', p.domain] })),
  });
  if (!res.ok) return { ok: false, orderedIds: [], error: res.error };
  return { ok: true, orderedIds: res.orderedIds ?? [] };
}
