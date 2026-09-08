/**
 * Global Lens publisher — composes honest, dated research briefs from REAL
 * Recourse state (science findings, trend ledger, ecosystem corpus) and
 * publishes each domain to Overlay Global Lens through the bridge.
 *
 * The enhancement path:
 *   corpus scan (bb_tech_core / HempForge / ECOS / sports_science /
 *   golf_surgery_core / oncology) → artifacts → brief body + paper attachment
 *   → POST /api/publish (Global Lens).
 *
 * Honesty contract (mirrors the rest of Recourse):
 *   - Every figure comes from real disk reads (corpus artifacts), real
 *     computation (science findings + ResearchArtifacts) or the real
 *     hash-chained discovery ledger (trend insights). Nothing is invented.
 *   - A domain with ZERO real material yields NO article (returns null) — the
 *     publisher never spams Global Lens with fabricated "research".
 *   - When the publish bridge is not configured / unreachable the result is
 *     ok:false with the real reason, never a claimed "sent".
 *   - Evidence tiers are carried verbatim from the artifacts/findings.
 */

import type { ScienceFinding } from './scienceConductor.js';
import type { ResearchArtifact } from './researchArtifact.js';
import type { LedgerInsight } from './trendLedger.js';
import type { CorpusArtifact } from '../intake/corpus/types.js';
import {
  publishToGlobalLens,
  globalLensConfigured,
  type GlobalLensPublishInput,
  type GlobalLensPublishResult,
} from './globalLensBridge.js';

export interface PublishDomainSpec {
  /** Corpus project id(s) this domain owns (matches CorpusRoot.project). */
  projects: string[];
  /** Human label used in the article title + source_name. */
  label: string;
  /** Global Lens category slug. */
  category: string;
  /** Global Lens pillar. */
  pillar: string;
  /** Corpus topics that mark an artifact as relevant to this domain. */
  topics: string[];
}

export const PUBLISH_DOMAINS: PublishDomainSpec[] = [
  {
    projects: ['bb-tech', 'bb_tech_core'],
    label: 'BB-Tech (Basketball → Biotech)',
    category: 'basketball-biotech',
    pillar: 'science',
    topics: ['basketball', 'biotech_translation'],
  },
  {
    projects: ['hempforge', 'hemp-os'],
    label: 'HempForge',
    category: 'hemp-research',
    pillar: 'science',
    topics: ['hemp', 'pharma'],
  },
  {
    projects: ['environmental', 'ecos'],
    label: 'Environmental Solutions (ECOS)',
    category: 'environmental-science',
    pillar: 'environment',
    topics: ['environment'],
  },
  {
    projects: ['sports-science', 'sports_science'],
    label: 'Sports Science',
    category: 'sports-science',
    pillar: 'science',
    topics: ['sports'],
  },
  {
    projects: ['golf-surgery', 'golf_surgery_core'],
    label: 'Golf Surgery',
    category: 'golf-surgery',
    pillar: 'science',
    topics: ['golf'],
  },
  {
    projects: ['overlay-oncology', 'cancer-pdfs', 'cancer-datasets'],
    label: 'Overlay Oncology',
    category: 'cancer-research',
    pillar: 'science',
    topics: ['oncology', 'clinical'],
  },
  {
    // Music Therapy: no corpus root owns it — the findings bridge
    // (musicTherapyFindings) is the data source, matched by topic terms.
    projects: [],
    label: 'Music Therapy',
    category: 'music-therapy',
    pillar: 'science',
    topics: ['music', 'tuning', 'stimulus', 'biomarker', 'cortisol', 'hrv'],
  },
];

export function domainForProject(project: string): PublishDomainSpec | null {
  return PUBLISH_DOMAINS.find((d) => d.projects.includes(project)) ?? null;
}

/** Artifacts belonging to this domain (by project id OR topic match). */
export function artifactsForDomain(spec: PublishDomainSpec, artifacts: CorpusArtifact[]): CorpusArtifact[] {
  return artifacts.filter(
    (a) => spec.projects.includes(a.project) || a.topics.some((t) => spec.topics.includes(t)),
  );
}

/** Findings with an attached publishable artifact (real computation + hash). */
export function artifactFindings(findings: Array<ScienceFinding & { artifact?: ResearchArtifact }>): Array<ScienceFinding & { artifact: ResearchArtifact }> {
  return (findings as Array<ScienceFinding & { artifact?: ResearchArtifact }>)
    .filter((f): f is ScienceFinding & { artifact: ResearchArtifact } => !!f.artifact && !!f.artifact.claim)
    .slice(-20);
}

