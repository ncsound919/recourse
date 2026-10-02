/**
 * citationResolver.ts — turn a human citation string into a FETCHABLE document.
 *
 * WHY THIS EXISTS
 * `biotechKnowledgeGraph.ts` already has `crossValidateWithLiterature()`, which
 * fetches a paper through the PDF sidecar and checks the claim's terms against
 * the extracted text. It was written, correct, and never called.
 *
 * It could never usefully have been called: `extractUrl()` requires an http(s)
 * URL inside `claim.source`, and NOT ONE of the 7 curated oncology citations
 * contains one. They are all typed reference strings —
 *
 *   'Skoulidis F, et al. Sotorasib for Lung Cancers with KRAS p.G12C Mutation.
 *    N Engl J Med 2021; 384:2371-2381.'
 *
 * So the function would have returned "no fetchable URL" for every claim, every
 * time. The blocker was not the verification logic; it was that a citation
 * written for a human is not a URL.
 *
 * This module resolves a citation to an open-access identifier via the Europe
 * PMC REST search (already a dependency of this repo — musicTherapyFeed.ts and
 * musicTherapyFullText.ts use it), then returns a URL the PDF sidecar can fetch.
 *
 * HONESTY CONTRACT
 *  - No identifier means NO resolution. Never guess a URL, never synthesize a
 *    PMCID, never return a document we did not actually find. A citation that
 *    cannot be resolved reports `resolved: false` with the reason, so a caller
 *    can say "could not check" instead of "checked and passed".
 *  - Search hits are ranked and the best one is returned ALONG WITH the title
 *    the index reports, so a caller can see whether it is plausibly the same
 *    paper rather than trusting a silent substitution.
 *  - Network failures are failures. There is no cached/fabricated fallback.
 *  - `matchScore` is a lexical overlap heuristic, NOT proof of identity. Callers
 *    that need certainty should surface it as "likely match", not "verified".
 */

import { fetchFullTextXml } from './musicTherapyFullText.js';

const EUROPE_PMC_SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

export interface ResolvedCitation {
  resolved: boolean;
  /** URL a fetcher can retrieve, when resolved. */
  url?: string;
  /** Europe PMC identifier (PMCID when open-access). */
  pmcid?: string;
  pmid?: string;
  /** Title as the index reports it — NOT asserted to be the same paper. */
  indexedTitle?: string;
  journal?: string;
  year?: string;
  /** 0..1 lexical overlap between the citation and the indexed title. */
  matchScore?: number;
  /** Human-readable reason when unresolved. */
  reason?: string;
}

/**
 * Pull the search phrase out of a citation.
 *
 * A citation is typically `Authors. Article Title. Journal Year;Vol:Pages.`
 *
 * Europe PMC's `TITLE:` field ANDs the terms, so AUTHOR SURNAMES are actively
 * harmful: `TITLE:Skoulidis Sotorasib` returns ZERO hits, because "Skoulidis"
 * is in the byline, not the title. `TITLE:Sotorasib Lung Cancers` finds the
 * paper exactly.
 *
 * So: drop the author segment STRUCTURALLY, not by guessing from word length
 * ("Skoulidis" is 9 characters and would survive any length heuristic). The
 * byline is the run of comma-separated tokens before the first sentence break,
 * which is a structural property of the citation format.
 *
 * Ranking afterwards still scores against the WHOLE citation, so a correct title
 * match that shares words with the byline is not penalised.
 */
function searchPhrase(citation: string): string {
  // Everything before the first sentence boundary is the author list.
  const authorSegment = citation.split(/(?<=\.)\s/)[0] ?? '';
  // Drop author surnames/initials: tokens that appear ONLY in the author segment.
  const authorWords = new Set(authorSegment.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean));
  const body = citation
    .replace(authorSegment, ' ')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !authorWords.has(w));

  // If stripping the byline left nothing (an odd citation), fall back to the
  // longest words anywhere in it rather than searching on author names.
  const source = body.length >= 2
    ? body
    : citation.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

  return source.sort((a, b) => b.length - a.length).slice(0, 4).join(' ');
}
/**
 * Isolate the article TITLE from a citation, for a tight exact-phrase search.
 *
 * The title is NOT reliably the 2nd segment:
 *   - `Skoulidis F, et al. Sotorasib for Lung Cancers...`  -> title is [1]
 *   - `Sotorasib combined with 3-methyladenine for...`    -> title is [0] (no byline)
 *
 * So score each segment instead of hard-coding an index: a title is long, has
 * several words, and is not just a journal+year stub. Picking the wrong segment
 * sends Europe PMC a garbage query, which is worse than not sending one.
 */
