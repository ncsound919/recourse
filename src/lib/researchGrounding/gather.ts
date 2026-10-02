/**
 * gather.ts — builds a {@link GroundingBundle} for one forge spec.
 *
 * ## The contract with the forge
 *
 * Grounding is **advisory**. It never blocks promotion. A tool whose hidden
 * reference suite passes is promoted whether or not any literature was found,
 * because the suite is the real judge of whether the code is correct and
 * literature is evidence about whether the *problem* was worth solving.
 *
 * That decision has a consequence this file takes seriously: when the research
 * services are down, `gatherGrounding` still returns a bundle. It returns one
 * with `degraded: true`, empty `quotable`, and a reason naming the service that
 * did not answer — because silently returning "no grounding" is how a broken
 * research stack quietly becomes indistinguishable from a spec nobody looked up.
 *
 * ## Why the two services are queried differently
 *
 * OmniResearch's model lane depends on LiteLLM, which is down on this machine, so
 * even when the service is up most of its routes 502. Its *keyless* routes do not.
 * Synthbook's `/api/external` needs no model at all. So the default fan-out is
 * biased toward the lane that survives a gateway outage, and the dead lane is
 * probed rather than assumed.
 */

import { canonicalize, sha256Hex } from '../federation/canonical.js';
import {
  defaultSynthbookProviders,
  groundingEnabled,
  omniresearchBaseline,
  omniresearchHarvest,
  synthbookExternal,
} from './providers.js';
import { contentTerms, filterByRelevance } from './relevance.js';
import { isQuotable, strongerTrust, type GroundingBundle, type GroundingSource, type ProviderStatus } from './types';

/** What the gatherer needs to know about a spec to build a query. */
export interface GroundingTarget {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly domain?: string;
}

/** Subjects a bare query is off-topic for. Not searched, but says so. */
const DOMAIN_TERMS: Record<string, string> = {
  biotech: 'genome sequencing',
  cyber_defense: 'network intrusion detection',
  neuro_symbolic: 'neural symbolic reasoning',
  quantum_sim: 'quantum simulation',
};

/**
 * Derive a literature query from a spec.
 *
 * The spec's `prompt` is a behavioural contract written for a code generator, not
 * a research question. Searching it verbatim returns nothing useful, and
 * padding it with contract boilerplate is worse than useless — an arXiv query
 * carrying "compute", "array" and "implied" pulls back radio astronomy.
 *
 * So the title carries the query. It is the part that actually names the
 * subject. A few prompt terms are added only when the title is too thin to
 * search on its own, and the whole query is capped, because every extra term is
 * another OR in the upstream search.
 */
export function groundingQuery(target: GroundingTarget): string {
  const titleWords = contentTerms(target.title);
  // Cap the title too: a descriptive title can run to a dozen words, and arXiv
  // scores best against a short topical phrase.
  const words: string[] = titleWords.slice(0, 8);
  const seen = new Set(words.map((w) => w.toLowerCase()));

  // Only borrow from the contract when the title gave us almost nothing to search.
  if (words.length < 3) {
    for (const w of contentTerms(target.prompt)) {
      if (seen.has(w)) continue;
      seen.add(w);
      words.push(w);
      if (words.length >= 8) break;
    }
  }
  return words.join(' ').trim();
}