function domainTopicTerms(spec: PublishDomainSpec): string[] {
  const terms = new Set<string>();
  for (const t of [...spec.topics, spec.label]) {
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) terms.add(w);
  }
  return [...terms];
}

/** Finding kinds explicitly owned by a single domain (never leak into others). */
const DOMAIN_TAGGED_KINDS = new Set(['music_therapy_trial', 'tuning_contrast', 'music_therapy_benchmark']);

/**
 * Findings belonging to a domain by topic match (claim + provenance + numbers).
 * When a domain has NO topical findings, the general artifact-finding set is
 * returned so pre-existing domains keep their briefs — but findings explicitly
 * tagged to another domain (e.g. music_therapy_*) are NEVER included, so a
 * music-therapy benchmark can't become another domain's paper.
 */
export function findingsForDomain(
  spec: PublishDomainSpec,
  findings: Array<ScienceFinding & { artifact?: ResearchArtifact }>,
): Array<ScienceFinding & { artifact?: ResearchArtifact }> {
  const terms = domainTopicTerms(spec);
  const topical = findings.filter((f) => {
    const text = `${f.claim} ${f.provenance} ${JSON.stringify(f.numbers ?? {})} ${f.kind}`.toLowerCase();
    return terms.some((w) => text.includes(w));
  });
  if (topical.length > 0) return topical;
  return findings.filter((f) => !DOMAIN_TAGGED_KINDS.has(f.kind));
}

