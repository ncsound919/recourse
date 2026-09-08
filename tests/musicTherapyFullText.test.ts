import { describe, it, expect } from 'vitest';
import {
  parseJatsTables,
  extractFromTables,
  fetchFullTextXml,
  type JatsTable,
} from '../src/lib/musicTherapyFullText';

/** Fixture modeled on real open-access oncology RCT tables (PMC12447645). */
const FIXTURE_XML = `<article>
<table-wrap>
<caption>Table 1. Post-intervention group comparison.</caption>
<table>
<tr><th>Variable</th><th>Control n=50 n (%)</th><th>Music Therapy n=60 n (%)</th><th>p</th></tr>
<tr><td>Age, years</td><td>57.1 (16.2)</td><td>54.2 (14.7)</td><td>0.331</td></tr>
<tr><td>State anxiety (STAI)</td><td>45.3 (9.1)</td><td>38.2 (8.4)</td><td>&lt;0.001</td></tr>
</table>
</table-wrap>
<table-wrap>
<caption>Table 2. Multivariable model.</caption>
<table>
<tr><th>Model</th><th>Size effect</th><th>SE</th><th>CI95%</th><th>p</th></tr>
<tr><td>Crude</td><td>-7.03</td><td>1.453</td><td>-9.91;-4.41</td><td>&lt;0.001</td></tr>
<tr><td>Hospital B</td><td>-6.77</td><td>1.444</td><td>-9.64;-3.91</td><td>&lt;0.001</td></tr>
</table>
</table-wrap>
<table-wrap>
<caption>Table 3. Wellbeing outcomes.</caption>
<table>
<tr><th>Outcome</th><th>Control n=50</th><th>Music Therapy n=60</th><th>p</th></tr>
<tr><td>Wellbeing NRS</td><td>9 (7 - 10)</td><td>9 (8 - 10)</td><td>0.072</td></tr>
</table>
</table-wrap>
</article>`;