function citationTitlePhrase(citation: string): string | null {
  const segments = citation
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const JOURNAL = /^(N Engl J Med|Lancet|JAMA|Nat|Cell|Science|J Clin Oncol|Cancer|Radiol|BMJ|Lancet Oncol|N Engl|Ann Oncol|PLoS|BMC)\b/i;

  let best: string | null = null;
  let bestScore = 0;
  for (const raw of segments) {
    const seg = raw
      .split(/\.\s+[A-Z][a-z]+\s/)[0]
      // Keep INTERNAL periods: mutational notation is part of the title's
      // identity. Stripping "KRAS p.G12C" to "KRAS p G12C" turns a 1-hit exact
      // match in Europe PMC into 0 hits, silently dropping the correct paper.
      .replace(/[^\w\s,\-().]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = seg.split(' ').filter(Boolean);
    // Needs enough substance to be a title, not a stub.
    if (words.length < 6 || seg.length <= 12) continue;
    // A bare journal+year tail is not a title.
    if (JOURNAL.test(seg) && words.length < 10) continue;
    // Prefer the longest plausible title segment.
    if (words.length > bestScore) {
      bestScore = words.length;
      best = seg.slice(0, 200);
    }
  }
  return best;
}

/**
 * Floor for accepting an indexed record as the cited paper.
 *
 * CALIBRATED, not guessed. Measured against the real Sotorasib citation
 * (Skoulidis, NEJM 2021): the index returned ~25 candidates whose titles
 * overlapped the citation by 0.14–0.36 — all DIFFERENT papers about sotorasib
 * (case reports, combination trials, resistance mechanisms). An earlier 0.3
 * floor accepted one of those, which would have reported a claim as
 * "cross-validated" against literature that does not contain the cited finding.
 *
 * A genuine same-paper match scores far higher because the title is nearly
 * identical. Below the floor we REFUSE rather than retrieve something adjacent:
 * a wrong paper is worse than no paper, because it manufactures a false pass.
 */
export const MATCH_FLOOR = 0.5;

/** Significant lowercase tokens, stopwords removed. */
function tokens(s: string): string[] {
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'et', 'al', 'a', 'an', 'of', 'in', 'on', 'to']);
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP.has(t));
}

/**
 * Lexical overlap between a citation string and an indexed title.
 * Deliberately simple and reported as a score, never as a boolean: a low score
 * means "probably a different paper", not "no match".
 */
export function titleMatchScore(citation: string, title: string): number {
  const a = new Set(tokens(citation));
  const b = new Set(tokens(title));
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of b) if (a.has(t)) hits += 1;
  return Math.round((hits / b.size) * 1000) / 1000;
}

interface EpmcHit {
  pmid?: string;
  pmcid?: string;
  title?: string;
  journalTitle?: string;
  pubYear?: string;
  isOpenAccess?: string;
  source?: string;
}

/**
 * Resolve a citation string to an open-access full-text URL.
 *
 * `fetchImpl` is injectable so tests never touch the network. Results are ranked
 * by title overlap; only an open-access hit with a PMCID can yield a
 * fetchable full-text URL, because a paywalled PDF is not something the PDF
 * sidecar can honestly retrieve and report on.
 */
