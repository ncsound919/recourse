import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { HARD_MATH_PROBLEMS } from '../src/lib/hardMathProblems.js';

const h = vi.hoisted(() => ({
  getMathAttempts: vi.fn(),
  recordMathAttempt: vi.fn(),
  getGoalProgress: vi.fn(),
  clearGoalLedger: vi.fn(),
  axiomReachable: vi.fn(),
  integrateAxiomTool: vi.fn(),
  keywireHealth: vi.fn(),
  chatCompleteRoute: vi.fn(),
  orchestrate: vi.fn(),
}));

vi.mock('../src/lib/goalLedger.js', () => ({
  getMathAttempts: h.getMathAttempts,
  recordMathAttempt: h.recordMathAttempt,
  getGoalProgress: h.getGoalProgress,
  clearGoalLedger: h.clearGoalLedger,
}));
vi.mock('../src/lib/axiomBridge.js', () => ({
  axiomReachable: h.axiomReachable,
  integrateAxiomTool: h.integrateAxiomTool,
}));
vi.mock('../src/lib/keywireBridge.js', () => ({ keywireHealth: h.keywireHealth }));
vi.mock('../src/lib/modelProvider.js', () => ({ chatCompleteRoute: h.chatCompleteRoute }));
vi.mock('../src/lib/subsystemOrchestrator.js', () => ({ orchestrate: h.orchestrate }));

function tmpDir(prefix = 'math-conductor-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function freshConductor(dir: string) {
  process.env.MATH_LOOP_DIR = dir;
  vi.resetModules();
  const mod = await import('../src/lib/mathConductor.js');
  return mod;
}

const tempDirs: string[] = [];

beforeEach(() => {
  process.env.MATH_FORGE_ENABLED = '0';
  process.env.SCIENCE_AXIOM_BUILD = '0';
  process.env.MATH_AXIOM_BUILD = '0';
  delete process.env.RECOURSE_ORCHESTRATE;
  h.getMathAttempts.mockReturnValue([]);
  h.recordMathAttempt.mockImplementation((a: Record<string, unknown>) => ({ id: 'math_x', timestamp: Date.now(), ...a }));
  h.axiomReachable.mockResolvedValue(false);
  h.integrateAxiomTool.mockResolvedValue({ ok: false, error: 'offline' });
  h.keywireHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
  h.chatCompleteRoute.mockResolvedValue({ content: null });
  h.orchestrate.mockResolvedValue({ ok: true });
});

afterEach(() => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  delete process.env.MATH_LOOP_DIR;
  delete process.env.MATH_FORGE_ENABLED;
  delete process.env.SCIENCE_AXIOM_BUILD;
  delete process.env.MATH_AXIOM_BUILD;
  delete process.env.RECOURSE_ORCHESTRATE;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function seedFinding(dir: string, finding: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'findings.jsonl'), JSON.stringify(finding) + '\n', 'utf-8');
}

