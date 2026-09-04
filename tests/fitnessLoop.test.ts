import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessScorecard, type BusinessScorecardT } from '../src/autopilot/loopTypes';
import {
  computeFitnessDelta,
  shouldQuarantine,
  updateGeneFitness,
  loadLedger,
  saveLedger,
  LEDGER_FILENAME,
} from '../src/autopilot/fitnessLoop';

type ScorecardOverrides = Partial<BusinessScorecardT>;

function makeScorecard(overrides: ScorecardOverrides = {}): BusinessScorecardT {
  const base: ScorecardOverrides = {
    businessSlug: 'test-biz',
    auditedAt: '2026-01-01T00:00:00.000Z',
    auditorsUsed: ['codegang'],
    auditorsExcluded: [],
    codeQuality: 60,
    securityPosture: 60,
    testCoverage: 50,
    documentationCompleteness: 50,
    marketSignals: 40,
    complianceMaturity: 40,
    valuationEstimate: 100_000,
    profileGapCoverage: 50,
    webPresence: 30,
    overallScore: 400,
    gradeCategory: 'C',
    findingsCount: 10,
    criticalFindings: 1,
    highFindings: 3,
  };
  return BusinessScorecard.parse({ ...base, ...overrides });
}

function makeTmpLedgerRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'recourse-fitness-'));
}

const tmpRoots: string[] = [];

function ledgerFile(root: string): string {
  return path.join(root, LEDGER_FILENAME);
}

beforeEach(() => {
  tmpRoots.length = 0;
});