/** Real trend insights relevant to this domain (token overlap, deterministic). */
export function insightsForDomain(spec: PublishDomainSpec, insights: LedgerInsight[]): LedgerInsight[] {
  const terms = new Set<string>();
  for (const t of [...spec.topics, spec.label]) {
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) terms.add(w);
  }
  return insights.filter((i) => {
    const text = `${i.statement} ${JSON.stringify(i.payload ?? {})}`.toLowerCase();
    for (const w of terms) if (text.includes(w)) return true;
    return false;
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Research-value ranking — same convention as the corpus signal dispatch.
 *  Whitepapers/papers/research docs outrank changelogs + package manifests so
 *  briefs surface insight, not repo noise (real reads, ranked honestly). */
const ARTIFACT_KIND_RANK: Record<CorpusArtifact['kind'], number> = {
  whitepaper: 0, paper: 1, research: 2, knowledge: 3, spec: 4, data: 5, readme: 6, config: 7, other: 8,
};

function topResearchArtifacts(artifacts: CorpusArtifact[], limit = 8): CorpusArtifact[] {
  const usable = artifacts.filter((a) => !a.excerpt.startsWith('[unreadable') && !a.excerpt.startsWith('[skipped'));
  const readable = usable.filter((a) => a.words > 0);
  const indexOnly = usable.filter((a) => a.words === 0);
  const byValue = (list: CorpusArtifact[]) =>
    [...list].sort((a, b) => (ARTIFACT_KIND_RANK[a.kind] - ARTIFACT_KIND_RANK[b.kind]) || (b.words - a.words));
  // Real text research docs first (paper/research/knowledge/...), then config/
  // other noise and index-only PDFs (0 words) only to fill the list.
  const highValue = byValue(readable).filter((a) => a.kind !== 'config' && a.kind !== 'other');
  const remainder = [...byValue(readable).filter((a) => a.kind === 'config' || a.kind === 'other'), ...byValue(indexOnly)];
  return [...highValue, ...remainder].slice(0, limit);
}

/** Deterministic markdown brief for one domain from its real material. */
export function composeDomainArticle(opts: {
  spec: PublishDomainSpec;
  artifacts: CorpusArtifact[];
  findings: Array<ScienceFinding & { artifact?: ResearchArtifact }>;
  insights: LedgerInsight[];
  referenceTime?: number;
}): GlobalLensPublishInput | null {
  const { spec } = opts;
  const artifacts = artifactsForDomain(spec, opts.artifacts);
  const findings = findingsForDomain(spec, artifactFindings(opts.findings));
  const insights = insightsForDomain(spec, opts.insights);

  if (artifacts.length === 0 && findings.length === 0 && insights.length === 0) {
    return null; // nothing real to say — never fabricate a brief.
  }

  const generated = new Date(opts.referenceTime ?? Date.now());
  const title = `Recourse research brief — ${spec.label} (${isoDate(generated)})`;
  const L: string[] = [];

  L.push(`# ${spec.label} — research brief`);
  L.push('');
  L.push('All figures from real Recourse state: corpus artifacts read from disk, findings from real computation, insights from the hash-chained discovery ledger. Empty sources are reported as zero, never interpolated.');
  L.push('');

  if (artifacts.length > 0) {
    L.push('## Ecosystem corpus (real disk reads)');
    L.push('');
    L.push(`- Artifacts indexed: ${artifacts.length}`);
    const byKind: Record<string, number> = {};
    for (const a of artifacts) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
    L.push(`- By kind: ${Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join(', ')}`);
    const topics: Record<string, number> = {};
    for (const a of artifacts) for (const t of a.topics) topics[t] = (topics[t] ?? 0) + 1;
    const topTopics = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topTopics.length) L.push(`- Topics: ${topTopics.map(([t, n]) => `${t} (${n})`).join(', ')}`);
    L.push('');
    L.push('### Top artifacts');
    L.push('');
    const ranked = topResearchArtifacts(artifacts);
    for (const a of ranked) {
      const excerpt = (a.excerpt || '').replace(/[\r\n]+/g, ' ').trim();
      L.push(`- **${a.name}** (${a.kind}, ${a.words} words) — ${excerpt.length > 240 ? excerpt.slice(0, 240) + '…' : excerpt}`);
    }
    L.push('');
  }

  if (insights.length > 0) {
    L.push('## Trend insights (discovery ledger)');
    L.push('');
    for (const i of insights.slice(-5)) {
      L.push(`- ${i.statement.trim()} (confidence ${i.confidence.toFixed(2)})`);
    }
    L.push('');
  }

  if (findings.length > 0) {
    L.push('## Science findings (real computation + artifacts)');
    L.push('');
    for (const f of findings.slice(-6)) {
      const tier = f.artifact.evidenceTier;
      const hash = f.artifact.artifactHash?.slice(0, 16) ?? 'n/a';
      L.push(`- ${f.claim.trim()} [${tier}, art_${hash}]`);
    }
    L.push('');
  }

  L.push(`Generated by Recourse at ${generated.toISOString()}. Category: ${spec.category}.`);

  // Paper attachment: the strongest artifact-carrying finding becomes a
  // research_papers row (evidence tier from the artifact).
  let paper: Record<string, unknown> | undefined;
  if (findings.length > 0) {
    const top = [...findings].reverse()[0];
    paper = {
      title: `${spec.label} — ${top.claim.trim().slice(0, 120)}`,
      url: `recourse://findings/${top.artifact.id ?? 'artifact'}`,
      authors: 'Recourse science conductor',
      abstract: top.claim.trim(),
      summary: top.artifact.provenance?.trim() ?? '',
      category: spec.category,
      pillar: spec.pillar,
      evidence_tier: top.artifact.evidenceTier,
      payload: {
        artifact_hash: top.artifact.artifactHash,
        kind: top.kind,
        engine: top.artifact.engine,
        provenance: top.provenance,
        cycle: top.cycle,
        stats: top.artifact.stats,
      },
    };
  }

  return {
    title,
    body: L.join('\n'),
    category: spec.category,
    source_name: 'Recourse',
    url: `recourse://domains/${spec.projects[0]}`,
    paper,
  };
}

export interface PublishPassResult {
  attempted: boolean;
  configured: boolean;
  total: number;
  ok: number;
  failed: number;
  skipped: string[];
  results: Array<{ domain: string; title: string; ok: boolean; inserted?: boolean; error?: string }>;
}

/** One publish pass over every domain. Optional injected `publish` for tests. */
export async function runPublishPass(opts: {
  artifacts: CorpusArtifact[];
  findings: Array<ScienceFinding & { artifact?: ResearchArtifact }>;
  insights: LedgerInsight[];
  domains?: PublishDomainSpec[];
  publish?: (input: GlobalLensPublishInput) => Promise<GlobalLensPublishResult>;
}): Promise<PublishPassResult> {
  const publish = opts.publish ?? publishToGlobalLens;
  const domains = opts.domains ?? PUBLISH_DOMAINS;
  const skipped: string[] = [];
  const results: PublishPassResult['results'] = [];

  for (const spec of domains) {
    const article = composeDomainArticle({
      spec,
      artifacts: opts.artifacts,
      findings: opts.findings,
      insights: opts.insights,
    });
    if (!article) {
      skipped.push(`${spec.label}: no real corpus/findings/insights this pass`);
      continue;
    }
    const r = await publish(article);
    results.push({ domain: spec.label, title: article.title, ok: r.ok, inserted: r.inserted, error: r.error });
    if (!r.ok) skipped.push(`${spec.label}: ${r.error ?? 'publish failed'}`);
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return {
    attempted: true,
    configured: globalLensConfigured(),
    total: results.length,
    ok,
    failed,
    skipped,
    results,
  };
}