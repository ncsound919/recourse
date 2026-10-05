/**
 * Deterministic research core — dependency-free (except node:crypto) port of the
 * deterministic-web-researcher engine for Recourse.
 *
 * No external fetch. All functions are pure and deterministic: same inputs
 * always produce identical outputs, including audit hashes.
 */

import { createHash } from 'node:crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchQuery {
  id: string;
  timestamp: number;
  topic: string;
  intent: 'literature_scan' | 'fact_check' | 'trend_detection' | 'evidence_collection';
  scope: {
    domains?: string[];
    dateRange?: [number, number];
    languages?: string[];
    maxResults?: number;
  };
  constraints?: {
    minRelevanceScore?: number;
    excludeTerms?: string[];
    requirePeerReview?: boolean;
    requireOpenAccess?: boolean;
  };
}

export interface RawSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  contentPreview: string;
  metadata: {
    publishedAt?: number;
    authors?: string[];
    doi?: string;
    accessibilityStatus: 'open' | 'paywalled' | 'restricted';
  };
  fetchedAt: number;
}

export interface VerifiedSource extends RawSource {
  relevanceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  dataQuality: {
    hasMetadata: boolean;
    hasAuthors: boolean;
    isOpenAccess: boolean;
    citationCount?: number;
    h5Index?: number;
  };
  extractedClaims?: string[];
  auditHash: string;
}

export interface DeterministicResearchConfig {
  maxSources: number;
  minRelevance: number;
  dedupThreshold: number;
  trustedDomains: string[];
  referenceTimeMs: number | null;
}

export type PartialResearchConfig = Partial<DeterministicResearchConfig>;

export type DedupMatchType = 'exact_hash' | 'doi_match' | 'author_cluster' | 'semantic';

export interface DedupGroup {
  groupId: string;
  representativeId: string;
  duplicateIds: string[];
  matchTypes: DedupMatchType[];
}

export interface DedupReport {
  groupsFormed: number;
  duplicatesRemoved: number;
  mergeStrategy: string;
}

export interface AuditSummary {
  queryHash: string;
  executionHash: string;
  rawSourceCount: number;
  uniqueSourceCount: number;
  verifiedSourceCount: number;
  duplicatesRemoved: number;
}

export interface ExecuteResearchResult {
  sources: VerifiedSource[];
  dedupReport: DedupReport;
  auditSummary: AuditSummary;
  groups: DedupGroup[];
}

export interface Claim {
  id: string;
  text: string;
}

export interface EvidenceClaimBinding {
  sourceId: string;
  claimId: string;
  confidenceLevel: VerifiedSource['confidenceLevel'];
  similarity: number;
  auditHash: string;
}

export const DEFAULT_TRUSTED_DOMAINS: string[] = [
  'arxiv.org',
  'pubmed.ncbi.nlm.nih.gov',
  'github.com',
  'nature.com',
  'science.org',
  // Overlay Science wiring: preprints, literature APIs, trial + bio registries
  // (Overlay Oncology evidence ingest: EuropePMC/bioRxiv; Biotech gene/drug DBs).
  'biorxiv.org',
  'medrxiv.org',
  'europepmc.org',
  'clinicaltrials.gov',
  'cbioportal.org',
  'ensembl.org',
  'uniprot.org',
  'opentargets.org',
];

export const DEFAULT_RESEARCH_CONFIG: DeterministicResearchConfig = {
  maxSources: 10,
  minRelevance: 0,
  dedupThreshold: 0.85,
  trustedDomains: DEFAULT_TRUSTED_DOMAINS,
  referenceTimeMs: null,
};

const OPEN_ACCESS_BONUS = 0.1;
const BINDING_SIMILARITY_THRESHOLD = 0.6;

// ============================================================================
// HASHING
// ============================================================================

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic content hash for exact-match dedup + audit trail. */
export function contentHash(source: RawSource): string {
  const authors = normalizeAuthors(source.metadata.authors);
  const contentKey = [
    source.title.toLowerCase().trim(),
    source.url,
    (source.metadata.doi ?? '').toLowerCase().trim(),
    authors,
  ].join('\n');
  return sha256Hex(contentKey);
}

/** Stable hash of a query for the audit summary. */
export function queryHash(query: ResearchQuery): string {
  return sha256Hex(JSON.stringify(query));
}