/** Dedupe on a stable key, keeping the most trustworthy copy of each. */
function dedupe(items: readonly GroundingSource[]): GroundingSource[] {
  const byKey = new Map<string, GroundingSource>();
  for (const item of items) {
    const key = item.url || `${item.provider}:${item.title.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    // Same work found twice: keep whichever carries real prose, and never let a
    // templated copy displace a retrieved one.
    const preferred = strongerTrust(existing.trust, item.trust);
    if (preferred === existing.trust) byKey.set(key, existing);
    else byKey.set(key, { ...item, trust: existing.trust, trustReason: existing.trustReason });
  }
  return [...byKey.values()];
}

function bundleHash(bundle: Omit<GroundingBundle, 'hash'>): string {
  return sha256Hex(canonicalize(bundle));
}

export interface GatherOptions {
  /** Max items carried in the bundle. Default 12. */
  readonly maxSources?: number;
  /** Max items quoted into the prompt. Default 3. */
  readonly maxQuoted?: number;
  /**
   * Minimum weighted query-term overlap an item needs to be kept. Default 0.34.
   * Lower it to widen coverage, at the cost of quoting loosely-related papers.
   */
  readonly minRelevance?: number;
  /** Skip OmniResearch entirely. */
  readonly skipOmni?: boolean;
  /** Override the query instead of deriving one from the spec. */
  readonly query?: string;
  /**
   * Bypass the relevance filter and return every provider hit.
   *
   * Only for the threshold-comparison route, which needs the dropped items in
   * order to show what a looser setting would have kept. Never for the forge:
   * `quotable` would then carry off-topic excerpts.
   */
  readonly keepAll?: boolean;
}

/**
 * Gather research for a spec. Never throws; a bundle is always returned.
 *
 * Providers run concurrently with `allSettled`, so one slow service cannot add
 * its timeout to every other provider's.
 */
export async function gatherGrounding(target: GroundingTarget, opts: GatherOptions = {}): Promise<GroundingBundle> {
  const maxSources = opts.maxSources ?? 12;
  const maxQuoted = opts.maxQuoted ?? 3;
  const minRelevance = opts.minRelevance ?? 0.34;
  const query = opts.query?.trim() || groundingQuery(target);
  // When the derived query is too thin to search on, fall back to a subject term
  // for the domain. `coding` and `math` deliberately have none: a bare generic
  // term would pull back noise rather than signal.
  const effectiveQuery = query.length >= 3 ? query : DOMAIN_TERMS[target.domain ?? ''] ?? '';
  const empty: GroundingBundle = {
    specId: target.id,
    query,
    gatheredAt: Date.now(),
    sources: [],
    providers: [],
    quotable: [],
    degraded: true,
    degradedReasons: [],
    hash: '',
  };

  if (!groundingEnabled()) {
    const reasons = ['research grounding is disabled (GROUNDING_SERVICES=0)'];
    const base = { ...empty, degradedReasons: reasons };
    return { ...base, hash: bundleHash(base) };
  }
  if (!effectiveQuery) {
    const reasons = ['no searchable terms could be derived from the spec'];
    const base = { ...empty, degradedReasons: reasons };
    return { ...base, hash: bundleHash(base) };
  }

  const tasks: Array<Promise<{ status: ProviderStatus; items: GroundingSource[] }>> = [];
  for (const provider of defaultSynthbookProviders()) {
    tasks.push(synthbookExternal(provider, effectiveQuery));
  }
  if (opts.skipOmni !== true) {
    tasks.push(omniresearchHarvest(effectiveQuery));
    tasks.push(omniresearchBaseline(effectiveQuery));
  }

  const settled = await Promise.allSettled(tasks);
  const items: GroundingSource[] = [];
  const providers: ProviderStatus[] = [];
  for (const result of settled) {
    // `allSettled` rather than `all`: a provider that rejects must not take the
    // whole gather down, and the failure is recorded like any other.
    if (result.status === 'rejected') {
      providers.push({
        service: 'unknown',
        provider: 'unknown',
        ok: false,
        count: 0,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        latencyMs: 0,
        serviceDown: true,
      });
      continue;
    }
    providers.push(result.value.status);
    items.push(...result.value.items);
  }

  // Relevance before trust: an off-topic retrieved paper and an on-topic
  // templated one are both unusable, and dropping the off-topic one first keeps
  // the "nothing quotable" message honest about which was the real blocker.
  const deduped = dedupe(items);
  const { kept, dropped } = filterByRelevance(deduped, effectiveQuery, { minScore: minRelevance, ...(opts.keepAll === true ? { keepAll: true } : {}) });
  const unique = kept.slice(0, maxSources);
  const quotable = unique.filter((s) => isQuotable(s.trust) && s.span.length > 0).slice(0, maxQuoted);

  const failed = providers.filter((p) => !p.ok);
  const reasons: string[] = [];
  const servicesDown = new Set(failed.filter((f) => f.serviceDown === true).map((f) => f.service));
  for (const f of failed) {
    // Two endpoints on one dead service are one outage, not two problems.
    if (f.serviceDown === true && servicesDown.has(f.service) && reasons.some((r) => r.startsWith(`${f.service} did not answer`))) {
      continue;
    }
    reasons.push(
      f.serviceDown === true ? `${f.service} did not answer (${f.error})` : `${f.service}/${f.provider}: ${f.error}`,
    );
  }
  if (quotable.length === 0) {
    if (deduped.length === 0) {
      reasons.push(`no source returned anything for "${effectiveQuery}"`);
    } else if (dropped.length > 0 && dropped.length === deduped.length) {
      reasons.push(
        `all ${deduped.length} result(s) for "${effectiveQuery}" were off-topic; the best matched only ${(dropped[0]?.score ?? 0).toFixed(2)} of the query`,
      );
    } else {
      reasons.push(
        `none of the ${unique.length} on-topic result(s) carried quotable retrieved text (${[...new Set(unique.map((s) => s.trust))].sort().join(', ')})`,
      );
    }
  }

  const base = {
    specId: target.id,
    // Record what was actually searched, which is the effective query rather
    // than the derived one when the domain fallback kicked in.
    query: effectiveQuery,
    gatheredAt: Date.now(),
    sources: unique,
    providers,
    quotable,
    degraded: reasons.length > 0,
    degradedReasons: reasons,
  };
  return { ...base, hash: bundleHash(base) };
}

/** One-line human summary, used in ledger rows and the forge ledger. */
export function describeGrounding(bundle: GroundingBundle): string {
  const q = bundle.quotable.length;
  const leads = bundle.sources.length - q;
  const base = `${q} quotable source(s)${leads > 0 ? `, ${leads} unquotable lead(s)` : ''}`;
  return bundle.degraded ? `${base} — degraded: ${bundle.degradedReasons[0]}` : base;
}