describe('full-text JATS extraction', () => {
  it('parses tables into caption/header/rows', () => {
    const tables = parseJatsTables(FIXTURE_XML);
    expect(tables.length).toBe(3);
    expect(tables[0].header).toContain('Music Therapy n=60 n (%)');
    expect(tables[0].rows.length).toBe(2);
  });

  it('extracts group-mean evidence with SE from pooled variance (Pattern B)', () => {
    const tables = parseJatsTables(FIXTURE_XML);
    const { evidence } = extractFromTables(tables, 'Effect of group music therapy on state-anxiety in oncology', { pmid: '40980027', year: 2025 });
    const anx = evidence.find((e) => e.biomarker === 'anxietySai' && !e.qualitative);
    expect(anx).toBeDefined();
    // MD = 38.2 - 45.3 = -7.1 (music - control: lowered anxiety)
    expect(anx!.effect).toBeCloseTo(-7.1, 1);
    // SE from pooled SD: sp = sqrt((59*8.4^2 + 49*9.1^2)/107) ~ 8.73; SE ~ 8.73*sqrt(1/60+1/50)
    expect(anx!.se).toBeGreaterThan(1.5);
    expect(anx!.se).toBeLessThan(2.0);
    expect(anx!.n).toBe(110);
    expect(anx!.detail).toContain('music 38.2±8.4');
    expect(anx!.pmid).toBe('40980027');
  });

  it('never pools Age rows (no biomarker attribution, honest skip)', () => {
    const tables = parseJatsTables(FIXTURE_XML);
    const { evidence, notes } = extractFromTables(tables, 'Effect of group music therapy on state-anxiety in oncology', {});
    const age = evidence.find((e) => e.detail?.includes('Age'));
    expect(age).toBeUndefined();
  });

  it('extracts regression coefficient with reported SE (Pattern A)', () => {
    const tables = parseJatsTables(FIXTURE_XML);
    const { evidence } = extractFromTables(tables, 'Effect of group music therapy on state-anxiety in oncology', { year: 2025 });
    const coef = evidence.find((e) => e.detail?.includes('coefficient table row "Crude"'));
    expect(coef).toBeDefined();
    expect(coef!.effect).toBe(-7.03);
    expect(coef!.se).toBe(1.453);
    expect(coef!.biomarker).toBe('anxietySai'); // attributed via article title
    expect(coef!.source).toContain('article title');
  });

  it('coefficient rows that cannot be attributed become qualitative, never numbers', () => {
    const tables = parseJatsTables(FIXTURE_XML);
    const { evidence } = extractFromTables(tables, 'Some unrelated wellness study', {});
    const unattr = evidence.find((e) => e.qualitative && e.detail?.includes('unattributed'));
    expect(unattr).toBeDefined();
    // No poolable anxiety evidence from the coefficient table in this case.
    const poolable = evidence.filter((e) => e.biomarker === 'anxietySai' && !e.qualitative && e.se != null && e.source.includes('coefficient'));
    expect(poolable.length).toBe(0);
  });

  it('median (IQR) rows are skipped honestly, never read as mean (SD)', () => {
    const tables = parseJatsTables(FIXTURE_XML);
    const { evidence } = extractFromTables(tables, 'Effect of group music therapy on state-anxiety and wellbeing', {});
    const iqr = evidence.find((e) => e.detail?.includes('9 (7 - 10)') || e.detail?.includes('9 (8 - 10)'));
    expect(iqr).toBeUndefined();
  });

  it('CI column provides SE when the SE cell is missing', () => {
    const tbl: JatsTable[] = [{
      caption: 'Model for anxiety (STAI)',
      header: ['Model', 'Effect', 'CI95%'],
      rows: [['Crude', '-7.03', '-9.91;-4.41']],
    }];
    const { evidence } = extractFromTables(tbl, 'Anxiety outcomes of music therapy', {});
    const coef = evidence.find((e) => !e.qualitative && e.detail?.includes('Crude'));
    expect(coef).toBeDefined();
    // SE = (9.91-4.41)/3.919928 = 1.403
    expect(coef!.se).toBeCloseTo(1.403, 2);
  });

  it('fetchFullTextXml returns null on network failure (honest)', async () => {
    const failing: typeof fetch = (async () => { throw new Error('ECONNREFUSED'); }) as any;
    const xml = await fetchFullTextXml('PMC0000000', failing, 2000);
    expect(xml).toBeNull();
  });

  it('baseline/demographic tables are never pooled (pre-intervention differences are not treatment effects)', () => {
    const xml = `<article><table-wrap><caption>Baseline demographic and clinical characteristics.</caption><table>
      <tr><th>Variable</th><th>Control n=50</th><th>Music Therapy n=60</th><th>p</th></tr>
      <tr><td>State anxiety (STAI)</td><td>45.3 (9.1)</td><td>38.2 (8.4)</td><td>&lt;0.001</td></tr>
    </table></table-wrap></article>`;
    const tables = parseJatsTables(xml);
    const { evidence, notes } = extractFromTables(tables, 'Music therapy RCT', {});
    expect(evidence.filter((e) => !e.qualitative).length).toBe(0);
    expect(notes.some((n) => n.includes('baseline/demographic'))).toBe(true);
  });

  it('interaction/subgroup coefficient tables are demoted to qualitative', () => {
    const xml = `<article><table-wrap><caption>Interaction between diagnosis and time on DASS-21 scores.</caption><table>
      <tr><th>Subscale</th><th>Group</th><th>Bipolar vs Depression beta (coef.)</th><th>Standard Error, p value</th></tr>
      <tr><td>Anxiety</td><td>High-frequency</td><td>-1.85</td><td>0.71, p=0.011</td></tr>
    </table></table-wrap></article>`;
    const tables = parseJatsTables(xml);
    const { evidence, notes } = extractFromTables(tables, 'Anxiety outcomes of music therapy', {});
    // The -1.85 coefficient is an interaction term, NOT a music-vs-control effect.
    const poolable = evidence.filter((e) => !e.qualitative);
    expect(poolable.length).toBe(0);
    const qual = evidence.find((e) => e.qualitative && e.detail?.includes('interaction'));
    expect(qual).toBeDefined();
  });

  it('music-vs-music coefficient tables are demoted (no control arm)', () => {
    const xml = `<article><table-wrap><caption>Linear model for Anxiety by intervention group.</caption><table>
      <tr><th>Term</th><th>Effect</th><th>SE</th></tr>
      <tr><td>High-frequency</td><td>0.71</td><td>1.09</td></tr>
      <tr><td>Low-frequency</td><td>0.42</td><td>0.93</td></tr>
    </table></table-wrap></article>`;
    const tables = parseJatsTables(xml);
    const { evidence } = extractFromTables(tables, 'Anxiety outcomes of music therapy', {});
    expect(evidence.filter((e) => !e.qualitative).length).toBe(0);
    expect(evidence.some((e) => e.qualitative && e.detail?.includes('music-vs-music'))).toBe(true);
  });

  it('unicode minus does not mispair effect/SE columns', () => {
    const xml = `<article><table-wrap><caption>Anxiety model (STAI), music therapy vs usual care.</caption><table>
      <tr><th>Term</th><th>Effect</th><th>SE</th></tr>
      <tr><td>Music therapy</td><td>\u22127.03</td><td>1.453</td></tr>
    </table></table-wrap></article>`;
    const tables = parseJatsTables(xml);
    const { evidence } = extractFromTables(tables, 'Anxiety outcomes of music therapy', {});
    const rec = evidence.find((e) => !e.qualitative);
    expect(rec).toBeDefined();
    expect(rec!.effect).toBeCloseTo(-7.03, 2); // unicode minus parsed as negative
    expect(rec!.se).toBeCloseTo(1.453, 2);     // SE not shifted into the effect slot
  });
});