/** Audit hash binding a verified source to its score + quality flags. */
export function sourceAuditHash(
  source: RawSource,
  relevanceScore: number,
  quality: VerifiedSource['dataQuality'],
): string {
  const content = [source.id, source.url, source.title, relevanceScore.toString(), JSON.stringify(quality)].join('|');
  return sha256Hex(content);
}

function normalizeAuthors(authors: string[] | undefined): string {
  if (!authors || authors.length === 0) return '';
  return authors
    .map((a) => a.toLowerCase().trim())
    .filter((a) => a.length > 0)
    .sort()
    .join('|');
}

function normalizeDoi(doi: string | undefined): string {
  if (!doi) return '';
  return doi.toLowerCase().trim();
}

// ============================================================================
// STRING SIMILARITY (Levenshtein ratio)
// ============================================================================

/**
 * Reference implementation — the contract, and the fallback.
 *
 * Kept as the definition of correct behaviour rather than deleted, because
 * `adoptForgeLevenshtein` below proves the generated tool equals THIS before the
 * tool is allowed to answer a single query. A consumer with no proof to check
 * against has no way to adopt generated code at all.
 */
export function referenceLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = Array.from({ length: b.length + 1 });
  const curr: number[] = Array.from({ length: b.length + 1 });
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const deletion = prev[j] + 1;
      const insertion = curr[j - 1] + 1;
      const substitution = prev[j - 1] + cost;
      let best = deletion;
      if (insertion < best) best = insertion;
      if (substitution < best) best = substitution;
      curr[j] = best;
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// The implementation actually used. Swapped for the forge-built tool only after
// an equivalence proof; see `adoptForgeLevenshtein`.
let levenshteinImpl: (a: string, b: string) => number = referenceLevenshteinDistance;

/** The forge tool this module is willing to adopt. */
export const LEVENSHTEIN_TOOL = 'levenshteinDistance';

export type LevenshteinAdoption =
  | { status: 'adopted'; tool: string; hash: string; vectors: number; verifiedByManifest: boolean; detail: string }
  | { status: 'rejected'; tool: string; reason: string; vectors: number }
  | { status: 'unavailable'; tool: string; reason: string }
  | { status: 'pending'; tool: string; detail: string };

let adoption: LevenshteinAdoption = { status: 'pending', tool: LEVENSHTEIN_TOOL, detail: 'not attempted yet' };

export function levenshteinAdoption(): LevenshteinAdoption {
  return adoption;
}

/** Public state for the health readout: which implementation is answering. */
export function levenshteinImplementation(): { source: 'forge_tool' | 'local_reference'; detail: string } {
  return levenshteinImpl === referenceLevenshteinDistance
    ? { source: 'local_reference', detail: adoption.status === 'pending' ? 'forge tool not loaded' : JSON.stringify(adoption) }
    : { source: 'forge_tool', detail: JSON.stringify(adoption) };
}

export function levenshteinDistance(a: string, b: string): number {
  return levenshteinImpl(a, b);
}

/**
 * Equivalence vectors: the forge suite's own assertions plus the edge cases a
 * research title actually contains (empty sides, unicode, case, length
 * asymmetry, repeated characters). A tool that matches on all of these is
 * treated as the same function; one that does not is refused, not averaged.
 */
const LEVENSHTEIN_EQUIVALENCE_VECTORS: Array<[string, string]> = [
  ['kitten', 'sitting'],
  ['flaw', 'lawn'],
  ['', 'abc'],
  ['same', 'same'],
  ['a', 'b'],
  ['', ''],
  ['abc', ''],
  ['Deterministic Web Research', 'deterministic web research'],
  ['A study of CRISPR-Cas9 mediated editing', 'A study of CRISPR-Cas9 mediated editing in wheat'],
  ['mémoire', 'memoire'],
  ['日本語のタイトル', '日本語タイトル'],
  ['aaaaaaaa', 'aaaa'],
  ['x', 'x'.repeat(200)],
  ['The quick brown fox', 'The quick brown fx'],
  ['-', '—'],
];

/**
 * The adoption gate itself, as a pure function so it can be tested against a
 * deliberately wrong implementation: returns a description of the first
 * disagreement, or null when the candidate matches the reference everywhere.
 */
