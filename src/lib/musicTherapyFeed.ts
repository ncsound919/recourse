/**
 * Live Europe PMC feed for music-therapy-in-oncology trial evidence.
 *
 * Queries the real Europe PMC REST API for RCT abstracts, parses each for
 * machine-parseable effect statements, and returns poolable TrialEvidence +
 * qualitative records. This is the "measured data" path: real published trial
 * results, not fabricated values. When the network is unavailable the caller
 * falls back to the seeded Cochrane anchor records (also real, published).
 */
import {
  parseAbstractForEffect,
  seFromCi,
  type EvidenceBiomarker,
  type QualitativeEvidence,
  type TrialEvidence,
} from './musicTherapyEvidence.js';
import { parseJatsTables, extractFromTables, fetchFullTextXml } from './musicTherapyFullText.js';

export interface EpMcTrial {
  title: string;
  abstract: string;
  year: number;
  journal: string;
  pmid: string | null;
}

export interface FeedResult {
  hitCount: number;
  trials: EpMcTrial[];
  poolable: TrialEvidence[];
  qualitative: QualitativeEvidence[];
  errors: string[];
  fetchedAt: number;
  /** Full-text pass stats (0 when fullText option not requested). */
  fullTextFetched: number;
  fullTextExtracted: number;
}

/** Query string — music therapy + oncology + randomized, sorted by relevance. */
const DEFAULT_QUERY = '(TITLE:"music therapy" OR TITLE:"music intervention" OR ABSTRACT:"music therapy") AND (oncology OR cancer OR chemotherapy OR tumor) AND (randomized OR randomised OR "clinical trial")';

/** Run the live feed. `fetchImpl` is injectable for tests.
 *  `fullText: true` additionally fetches open-access full text (JATS XML) for
 *  trials with PMCIDs and extracts per-arm/coefficient evidence from result
 *  tables — the primary-data path that abstracts rarely expose. */
