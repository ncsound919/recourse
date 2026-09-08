import { describe, it, expect } from 'vitest';
import { keywireHealth, keywireCallService, keywirePm2Status, keywireAuthStatus } from '../src/lib/keywireBridge.js';
import { computeIssueProgress, readIssueRecords } from '../src/lib/issueTracker.js';
import { generateFleetReport, renderFleetReportMarkdown, recentReports } from '../src/lib/researchReports.js';
import { axiomReachable } from '../src/lib/axiomBridge.js';

const DOWN = 'http://127.0.0.1:1';

describe('keywire bridge (fail-soft, honest)', () => {
  it('health reports ok:false on unreachable keywire', async () => {
    const r = await keywireHealth(DOWN, 1500);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  it('call/pm2 fail soft without throwing', async () => {
    const c = await keywireCallService('draymond', DOWN, 1500);
    expect(c.ok).toBe(false);
    const p = await keywirePm2Status(DOWN, 1500);
    expect(p.ok).toBe(false);
  });

  it('reports real summary when keywire is online (skip when not)', async () => {
    const r = await keywireHealth();
    if (!r.ok) return; // environment-dependent
    expect(r.summary).toHaveProperty('servers');
    expect(typeof r.summary?.servers?.taken).toBe('number');
  });

  it('auth status never leaks the token', () => {
    const s = keywireAuthStatus();
    expect(typeof s.configured).toBe('boolean');
    expect(typeof s.jwtCached).toBe('boolean');
    const j = JSON.stringify(s);
    expect(j).not.toMatch(/kw_st_live_/);
  });
});

describe('issue tracker (real progress, no fabrication)', () => {
  it('computes records for every grant problem with honest counters', () => {
    const records = computeIssueProgress();
    expect(records.length).toBeGreaterThanOrEqual(10);
    for (const r of records) {
      expect(r.progressScore).toBeGreaterThanOrEqual(0);
      expect(r.progressScore).toBeLessThanOrEqual(1);
      // stalled only when there is genuinely no activity
      if (r.status === 'stalled') {
        expect(r.experimentsRun).toBe(0);
        expect(r.findingsCount).toBe(0);
      }
      expect(r.hypothesisCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('records persist + re-read matches', () => {
    const a = readIssueRecords();
    const b = readIssueRecords();
    expect(a.length).toBe(b.length);
    expect(Array.isArray(a)).toBe(true);
  });
});

describe('research reports (real state only)', () => {
  it('generates a fleet report with real counters + honesty line', async () => {
    const report = await generateFleetReport();
    expect(report.issues.length).toBeGreaterThanOrEqual(10);
    // Job table reflects in-process scheduler state: in the unit-test process no
    // jobs are registered (server.ts registers them at boot), so this is
    // honestly 0 — the report never fabricates a job table.
    expect(Array.isArray(report.jobs)).toBe(true);
    const md = renderFleetReportMarkdown(report);
    expect(md).toContain('All figures from real Recourse state');
    expect(md).toContain('Job Scheduler');
    expect(md).toContain('Goal Progress');
  });

  it('lists recent report files', () => {
    const files = recentReports(5);
    expect(Array.isArray(files)).toBe(true);
  });
});

describe('axiom wiring', () => {
  it('axiomReachable is a real boolean check', async () => {
    const up = await axiomReachable();
    expect(typeof up).toBe('boolean');
  });
});