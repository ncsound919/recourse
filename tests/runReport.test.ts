import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  RunReport,
  SIGNIFICANCE,
  assessSignificance,
  countLocAdded,
  listRunIds,
  readRunReport,
  renderRunReportSummary,
  significantRunRate,
  writeRunReport,
  type RunReportT,
} from '../src/autopilot/runReport';
import { runLoop } from '../src/autopilot/loopStateMachine';
import { DEFAULT_EXECUTORS } from '../src/autopilot/preMergeGate';
import { RepoBinding, type BusinessProfileT } from '../src/autopilot/businessProfile';
import type { AuditAdapter } from '../src/autopilot/auditRunner';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

function makeReport(over: Partial<RunReportT> = {}): RunReportT {
  return RunReport.parse({
    runId: 'run-test',
    generatedAt: new Date().toISOString(),
    profileSlug: 'testbiz',
    gapsConsidered: 3,
    compositeGaps: 1,
    proposals: 1,
    skipped: {},
    filesChanged: 2,
    locAdded: 40,
    gatesPassed: 1,
    gatesFailed: 0,
    laneA: true,
    laneB: false,
    fitnessDelta: 5,
    forecastBrier: 0.1,
    forecastEce: 0.05,
    selfEce: 0.2,
    outcome: 'pr_open',
    significant: true,
    significanceNote: 'significant: 2 file(s) changed, 1 gate(s) passed, fitnessDelta 5',
    ...over,
  });
}

describe('assessSignificance', () => {
  it('requires every condition, and names each miss', () => {
    const ok = assessSignificance({ filesChanged: 2, gatesPassed: 1, fitnessDelta: 1 });
    expect(ok.significant).toBe(true);
    expect(ok.note).toContain('significant');

    const oneFile = assessSignificance({ filesChanged: 1, gatesPassed: 1, fitnessDelta: 1 });
    expect(oneFile.significant).toBe(false);
    expect(oneFile.note).toContain('filesChanged 1 < 2');

    const noGate = assessSignificance({ filesChanged: 3, gatesPassed: 0, fitnessDelta: 1 });
    expect(noGate.significant).toBe(false);
    expect(noGate.note).toContain('gatesPassed 0 < 1');

    const flat = assessSignificance({ filesChanged: 3, gatesPassed: 1, fitnessDelta: 0 });
    expect(flat.significant).toBe(false);
    expect(flat.note).toContain('fitnessDelta 0');

    const unmerged = assessSignificance({ filesChanged: 3, gatesPassed: 1, fitnessDelta: null });
    expect(unmerged.significant).toBe(false);
    expect(unmerged.note).toContain('nothing merged');

    // A dry run proposes real files but never merges, so it is never significant.
    expect(unmerged.significant).toBe(false);
  });

  it('matches the exported thresholds', () => {
    expect(SIGNIFICANCE.minFilesChanged).toBe(2);
    expect(SIGNIFICANCE.minGatesPassed).toBe(1);
    expect(SIGNIFICANCE.minFitnessDelta).toBe(0);
  });
});

describe('countLocAdded', () => {
  it('counts code lines, not blanks or comments', () => {
    expect(
      countLocAdded([
        {
          content: [
            '// header',
            '',
            'const a = 1;',
            '/* block */',
            ' * continued',
            'const b = 2; // inline',
            '',
          ].join('\n'),
        },
      ]),
    ).toBe(2);
  });
});

describe('writeRunReport / readRunReport', () => {
  it('round-trips a report through its own dir', () => {
    const dir = tmpDir('run-report-');
    const report = makeReport({ runId: 'abc' });
    const file = writeRunReport(report, dir);
    expect(file).toBe(path.join(dir, 'abc.json'));
    expect(readRunReport('abc', dir)).toEqual(report);
  });

  it('reports an unreadable id as null, not as a throw', () => {
    const dir = tmpDir('run-report-');
    expect(readRunReport('nope', dir)).toBeNull();
    expect(readRunReport('nope', path.join(dir, 'missing-dir'))).toBeNull();
  });

  it('lists ids newest-first and skips garbage', () => {
    const dir = tmpDir('run-report-');
    writeRunReport(makeReport({ runId: 'a', significant: false }), dir);
    writeRunReport(makeReport({ runId: 'b', significant: true }), dir);
    fs.writeFileSync(path.join(dir, 'junk.json'), '{not json', 'utf8');
    expect(listRunIds(dir)).toEqual(['b', 'a']);
    expect(significantRunRate(10, dir)).toBe(0.5);
    expect(significantRunRate(1, dir)).toBe(1);
  });

  it('significantRunRate is -1 when there is nothing to average', () => {
    expect(significantRunRate(5, tmpDir('run-report-empty-'))).toBe(-1);
  });

  it('renders one honest line per report', () => {
    const summary = renderRunReportSummary(makeReport());
    expect(summary).toContain('SIGNIFICANT');
    expect(summary).toContain('gaps=3');
    expect(summary).toContain('lane=A');
    const boring = renderRunReportSummary(makeReport({ significant: false, skipped: { planner_unavailable: 4 } }));
    expect(boring).toContain('not significant');
    expect(boring).toContain('planner_unavailable=4');
  });
});

const graderFixture: AuditAdapter = async () => ({
  included: true,
  scoreBasis: 'deterministic fixture',
  payload: { security: { score: 90 } },
});

function makeProfile(): BusinessProfileT {
  const repo = tmpDir('loop-report-');
  return {
    business: { name: 'TestBiz', tagline: 'Tagline', industry: 'Test', website: '', stage: 'idea' },
    customer: {
      icp: 'Test ICP', segments: [{ name: 'Seg', pain: 'Pain' }], buyingTrigger: 'Trigger', topObjections: ['Obj'],
    },
    offering: { summary: 'Summary', pricing: '$0', model: 'free', differentiators: ['Diff'] },
    gaps: ['Refactor input handling to sanitize the upload endpoint (code quality)'],
    repo: RepoBinding.parse({ localPath: repo, autoMergeEnabled: true }),
  };
}

describe('runLoop emits a significance record for every run', () => {
  it('a run whose planner was offline reports upgrades 0 and skipped N, on disk', async () => {
    const reportDir = tmpDir('run-report-loop-');
    const pass = vi.fn(async () => ({ passed: true, output: 'ok' }));
    const out = await runLoop({
      profile: makeProfile(),
      dryRun: true,
      adapters: { grader: graderFixture },
      planner: async () => null,
      gateExecutors: { sandbox: DEFAULT_EXECUTORS.sandbox, lint: pass, typecheck: pass, tests: pass },
      runReportDir: reportDir,
    });

    const report = out.report;
    expect(report).toBeDefined();
    // The F2 done-when, persisted: upgrades 0, skipped N, no files written.
    expect(report!.proposals).toBe(0);
    expect(report!.filesChanged).toBe(0);
    expect(report!.gatesPassed).toBe(0);
    expect(Object.values(report!.skipped).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(report!.outcome).toBe('idle');
    // A dry run never merges, so fitnessDelta has no value to take — and the
    // report says so instead of defaulting to 0, which reads as "no change".
    expect(report!.fitnessDelta).toBeNull();
    expect(report!.significant).toBe(false);

    const onDisk = readRunReport(report!.runId, reportDir);
    expect(onDisk).toEqual(report);
  });
});
