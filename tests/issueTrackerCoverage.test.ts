import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const h = vi.hoisted(() => ({
  listProblems: vi.fn(),
  getProblem: vi.fn(),
  findGaps: vi.fn(),
  generateHypotheses: vi.fn(),
  recentCycles: vi.fn(),
  recentFindings: vi.fn(),
  recentInsights: vi.fn(),
  verifyLedgerChain: vi.fn(),
  initGoalLedger: vi.fn(),
  getGoalProgress: vi.fn(),
  getMathAttempts: vi.fn(),
  getBiotechClaims: vi.fn(),
}));

vi.mock('../src/lib/oncologyGrantEngine.js', () => ({
  listProblems: h.listProblems,
  getProblem: h.getProblem,
  findGaps: h.findGaps,
  generateHypotheses: h.generateHypotheses,
}));
vi.mock('../src/lib/scienceConductor.js', () => ({
  recentCycles: h.recentCycles,
  recentFindings: h.recentFindings,
}));
vi.mock('../src/lib/trendLedger.js', () => ({
  recentInsights: h.recentInsights,
  verifyLedgerChain: h.verifyLedgerChain,
}));
vi.mock('../src/lib/goalLedger.js', () => ({
  initGoalLedger: h.initGoalLedger,
  getGoalProgress: h.getGoalProgress,
  getMathAttempts: h.getMathAttempts,
  getBiotechClaims: h.getBiotechClaims,
}));

import {
  computeIssueProgress,
  renderIssueDocs,
  renderIssueIndex,
  readIssueRecords,
} from '../src/lib/issueTracker.js';

const RECORDS_PATH = path.join(process.cwd(), 'data', 'issues', 'records.json');

const p1 = {
  problem_id: 'P01_persister_dormancy',
  title: 'Persister dormancy',
  summary: 'Persister summary',
  lastUpdated: '2026-09-05',
};
const p2 = { problem_id: 'P02_cart_solid_tumor', title: 'CAR-T', summary: 'CAR-T summary', lastUpdated: 'not-a-date' };
const p3 = { problem_id: '-P03--', title: 'PDAC', summary: 'PDAC summary', lastUpdated: '2026-09-06' };
const p4 = { problem_id: 'P04_metastatic_dormancy', title: 'Met dormancy', summary: 'Met summary', lastUpdated: '2026-09-06' };

const hyp1a = { id: 'H-P1-1', text: 'test hypothesis one', gapRef: { subMechanism: 'dormancy', tier: 2, gapDescription: 'dormancy gap' } };
const hyp1b = { id: 'H-P1-2', text: 'test hypothesis two', gapRef: { subMechanism: 'reactivation', tier: 1, gapDescription: 'reactivation gap' } };

function finding(problemId: string, hypothesisId: string) {
  return {
    problemId,
    hypothesisId,
    kind: 'in_vitro',
    mode: 'biosim',
    cycle: 1,
    claim: `finding for ${problemId}`,
    provenance: `seed:${problemId}:${hypothesisId}`,
  };
}

function insight(id: string, problemId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    createdRun: 'run-1',
    hypothesisId: 'h',
    templateId: 't',
    statement: `insight ${id}`,
    confidence: 0.8,
    provenanceRoot: 'root',
    prevInsightHash: '0'.repeat(64),
    hash: 'a'.repeat(64),
    payload: { problemId },
    ...overrides,
  };
}