export function checkLevenshteinEquivalence(
  candidate: (a: string, b: string) => number,
  vectors: Array<[string, string]> = LEVENSHTEIN_EQUIVALENCE_VECTORS,
): string | null {
  for (const [a, b] of vectors) {
    let got: number;
    try {
      got = Number(candidate(a, b));
    } catch (err: any) {
      return `threw on (${JSON.stringify(a)}, ${JSON.stringify(b)}): ${err?.message || String(err)}`;
    }
    const want = referenceLevenshteinDistance(a, b);
    if (got !== want) return `(${JSON.stringify(a)}, ${JSON.stringify(b)}) -> ${got}, expected ${want}`;
  }
  return null;
}

/**
 * Make the forge-built `levenshteinDistance` the implementation this module
 * uses, but only after proving it agrees with the reference on every
 * equivalence vector.
 *
 * WHY ADOPT A GENERATED TOOL HERE AT ALL
 * This function was a second hand-rolled copy of an algorithm the capability
 * forge already generates and verifies, and it is on a live path: the science
 * conductor's evidence phase runs `dedupSources` every cycle, where a wrong
 * distance silently merges two different papers (one evidence source vanishes
 * from the findings) or fails to merge the same paper twice. So this is the
 * first place where a forge-built tool is load-bearing rather than displayed —
 * and the equivalence gate is what makes that safe rather than brave.
 *
 * Idempotent: repeated calls reuse the first outcome unless `force` is set.
 * A tool that cannot be imported (absent, quarantined, hash mismatch, unsafe
 * in-process) leaves the reference implementation in place and says so.
 */
export async function adoptForgeLevenshtein(opts: { force?: boolean } = {}): Promise<LevenshteinAdoption> {
  const tool = LEVENSHTEIN_TOOL;
  if (!opts.force && adoption.status === 'adopted') return adoption;
  const { loadSelfHostedEntrypoint } = await import('./selfHosting.js');
  const loaded = await loadSelfHostedEntrypoint(tool);
  if (!loaded) {
    adoption = { status: 'unavailable', tool, reason: 'no importable self-hosted module (missing, quarantined, or refused by the in-process safety screen)' };
    return adoption;
  }
  const disagree = checkLevenshteinEquivalence(loaded.fn as (a: string, b: string) => number);
  if (disagree) {
    adoption = { status: 'rejected', tool, reason: `disagrees with the reference implementation: ${disagree}`, vectors: LEVENSHTEIN_EQUIVALENCE_VECTORS.length };
    return adoption;
  }
    levenshteinImpl = loaded.fn as (a: string, b: string) => number;
  // Record this as a real consumption in the tool-value ledger: the science loop
  // adopted and is about to depend on a forge-built tool. Without this, the
  // usefulness signal scores the only genuinely load-bearing tool as 0 and the
  // saturation gate classifies the best asset as dead weight (D2).
      try {
        const { toolValueLedger } = await import('./toolValueLedger.js');
        toolValueLedger().noteInvocation(LEVENSHTEIN_TOOL, { consumerKind: 'internal' });
        toolValueLedger().noteConsumption(LEVENSHTEIN_TOOL, 'scienceConductor.runScienceCycle', { consumerKind: 'internal' });
      } catch { /* ledger must never block adoption */ }
      adoption = {
    status: 'adopted',
    tool,
    hash: loaded.hash,
    vectors: LEVENSHTEIN_EQUIVALENCE_VECTORS.length,
    verifiedByManifest: loaded.verified,
    detail: `${loaded.detail}; agreed with the reference on all ${LEVENSHTEIN_EQUIVALENCE_VECTORS.length} equivalence vectors`,
  };
  return adoption;
}

/** Test seam: restore the reference implementation. */
export function resetForgeLevenshtein(): void {
  levenshteinImpl = referenceLevenshteinDistance;
  adoption = { status: 'pending', tool: LEVENSHTEIN_TOOL, detail: 'not attempted yet' };
}

/** Levenshtein similarity ratio in [0,1]. */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ============================================================================
// DEDUP
// ============================================================================

/**
 * Four-stage deterministic dedup, first-in-group retained:
 * exact content hash -> DOI match -> author-cluster match -> title Levenshtein.
 */