export async function fetchMusicTherapyTrials(
  opts: {
    query?: string;
    pageSize?: number;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    fullText?: boolean;
    maxFullText?: number;
  } = {},
): Promise<FeedResult> {
  const query = opts.query ?? DEFAULT_QUERY;
  const pageSize = opts.pageSize ?? 20;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const wantFullText = opts.fullText === true;
  const maxFullText = opts.maxFullText ?? 10;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url =
      'https://www.ebi.ac.uk/europepmc/webservices/rest/search?' +
      new URLSearchParams({ query, format: 'json', pageSize: String(pageSize), resultType: 'core' });
    const resp = await doFetch(url, { signal: ctrl.signal });
    if (!resp.ok) return { hitCount: 0, trials: [], poolable: [], qualitative: [], errors: [`HTTP ${resp.status}`], fetchedAt: Date.now(), fullTextFetched: 0, fullTextExtracted: 0 };
    const json = (await resp.json()) as any;
    const hitCount = Number(json.hitCount ?? 0);
    const results: any[] = json.resultList?.result ?? [];

    const trials: EpMcTrial[] = [];
    const poolable: TrialEvidence[] = [];
    const qualitative: QualitativeEvidence[] = [];
    const errors: string[] = [];
    const fullTextCandidates: { title: string; year: number; journal: string; pmcid: string; pmid: string | null }[] = [];

    for (const r of results) {
      const abstract = String(r.abstractText ?? '').trim();
      const title = String(r.title ?? '');
      const year = Number(r.pubYear ?? 0);
      const journal = String(r.journalInfo?.journal?.title ?? '');
      const pmid = r.pmid ? String(r.pmid) : null;
      const pmcid = r.pmcid ? String(r.pmcid) : null;
      if (!abstract) continue;

      trials.push({ title, abstract, year, journal, pmid });
      if (wantFullText && pmcid) fullTextCandidates.push({ title, year, journal, pmcid, pmid });

      for (const biomarker of BIOMARKER_FEED_ORDER) {
        const parsed = parseAbstractForEffect(abstract, biomarker);
        if (!parsed.matched) continue;
        if (parsed.effect != null) {
          if (parsed.se != null) {
            poolable.push({
              biomarker,
              effect: parsed.effect,
              se: parsed.se,
              n: null, // not reliably parseable from abstract
              year,
              source: `${title} (${journal}, ${year})`,
              pmid,
            });
          } else {
            qualitative.push({
              biomarker,
              year,
              source: `${title} (${journal}, ${year})`,
              pmid,
              detail: `effect reported without CI: MD=${parsed.effect}`,
            });
          }
        }
      }
    }

    // ---- Full-text pass: primary-data tables from open-access articles ------
    let fullTextFetched = 0;
    let fullTextExtracted = 0;
    if (wantFullText) {
      for (const cand of fullTextCandidates.slice(0, maxFullText)) {
        const xml = await fetchFullTextXml(cand.pmcid, doFetch, timeoutMs);
        if (!xml) continue;
        fullTextFetched++;
        try {
          const tables = parseJatsTables(xml);
          const { evidence, notes } = extractFromTables(tables, cand.title, {
            pmid: cand.pmid, year: cand.year, journal: cand.journal,
          });
          for (const ev of evidence) {
            if (ev.qualitative) {
              qualitative.push({
                biomarker: ev.biomarker,
                year: ev.year,
                source: ev.source,
                pmid: ev.pmid,
                detail: ev.detail ?? 'full-text record',
              });
            } else {
              poolable.push(ev);
              fullTextExtracted++;
            }
          }
          for (const n of notes) qualitative.push({
            biomarker: 'anxietySai', year: cand.year, source: `${cand.title} (${cand.journal}, ${cand.year})`,
            pmid: cand.pmid, detail: `note: ${n}`,
          });
        } catch (err: any) {
          errors.push(`full-text parse failed for ${cand.pmcid}: ${err?.message ?? String(err)}`);
        }
      }
    }

    // ---- Study-level dedupe: one poolable effect per article per biomarker --
    // A single study contributes ONE effect to a meta-analysis. The abstract
    // pass and full-text pass (and multiple tables inside one article) can both
    // produce records for the same article; duplicates would double-weight it.
    // Preference: group-mean records (they carry n) over coefficient records.
    const seen = new Set<string>();
    const deduped: TrialEvidence[] = [];
    for (const ev of poolable.sort((a, b) => (b.n ?? 0) - (a.n ?? 0))) {
      const key = `${ev.pmid ?? 'no-pmid:' + ev.source.slice(0, 60)}::${ev.biomarker}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(ev);
    }

    // ---- Review demotion: published meta-analyses/reviews are NOT studies ---
    // A review's pooled MD already aggregates its included trials. Pooling it
    // alongside primary studies would double-count every trial inside it.
    const REVIEW_RE = /systematic\s*review|meta-?analysis|scoping\s*review|umbrella\s*review|literature\s*review|narrative\s*review|review\s*of\s*the\s*literature/i;
    const finalPoolable: TrialEvidence[] = [];
    for (const ev of deduped) {
      if (REVIEW_RE.test(ev.source)) {
        qualitative.push({
          biomarker: ev.biomarker,
          year: ev.year,
          source: ev.source,
          pmid: ev.pmid,
          detail: `published review/meta-analysis pooled estimate (MD=${ev.effect}) — not poolable as a primary study (would double-count its included trials)`,
        });
        continue;
      }
      finalPoolable.push(ev);
    }

    return { hitCount, trials, poolable: finalPoolable, qualitative, errors, fetchedAt: Date.now(), fullTextFetched, fullTextExtracted };
  } catch (err: any) {
    return {
      hitCount: 0,
      trials: [],
      poolable: [],
      qualitative: [],
      errors: [`feed unavailable: ${err?.message ?? String(err)}`],
      fetchedAt: Date.now(),
      fullTextFetched: 0,
      fullTextExtracted: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

const BIOMARKER_FEED_ORDER: EvidenceBiomarker[] = ['anxietySai', 'hr', 'bpSystolic', 'cortisol', 'iga', 'hrv'];

export { seFromCi };