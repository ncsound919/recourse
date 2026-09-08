/**
 * Full-text evidence extraction from Europe PMC open-access articles (JATS XML).
 *
 * The abstract feed rarely reports CIs (only ~1 in 25 abstracts was poolable).
 * Full text is where the primary data lives — in results tables with two
 * machine-parseable shapes (both observed in real open-access oncology RCTs):
 *
 *  Pattern A — coefficient table:
 *    | Model | Size effect | SE | CI95%      | p      |
 *    | Crude | -7.03       | 1.453 | -9.91;-4.41 | <0.001 |
 *    Effect + SE reported directly. Pooled as-is.
 *
 *  Pattern B — group-comparison table:
 *    | Outcome | Control n=50 | Music Therapy n=60 | p |
 *    | Anxiety | 40.1 (6.8)   | 32.5 (5.2)         | .. |
 *    Per-arm mean (SD) with n in the header. MD = music - control,
 *    SE = pooled-variance SE (seFromGroups). Sign convention matches the
 *    anchors: negative = music lowered the measure (good for stress markers),
 *    positive = music raised it (good for IgA/HRV).
 *
 * Honesty guards:
 *  - Median (IQR) rows — "9 (7 - 10)" — are NEVER treated as mean (SD).
 *  - Biomarker attribution must come from the table caption, the row label, or
 *    the article title; the source is recorded in `detail`. Ambiguous tables
 *    produce qualitative records, never guessed numbers.
 *  - The MIN_POOLABLE_STUDIES=2 calibration guard still applies downstream.
 */

import { seFromGroups, type EvidenceBiomarker, type TrialEvidence } from './musicTherapyEvidence.js';

export interface JatsTable {
  caption: string;
  header: string[];
  rows: string[][];
}

/** Strip tags + decode entities + normalize unicode minus/dashes to ASCII.
 *  JATS full text uses U+2212 (math minus) and en-dashes inside numbers;
 *  parseFloat treats those as NaN, which silently mispairs effect/SE columns. */
function cleanCell(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/[\u2212\u2013\u2014\u2012\u2015]/g, '-') // − – — ‐ ‗ -> '-'
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseJatsTables(xml: string): JatsTable[] {
  const out: JatsTable[] = [];
  const wraps = xml.match(/<table-wrap[\s\S]*?<\/table-wrap>/g) ?? [];
  for (const wrap of wraps) {
    const capMatch = wrap.match(/<caption[\s\S]*?<\/caption>/);
    const caption = capMatch ? cleanCell(capMatch[0]) : '';
    const table = wrap.match(/<table[\s\S]*?<\/table>/);
    if (!table) continue;
    const trs = table[0].match(/<tr[\s\S]*?<\/tr>/g) ?? [];
    const rows: string[][] = [];
    for (const tr of trs) {
      const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? [])
        .map((c) => cleanCell(c));
      if (cells.length) rows.push(cells);
    }
    if (rows.length >= 2) out.push({ caption, header: rows[0], rows: rows.slice(1) });
  }
  return out;
}

const BIOMARKER_ROW_RE: Record<EvidenceBiomarker, RegExp> = {
  anxietySai: /anxiety|state.?trait|STAI|SAI|HADS-?A/i,
  hr: /heart\s*rate|\bHR\b(?!V)/i,
  bpSystolic: /systolic|blood\s*pressure|\bBP\b/i,
  cortisol: /cortisol|neuroendocrine/i,
  iga: /\bIgA\b|immunoglobulin\s*A/i,
  hrv: /heart\s*rate\s*variability|\bHRV\b/i,
};

/** Which biomarkers does this text mention (for attribution fallback)? */
function biomarkersIn(text: string): EvidenceBiomarker[] {
  return (Object.keys(BIOMARKER_ROW_RE) as EvidenceBiomarker[]).filter((b) =>
    BIOMARKER_ROW_RE[b].test(text));
}

/** "40.1 (6.8)" or "40.1 ± 6.8" -> [40.1, 6.8]. Range "9 (7 - 10)" -> null. */
function parseMeanSd(cell: string): [number, number] | null {
  const m = /^(-?\d+(?:\.\d+)?)\s*(?:\(|±|\+\/-)\s*(-?\d+(?:\.\d+)?)\s*\)?$/.exec(cell.trim());
  if (!m) return null;
  const mean = parseFloat(m[1]);
  const sd = parseFloat(m[2]);
  if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd < 0) return null;
  return [mean, sd];
}

/** Is this cell a median (IQR) like "9 (7 - 10)"? Those must be skipped. */
function isMedianIqr(cell: string): boolean {
  return /^-?\d+(?:\.\d+)?\s*\(\s*-?\d+(?:\.\d+)?\s*(-|–|to)\s*-?\d+(?:\.\d+)?\s*\)$/.test(cell.trim());
}

