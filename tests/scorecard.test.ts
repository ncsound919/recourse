import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  projectScorecard,
  slugify,
  saveScorecard,
  loadLatestScorecard,
} from '../src/autopilot/scorecard';
import {
  AuditStatement,
  BusinessScorecard,
  type AuditStatementT,
  type AuditorSectionT,
} from '../src/autopilot/loopTypes';
import type { BusinessProfileT } from '../src/autopilot/businessProfile';

const GENERATED_AT = '2026-09-04T12:00:00.000Z';

const GRADER_PAYLOAD = {
  security: { score: 85 },
  quality: { score: 70, testScore: 60, readmeCompleteness: 80 },
  market: { score: 50 },
  compliance: { score: 40 },
  valuation: { estimatedValue: 120000 },
};

const REPORANK_PAYLOAD = { result: { overallScore: 88, gradeCategory: 'A' } };

const DEEP_PAYLOAD = { counts: { total: 12, bySeverity: { critical: 2, high: 3 } } };

const DEFAULT_AUDITORS: Record<string, AuditorSectionT> = {
  grader: {
    included: true,
    reason: 'primary code auditor',
    scoreBasis: 'static analysis',
    payload: GRADER_PAYLOAD,
  },
  reporank: {
    included: true,
    reason: 'repo reputation ranker',
    scoreBasis: 'github metadata',
    payload: REPORANK_PAYLOAD,
  },
  deep: {
    included: true,
    reason: 'deep static scan',
    scoreBasis: 'semgrep-style scan',
    payload: DEEP_PAYLOAD,
  },
  codegang: { included: false, reason: 'codegang sandbox unavailable' },
  olympics: { included: false, reason: 'not implemented in this audit run' },
};

interface StatementOverrides {
  generatedAt?: string;
  auditors?: Partial<Record<string, Partial<AuditorSectionT>>>;
  disclosuresExcluded?: { auditor: string; reason: string }[];
}

function makeAuditStatement(overrides: StatementOverrides = {}): AuditStatementT {
  const auditors: Record<string, AuditorSectionT> = { ...DEFAULT_AUDITORS };
  for (const [key, value] of Object.entries(overrides.auditors ?? {})) {
    auditors[key] = { ...auditors[key], ...value } as AuditorSectionT;
  }
  return AuditStatement.parse({
    schema: 'audit-statement-v1',
    repo: 'test/repo',
    targetUrl: 'https://example.com/repo',
    generatedAt: overrides.generatedAt ?? GENERATED_AT,
    generator: { package: 'recourse-audit-runner', version: '1.0.0' },
    auditors,
    disclosures: {
      aiGenerated: [],
      deterministic: ['scorecard projection is deterministic'],
      measured: ['grader payload scores'],
      excluded: overrides.disclosuresExcluded ?? [],
    },
  });
}

interface ProfileOverrides {
  business?: Partial<BusinessProfileT['business']>;
  offering?: Partial<BusinessProfileT['offering']>;
  gaps?: string[];
}

function makeMinimalProfile(overrides: ProfileOverrides = {}): BusinessProfileT {
  const base = {
    business: {
      name: 'TestBiz',
      tagline: 'Tagline',
      industry: 'Test',
      website: '',
      stage: 'idea',
    },
    customer: {
      icp: 'Test ICP',
      segments: [{ name: 'Seg', pain: 'Pain' }],
      buyingTrigger: 'Trigger',
      topObjections: ['Obj'],
    },
    offering: {
      summary: 'Summary',
      pricing: '$0',
      model: 'free',
      differentiators: ['Diff'],
    },
    gaps: [] as string[],
  };
  const profile = {
    ...base,
    business: { ...base.business, ...overrides.business },
    offering: { ...base.offering, ...overrides.offering },
    gaps: overrides.gaps ?? base.gaps,
  };
  return profile as unknown as BusinessProfileT;
}