afterEach(() => {
  for (const root of tmpRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('fitnessLoop', () => {
  it('classifies an improved merge (400 -> 500): improved, +100, not quarantined', () => {
    const pre = makeScorecard({ overallScore: 400 });
    const post = makeScorecard({ overallScore: 500 });
    const delta = computeFitnessDelta(pre, post, 'prop-improve');

    expect(delta.verdict).toBe('improved');
    expect(delta.overallDelta).toBe(100);
    expect(delta.proposalId).toBe('prop-improve');
    expect(shouldQuarantine(delta)).toBe(false);
  });

  it('classifies a regression (500 -> 450): regressed, -50', () => {
    const pre = makeScorecard({ overallScore: 500 });
    const post = makeScorecard({ overallScore: 450 });
    const delta = computeFitnessDelta(pre, post, 'prop-regress');

    expect(delta.verdict).toBe('regressed');
    expect(delta.overallDelta).toBe(-50);
  });

  it('treats equal scores as neutral', () => {
    const pre = makeScorecard({ overallScore: 420 });
    const post = makeScorecard({ overallScore: 420 });
    const delta = computeFitnessDelta(pre, post, 'prop-flat');

    expect(delta.verdict).toBe('neutral');
    expect(delta.overallDelta).toBe(0);
  });

  it('computes dimensionDeltas per dimension (only securityPosture differs)', () => {
    const pre = makeScorecard({ securityPosture: 50, overallScore: 500 });
    const post = makeScorecard({ securityPosture: 75, overallScore: 500 });
    const delta = computeFitnessDelta(pre, post, 'prop-dims');

    expect(delta.dimensionDeltas.security).toBe(25);
    expect(delta.dimensionDeltas.codeQuality).toBe(0);
    expect(delta.dimensionDeltas.docs).toBe(0);
  });

  it('auto-quarantines a regression >= 10 points and records it in the ledger', async () => {
    const root = makeTmpLedgerRoot();
    tmpRoots.push(root);
    const pre = makeScorecard({ overallScore: 500 });
    const post = makeScorecard({ overallScore: 488 });

    const { delta, quarantined } = await updateGeneFitness({
      proposalId: 'prop-big-regress',
      pre,
      post,
      ledgerRoot: root,
    });

    expect(delta.verdict).toBe('regressed');
    expect(delta.overallDelta).toBe(-12);
    expect(quarantined).toBe(true);
    expect(existsSync(ledgerFile(root))).toBe(true);

    const ledger = loadLedger(root);
    expect(ledger.quarantined).toContain('prop-big-regress');
  });

  it('does NOT quarantine a small regression (-3)', async () => {
    const root = makeTmpLedgerRoot();
    tmpRoots.push(root);
    const pre = makeScorecard({ overallScore: 500 });
    const post = makeScorecard({ overallScore: 497 });

    const { delta, quarantined } = await updateGeneFitness({
      proposalId: 'prop-small-regress',
      pre,
      post,
      ledgerRoot: root,
    });

    expect(delta.overallDelta).toBe(-3);
    expect(quarantined).toBe(false);
    const ledger = loadLedger(root);
    expect(ledger.quarantined ?? []).not.toContain('prop-small-regress');
  });

  it('round-trips the ledger: two updates -> two entries, file stays valid JSON', async () => {
    const root = makeTmpLedgerRoot();
    tmpRoots.push(root);

    await updateGeneFitness({
      proposalId: 'prop-a',
      pre: makeScorecard({ overallScore: 400 }),
      post: makeScorecard({ overallScore: 450 }),
      ledgerRoot: root,
    });
    await updateGeneFitness({
      proposalId: 'prop-b',
      pre: makeScorecard({ overallScore: 450 }),
      post: makeScorecard({ overallScore: 460 }),
      ledgerRoot: root,
    });

    const raw = readFileSync(ledgerFile(root), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.geneFitnessUpdates).toHaveLength(2);
    expect(parsed.geneFitnessUpdates.map((d: { proposalId: string }) => d.proposalId)).toEqual([
      'prop-a',
      'prop-b',
    ]);

    const ledger = loadLedger(root);
    expect(ledger.geneFitnessUpdates).toHaveLength(2);
  });

  it('loads {} for a missing or corrupt ledger file, and saveLedger creates parent dirs', async () => {
    const root = makeTmpLedgerRoot();
    tmpRoots.push(root);

    expect(loadLedger(root)).toEqual({});

    const deepRoot = path.join(root, 'does', 'not', 'exist', 'yet');
    saveLedger(deepRoot, { geneFitnessUpdates: [], quarantined: [] });
    expect(existsSync(ledgerFile(deepRoot))).toBe(true);

    writeFileSync(ledgerFile(deepRoot), 'this is not valid json {{{', 'utf-8');
    expect(loadLedger(deepRoot)).toEqual({});
  });

  it('returns a delta and quarantined flag consistent with computeFitnessDelta + shouldQuarantine', async () => {
    const root = makeTmpLedgerRoot();
    tmpRoots.push(root);
    const pre = makeScorecard({ overallScore: 500 });
    const post = makeScorecard({ overallScore: 450 });

    const expectedDelta = computeFitnessDelta(pre, post, 'prop-consistency');
    const expectedQuarantined = shouldQuarantine(expectedDelta);

    const { delta, quarantined } = await updateGeneFitness({
      proposalId: 'prop-consistency',
      pre,
      post,
      ledgerRoot: root,
    });

    expect(expectedDelta.verdict).toBe('regressed');
    expect(expectedQuarantined).toBe(true);
    expect(delta.proposalId).toBe(expectedDelta.proposalId);
    expect(delta.overallDelta).toBe(expectedDelta.overallDelta);
    expect(delta.dimensionDeltas).toEqual(expectedDelta.dimensionDeltas);
    expect(delta.verdict).toBe(expectedDelta.verdict);
    expect(quarantined).toBe(expectedQuarantined);
  });

  it('honors a regressionThresholdPoints override (threshold 50 with delta -20 -> not quarantined)', async () => {
    const pre = makeScorecard({ overallScore: 500 });
    const post = makeScorecard({ overallScore: 480 });
    const delta = computeFitnessDelta(pre, post, 'prop-override');

    expect(delta.overallDelta).toBe(-20);
    expect(shouldQuarantine(delta, 10)).toBe(true);
    expect(shouldQuarantine(delta, 50)).toBe(false);
  });
});
