/**
 * crossDomainVocabulary.ts — one shared domain vocabulary for the three
 * cross-domain systems that used to speak different dialects:
 *
 *   - the trend engine's series domains (`oncology`, `aging`, `ai_health`, ...),
 *   - the synergy engine's sector ids (`health_oncology`, `sports`, ...), and
 *   - Draymond's science domains (`sports`, `biotech`) + its maths sectors.
 *
 * Recourse's engines already produce cross-domain evidence in isolation (lagged
 * correlations in `trendEngine`, structural method→problem transfers in
 * `synergy`), and Draymond's TID engine produces its own `cross_domain`
 * insights. None of them can be joined because the domain keys never matched.
 * This module is the join key. It is pure and deterministic: a domain string
 * canonicalizes to at most one alias, and every mapping is explicit — never a
 * fuzzy guess. An unknown domain is returned as-is (lower-cased), never forced
 * into an alias it does not belong to.
 */

import type { ToolDomain } from '../dream/types.js';

/** Draymond's science `from_domain`/`to_domain` vocabulary (only two exist). */
export type DraymondScienceDomain = 'sports' | 'biotech';

export interface DomainAlias {
  /** Canonical id used by the unified cross-domain graph. */
  id: string;
  label: string;
  /** Synergy sector ids (see `synergy/domainRegistry.ts`). */
  sectors: string[];
  /** Trend-engine series domains (see `trendSources.TREND_TERMS`). */
  trendDomains: string[];
  /** Draymond science domains this alias can be expressed as. */
  draymond: DraymondScienceDomain[];
  /** Recourse ToolDomains this alias overlaps. */
  toolDomains: ToolDomain[];
}

export const DOMAIN_ALIASES: DomainAlias[] = [
  {
    id: 'health_oncology',
    label: 'Health & oncology / biotech',
    sectors: ['health_oncology'],
    trendDomains: ['oncology', 'ai_health'],
    draymond: ['biotech'],
    toolDomains: ['biotech'],
  },
  {
    id: 'aging',
    label: 'Aging / geroscience / longevity',
    sectors: ['aging'],
    trendDomains: ['aging'],
    draymond: ['biotech'],
    toolDomains: ['biotech'],
  },
  {
    id: 'sports',
    label: 'Sports (basketball, golf)',
    sectors: ['sports'],
    trendDomains: [],
    draymond: ['sports'],
    toolDomains: ['biotech'],
  },
  {
    id: 'mathematics',
    label: 'Mathematics',
    sectors: ['mathematics'],
    trendDomains: [],
    draymond: [],
    toolDomains: ['math'],
  },
  {
    id: 'cybersecurity',
    label: 'Cybersecurity',
    sectors: ['cybersecurity'],
    trendDomains: [],
    draymond: [],
    toolDomains: ['cyber_defense'],
  },
  {
    id: 'neuro_music',
    label: 'Neuroscience / music therapy / auditory',
    sectors: ['neuro_music'],
    trendDomains: [],
    draymond: [],
    toolDomains: ['neuro_symbolic'],
  },
  {
    id: 'music',
    label: 'Music / composition (SoundLab)',
    sectors: ['music'],
    trendDomains: [],
    draymond: [],
    toolDomains: ['coding'],
  },
  {
    id: 'logistics',
    label: 'Logistics & freight',
    sectors: ['logistics'],
    trendDomains: [],
    draymond: [],
    toolDomains: ['systemic', 'coding'],
  },
];

const norm = (s: string): string => String(s ?? '').trim().toLowerCase();

const byId = new Map(DOMAIN_ALIASES.map((a) => [a.id, a]));

/** Index every spelling -> alias id for O(1) canonicalization. A Draymond
 *  science domain may map to several aliases (biotech -> oncology + aging), so
 *  it is handled by `canonicalForDraymond` (fan-out), not this single-value map. */
const lookup = new Map<string, string>();
for (const a of DOMAIN_ALIASES) {
  lookup.set(norm(a.id), a.id);
  for (const s of a.sectors) lookup.set(norm(s), a.id);
  for (const t of a.trendDomains) lookup.set(norm(t), a.id);
}

/**
 * Canonical alias id for any domain spelling (sector, trend domain, alias id).
 * Unknown domains return their lower-cased form so callers still get a stable
 * key — never forced into an alias that is not theirs.
 */
export function canonicalDomain(raw: string): string {
  const key = norm(raw);
  return lookup.get(key) ?? key;
}

/** All aliases a Draymond science domain can be expressed as. */
export function canonicalForDraymond(domain: string): string[] {
  const d = norm(domain);
  return DOMAIN_ALIASES.filter((a) => a.draymond.includes(d as DraymondScienceDomain)).map((a) => a.id);
}

/** Draymond science domains an alias can be exported as ([] when none exists). */
export function draymondDomainsFor(canonical: string): DraymondScienceDomain[] {
  const id = canonicalDomain(canonical);
  return byId.get(id)?.draymond ?? [];
}

/** The single preferred Draymond domain, or null when the alias has no mapping. */
export function draymondPrimaryFor(canonical: string): DraymondScienceDomain | null {
  return draymondDomainsFor(canonical)[0] ?? null;
}

/** Synergy sector ids for an alias (used to seed/read the synergy map). */
export function sectorsFor(canonical: string): string[] {
  const id = canonicalDomain(canonical);
  const alias = byId.get(id);
  return alias ? [...alias.sectors] : [id];
}

/** Canonical alias for a trend series domain, or null when unmapped. */
export function canonicalForTrendDomain(domain: string): string | null {
  const d = norm(domain);
  const a = DOMAIN_ALIASES.find((x) => x.trendDomains.includes(d));
  return a ? a.id : null;
}

/** The full alias record for a canonical id, or undefined. */
export function aliasFor(canonical: string): DomainAlias | undefined {
  const a = byId.get(canonicalDomain(canonical));
  return a ? { ...a, sectors: [...a.sectors], trendDomains: [...a.trendDomains], draymond: [...a.draymond], toolDomains: [...a.toolDomains] } : undefined;
}

/** All aliases with a real Draymond science-domain mapping. */
export function exportableAliases(): DomainAlias[] {
  return DOMAIN_ALIASES.filter((a) => a.draymond.length > 0).map((a) => ({ ...a, sectors: [...a.sectors], trendDomains: [...a.trendDomains], draymond: [...a.draymond], toolDomains: [...a.toolDomains] }));
}
