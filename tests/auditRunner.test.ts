import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AuditStatement,
  type AuditorResults,
  type AuditorSectionT,
  type AuditStatementT,
} from '../src/autopilot/loopTypes';
import { RepoBinding, type BusinessProfileT, type RepoBindingT } from '../src/autopilot/businessProfile';
import {
  AUDITOR_SERVICE_ENV,
  buildDisclosures,
  handleResult,
  loadLatestAudit,
  persistAudit,
  runAudit,
  slugify,
  type AuditAdapter,
} from '../src/autopilot/auditRunner';

function makeProfile(): BusinessProfileT {
  return {
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
    gaps: [],
  };
}

function makeProfileWithRepo(repoOverrides: Partial<RepoBindingT> = {}): BusinessProfileT {
  const profile = makeProfile();
  profile.repo = RepoBinding.parse({ localPath: '/tmp/test-repo', ...repoOverrides });
  return profile;
}

const graderOk: AuditAdapter = async () => ({
  included: true,
  scoreBasis: 'ai-generated (Gemini)',
  payload: { overallScore: 72 },
});

const deepBoom: AuditAdapter = async () => {
  throw new Error('boom');
};

const tmpRoots: string[] = [];

beforeEach(() => {
  delete process.env.RECOURSE_AUTOPILOT_DISABLED;
});