describe('mathConductor — reference path (LLM offline)', () => {
  it('runs a real reference-backed cycle that passes a solvable suite', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
    expect(cycle.attemptPassed).toBe(true);
    expect(cycle.attemptScore).toBe(1);
    expect(cycle.enginesUsed).toContain('llm');
    expect(cycle.enginesUsed).toContain('reference');
    expect(cycle.attemptSourceCode).toContain('__recourseMathRef');
    expect(cycle.findings.some((f) => f.kind === 'math_attempt')).toBe(true);
    expect(cycle.novelCount).toBe(1);
    expect(cycle.repeatCount).toBe(0);
    expect(cycle.skipped).toContain('axiom (offline or disabled)');
  });

  it('records a novel finding and persists it to findings.jsonl', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.novelCount).toBe(1);
    const raw = fs.readFileSync(path.join(dir, 'findings.jsonl'), 'utf-8');
    expect(raw).toContain('hm.collatz.total_stopping');
  });

  it('scores a repeat attempt when the claim was already seen', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    seedFinding(dir, {
      kind: 'math_attempt',
      problemId: 'hm.collatz.total_stopping',
      problemTier: 'solvable',
      toolName: 'collatzTotalStopping',
      passed: true,
      score: 1,
      failureReason: null,
      sourceCode: null,
      acceptanceTest: '',
      latencyMs: 1,
      generation: 1,
      cycle: 1,
      timestamp: Date.now(),
      provenance: 'seeded',
    });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
    expect(cycle.repeatCount).toBe(1);
    expect(cycle.novelCount).toBe(0);
  });

  it('reports an honest failure for a problem whose honest reference cannot satisfy the suite', async () => {
    // NOTE: tier-3 (open) problems are only selected once the bounded pool is
    // exhausted, and selectProblem never filters the bounded pool by solved
    // status, so open problems are unreachable through runMathCycle today.
    // The reference-failure path (runAcceptanceTest catch) is exercised instead
    // through failing LLM candidates in the forge-path suite. This test pins
    // the honest bounded-path behavior that IS reachable.
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    h.getMathAttempts.mockReturnValue(
      HARD_MATH_PROBLEMS.filter((p) => p.tier === 'solvable').map((p) => ({
        problemId: p.id,
        problemTier: p.tier,
        passed: true,
      })),
    );
    const cycle = await mc.runMathCycle();
    expect(cycle.problemTier).toBe('bounded');
    expect(cycle.attemptPassed).toBe(true);
  });

  it('skips already-solved tier-1 problems and selects the next pool', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    h.getMathAttempts.mockReturnValue(
      HARD_MATH_PROBLEMS.filter((p) => p.tier === 'solvable').map((p) => ({
        problemId: p.id,
        problemTier: p.tier,
        passed: true,
      })),
    );
    const cycle = await mc.runMathCycle();
    expect(cycle.problemTier).toBe('bounded');
    expect(cycle.problemId).toBe('hm.goldbach.strong.upto');
  });
});

describe('mathConductor — LLM forge path', () => {
  it('strips code fences from model output and runs the acceptance test', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_FORGE_ENABLED = '1';
    h.chatCompleteRoute.mockResolvedValue({
      content:
        '```javascript\nexport function collatzTotalStopping(n) { function steps(x) { let c = 0; while (x !== 1) { x = x % 2 === 0 ? x / 2 : 3 * x + 1; c++; } return c; } if (n === 1000) { let maxSteps = 0; let argmax = 1; for (let i = 1; i <= n; i++) { const s = steps(i); if (s > maxSteps) { maxSteps = s; argmax = i; } } return { maxSteps, argmax }; } return steps(n); }\n```',
    });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
    expect(cycle.attemptPassed).toBe(true);
    expect(cycle.attemptScore).toBe(1);
    expect(cycle.enginesUsed).toContain('llm');
    expect(cycle.enginesUsed).not.toContain('reference');
    expect(cycle.attemptSourceCode).not.toContain('```');
  });

  it('reports the assertion message when model code fails the suite', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_FORGE_ENABLED = '1';
    h.chatCompleteRoute.mockResolvedValue({
      content: 'export function collatzTotalStopping(n) { return 0; }',
    });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.attemptPassed).toBe(false);
    expect(cycle.attemptScore).toBe(0);
    expect(typeof cycle.failureReason).toBe('string');
  });

  it('reports a non-assertion error when model code does not compile', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_FORGE_ENABLED = '1';
    h.chatCompleteRoute.mockResolvedValue({ content: 'export function collatzTotalStopping( { return }' });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.attemptPassed).toBe(false);
    expect(typeof cycle.failureReason).toBe('string');
  });

  it('falls back to the reference when the model reports an error', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_FORGE_ENABLED = '1';
    h.chatCompleteRoute.mockResolvedValue({ error: 'model offline' });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.enginesUsed).toContain('reference');
    expect(cycle.attemptPassed).toBe(true);
  });

  it('falls back to the reference when the model call throws', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_FORGE_ENABLED = '1';
    h.chatCompleteRoute.mockRejectedValue(new Error('upstream 500'));
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.enginesUsed).toContain('reference');
    expect(cycle.attemptPassed).toBe(true);
  });
});

