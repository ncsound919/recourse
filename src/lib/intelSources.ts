/**
 * Intel source connectors — real, availability-gated HTTP access to the
 * ecosystem intel that feeds Recourse's invention proposals.
 */
import { callDevBrain } from './fleetDevelopment';
import { guessDomain, type IntelIdea, type IntelProposal, type IntelSourceStatus } from './intelInvention';

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
    { id: 'omniresearch', configured: Boolean(om), baseUrl: om || '(unset)', online: om ? await probe(`${om}/api/health`) : false, note: 'structured improvement research over Recourse\'s own capability surface (tool generation / healing / learning) — proposals only, verify-gated' },
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

/** One structured proposal from OmniResearch's improvement-research endpoint. */
export interface OmniresearchProposal {
  title: string;
  description?: string;
  domain?: string;
  technique?: string;
  targetFunction?: string;
  references?: Array<{ title?: string; url?: string }>;
  rationale?: string;
  /** Model-estimated confidence in [0,1]. NOT a verification — Recourse's own
   *  sandbox/adopt gate decides whether an idea becomes a real tool. */
  confidence?: number;
}

/**
 * Pull improvement proposals from OmniResearch. Omni researches Recourse's own
 * capability surface (skills, forge agenda, synergy gaps, repair failures) and
 * returns structured, source-attributed proposals. Honesty contract: these are
 * IDEAS, converted to `IntelIdea[]` and fed into the same proposal → rank →
 * adopt (requires a real reference suite) → forge → sandbox-verify pipeline.
 * Nothing here is claimed verified.
 */
export async function pullOmniresearchIdeas(
  input: { focus?: string; maxProposals?: number; surface?: unknown } = {},
): Promise<{ ok: boolean; ideas: IntelIdea[]; error?: string }> {
  const om = omniresearchConfig();
  if (!om) return { ok: false, ideas: [], error: 'OMNIRESEARCH_URL not configured' };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 120_000);
    try {
      const r = await fetch(`${om}/api/agent/recourse-improvement-research`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          focus: input.focus ?? 'improve Recourse tool generation, healing and learning',
          maxProposals: Math.max(1, Math.min(20, input.maxProposals ?? 8)),
          ...(input.surface !== undefined ? { surface: input.surface } : {}),
        }),
        signal: controller.signal,
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return { ok: false, ideas: [], error: `omniresearch HTTP ${r.status}${body ? `: ${body.slice(0, 160)}` : ''}` };
      }
      const data = (await r.json()) as { proposals?: OmniresearchProposal[] };
      const ideas: IntelIdea[] = (Array.isArray(data.proposals) ? data.proposals : [])
        .filter((p) => p && typeof p.title === 'string' && p.title.trim())
        .slice(0, 20)
        .map((p) => {
          const refs = (p.references ?? []).filter((x) => x && (x.url || x.title));
          const description = [
            p.description,
            p.technique ? `Technique: ${p.technique}` : '',
            p.targetFunction ? `Target function: ${p.targetFunction}` : '',
            p.rationale ? `Rationale: ${p.rationale}` : '',
            refs.length ? `Sources: ${refs.slice(0, 5).map((x) => x.url || x.title).filter(Boolean).join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 2000);
          return {
            title: p.title.trim().slice(0, 140),
            description,
            domain: (p.domain as IntelIdea['domain']) ?? guessDomain(p.title, p.description ?? ''),
            tags: ['omniresearch', ...(p.technique ? [String(p.technique).slice(0, 40)] : [])],
            score:
              typeof p.confidence === 'number'
                ? Math.round(Math.min(1, Math.max(0, p.confidence)) * 100)
                : undefined,
            url: refs.find((x) => x.url)?.url,
          } satisfies IntelIdea;
        });
      return { ok: true, ideas };
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    return { ok: false, ideas: [], error: err instanceof Error ? err.message : String(err) };
  }
}
