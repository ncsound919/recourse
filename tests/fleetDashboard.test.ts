import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-dashboard-real-'));
const SCIENCE_DIR = path.join(TMP, 'science-loop');
const MATH_DIR = path.join(TMP, 'math-loop');
const AGENDA_DIR = path.join(TMP, 'agenda');
const REPORTS_DIR = path.join(TMP, 'reports');
const TREND_LEDGER = path.join(TMP, 'trend-ledger.jsonl');

process.env.SCIENCE_LOOP_DIR = SCIENCE_DIR;
process.env.MATH_LOOP_DIR = MATH_DIR;
process.env.AGENDA_DIR = AGENDA_DIR;
process.env.REPORTS_DIR = REPORTS_DIR;
process.env.TREND_LEDGER_FILE = TREND_LEDGER;

let keywireOnline = true;
const keywireServer = http.createServer((_req, res) => {
  res.writeHead(keywireOnline ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(keywireOnline ? JSON.stringify({ servers: { total: 2, taken: 1, open: 1 } }) : '{}');
});
await new Promise<void>((resolve) => keywireServer.listen(0, '127.0.0.1', resolve));
process.env.KEYWIRE_URL = `http://127.0.0.1:${(keywireServer.address() as AddressInfo).port}`;

const dash = await import('../src/lib/fleetDashboard.js');
const goal = await import('../src/lib/goalLedger.js');

const REGISTRY_TSUPDATED = new Date('2026-09-05').getTime();

beforeAll(() => {
  goal.recordMathAttempt({
    problemId: 'hm.collatz.total_stopping',
    problemTier: 'solvable',
    toolName: 'collatzTotalStopping',
    passed: true,
    score: 1.0,
    generation: 1,
    latMs: 12,
  });
  goal.recordMathAttempt({
    problemId: 'hm.riemann.critical_line',
    problemTier: 'open',
    toolName: 'riemannSearch',
    passed: false,
    score: 0.25,
    failureReason: 'bounds not extended',
    generation: 1,
    latMs: 40,
  });
});

afterEach(() => {
  for (const p of [
    path.join(SCIENCE_DIR, 'cycles.jsonl'),
    path.join(SCIENCE_DIR, 'findings.jsonl'),
    path.join(MATH_DIR, 'cycles.jsonl'),
    path.join(MATH_DIR, 'findings.jsonl'),
  ]) {
    try {
      fs.rmSync(p, { force: true });
    } catch {
      /* best effort */
    }
  }
  try {
    fs.rmSync(TREND_LEDGER, { force: true });
  } catch {
    /* best effort */
  }
  keywireOnline = true;
  const sci = (globalThis as Record<string, unknown>).__scienceConductor as { running?: boolean } | undefined;
  if (sci) sci.running = false;
});

describe('computeDashboardSections — real aggregation', () => {
  it('derives issue records from the grant registry with no activity', async () => {
    const sections = await dash.computeDashboardSections();
    expect(sections.issues).toHaveLength(10);

    const p01 = sections.issues.find((i: { issueId: string }) => i.issueId === 'P01_persister_dormancy')!;
    expect(p01.status).toBe('stalled');
    expect(p01.gapCount).toBe(2);
    expect(p01.hypothesisCount).toBe(2);
    expect(p01.experimentsRun).toBe(0);
    expect(p01.findingsCount).toBe(0);
    expect(p01.trendInsights).toBe(0);
    expect(p01.goalSignals).toBe(0);
    expect(p01.progressScore).toBe(0);
    expect(p01.lastUpdatedAt).toBeGreaterThanOrEqual(REGISTRY_TSUPDATED);

    const p03 = sections.issues.find((i: { issueId: string }) => i.issueId === 'P03_mced_overdiagnosis')!;
    expect(p03.gapCount).toBe(1);
    expect(p03.status).toBe('stalled');

    for (const r of sections.issues) {
      expect(['open', 'in_progress', 'stalled']).toContain(r.status);
      expect(r.progressScore).toBeGreaterThanOrEqual(0);
      expect(r.progressScore).toBeLessThanOrEqual(1);
    }
  });

  it('derives the game profile from the seeded goal ledger (105 XP = researcher)', async () => {
    const sections = await dash.computeDashboardSections();
    expect(sections.profile.totalXp).toBe(105);
    expect(sections.profile.level.name).toBe('researcher');
    expect(sections.profile.nextLevel?.name).toBe('scholar');
    expect(sections.profile.xpToNextLevel).toBe(395);
    expect(sections.profile.mathXp).toBe(105);
    expect(sections.profile.oncologyXp).toBe(0);
    expect(sections.profile.streak).toBe(0);
    expect(sections.profile.mathAttempts).toBe(2);
    expect(sections.profile.mathPasses).toBe(1);
    expect(sections.profile.badges.map((b: { id: string }) => b.id)).toEqual([
      'first_blood',
      'tier1_solver',
      'collatz_conqueror',
      'apprentice',
      'researcher',
    ]);
  });

  it('marks the collatz milestone met and leaves the rest at_risk', async () => {
    const sections = await dash.computeDashboardSections();
    expect(sections.agenda).toHaveLength(13);

    const m01 = sections.agenda.find((m: { milestone: { id: string } }) => m.milestone.id === 'M01_collatz_1k')!;
    expect(m01.status).toBe('met');
    expect(m01.verification.currentValue).toBe(1);
    expect(m01.verification.targetValue).toBe(1);

    const m08 = sections.agenda.find((m: { milestone: { id: string } }) => m.milestone.id === 'M08_riemann_10k')!;
    expect(m08.status).toBe('at_risk');
    expect(m08.verification.currentValue).toBe(0);
    expect(m08.verification.targetValue).toBe(1);

    const o04 = sections.agenda.find((m: { milestone: { id: string } }) => m.milestone.id === 'O04_all_open')!;
    expect(o04.verification.currentValue).toBe(0);
    expect(o04.verification.targetValue).toBe(10);
    expect(o04.status).toBe('at_risk');

    expect(sections.agenda.filter((m: { status: string }) => m.status === 'met')).toHaveLength(1);
    expect(sections.agenda.filter((m: { status: string }) => m.status === 'at_risk')).toHaveLength(12);
  });

  it('reports offline keywire and conductor state honestly', async () => {
    keywireOnline = false;
    const sections = await dash.computeDashboardSections();
    expect(sections.keywireOk).toBe(false);
    expect(sections.trendLedgerValid).toBe(true);
    expect(sections.mathConductor.running).toBe(false);
    expect(sections.mathConductor.cyclesRun).toBe(0);
    expect(sections.sciConductor.running).toBe(false);
    expect(sections.sciConductor.cyclesRun).toBe(0);
  });

  it('reports a tampered trend ledger as broken', async () => {
    fs.mkdirSync(path.dirname(TREND_LEDGER), { recursive: true });
    fs.writeFileSync(
      TREND_LEDGER,
      JSON.stringify({
        id: 'ins_tampered',
        createdRun: 'cycle_1',
        hypothesisId: 'h1',
        templateId: 't',
        statement: 'tampered record',
        confidence: 0.5,
        provenanceRoot: 'root',
        prevInsightHash: 'deadbeef',
        hash: 'deadbeef',
        payload: {},
      }) + '\n',
      'utf-8',
    );
    const sections = await dash.computeDashboardSections();
    expect(sections.trendLedgerValid).toBe(false);
    expect(sections.keywireOk).toBe(true);
  });
});

describe('renderDashboard — real markdown assembly', () => {
  it('renders identity, agenda, issues, math and honesty into a file', async () => {
    const { file, sections } = await dash.renderDashboard();
    expect(path.dirname(file)).toBe(REPORTS_DIR);
    expect(fs.existsSync(file)).toBe(true);
    expect(sections.trendLedgerValid).toBe(true);
    expect(sections.keywireOk).toBe(true);

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    expect(lines[0]).toBe('# Recourse Fleet Dashboard');
    expect(lines[2]).toMatch(/^_Generated: \d{4}-\d{2}-\d{2}T/);
    expect(content).toContain('## Identity & Gamification');
    expect(content).toContain('**Level:** RESEARCHER — Consistently producing novel findings; rhythm established.');
    expect(content).toContain('**Total XP:** 105 (math: 105 + oncology: 0 + streak: 0)');
    expect(content).toContain('**Next level:** scholar (395 XP to go)');
    expect(content).toContain('**Streak:** 0 consecutive day(s) of novel findings');
    expect(content).toContain('**Badges earned (5/22):** 🩸 🥇 🌀 🌱 🔬');
    expect(content).toContain('  | 🩸 | First Blood | First passing math attempt. |');
    expect(content).toContain('  | 🌀 | Collatz Conqueror | Collatz total-stopping time solved. |');
    expect(content).toContain('| math | 105 | 1 passing attempts |');
    expect(content).toContain('| oncology | 0 | 0 novel findings |');
    expect(content).toContain('**Science conductor:** STOPPED (0 cycles)');
    expect(content).toContain('**Math conductor:** STOPPED (0 cycles)');

    expect(content).toContain('- ✅ Met: **1**');
    expect(content).toContain('- 🟢 On track: **0**');
    expect(content).toContain('- 🟡 At risk: **12**');
    expect(content).toContain('- 🔴 Overdue: **0**');

    expect(content).toMatch(
      /^\| ✅ \| Solve Collatz total-stopping time for n up to 1,000 \| 2026-09-30 \| \d+\.\d \| ████████████████ 100% \| metric 1 >= target 1: 1 passing attempt\(s\) out of 1 for Collatz total-stopping time for n up to N \(best score=1\.00\) \|$/m,
    );
    expect(content).toMatch(/^\| .* \| 🔍 bounded \| 0 \| 0 \| 0\.00 \|$/m);
    expect(content).toMatch(/^\| Riemann Hypothesis .* \| 🌌 open \| 1 \| 0 \| 0\.25 \|$/m);

    expect(content).toMatch(/^\| `P01_persister_dormancy` \| 🟠 stalled \| ░░░░░░░░░░░░░░░░ 0% \| 2 \| 0 \| 0 \|$/m);
    expect(content).toMatch(/^\| `P03_mced_overdiagnosis` \| 🟠 stalled \| ░░░░░░░░░░░░░░░░ 0% \| 1 \| 0 \| 0 \|$/m);

    expect(content).toContain('| Collatz total-stopping time for n up to N | 🥇 solvable | 1 | 1 | 1.00 |');

    expect(content).toContain('_No science cycles yet._');
    expect(content).toContain('_No math cycles yet._');

    expect(content).toContain('**Trend ledger chain:** VALID');
    expect(content).toContain('**Keywire fleet:** online');
    expect(content).toContain('## Honesty Contract');
    expect(content).toContain('_Offline services and unmet criteria are reported as zero. We do not interpolate, we do not pad._');
    expect(lines[lines.length - 1]).toBe('');

    const daily = path.basename(file);
    expect(daily).toMatch(/^fleet-\d{4}-\d{2}-\d{2}\.md$/);
    const latest = path.join(REPORTS_DIR, 'latest.md');
    expect(fs.existsSync(latest)).toBe(true);
    expect(fs.readFileSync(latest, 'utf-8')).toBe(content);
  });

  it('renders science conductor RUNNING when its state says so', async () => {
    const sci = (globalThis as Record<string, unknown>).__scienceConductor as { running?: boolean } | undefined;
    expect(sci).toBeDefined();
    sci!.running = true;
    try {
      const sections = await dash.computeDashboardSections();
      expect(sections.sciConductor.running).toBe(true);
      const { file } = await dash.renderDashboard();
      expect(fs.readFileSync(file, 'utf-8')).toContain('**Science conductor:** RUNNING (0 cycles)');
    } finally {
      sci!.running = false;
    }
  });

  it('renders seeded science and math cycles into the tables', async () => {
    fs.mkdirSync(SCIENCE_DIR, { recursive: true });
    fs.mkdirSync(MATH_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(SCIENCE_DIR, 'cycles.jsonl'),
      JSON.stringify({
        cycle: 101,
        startedAt: 1,
        durationMs: 1,
        services: {},
        problemId: 'scratch.x',
        problemTitle: 'scratch',
        gapCount: 0,
        hypothesisId: 'h',
        hypothesisText: 't',
        experimentMode: 'biosim_sidecar',
        experimentsRun: 1,
        findings: [],
        novelCount: 0,
        repeatCount: 0,
        enginesUsed: ['biosim'],
        trendScan: null,
        axiomBuild: { built: false },
        keywireHandoff: null,
        integrityCheck: { submitted: false },
        skipped: ['kg (offline)'],
      }) + '\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(MATH_DIR, 'cycles.jsonl'),
      JSON.stringify({
        cycle: 7,
        startedAt: 1,
        durationMs: 1,
        problemId: 'hm.collatz.total_stopping',
        problemTier: 'solvable',
        problemStatement: '',
        toolName: 'collatzTotalStopping',
        attemptPassed: true,
        attemptScore: 1,
        attemptLatencyMs: 1,
        attemptGeneration: 1,
        attemptSourceCode: null,
        failureReason: null,
        enginesUsed: ['llm'],
        axiomBuild: { built: false },
        findings: [],
        novelCount: 0,
        repeatCount: 0,
        skipped: [],
        timestamp: 1,
      }) +
        '\n' +
        JSON.stringify({
          cycle: 8,
          startedAt: 1,
          durationMs: 1,
          problemId: 'hm.riemann.critical_line',
          problemTier: 'open',
          problemStatement: '',
          toolName: 'riemannSearch',
          attemptPassed: false,
          attemptScore: 0.4,
          attemptLatencyMs: 1,
          attemptGeneration: 2,
          attemptSourceCode: null,
          failureReason: null,
          enginesUsed: ['llm', 'axiom'],
          axiomBuild: { built: false },
          findings: [],
          novelCount: 0,
          repeatCount: 0,
          skipped: [],
          timestamp: 1,
        }) +
        '\n',
      'utf-8',
    );

    const { file } = await dash.renderDashboard();
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('| 101 | scratch.x | biosim_sidecar | 0 | biosim | 1 |');
    expect(content).toContain('| 7 | hm.collatz.total_stopping | solvable | ✅ | 1.00 | 1 | llm |');
    expect(content).toContain('| 8 | hm.riemann.critical_line | open | ❌ | 0.40 | 2 | llm, axiom |');
    expect(content).not.toContain('_No science cycles yet._');
    expect(content).not.toContain('_No math cycles yet._');
  });

  it('renders a BROKEN ledger and offline keywire honestly', async () => {
    keywireOnline = false;
    fs.mkdirSync(path.dirname(TREND_LEDGER), { recursive: true });
    fs.writeFileSync(
      TREND_LEDGER,
      JSON.stringify({
        id: 'ins_tampered',
        createdRun: 'cycle_1',
        hypothesisId: 'h1',
        templateId: 't',
        statement: 'tampered record',
        confidence: 0.5,
        provenanceRoot: 'root',
        prevInsightHash: 'deadbeef',
        hash: 'deadbeef',
        payload: {},
      }) + '\n',
      'utf-8',
    );
    const { file, sections } = await dash.renderDashboard();
    expect(sections.trendLedgerValid).toBe(false);
    expect(sections.keywireOk).toBe(false);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('**Trend ledger chain:** BROKEN');
    expect(content).toContain('**Keywire fleet:** offline');
  });

  it('renders the max-level header when XP reaches luminary', async () => {
    fs.mkdirSync(MATH_DIR, { recursive: true });
    const rows: string[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push(
        JSON.stringify({
          kind: 'math_attempt',
          problemId: 'hm.proth.primality',
          problemTier: 'solvable',
          toolName: 'prothPrimality',
          passed: true,
          score: 1,
          failureReason: null,
          sourceCode: 'x',
          acceptanceTest: 'x',
          latencyMs: 1,
          generation: i + 1,
          cycle: i + 1,
          timestamp: 1,
          provenance: 'x',
        }),
      );
    }
    fs.writeFileSync(path.join(MATH_DIR, 'findings.jsonl'), rows.join('\n') + '\n', 'utf-8');

    const { file } = await dash.renderDashboard();
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('**Level:** LUMINARY — Self-driving research — the system meets milestones on its own.');
    expect(content).toContain('**Total XP:** 10000 (math: 10000 + oncology: 0 + streak: 0)');
    expect(content).toContain('**Next level:** — (max level reached)');
  });

  it('writes to the default reports dir when REPORTS_DIR is unset', async () => {
    const prev = process.env.REPORTS_DIR;
    delete process.env.REPORTS_DIR;
    try {
      const { file } = await dash.renderDashboard();
      expect(path.dirname(file)).toBe(path.join(process.cwd(), 'data', 'reports'));
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.existsSync(path.join(path.dirname(file), 'latest.md'))).toBe(true);
      fs.rmSync(file, { force: true });
      fs.rmSync(path.join(path.dirname(file), 'latest.md'), { force: true });
    } finally {
      if (prev) process.env.REPORTS_DIR = prev;
    }
  });

  it('reports the math conductor RUNNING when a real cycle is started', async () => {
    const mc = await import('../src/lib/mathConductor.js');
    process.env.MATH_FORGE_ENABLED = '0';
    const started = mc.startMathConductor({ intervalMs: 300000 });
    expect(started.started).toBe(true);
    try {
      const deadline = Date.now() + 15000;
      while (mc.mathConductorStatus().cyclesRun === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(mc.mathConductorStatus().cyclesRun).toBeGreaterThan(0);
      expect(mc.mathConductorStatus().running).toBe(true);
      const sections = await dash.computeDashboardSections();
      expect(sections.mathConductor.running).toBe(true);
      expect(sections.mathConductor.cyclesRun).toBe(1);
      const { file } = await dash.renderDashboard();
      expect(fs.readFileSync(file, 'utf-8')).toContain('**Math conductor:** RUNNING (1 cycles)');
    } finally {
      mc.stopMathConductor();
      delete process.env.MATH_FORGE_ENABLED;
    }
  });
});