export function dedupSources(
  sources: RawSource[],
  threshold = DEFAULT_RESEARCH_CONFIG.dedupThreshold,
): { unique: RawSource[]; groups: DedupGroup[]; dedupReport: DedupReport } {
  const unique: RawSource[] = [];
  const groups: DedupGroup[] = [];
  const hashIndex = new Map<string, number>();
  let groupCounter = 0;

  for (const source of sources) {
    const hash = contentHash(source);
    const doi = normalizeDoi(source.metadata.doi);
    const authorKey = normalizeAuthors(source.metadata.authors);
    let duplicateOf = -1;
    let matchType: DedupMatchType | null = null;

    // Stage 1: exact content hash.
    const hashHit = hashIndex.get(hash);
    if (hashHit !== undefined) {
      duplicateOf = hashHit;
      matchType = 'exact_hash';
    }

    // Stage 2: DOI match (non-empty DOI only).
    if (duplicateOf === -1 && doi !== '') {
      for (let i = 0; i < unique.length; i++) {
        if (normalizeDoi(unique[i].metadata.doi) === doi) {
          duplicateOf = i;
          matchType = 'doi_match';
          break;
        }
      }
    }

    // Stage 3: author-cluster match (identical normalized author sets).
    if (duplicateOf === -1 && authorKey !== '') {
      for (let i = 0; i < unique.length; i++) {
        if (normalizeAuthors(unique[i].metadata.authors) === authorKey) {
          duplicateOf = i;
          matchType = 'author_cluster';
          break;
        }
      }
    }

    // Stage 4: title Levenshtein similarity above threshold.
    if (duplicateOf === -1) {
      for (let i = 0; i < unique.length; i++) {
        const sim = stringSimilarity(source.title.toLowerCase(), unique[i].title.toLowerCase());
        if (sim > threshold) {
          duplicateOf = i;
          matchType = 'semantic';
          break;
        }
      }
    }

    if (duplicateOf === -1 || matchType === null) {
      hashIndex.set(hash, unique.length);
      unique.push(source);
      groups.push({
        groupId: `dedup_${groupCounter++}`,
        representativeId: source.id,
        duplicateIds: [],
        matchTypes: [],
      });
    } else {
      const group = groups[duplicateOf];
      group.duplicateIds.push(source.id);
      group.matchTypes.push(matchType);
    }
  }

  const dedupReport: DedupReport = {
    groupsFormed: groups.length,
    duplicatesRemoved: sources.length - unique.length,
    mergeStrategy: 'first_in_group_retained',
  };
  return { unique, groups, dedupReport };
}

// ============================================================================
// SCORING
// ============================================================================

export function resolveConfig(
  query: ResearchQuery,
  config: PartialResearchConfig = {},
): DeterministicResearchConfig {
  return {
    maxSources: config.maxSources ?? DEFAULT_RESEARCH_CONFIG.maxSources,
    minRelevance: config.minRelevance ?? DEFAULT_RESEARCH_CONFIG.minRelevance,
    dedupThreshold: config.dedupThreshold ?? DEFAULT_RESEARCH_CONFIG.dedupThreshold,
    trustedDomains: config.trustedDomains ?? DEFAULT_TRUSTED_DOMAINS,
    referenceTimeMs: config.referenceTimeMs ?? query.timestamp ?? null,
  };
}

/**
 * Deterministic relevance score in [0,1]:
 * keyword overlap 0.4 + domain reputation 0.3 + recency 0.3 + OA bonus 0.1,
 * clamped to [0,1].
 */
export function scoreRelevance(
  source: RawSource,
  query: ResearchQuery,
  config: PartialResearchConfig = {},
): number {
  const resolved = resolveConfig(query, config);
  let score = 0;

  // Keyword overlap (0.4 weight).
  const queryTokens = query.topic
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (queryTokens.length > 0) {
    const sourceText = `${source.title} ${source.contentPreview}`.toLowerCase();
    const keywordMatches = queryTokens.filter((token) => sourceText.includes(token)).length;
    score += (keywordMatches / queryTokens.length) * 0.4;
  }

  // Domain reputation (0.3 weight).
  if (resolved.trustedDomains.includes(source.domain)) {
    score += 0.3;
  }

  // Recency (0.3 weight, linear decay over 12 months from reference time).
  if (source.metadata.publishedAt !== undefined) {
    const reference = resolved.referenceTimeMs ?? query.timestamp;
    const ageMonths = (reference - source.metadata.publishedAt) / (1000 * 60 * 60 * 24 * 30);
    const recency = Math.max(0, Math.min(0.3, 0.3 * (1 - ageMonths / 12)));
    score += recency;
  }

  // Open-access bonus.
  if (source.metadata.accessibilityStatus === 'open') {
    score += OPEN_ACCESS_BONUS;
  }

  const clamped = Math.max(0, Math.min(1, score));
  return Math.round(clamped * 1e6) / 1e6;
}