/** "n=50" or "N=50" inside a header cell. */
function parseN(cell: string): number | null {
  const m = /[nN]\s*=\s*(\d+)/.exec(cell);
  return m ? parseInt(m[1], 10) : null;
}

export interface FullTextExtraction {
  evidence: TrialEvidence[];
  notes: string[];
}

/**
 * Extract poolable evidence from one article's tables.
 * `articleTitle` is the attribution fallback; `pmid`/`pmcid` ride along for
 * provenance. Only unambiguous rows produce numbers.
 */
export function extractFromTables(
  tables: JatsTable[],
  articleTitle: string,
  opts: { pmid?: string | null; year?: number; journal?: string } = {},
): FullTextExtraction {
  const evidence: TrialEvidence[] = [];
  const notes: string[] = [];
  const year = opts.year ?? 0;
  const src = (what: string) =>
    `${articleTitle}${opts.journal ? ` (${opts.journal}, ${year})` : ` (${year})`} [${what}]`;

  for (const tbl of tables) {
    const header = tbl.header.join(' | ');
    const headerText = `${tbl.caption} ${header}`;
    const articleBiomarkers = biomarkersIn(articleTitle);
    // Full table context (caption + header + all row labels) — used to detect
    // model types that must NOT be pooled as music-vs-control effects.
    const tableText = `${tbl.caption} ${header} ${tbl.rows.map((r) => r[0] ?? '').join(' ')}`;

    // Baseline-characteristics tables report PRE-intervention between-group
    // differences, which are NOT treatment effects. Never pool them.
    const isBaseline = /baseline|demographic|characteristic/i.test(headerText);
    if (isBaseline) {
      notes.push(`table "${(tbl.caption || 'untitled').slice(0, 60)}" skipped: baseline/demographic table (pre-intervention differences are not treatment effects)`);
      continue;
    }

    // ---- Pattern A: coefficient table with SE and/or CI --------------------
    const hasSeCol = /\bSE\b|standard error/i.test(header);
    const hasCiCol = /CI|confidence interval/i.test(header);
    const hasEffectCol = /effect|coefficient|β|beta|estimate|difference/i.test(header);
    if (hasEffectCol && (hasSeCol || hasCiCol)) {
      // Contrast-type guards. A coefficient must represent the MUSIC-vs-CONTROL
      // effect. Demote to qualitative when the table is:
      //  (a) an interaction / subgroup / moderator model (its coefficients are
      //      not the between-arm treatment effect), or
      //  (b) a music-vs-music comparison (both arms are music interventions —
      //      e.g. high-frequency vs low-frequency; pooling that into a
      //      music-vs-control effect estimate would be invalid).
      const isInteractionModel = /interaction|moderat|expectation|pre-?post\s*change|subgroup|×/i.test(tableText);
      const musicArmMentions = new Set(
        (tableText.toLowerCase().match(/high.?frequency|low.?frequency|active\s+music|receptive\s+music|preferred\s+music|improvised|group\s+singing|music\s+therapy\s+group/g) ?? []),
      );
      const mentionsControl = /control|usual\s*care|standard\s*care/i.test(tableText);
      const isMusicVsMusic = musicArmMentions.size >= 2 && !mentionsControl;
      if (isInteractionModel || isMusicVsMusic) {
        const why = isInteractionModel ? 'interaction/subgroup model (coefficient is not the between-arm treatment effect)' : 'music-vs-music comparison (no control arm)';
        notes.push(`coefficient table "${(tbl.caption || 'untitled').slice(0, 60)}" demoted: ${why}`);
        for (const row of tbl.rows) {
          const rowLabel = row[0] ?? '';
          const rowBm = biomarkersIn(`${rowLabel} ${tbl.caption}`);
          if (rowBm.length !== 1) continue;
          evidence.push({
            biomarker: rowBm[0], effect: 0, se: null, n: null, year,
            source: src('coefficient, contrast-type unsafe'),
            pmid: opts.pmid ?? null,
            qualitative: true,
            detail: `${why} — row "${rowLabel}"`,
          });
        }
        continue;
      }
      let tookPrimary = false; // one coefficient per table (crude/adjusted of the same model are not independent studies)
      for (const row of tbl.rows) {
        const rowLabel = row[0] ?? '';
        // Scan cells: first pure number = effect; explicit SE cell or "a;b" CI = SE.
        let effect: number | null = null;
        let se: number | null = null;
        for (let i = 1; i < row.length; i++) {
          const cell = row[i].trim();
          const ci = /^([+-]?\d+(?:\.\d+)?)\s*[;,]\s*([+-]?\d+(?:\.\d+)?)$/.exec(cell);
          if (ci) {
            const a = parseFloat(ci[1]); const b = parseFloat(ci[2]);
            if (Number.isFinite(a) && Number.isFinite(b) && se === null) se = Math.abs(b - a) / (2 * 1.959963985);
            continue;
          }
          const v = parseFloat(cell);
          if (!Number.isFinite(v)) continue;
          if (effect === null) { effect = v; continue; }
          if (se === null) { se = Math.abs(v); break; }
        }
        if (effect === null || se === null || se <= 0) continue;

        // Biomarker attribution: row label/caption -> article title (a
        // coefficient table models one outcome, so title fallback is valid).
        let biomarker: EvidenceBiomarker | null = null;
        let how = '';
        const rowBm = biomarkersIn(`${rowLabel} ${tbl.caption}`);
        if (rowBm.length === 1) { biomarker = rowBm[0]; how = 'row/caption'; }
        else if (articleBiomarkers.length === 1) { biomarker = articleBiomarkers[0]; how = 'article title'; }
        if (!biomarker) {
          notes.push(`coefficient row "${rowLabel}" (effect ${effect}, SE ${se}) not attributed — recorded qualitative`);
          evidence.push({ biomarker: 'anxietySai', effect, se: null, n: null, year, source: src('coefficient, unattributed'), pmid: opts.pmid ?? null, qualitative: true, detail: `unattributed coefficient row "${rowLabel}"` });
          continue;
        }
        if (tookPrimary) {
          notes.push(`coefficient row "${rowLabel}" skipped (secondary model of the same table)`);
          continue;
        }
        tookPrimary = true;
        evidence.push({
          biomarker, effect, se, n: null, year,
          source: src(`regression coefficient (${how})`), pmid: opts.pmid ?? null,
          detail: `coefficient table row "${rowLabel}" effect=${effect} SE=${se}`,
        });
      }
      continue; // a coefficient table is not also a group-mean table
    }

    // ---- Pattern B: group-comparison table with n in header -----------------
    const groupCols: { idx: number; n: number; isIntervention: boolean }[] = [];
    for (let i = 0; i < tbl.header.length; i++) {
      const n = parseN(tbl.header[i]);
      if (n === null) continue;
      const h = tbl.header[i].toLowerCase();
      const isIntervention = /music|intervention|experimental|treatment/.test(h) && !/control/.test(h);
      const isControl = /control|usual care|standard/.test(h);
      if (isIntervention || isControl) groupCols.push({ idx: i, n, isIntervention });
    }
    // Need exactly one intervention arm and one control arm.
    const ig = groupCols.find((g) => g.isIntervention);
    const cg = groupCols.find((g) => !g.isIntervention);
    if (ig && cg && ig.n >= 2 && cg.n >= 2) {
      // Music-vs-music guard: a "control" arm that is itself a music variant
      // (e.g. "Low-frequency Control Group") is NOT a valid control.
      const MUSIC_VARIANT = /high.?frequency|low.?frequency|active\s+music|receptive\s+music|preferred\s+music|improvised|music\s+therapy/i;
      if (MUSIC_VARIANT.test(tbl.header[cg.idx])) {
        notes.push(`table "${(tbl.caption || 'untitled').slice(0, 60)}" skipped: control arm is itself a music variant (music-vs-music comparison)`);
        continue;
      }
      for (const row of tbl.rows) {
        const rowLabel = row[0] ?? '';
        if (isMedianIqr(row[ig.idx] ?? '') || isMedianIqr(row[cg.idx] ?? '')) continue; // honest skip
        const ms1 = parseMeanSd(row[ig.idx] ?? '');
        const ms2 = parseMeanSd(row[cg.idx] ?? '');
        if (!ms1 || !ms2) continue;
        const [m1, s1] = ms1; // intervention
        const [m2, s2] = ms2; // control
        const rowBm = biomarkersIn(rowLabel);
        let biomarker: EvidenceBiomarker | null = null;
        let how = '';
        // Group rows: the ROW LABEL is the outcome. No article-title fallback
        // here — it would mis-attribute unrelated rows (e.g. Age) to whatever
        // the article studied.
        if (rowBm.length === 1) { biomarker = rowBm[0]; how = 'row label'; }
        else if (tbl.caption && biomarkersIn(tbl.caption).length === 1) { biomarker = biomarkersIn(tbl.caption)[0]; how = 'caption'; }
        if (!biomarker) {
          notes.push(`group row "${rowLabel}" (${m1}±${s1} vs ${m2}±${s2}) not attributed — skipped`);
          continue;
        }
        const md = m1 - m2; // music - control: negative = lowered (good for stress)
        const se = seFromGroups(s1, ig.n, s2, cg.n);
        evidence.push({
          biomarker, effect: Math.round(md * 100) / 100, se: Math.round(se * 100) / 100,
          n: ig.n + cg.n, year, source: src(`group means (${how})`), pmid: opts.pmid ?? null,
          detail: `${rowLabel}: music ${m1}±${s1} (n=${ig.n}) vs control ${m2}±${s2} (n=${cg.n})`,
        });
      }
    }
  }
  return { evidence, notes };
}

/** Fetch one article's full text XML by PMCID (Europe PMC REST). */
export async function fetchFullTextXml(
  pmcid: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20000,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`;
    const resp = await fetchImpl(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}