export async function resolveCitation(
  citation: string,
  opts: {
    fetchImpl?: typeof fetch;
    maxResults?: number;
    timeoutMs?: number;
    minScore?: number;
  } = {},
): Promise<ResolvedCitation> {
  const cite = String(citation ?? '').trim();
  if (!cite) return { resolved: false, reason: 'empty citation' };

  // Prefer a distinctive phrase from the citation; searchPhrase deliberately
  // keeps it general and lets the ranking below decide relevance.
  const query = searchPhrase(cite);
  if (!query) return { resolved: false, reason: 'citation contains no searchable words' };
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);

  try {
    // Europe PMC's TITLE:"<whole phrase>" needs an EXACT title match and returns
    // nothing for a citation's first sentence (which carries an author list and
    // trailing punctuation). Searching on the citation's distinctive TITLE WORDS
    // is both broader and correct: we rank the hits ourselves by overlap with the
    // full citation, and refuse anything below the score floor.
    const url =
      `${EUROPE_PMC_SEARCH}?query=${encodeURIComponent(`TITLE:${query}`)}` +
      `&format=json&pageSize=${Math.max(1, opts.maxResults ?? 8)}&resultType=core`;
    const resp = await doFetch(url, { signal: ctrl.signal });
    if (!resp.ok) {
      return { resolved: false, reason: `Europe PMC search failed: HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as { resultList?: { result?: EpmcHit[] } };
    const hits = data.resultList?.result ?? [];
    if (hits.length === 0) {
      return { resolved: false, reason: 'no Europe PMC result for this citation' };
    }

    // Rank by title overlap against the whole citation.
    //
    // The cited paper is not always the highest-scoring hit: the correct record
    // can sit below several other papers about the same drug. So when the
    // citation yields a usable title phrase, run a SECOND, tighter query for
    // that exact phrase and prefer an exact-ish title hit if one exists.
    const ranked = hits
      .map((h) => ({ h, score: titleMatchScore(cite, h.title ?? '') }))
      .sort((a, b) => b.score - a.score);
    let best = ranked[0];

    const min = opts.minScore ?? MATCH_FLOOR;

    // Tight follow-up search on the title phrase, when we could isolate one.
    const titlePhrase = citationTitlePhrase(cite);
    if (titlePhrase && titlePhrase.split(' ').length >= 3) {
      try {
        const tightUrl =
          `${EUROPE_PMC_SEARCH}?query=${encodeURIComponent(`TITLE:"${titlePhrase}"`)}` +
          `&format=json&pageSize=5&resultType=core`;
        const tightResp = await doFetch(tightUrl, { signal: ctrl.signal });
        if (tightResp.ok) {
          const tightData = (await tightResp.json()) as { resultList?: { result?: EpmcHit[] } };
          for (const h of tightData.resultList?.result ?? []) {
            const score = titleMatchScore(cite, h.title ?? '');
            // An exact-phrase title hit is the paper; take it over a merely
            // higher-scoring neighbour.
            if (score > best.score || (score >= MATCH_FLOOR && best.score < MATCH_FLOOR)) {
              best = { h, score };
            }
          }
        }
      } catch {
        // A failed tightening search is not fatal — we still rank what we have.
      }
    }

    if (best.score < min) {
      return {
        resolved: false,
        reason: `best Europe PMC match scored ${best.score} (below ${min}); refusing to substitute a different paper`,
        indexedTitle: best.h.title,
        matchScore: best.score,
      };
    }

    // Full text requires an open-access PMCID. Without one we can offer no
    // fetchable document, and must not pretend otherwise. Note this is a COMMON
    // case for NEJM/Lancet/JAMA-era oncology papers: they are indexed but
    // paywalled, so there is legally no retrievable full text to check a claim
    // against. Reporting "paywalled" is the honest outcome; it is NOT a failure
    // of the claim.
    if (!best.h.pmcid || best.h.isOpenAccess !== 'Y') {
      return {
        resolved: false,
        reason: best.h.pmcid
          ? `matched "${best.h.title?.slice(0, 80) ?? 'the record'}" (${best.h.pmcid}) but it is NOT open-access; no retrievable full text`
          : 'matched record has no PMC identifier, so it has no retrievable full text',
        pmid: best.h.pmid,
        pmcid: best.h.pmcid || undefined,
        indexedTitle: best.h.title,
        matchScore: best.score,
      };
    }

    const pmcid = best.h.pmcid;
    return {
      resolved: true,
      pmcid,
      pmid: best.h.pmid,
      // Europe PMC serves JATS XML full text for open-access articles; the PDF
      // sidecar consumes http(s) URLs, and this is the canonical full-text URL
      // for the identifier we actually resolved.
      url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`,
      indexedTitle: best.h.title,
      journal: best.h.journalTitle,
      year: best.h.pubYear,
      matchScore: best.score,
    };
  } catch (err: any) {
    return {
      resolved: false,
      reason: `citation resolution failed: ${err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err))}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve and extract full text in one step.
 *
 * Uses the repo's existing `fetchFullTextXml` (Europe PMC JATS XML) rather than
 * the PDF sidecar, because an open-access article's canonical full text is XML
 * and we already parse JATS elsewhere. Returns plain text suitable for the same
 * term-checking the KG does, plus the identifier that produced it.
 */
export async function resolveAndExtract(
  citation: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; minScore?: number } = {},
): Promise<{
  ok: boolean;
  text: string;
  chars: number;
  resolution: ResolvedCitation;
  reason?: string;
}> {
  const resolution = await resolveCitation(citation, opts);
  if (!resolution.resolved || !resolution.pmcid) {
    return { ok: false, text: '', chars: 0, resolution, reason: resolution.reason };
  }
  const xml = await fetchFullTextXml(
    resolution.pmcid,
    opts.fetchImpl ?? fetch,
    opts.timeoutMs ?? 20_000,
  );
  if (!xml) {
    return {
      ok: false, text: '', chars: 0, resolution,
      reason: `Europe PMC returned no full text for ${resolution.pmcid}`,
    };
  }
  // Strip tags so the term checker sees words, not markup.
  const text = xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    ok: text.length > 0,
    text,
    chars: text.length,
    resolution,
    ...(text.length === 0 ? { reason: 'full text was empty after tag stripping' } : {}),
  };
}