export function confidenceFor(
  relevanceScore: number,
  quality: VerifiedSource['dataQuality'],
): VerifiedSource['confidenceLevel'] {
  const qualityScore =
    (quality.hasMetadata ? 0.3 : 0) +
    (quality.hasAuthors ? 0.3 : 0) +
    (quality.isOpenAccess ? 0.2 : 0) +
    (quality.citationCount ? Math.min(0.2, quality.citationCount / 100) : 0);
  const combined = relevanceScore * 0.6 + qualityScore * 0.4;
  if (combined >= 0.8) return 'high';
  if (combined >= 0.5) return 'medium';
  return 'low';
}

// ============================================================================
// PIPELINE
// ============================================================================

/**
 * Deterministic research pipeline: dedup -> score -> filter -> sort.
 * The execution hash covers only deterministic content (query hash +
 * ordered verified audit hashes), so re-execution is bit-identical.
 */
export function executeResearch(
  query: ResearchQuery,
  sources: RawSource[],
  config: PartialResearchConfig = {},
): ExecuteResearchResult {
  const resolved = resolveConfig(query, config);
  const { unique, groups, dedupReport } = dedupSources(sources, resolved.dedupThreshold);

  const verified: VerifiedSource[] = [];
  for (const raw of unique) {
    const relevanceScore = scoreRelevance(raw, query, resolved);
    const threshold = query.constraints?.minRelevanceScore ?? resolved.minRelevance;
    if (relevanceScore < threshold) continue;
    const dataQuality: VerifiedSource['dataQuality'] = {
      hasMetadata: Boolean(raw.metadata.publishedAt !== undefined && raw.metadata.authors !== undefined),
      hasAuthors: Boolean(raw.metadata.authors && raw.metadata.authors.length > 0),
      isOpenAccess: raw.metadata.accessibilityStatus === 'open',
      citationCount: 0,
      h5Index: undefined,
    };
    verified.push({
      ...raw,
      relevanceScore,
      confidenceLevel: confidenceFor(relevanceScore, dataQuality),
      dataQuality,
      auditHash: sourceAuditHash(raw, relevanceScore, dataQuality),
    });
  }

  verified.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const limited = verified.slice(0, Math.max(0, resolved.maxSources));

  const qHash = queryHash(query);
  const executionHash = sha256Hex(
    [qHash, ...limited.map((s) => `${s.id}|${s.relevanceScore}|${s.auditHash}`)].join('\n'),
  );

  const auditSummary: AuditSummary = {
    queryHash: qHash,
    executionHash,
    rawSourceCount: sources.length,
    uniqueSourceCount: unique.length,
    verifiedSourceCount: limited.length,
    duplicatesRemoved: dedupReport.duplicatesRemoved,
  };

  return { sources: limited, dedupReport, auditSummary, groups };
}

// ============================================================================
// EVIDENCE BRIDGE
// ============================================================================

export function claimSourceSimilarity(claimText: string, sourceText: string): number {
  const claimWords = claimText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (claimWords.length === 0) return 0;
  const lowered = sourceText.toLowerCase();
  const matches = claimWords.filter((w) => lowered.includes(w)).length;
  return matches / claimWords.length;
}

/** Bind verified sources to claims wherever similarity > 0.6. */
export function bindToClaims(result: ExecuteResearchResult, claims: Claim[]): EvidenceClaimBinding[] {
  const bindings: EvidenceClaimBinding[] = [];
  for (const claim of claims) {
    for (const source of result.sources) {
      const similarity = claimSourceSimilarity(claim.text, `${source.title} ${source.contentPreview}`);
      if (similarity > BINDING_SIMILARITY_THRESHOLD) {
        bindings.push({
          sourceId: source.id,
          claimId: claim.id,
          confidenceLevel: source.confidenceLevel,
          similarity: Math.round(similarity * 1e6) / 1e6,
          auditHash: sha256Hex(`${source.id}|${claim.id}|${similarity}`),
        });
      }
    }
  }
  return bindings;
}