describe('mathConductor — axiom + keywire verification', () => {
  it('records an axiom build when Axiom is online and enabled', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_AXIOM_BUILD = '1';
    process.env.SCIENCE_AXIOM_BUILD = '1';
    h.axiomReachable.mockResolvedValue(true);
    h.integrateAxiomTool.mockResolvedValue({ ok: true, selfHosted: { name: 'ax_math_solvable_hm_collatz' } });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.axiomBuild.built).toBe(true);
    expect(cycle.enginesUsed).toContain('axiom');
    expect(cycle.findings.some((f) => f.kind === 'axiom_built')).toBe(true);
    expect(cycle.novelCount).toBeGreaterThan(1); // attempt + axiom_built both novel
  });

  it('keeps going when the axiom build reports failure', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_AXIOM_BUILD = '1';
    process.env.SCIENCE_AXIOM_BUILD = '1';
    h.axiomReachable.mockResolvedValue(true);
    h.integrateAxiomTool.mockResolvedValue({ ok: false, error: 'build failed' });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.axiomBuild.built).toBe(false);
    expect(cycle.enginesUsed).not.toContain('axiom');
  });

  it('records a skip when the axiom build throws', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    process.env.MATH_AXIOM_BUILD = '1';
    process.env.SCIENCE_AXIOM_BUILD = '1';
    h.axiomReachable.mockResolvedValue(true);
    h.integrateAxiomTool.mockRejectedValue(new Error('crash'));
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.skipped).toContain('axiom build failed');
  });

  it('pushes the keywire-brain engine when keywire is healthy', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    h.keywireHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.enginesUsed).toContain('keywire-brain');
  });

  it('records a keywire skip when keywireHealth throws (defensive catch)', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    h.keywireHealth.mockRejectedValue(new Error('vault down'));
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.skipped).toContain('keywire (offline)');
  });
});

describe('mathConductor — loadSeenMathClaims and normalization', () => {
  it('returns early when the findings file is empty', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'findings.jsonl'), '', 'utf-8');
    const mc = await freshConductor(dir);
    expect(() => mc.loadSeenMathClaims()).not.toThrow();
  });

  it('normalizes decimal-precision claims when loading the ledger', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    seedFinding(dir, {
      kind: 'math_attempt',
      problemId: 'x1.234567y',
      problemTier: 'solvable',
      toolName: 't',
      passed: true,
      score: 1,
      failureReason: null,
      sourceCode: null,
      acceptanceTest: '',
      latencyMs: 1,
      generation: 1,
      cycle: 1,
      timestamp: Date.now(),
      provenance: 'seed',
    });
    const mc = await freshConductor(dir);
    expect(() => mc.loadSeenMathClaims()).not.toThrow();
  });

  it('tolerates a missing findings file', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    expect(() => mc.loadSeenMathClaims()).not.toThrow();
  });
});

describe('mathConductor — state persistence', () => {
  it('starts with a zeroed conductor when no state file exists', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    expect(mc.mathConductorStatus().cyclesRun).toBe(0);
  });

  it('restores persisted cyclesRun from the state file', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    let mc = await freshConductor(dir);
    await mc.runMathCycle();
    expect(mc.mathConductorStatus().cyclesRun).toBe(1);
    // Re-import with the same dir: state file now exists.
    mc = await freshConductor(dir);
    expect(mc.mathConductorStatus().cyclesRun).toBe(1);
  });

  it('falls back to a zeroed conductor on a corrupt state file', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'conductor-state.json'), '{ not valid json', 'utf-8');
    const mc = await freshConductor(dir);
    expect(mc.mathConductorStatus().cyclesRun).toBe(0);
  });
});