describe('projectScorecard', () => {
  it('projects a full happy-path statement into a valid BusinessScorecard', () => {
    const statement = makeAuditStatement();
    const profile = makeMinimalProfile();
    const sc = projectScorecard(statement, profile);

    const reparsed = BusinessScorecard.parse(sc);
    expect(reparsed).toEqual(sc);
    expect(sc.businessSlug).toBe('testbiz');
    expect(sc.auditedAt).toBe(GENERATED_AT);
    expect(sc.auditorsUsed.length).toBeGreaterThan(0);
    expect(sc.auditorsUsed).toContain('grader');
  });

  it('extracts grader security score into securityPosture', () => {
    const statement = makeAuditStatement();
    const sc = projectScorecard(statement, makeMinimalProfile());

    expect(sc.securityPosture).toBe(85);
    expect(sc.testCoverage).toBe(60);
    expect(sc.documentationCompleteness).toBe(80);
    expect(sc.marketSignals).toBe(50);
    expect(sc.complianceMaturity).toBe(40);
    expect(sc.valuationEstimate).toBe(120000);
    expect(sc.findingsCount).toBe(12);
    expect(sc.criticalFindings).toBe(2);
    expect(sc.highFindings).toBe(3);
    expect(sc.gradeCategory).toBe('A');
  });

  it('degrades to 0 when the grader is excluded, even if a payload exists', () => {
    const statement = makeAuditStatement({
      auditors: { grader: { included: false, reason: 'skipped in this run' } },
    });
    const sc = projectScorecard(statement, makeMinimalProfile());

    expect(sc.securityPosture).toBe(0);
    expect(sc.testCoverage).toBe(0);
    expect(sc.auditorsUsed).not.toContain('grader');
    expect(sc.auditorsExcluded.some((e) => e.name === 'grader')).toBe(true);
  });

  it('gives webPresence credit when the profile has a website and no landing/testimonial gaps', () => {
    const profile = makeMinimalProfile({
      business: { website: 'https://example.com' },
      offering: { differentiators: ['a', 'b', 'c'] },
    });
    const sc = projectScorecard(makeAuditStatement(), profile);

    expect(sc.webPresence).toBe(100);
    expect(sc.webPresence).toBeGreaterThan(0);
  });

  it('reports 100 profileGapCoverage when the profile declares no gaps', () => {
    const sc = projectScorecard(makeAuditStatement(), makeMinimalProfile());
    expect(sc.profileGapCoverage).toBe(100);
  });

  it('reports profileGapCoverage below 100 when gaps exist and deep findings are few', () => {
    const profile = makeMinimalProfile({ gaps: ['no sla', 'no refund policy', 'no onboarding'] });
    const statement = makeAuditStatement({
      auditors: {
        deep: {
          included: true,
          payload: { counts: { total: 2, bySeverity: { critical: 0, high: 0 } } },
        },
      },
    });
    const sc = projectScorecard(statement, profile);

    expect(sc.profileGapCoverage).toBe(22);
    expect(sc.profileGapCoverage).toBeLessThan(100);
  });

  it('keeps overallScore within [0, 1000]', () => {
    const sc = projectScorecard(makeAuditStatement(), makeMinimalProfile());
    expect(sc.overallScore).toBeGreaterThanOrEqual(0);
    expect(sc.overallScore).toBeLessThanOrEqual(1000);
    expect(Number.isInteger(sc.overallScore)).toBe(true);
  });

  it('populates auditorsExcluded with reasons when auditors are excluded', () => {
    const statement = makeAuditStatement({
      auditors: { codegang: { included: false, reason: 'codegang sandbox is down' } },
    });
    const sc = projectScorecard(statement, makeMinimalProfile());

    const codegang = sc.auditorsExcluded.find((e) => e.name === 'codegang');
    expect(codegang).toBeDefined();
    expect(codegang?.reason).toBe('codegang sandbox is down');
    expect(sc.auditorsUsed).not.toContain('codegang');
  });

  it('degrades a malformed grader payload to 0 instead of throwing', () => {
    const statement = makeAuditStatement({
      auditors: { grader: { included: true, payload: 'payload-was-a-string' } },
    });
    let sc: ReturnType<typeof projectScorecard> | undefined;
    expect(() => {
      sc = projectScorecard(statement, makeMinimalProfile());
    }).not.toThrow();

    expect(sc?.securityPosture).toBe(0);
    expect(sc?.testCoverage).toBe(0);
    expect(sc?.documentationCompleteness).toBe(0);
  });

  it('falls back testCoverage to quality.score when testScore is absent', () => {
    const statement = makeAuditStatement({
      auditors: { grader: { payload: { quality: { score: 55 } } } },
    });
    const sc = projectScorecard(statement, makeMinimalProfile());
    expect(sc.testCoverage).toBe(55);
  });

  it('reports gradeCategory N/A when reporank is excluded', () => {
    const statement = makeAuditStatement({
      auditors: { reporank: { included: false, reason: 'rate limited' } },
    });
    const sc = projectScorecard(statement, makeMinimalProfile());
    expect(sc.gradeCategory).toBe('N/A');
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with dashes', () => {
    expect(slugify('TestBiz')).toBe('testbiz');
    expect(slugify(' Acme SaaS, LLC! ')).toBe('acme-saas-llc');
    expect(slugify('')).toBe('business');
  });
});

describe('saveScorecard / loadLatestScorecard', () => {
  it('round-trips a scorecard through a temp audit dir', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'recourse-scorecard-'));
    try {
      const scorecard = projectScorecard(makeAuditStatement(), makeMinimalProfile());
      const filePath = saveScorecard(scorecard, dir);

      expect(path.dirname(filePath)).toBe(path.join(dir, 'testbiz'));
      expect(path.basename(filePath)).toMatch(/^scorecard-\d{4}-.*\.json$/);
      expect(existsSync(filePath)).toBe(true);

      const loaded = loadLatestScorecard('testbiz', dir);
      expect(loaded).not.toBeNull();
      expect(loaded).toEqual(scorecard);

      expect(loadLatestScorecard('missing', dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads the newest scorecard-*.json by filename sort desc', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'recourse-scorecard-'));
    try {
      const newer = projectScorecard(makeAuditStatement(), makeMinimalProfile());
      saveScorecard(newer, dir);

      const older = projectScorecard(
        makeAuditStatement({ generatedAt: '2020-01-01T00:00:00.000Z' }),
        makeMinimalProfile(),
      );
      writeFileSync(
        path.join(dir, 'testbiz', 'scorecard-2020-01-01T00-00-00-000Z.json'),
        JSON.stringify(older),
        'utf8',
      );

      const loaded = loadLatestScorecard('testbiz', dir);
      expect(loaded?.auditedAt).toBe(newer.auditedAt);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
