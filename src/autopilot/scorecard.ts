/**
 * scorecard.ts — pure deterministic projection of an AuditStatement onto a
 * BusinessScorecard.
 *
 * No network, no LLM. Every number is derived either from included auditor
 * payloads (defensive: malformed payloads degrade to 0, never throw) or from
 * the static projection rules below. Excluded auditors never contribute scores.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  BusinessScorecard,
  type AuditStatementT,
  type BusinessScorecardT,
} from './loopTypes';
import type { BusinessProfileT } from './businessProfile';

const DIM_HI = 100;
const OVERALL_HI = 1000;
const MAX_VALUATION = 1_000_000_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function asRecord(x: unknown): Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return fallback;
}

function payloadFor(statement: AuditStatementT, id: string): Record<string, unknown> {
  const section = statement.auditors[id];
  if (!section || section.included !== true) return {};
  return asRecord(section.payload);
}

function computeWebPresence(profile: BusinessProfileT): number {
  let score = 0;
  const website = profile.business.website;
  if (typeof website === 'string' && website.trim() !== '') score += 25;
  const gapText = (Array.isArray(profile.gaps) ? profile.gaps : []).join('\n');
  if (!/landing/i.test(gapText)) score += 25;
  if (!/testimonial|case stud/i.test(gapText)) score += 25;
  const differentiators = profile.offering?.differentiators;
  if (Array.isArray(differentiators) && differentiators.length >= 3) score += 25;
  return clamp(score, 0, DIM_HI);
}

function computeGapCoverage(profile: BusinessProfileT, findingsCount: number): number {
  const gaps = Array.isArray(profile.gaps) ? profile.gaps : [];
  if (gaps.length === 0) return DIM_HI;
  const ratio = Math.min(1, findingsCount / (gaps.length * 3));
  return Math.round(ratio * DIM_HI);
}

export function slugify(name: string): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'business';
}

export function projectScorecard(
  statement: AuditStatementT,
  profile: BusinessProfileT,
): BusinessScorecardT {
  const grader = payloadFor(statement, 'grader');
  const graderSecurity = asRecord(grader.security);
  const graderQuality = asRecord(grader.quality);
  const graderMarket = asRecord(grader.market);
  const graderCompliance = asRecord(grader.compliance);
  const graderValuation = asRecord(grader.valuation);

  const securityPosture = clamp(num(graderSecurity.score), 0, DIM_HI);
  const testCoverage = clamp(num(graderQuality.testScore ?? graderQuality.score), 0, DIM_HI);
  const documentationCompleteness = clamp(num(graderQuality.readmeCompleteness), 0, DIM_HI);
  const marketSignals = clamp(num(graderMarket.score), 0, DIM_HI);
  const complianceMaturity = clamp(num(graderCompliance.score), 0, DIM_HI);
  const valuationEstimate = clamp(num(graderValuation.estimatedValue), 0, MAX_VALUATION);

  const reporank = payloadFor(statement, 'reporank');
  const rrResult = asRecord(reporank.result);
  const reporankOverall = num(rrResult.overallScore);
  const rawGradeCategory = rrResult.gradeCategory;
  const gradeCategory =
    typeof rawGradeCategory === 'string' && rawGradeCategory.trim() !== ''
      ? rawGradeCategory
      : 'N/A';

  const codeQuality = clamp(
    Math.round(num(graderQuality.score) * 0.6 + reporankOverall * 0.4),
    0,
    DIM_HI,
  );

  const deep = payloadFor(statement, 'deep');
  const counts = asRecord(deep.counts);
  const bySeverity = asRecord(counts.bySeverity);
  const findingsCount = Math.floor(num(counts.total));
  const criticalFindings = Math.floor(num(bySeverity.critical));
  const highFindings = Math.floor(num(bySeverity.high));

  const webPresence = computeWebPresence(profile);
  const profileGapCoverage = computeGapCoverage(profile, findingsCount);
  const businessSlug = slugify(profile.business.name);

  const knownNames = new Set<string>(Object.keys(statement.auditors));
  const disclosureReasons = new Map<string, string>();
  for (const d of statement.disclosures.excluded) {
    knownNames.add(d.auditor);
    disclosureReasons.set(d.auditor, d.reason);
  }

  const auditorsUsed: string[] = [];
  const auditorsExcluded: { name: string; reason: string }[] = [];
  for (const name of [...knownNames].sort()) {
    const section = statement.auditors[name];
    if (section && section.included === true) {
      auditorsUsed.push(name);
    } else {
      auditorsExcluded.push({
        name,
        reason:
          (section?.reason ?? '').trim() || disclosureReasons.get(name) || 'excluded from audit run',
      });
    }
  }

  const weighted =
    codeQuality * 0.2 +
    securityPosture * 0.2 +
    testCoverage * 0.1 +
    documentationCompleteness * 0.1 +
    marketSignals * 0.15 +
    complianceMaturity * 0.15 +
    webPresence * 0.05 +
    profileGapCoverage * 0.05;
  const overallScore = clamp(Math.round(weighted) * 10, 0, OVERALL_HI);

  return BusinessScorecard.parse({
    businessSlug,
    auditedAt: statement.generatedAt,
    auditorsUsed,
    auditorsExcluded,
    codeQuality,
    securityPosture,
    testCoverage,
    documentationCompleteness,
    marketSignals,
    complianceMaturity,
    valuationEstimate,
    profileGapCoverage,
    webPresence,
    overallScore,
    gradeCategory,
    findingsCount,
    criticalFindings,
    highFindings,
  });
}

export function saveScorecard(scorecard: BusinessScorecardT, auditDir: string): string {
  const slug = scorecard.businessSlug || 'business';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(auditDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `scorecard-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(scorecard, null, 2), 'utf8');
  return filePath;
}

export function loadLatestScorecard(slug: string, auditDir: string): BusinessScorecardT | null {
  const dir = path.join(auditDir, slug);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const candidates = entries.filter((f) => /^scorecard-.+\.json$/.test(f)).sort().reverse();
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      return BusinessScorecard.parse(JSON.parse(raw) as unknown);
    } catch {
      // corrupted or non-scorecard file — skip to the next newest
    }
  }
  return null;
}