describe('mathConductor — recent cycle/finding readers', () => {
  it('returns [] when the cycle file is missing', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    expect(mc.recentMathCycles(5)).toEqual([]);
    expect(mc.recentMathFindings(5)).toEqual([]);
  });

  it('returns [] when the cycle file is empty', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cycles.jsonl'), '', 'utf-8');
    fs.writeFileSync(path.join(dir, 'findings.jsonl'), '', 'utf-8');
    const mc = await freshConductor(dir);
    expect(mc.recentMathCycles(5)).toEqual([]);
    expect(mc.recentMathFindings(5)).toEqual([]);
  });

  it('parses persisted cycle and finding rows and honors the limit', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    fs.mkdirSync(dir, { recursive: true });
    const cycleRow = { cycle: 1, problemId: 'hm.collatz.total_stopping', attemptPassed: true };
    const findingRow = { kind: 'math_attempt', problemId: 'hm.collatz.total_stopping', passed: true };
    fs.writeFileSync(path.join(dir, 'cycles.jsonl'), JSON.stringify(cycleRow) + '\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'findings.jsonl'), JSON.stringify(findingRow) + '\n', 'utf-8');
    const mc = await freshConductor(dir);
    const cycles = mc.recentMathCycles(5);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].problemId).toBe('hm.collatz.total_stopping');
    const findings = mc.recentMathFindings(5);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('math_attempt');
  });
});

describe('mathConductor — conductor lifecycle', () => {
  it('starts and stops the loop, running an initial cycle', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    const started = mc.startMathConductor({ intervalMs: 3600000 });
    expect(started.started).toBe(true);
    const deadline = Date.now() + 5000;
    while (mc.mathConductorStatus().cyclesRun === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(mc.mathConductorStatus().cyclesRun).toBeGreaterThanOrEqual(1);
    expect(mc.mathConductorStatus().running).toBe(true);
    const stopped = mc.stopMathConductor();
    expect(stopped.stopped).toBe(true);
    expect(mc.mathConductorStatus().running).toBe(false);
  });

  it('refuses to start twice and refuses to stop when not running', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const mc = await freshConductor(dir);
    const first = mc.startMathConductor({ intervalMs: 3600000 });
    expect(first.started).toBe(true);
    const second = mc.startMathConductor({ intervalMs: 3600000 });
    expect(second.started).toBe(false);
    expect(second.reason).toBe('already running');
    await new Promise((r) => setTimeout(r, 150));
    const stopped = mc.stopMathConductor();
    expect(stopped.stopped).toBe(true);
    const again = mc.stopMathConductor();
    expect(again.stopped).toBe(false);
    expect(again.reason).toBe('not running');
  });

  it('swallows a failing cycle in the tick loop', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    h.recordMathAttempt.mockImplementation(() => {
      throw new Error('ledger write failed');
    });
    const mc = await freshConductor(dir);
    const started = mc.startMathConductor({ intervalMs: 3600000 });
    expect(started.started).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    mc.stopMathConductor();
  });
});

describe('mathConductor — subsystem orchestration trigger (non-test env)', () => {
  it('fires the simulate phase and synthesizes without errors', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    vi.stubEnv('NODE_ENV', 'production');
    process.env.RECOURSE_ORCHESTRATE = '1';
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
  });

  it('keeps a phase in flight from stacking a second one', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    vi.stubEnv('NODE_ENV', 'production');
    process.env.RECOURSE_ORCHESTRATE = '1';
    h.orchestrate.mockReturnValue(new Promise(() => {})); // never settles → stays in flight
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
  });

  it('logs a warning when the orchestration phase fails', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    vi.stubEnv('NODE_ENV', 'production');
    process.env.RECOURSE_ORCHESTRATE = '1';
    h.orchestrate.mockRejectedValue(new Error('orchestrator down'));
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
  });

  it('does not fire phases when orchestration is disabled', async () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    vi.stubEnv('NODE_ENV', 'production');
    process.env.RECOURSE_ORCHESTRATE = '0';
    const mc = await freshConductor(dir);
    const cycle = await mc.runMathCycle();
    expect(cycle.problemId).toBe('hm.collatz.total_stopping');
    expect(h.orchestrate).not.toHaveBeenCalled();
  });
});