/**
 * types.ts — what "grounded in research" means here, precisely.
 *
 * ## The distinction this file exists to enforce
 *
 * A research service will hand you a title, an author, a year, a URL, and a
 * paragraph of prose. Those five fields do **not** have the same provenance. A
 * real arXiv abstract and a paragraph a service generated from your query string
 * are byte-identical in shape; only one of them is evidence.
 *
 * Probing the live services on this machine made that concrete. Synthbook's
 * keyless `pubmed` provider answers a query for CRISPR base editing with:
 *
 * ```json
 * { "id": "pmc-13627999",
 *   "title": "Biomedical Research (PMC13627999): crispr base editing off-target rate",
 *   "author": "Biotech & Medical Researchers",
 *   "text_span": "PMC Research Article PMC13627999: Investigates bioenergetic mechanisms..." }
 * ```
 *
 * Only the PMC identifier is real. The title echoes the query. The span is a
 * template. Passing that to a code generator as "research" teaches the model to
 * invent plausible methods, which is precisely the failure grounding is supposed
 * to prevent.
 *
 * So every item carries a {@link EvidenceTrust}. Only `retrieved` is quoted into
 * a prompt. The rest travel with the tool as leads — real identifiers a human can
 * follow — and are never presented as findings.
 */

/**
 * How much of an item is actually retrieved rather than generated.
 *
 * - `retrieved` — the text came from the upstream source. Safe to quote.
 * - `metadata` — identifiers are real (a DOI, a PMC id, a wiki page) but the
 *   accompanying prose was composed by the service. Cite the link, not the text.
 * - `unverified` — essentially templated from the query. Not evidence. Recorded
 *   so the gap is visible, never quoted.
 */
export type EvidenceTrust = 'retrieved' | 'metadata' | 'unverified';

/** Order used when a bundle must pick one headline level. */
const TRUST_RANK: Record<EvidenceTrust, number> = {
  retrieved: 0,
  metadata: 1,
  unverified: 2,
};

/** Lower rank wins. */
export function strongerTrust(a: EvidenceTrust, b: EvidenceTrust): EvidenceTrust {
  return TRUST_RANK[a] <= TRUST_RANK[b] ? a : b;
}

/** Only this level may be quoted into a model prompt. */
export function isQuotable(trust: EvidenceTrust): boolean {
  return trust === 'retrieved';
}

/** One retrieved item from one provider. */
export interface GroundingSource {
  /** Stable id from the provider, used for dedupe and content addressing. */
  readonly id: string;
  /** Which service answered: `synthbook`, `omniresearch`. */
  readonly service: string;
  /** Which provider within that service: `arxiv`, `crossref`, ... */
  readonly provider: string;
  readonly trust: EvidenceTrust;
  readonly title: string;
  readonly author: string;
  readonly year: string;
  /** Where a reader can verify this. Empty when the provider gave none. */
  readonly url: string;
  /** The prose. Empty when the provider returned none. */
  readonly span: string;
  /** Where the trust level came from — the registry rule that classified it. */
  readonly trustReason: string;
}

/** The outcome of asking one provider a question. */
export interface ProviderStatus {
  readonly service: string;
  readonly provider: string;
  readonly ok: boolean;
  readonly count: number;
  readonly latencyMs: number;
  /** Why it failed, or why it was skipped. Empty on a clean success. */
  readonly error: string;
  /** True when the service could not be reached at all, as opposed to answering badly. */
  readonly serviceDown?: boolean;
}

/** Everything gathered for one forge spec, plus what failed. */
export interface GroundingBundle {
  readonly specId: string;
  /** The query actually sent, so a reader can reproduce the search. */
  readonly query: string;
  readonly gatheredAt: number;
  /** All items, strongest trust first. May include unquotable ones. */
  readonly sources: readonly GroundingSource[];
  /** Per-provider outcomes, including the ones that failed. */
  readonly providers: readonly ProviderStatus[];
  /** Items eligible to be quoted into a prompt. */
  readonly quotable: readonly GroundingSource[];
  /**
   * True when some configured source did not answer, or when nothing quotable
   * came back. The prompt says so plainly rather than implying full coverage.
   */
  readonly degraded: boolean;
  /** Human-readable reasons the bundle is degraded. Empty when it is not. */
  readonly degradedReasons: readonly string[];
  /** Content hash over the canonical bundle. Lets a later run detect drift. */
  readonly hash: string;
}

/** A bundle that could not be built at all (nothing configured, or all down). */
export interface NoGrounding {
  readonly specId: string;
  readonly reason: string;
}