beforeEach(() => {
  h.getMathAttempts.mockReturnValue([]);
  h.getBiotechClaims.mockReturnValue([]);
  h.initGoalLedger.mockImplementation(() => {});
  h.getGoalProgress.mockReturnValue({
    math: { solved: 0, total: 0, rate: 0, byTier: {} },
    biotech: { passed: 0, total: 0, rate: 0, byLeg: {} },
    lastUpdatedAt: 0,
  });
  h.verifyLedgerChain.mockReturnValue({ valid: true, length: 3 });
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function setupDefaultState() {
  h.listProblems.mockReturnValue([p1, p2, p3, p4]);
  h.getProblem.mockImplementation((id: string) => [p1, p2, p3, p4].find((p) => p.problem_id === id) ?? { problem_id: id, title: '?', summary: '?', lastUpdated: '' });
  h.findGaps.mockImplementation((id: string) => {
    if (id === p3.problem_id) return [];
    if (id === p2.problem_id) return [{ subMechanism: 'immune-exclusion', tier: 1, gapDescription: 'solid tumor gap' }];
    return [
      { subMechanism: 'dormancy', tier: 2, gapDescription: 'dormancy gap' },
      { subMechanism: 'reactivation', tier: 1, gapDescription: 'reactivation gap' },
      { subMechanism: 'clearance', tier: 3, gapDescription: 'clearance gap' },
    ];
  });
  h.generateHypotheses.mockImplementation((id: string) => {
    if (id === p2.problem_id || id === p3.problem_id || id === p4.problem_id) return [];
    return [hyp1a, hyp1b];
  });
  h.recentCycles.mockReturnValue([{ problemId: p1.problem_id, startedAt: 1750000000000 }]);
  h.recentFindings.mockReturnValue([
    finding(p1.problem_id, 'H-P1-1'),
    finding(p1.problem_id, 'H-UNKNOWN'),
    finding(p4.problem_id, 'H-P4-1'),
  ]);
  h.recentInsights.mockReturnValue([
    insight('i1', p1.problem_id),
    insight('i2', p4.problem_id, { payload: { nested: { ref: 'P04_metastatic_dormancy-endpoint' } }, provenanceRoot: 'other' }),
    insight('i3', p4.problem_id, { payload: { other: true }, provenanceRoot: 'P04_metastatic_dormancy-root' }),
    insight('i4', 'x', { payload: { unrelated: 1 }, provenanceRoot: 'nope' }),
    insight('i5', p4.problem_id, {
      payload: (() => { const c: Record<string, unknown> = { self: null }; c.self = c; return c; })(),
      provenanceRoot: 'circular',
    }),
  ]);
  const mathAttempt = {
    id: 'm1',
    problemId: p1.problem_id,
    problemTier: 'solvable' as const,
    toolName: 't',
    passed: true,
    score: 1,
    timestamp: 1,
    generation: 1,
    latMs: 1,
  };
  const biotechClaim = {
    id: 'b1',
    assetName: 'asset',
    leg: 'debulking',
    evidenceTier: 5,
    passed: true,
    score: 1,
    summary: `claims ${p1.problem_id} target`,
    timestamp: 1,
    generation: 1,
  };
  h.getMathAttempts.mockReturnValue([mathAttempt]);
  h.getBiotechClaims.mockReturnValue([biotechClaim]);
}

describe('issueTracker — computeIssueProgress honest aggregation', () => {
  it('derives in_progress/stalled/open statuses and real counters', () => {
    setupDefaultState();
    const records = computeIssueProgress();
    const byId = new Map(records.map((r) => [r.issueId, r]));

    const p1rec = byId.get(p1.problem_id)!;
    expect(p1rec.status).toBe('in_progress');
    expect(p1rec.gapCount).toBe(3);
    expect(p1rec.hypothesisCount).toBe(2);
    expect(p1rec.experimentsRun).toBe(2);
    expect(p1rec.findingsCount).toBe(2);
    expect(p1rec.trendInsights).toBe(1);
    expect(p1rec.goalSignals).toBe(2); // one math + one biotech mention
    expect(p1rec.lastUpdatedAt).toBe(new Date('2026-09-05').getTime()); // registry date wins the max
    // gapAddressRate = 1 addressed / 3 gaps; experimentCoverage = min(1, 2/6) = 1/3
    const expected = Math.round(Math.min(1, Math.max(0, 0.6 * (1 / 3) + 0.4 * (1 / 3))) * 1000) / 1000;
    expect(p1rec.progressScore).toBe(expected);

    const p2rec = byId.get(p2.problem_id)!;
    expect(p2rec.status).toBe('stalled');
    expect(p2rec.experimentsRun).toBe(0);
    expect(p2rec.findingsCount).toBe(0);
    expect(p2rec.trendInsights).toBe(0);
    expect(p2rec.lastUpdatedAt).toBe(0);

    const p3rec = byId.get(p3.problem_id)!;
    expect(p3rec.status).toBe('open');
    expect(p3rec.gapCount).toBe(0);
    expect(p3rec.progressScore).toBe(1);

    const p4rec = byId.get(p4.problem_id)!;
    expect(p4rec.trendInsights).toBe(2); // nested-stringify + provenanceRoot matches
  });

  it('treats a non-matching and circular insight honestly', () => {
    setupDefaultState();
    const records = computeIssueProgress();
    const p4rec = records.find((r) => r.issueId === p4.problem_id)!;
    // i4 (unrelated) and i5 (circular payload, non-serializable) must NOT match.
    expect(p4rec.trendInsights).toBe(2);
  });

  it('calls initGoalLedger only when no in-memory signals exist', () => {
    setupDefaultState();
    computeIssueProgress();
    // getMathAttempts/getBiotechClaims return real entries above → no init.
    expect(h.initGoalLedger).not.toHaveBeenCalled();

    h.getMathAttempts.mockReturnValue([]);
    h.getBiotechClaims.mockReturnValue([]);
    computeIssueProgress();
    expect(h.initGoalLedger).toHaveBeenCalledTimes(1);
  });

  it('degrades to zero goal signals when the goal ledger init throws', () => {
    setupDefaultState();
    h.getMathAttempts.mockReturnValue([]);
    h.getBiotechClaims.mockReturnValue([]);
    h.initGoalLedger.mockImplementation(() => {
      throw new Error('corrupt ledger');
    });
    expect(() => computeIssueProgress()).not.toThrow();
  });
});

describe('issueTracker — markdown rendering', () => {
  it('renders every branch of the issue document', () => {
    setupDefaultState();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-docs-'));
    const { files } = renderIssueDocs(outDir);
    expect(files.length).toBe(4);
    const read = (id: string) => fs.readFileSync(path.join(outDir, `${id}.md`), 'utf-8');

    const p1md = read('p01_persister_dormancy');
    expect(p1md).toContain('- [T2 · dormancy] dormancy gap');
    expect(p1md).toContain('`H-P1-1` [T2 · dormancy] test hypothesis one');
    expect(p1md).toContain('### Real findings');
    expect(p1md).toContain('_(kind=in_vitro, mode=biosim, cycle=1)_ finding for P01_persister_dormancy');
    expect(p1md).toContain('### Real trend insights');
    expect(p1md).toContain('_[i1]_ insight i1');

    const p2md = read('p02_cart_solid_tumor');
    expect(p2md).toContain('No experiments, findings, or insights were recorded for this issue this cycle');

    const p3md = read('p03');
    expect(p3md).toContain('_No open gaps — every ladder rung carries at least one sourced claim._');
    expect(p3md).toContain('_No falsifiable hypotheses generated — nothing to test._');

    const p4md = read('p04_metastatic_dormancy');
    expect(p4md).toContain('_No falsifiable hypotheses generated — nothing to test._');
    expect(p4md).toContain('### Real findings');
    expect(p4md).toContain('### Real trend insights');
    expect(p4md).toContain('_[i2]_ insight i2');
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('persists records.json atomically next to the docs', () => {
    setupDefaultState();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-docs-'));
    renderIssueDocs(outDir);
    expect(fs.existsSync(path.join(outDir, 'records.json'))).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(path.join(outDir, 'records.json'), 'utf-8'));
    expect(parsed.length).toBe(4);
    fs.rmSync(outDir, { recursive: true, force: true });
  });
});

describe('issueTracker — index rendering and ledger integrity', () => {
  it('renders an index table with a valid ledger line', () => {
    setupDefaultState();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-index-'));
    h.verifyLedgerChain.mockReturnValue({ valid: true, length: 3 });
    const { file } = renderIssueIndex(outDir);
    const md = fs.readFileSync(file, 'utf-8');
    expect(md).toContain('| issue | title | status |');
    expect(md).toContain('P01_persister_dormancy');
    expect(md).toContain('Discovery ledger chain: valid (3 records)');
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('reports a broken ledger with the broken-at index', () => {
    setupDefaultState();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-index-'));
    h.verifyLedgerChain.mockReturnValue({ valid: false, length: 3, brokenAt: 1 });
    const { file } = renderIssueIndex(outDir);
    const md = fs.readFileSync(file, 'utf-8');
    expect(md).toContain('Discovery ledger chain: BROKEN (3 records, broken at 1)');
    fs.rmSync(outDir, { recursive: true, force: true });
  });
});

describe('issueTracker — readIssueRecords persistence paths', () => {
  const original = fs.existsSync(RECORDS_PATH) ? fs.readFileSync(RECORDS_PATH, 'utf-8') : null;

  afterEach(() => {
    if (original !== null) {
      fs.writeFileSync(RECORDS_PATH, original, 'utf-8');
    } else if (fs.existsSync(RECORDS_PATH)) {
      fs.unlinkSync(RECORDS_PATH);
    }
  });

  it('re-reads a persisted array from disk', () => {
    const fake = [{ issueId: 'X', title: 'x', status: 'open', progressScore: 0.5 }];
    fs.writeFileSync(RECORDS_PATH, JSON.stringify(fake), 'utf-8');
    const records = readIssueRecords();
    expect(records).toEqual(fake);
  });

  it('recomputes when the persisted value is not an array', () => {
    setupDefaultState();
    fs.writeFileSync(RECORDS_PATH, JSON.stringify({ not: 'an array' }), 'utf-8');
    const records = readIssueRecords();
    expect(records.length).toBe(4);
  });

  it('recomputes when the persisted records file is corrupt', () => {
    setupDefaultState();
    fs.writeFileSync(RECORDS_PATH, '{ broken json', 'utf-8');
    const records = readIssueRecords();
    expect(records.length).toBe(4);
  });

  it('recomputes when no records file exists', () => {
    setupDefaultState();
    if (fs.existsSync(RECORDS_PATH)) fs.unlinkSync(RECORDS_PATH);
    const records = readIssueRecords();
    expect(records.length).toBe(4);
  });
});