afterEach(() => {
  delete process.env.RECOURSE_AUTOPILOT_DISABLED;
  for (const root of tmpRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

describe('auditRunner runAudit gating', () => {
  it('throws when RECOURSE_AUTOPILOT_DISABLED=1', async () => {
    process.env.RECOURSE_AUTOPILOT_DISABLED = '1';
    try {
      await expect(runAudit({ profile: makeProfileWithRepo() })).rejects.toThrow(
        'RECOURSE_AUTOPILOT_DISABLED is set',
      );
    } finally {
      delete process.env.RECOURSE_AUTOPILOT_DISABLED;
    }
  });

  it('throws when the profile has no repo binding', async () => {
    await expect(runAudit({ profile: makeProfile() })).rejects.toThrow(/no repo\.localPath/);
  });

  it('throws when ALL auditors are excluded or failed', async () => {
    await expect(
      runAudit({ profile: makeProfileWithRepo(), adapters: {} }),
    ).rejects.toThrow(/All auditors failed/i);
  });
});

describe('auditRunner runAudit adapter resolution', () => {
  it('returns a valid AuditStatementT and persists it under <auditDir>/<slug>/audits/', async () => {
    const auditDir = mkdtempSync(path.join(tmpdir(), 'recourse-audit-'));
    tmpRoots.push(auditDir);

    const statement = await runAudit({
      profile: makeProfileWithRepo(),
      adapters: { grader: graderOk },
      auditDir,
    });

    expect(AuditStatement.safeParse(statement).success).toBe(true);
    expect(statement.schema).toBe('audit-statement-v1');
    expect(statement.repo).toBe('TestBiz');
    expect(statement.targetUrl).toBe('/tmp/test-repo');
    expect(statement.generator).toEqual({ package: 'recourse-autopilot', version: '1.0.0' });
    expect(new Date(statement.generatedAt).toISOString()).toBe(statement.generatedAt);

    const auditsDir = path.join(auditDir, 'testbiz', 'audits');
    expect(existsSync(auditsDir)).toBe(true);
    const files = readdirSync(auditsDir).filter(
      (f) => f.startsWith('audit-') && f.endsWith('.json'),
    );
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^audit-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/);

    const onDisk = JSON.parse(readFileSync(path.join(auditsDir, files[0]), 'utf8'));
    expect(onDisk.schema).toBe('audit-statement-v1');
    expect(AuditStatement.safeParse(onDisk).success).toBe(true);

    const latest = loadLatestAudit('testbiz', auditDir);
    expect(latest).not.toBeNull();
    expect(latest?.schema).toBe('audit-statement-v1');
    expect(latest?.generator.package).toBe('recourse-autopilot');
  });

  it('excludes adapters that are not provided, with a not-provided reason', async () => {
    const statement = await runAudit({
      profile: makeProfileWithRepo(),
      adapters: { grader: graderOk },
    });

    expect(statement.auditors.grader.included).toBe(true);
    for (const name of ['reporank', 'deep', 'codegang', 'olympics']) {
      expect(statement.auditors[name].included).toBe(false);
      expect(statement.auditors[name].reason).toMatch(/not provided/);
    }
    expect(statement.disclosures.excluded.map((e) => e.auditor).sort()).toEqual(
      ['codegang', 'deep', 'olympics', 'reporank'].sort(),
    );
  });

  it('includes a grader result when the mock adapter resolves an ai-generated grade', async () => {
    const statement = await runAudit({
      profile: makeProfileWithRepo(),
      adapters: { grader: graderOk },
    });

    const grader = statement.auditors.grader;
    expect(grader.included).toBe(true);
    expect(grader.scoreBasis).toBe('ai-generated (Gemini)');
    expect(grader.payload).toEqual({ overallScore: 72 });
  });

  it('converts a rejecting adapter into an excluded section instead of failing the audit', async () => {
    const statement = await runAudit({
      profile: makeProfileWithRepo(),
      adapters: { grader: graderOk, deep: deepBoom },
    });

    expect(statement.auditors.grader.included).toBe(true);
    expect(statement.auditors.deep.included).toBe(false);
    expect(statement.auditors.deep.reason).toMatch(/adapter threw: boom/);
  });
});

describe('auditRunner disclosures and helpers', () => {
  it('buildDisclosures partitions by meta.basis and collects excluded sections', () => {
    const auditors: AuditorResults = {
      grader: { included: true, meta: { basis: 'ai' } },
      reporank: { included: true, meta: { basis: 'deterministic' } },
      deep: { included: true, meta: { basis: 'measured' } },
      codegang: { included: false, reason: 'CODEGANG_API_KEY not configured' },
      olympics: { included: false, reason: 'olympics adapter not provided' },
    };

    const disclosures = buildDisclosures(auditors);
    expect(disclosures.aiGenerated).toEqual(['grader']);
    expect(disclosures.deterministic).toEqual(['reporank']);
    expect(disclosures.measured).toEqual(['deep']);
    expect(disclosures.excluded).toEqual([
      { auditor: 'codegang', reason: 'CODEGANG_API_KEY not configured' },
      { auditor: 'olympics', reason: 'olympics adapter not provided' },
    ]);
  });

  it('slugify lowercases and converts spaces to dashes', () => {
    expect(slugify('TestBiz')).toBe('testbiz');
    expect(slugify('  My Cool Biz  ')).toBe('my-cool-biz');
  });

  it('persistAudit and loadLatestAudit round-trip a statement', () => {
    const auditDir = mkdtempSync(path.join(tmpdir(), 'recourse-audit-roundtrip-'));
    tmpRoots.push(auditDir);
    const profile = makeProfileWithRepo();
    const raw: AuditStatementT = {
      schema: 'audit-statement-v1',
      repo: profile.business.name,
      targetUrl: '/tmp/test-repo',
      generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      generator: { package: 'recourse-autopilot', version: '1.0.0' },
      auditors: { grader: { included: true, scoreBasis: 'x', payload: { overallScore: 5 } } },
      disclosures: { aiGenerated: ['grader'], deterministic: [], measured: [], excluded: [] },
    };

    const filePath = persistAudit(raw, slugify('TestBiz'), auditDir);
    expect(existsSync(filePath)).toBe(true);
    const latest = loadLatestAudit('testbiz', auditDir);
    expect(latest).not.toBeNull();
    expect(latest?.generatedAt).toBe(raw.generatedAt);
    expect(latest?.auditors.grader.payload).toEqual({ overallScore: 5 });
  });

  it('loadLatestAudit returns null when no audits exist', () => {
    const auditDir = mkdtempSync(path.join(tmpdir(), 'recourse-audit-empty-'));
    tmpRoots.push(auditDir);
    expect(loadLatestAudit('test-biz', auditDir)).toBeNull();
  });

  it('handleResult maps rejections and invalid values to excluded sections', () => {
    const rejected: PromiseSettledResult<AuditorSectionT> = {
      status: 'rejected',
      reason: new Error('kaput'),
    };
    expect(handleResult(rejected, 'fallback')).toEqual({
      included: false,
      reason: 'adapter threw: kaput',
    });

    const fulfilled: PromiseSettledResult<AuditorSectionT> = {
      status: 'fulfilled',
      value: { included: true, scoreBasis: 'measured' },
    };
    expect(handleResult(fulfilled, 'fallback')).toEqual({
      included: true,
      scoreBasis: 'measured',
    });

    const bad: PromiseSettledResult<AuditorSectionT> = {
      status: 'fulfilled',
      value: { payload: 'not a section' } as unknown as AuditorSectionT,
    };
    expect(handleResult(bad, 'fallback reason')).toEqual({
      included: false,
      reason: 'fallback reason',
    });
  });

  it('AUDITOR_SERVICE_ENV reflects env config and gating keys', () => {
    const keys = [
      'GRADER_API_KEY',
      'GRADER_URL',
      'REPORANK_API_KEY',
      'REPORANK_URL',
      'CODEGANG_API_KEY',
      'CODEGANG_URL',
      'DEEP_TOKEN',
      'DEEP_URL',
      'OLYMPICS_TARGET_URL',
    ];
    const saved: Record<string, string | undefined> = {};
    for (const key of keys) saved[key] = process.env[key];
    try {
      for (const key of keys) delete process.env[key];

      expect(AUDITOR_SERVICE_ENV.grader()).toBeNull();
      expect(AUDITOR_SERVICE_ENV.reporank()).toBeNull();
      expect(AUDITOR_SERVICE_ENV.codegang()).toBeNull();
      expect(AUDITOR_SERVICE_ENV.olympics()).toBeNull();
      expect(AUDITOR_SERVICE_ENV.deep()).toEqual({
        url: 'http://localhost:3100',
        apiKey: '',
        repoUrl: '',
        localPath: '',
        secret: '',
        targetUrl: '',
      });

      process.env.GRADER_API_KEY = 'k1';
      expect(AUDITOR_SERVICE_ENV.grader()).toMatchObject({
        url: 'http://localhost:3201',
        apiKey: 'k1',
      });

      process.env.CODEGANG_API_KEY = 'secret-key';
      expect(AUDITOR_SERVICE_ENV.codegang()).toMatchObject({
        url: 'http://localhost:3204',
        secret: 'secret-key',
      });

      process.env.OLYMPICS_TARGET_URL = 'https://github.com/example/repo';
      expect(AUDITOR_SERVICE_ENV.olympics()).toMatchObject({
        targetUrl: 'https://github.com/example/repo',
      });
    } finally {
      for (const key of keys) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
