import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DreamingEngine } from '../src/dream/engine';
import type { DreamGeneratorResult, DreamGeneratorInput } from '../src/dream/engine';
import { InMemoryDreamStore } from '../src/dream/store';
import type { DreamState, DreamThought } from '../src/dream/types';
import { executeTestSuite } from '../src/lib/executionSandbox';
import {
  maskLiterals, generateMutants, mutationScore, staticTestIssues, assessModelTests, type SuiteRunner,
} from '../src/dream/testStrength';
import {
  buildRemoteJob, enqueueRemoteTask, drainRemoteTasks, clearRemoteAppliers, buildDreamCandidatesNotebook,
} from '../src/lib/remoteCompute';
import { registerRemoteComputeAppliers } from '../src/lib/remoteComputeIntegrations';
import type { ComputeJob, ComputeJobHandle, UnifiedComputeClient } from '../src/lib/computePlatforms';

const real: SuiteRunner = (c, t) => executeTestSuite(c, t);

const GRADE = 'export function grade(s) {\n  if (s >= 90) return "A";\n  if (s >= 80) return "B";\n  if (s >= 70) return "C";\n  return "F";\n}';
const ADD = 'export function add(a, b) {\n  // adds a and b: a + b\n  return a + b;\n}';
const STRONG = 'assert add(2, 3) === 5;\nassert add(-1, 1) === 0;\nassert add(0, 0) === 0;\nassert add(10, -4) === 6;';
const WEAK = 'assert add(0, 0) === 0;';

describe('testStrength', () => {
  it('maskLiterals blanks comments and strings but keeps offsets', () => {
    const src = 'const a = "x + y"; // p + q\nreturn a + b;';
    const m = maskLiterals(src);
    expect(m.length).toBe(src.length);
    expect(m).not.toContain('x + y');
    expect(m).not.toContain('p + q');
    expect(m).toContain('a + b');
  });

  it('mutants only touch real operators, not comments/strings', () => {
    const ms = generateMutants(ADD);
    expect(ms.length).toBe(1);
    expect(ms[0].source).toContain('return a - b;');
    expect(ms[0].source).toContain('// adds a and b: a + b'); // comment untouched
  });

  it('static screen: tautologies and tests that never call the code', () => {
    expect(staticTestIssues(ADD, 'assert true;\nassert 1 === 1;')).toContain('every assert is a tautology');
    expect(staticTestIssues(ADD, 'assert 2 + 2 === 4 && true;')[0]).toMatch(/never call the exported function/);
    expect(staticTestIssues(ADD, 'x = 1')).toEqual(['no assert lines']);
    expect(staticTestIssues(ADD, STRONG)).toEqual([]);
  });

  it('mutationScore counts kills with an injected runner; compile errors are not counted', () => {
    const code = 'export function f(a, b) { if (a < b && b > 0) return a + b; return a - b; }';
    let n = 0;
    const run: SuiteRunner = () => {
      n++;
      if (n === 1) return { passed: true, testDetails: [] };                       // survived
      if (n === 2) return { passed: false, testDetails: ['[COMPILATION ERROR] x'] }; // skipped
      return { passed: false, testDetails: ['[FAIL] y'] };                            // killed
    };
    const r = mutationScore(code, 'assert f(1,2)===3', run);
    expect(r.total).toBe(r.killed + r.survived.length);
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.survived).toHaveLength(1);
  });


  it('REAL sandbox: a suite covering every branch passes the gate; one that only hits the first branch does not', () => {
    const strong = 'assert grade(95) === "A";\nassert grade(85) === "B";\nassert grade(75) === "C";\nassert grade(10) === "F";';
    const weak = 'assert grade(95) === "A";';
    expect(assessModelTests(GRADE, strong, real).ok).toBe(true);
    const w = assessModelTests(GRADE, weak, real);
    expect(w.ok).toBe(false);
    expect(w.reasons[0]).toMatch(/weak tests: killed 1\/3 mutants/);
  });
});

const GENESIS: DreamState = {
  isDreamingActive: true, currentPhase: 'lucid_crystallization', dreamCyclesCompleted: 0,
  cognitiveCoherence: 0.5, totalCrystallizedGenes: 0, recentThoughts: [], registry: [],
  seed: 7, tick: 0, lastTickAt: null, prunedCount: 0,
};

function codeThought(id: string, hypothesis: string, code: string, tests: string, readiness: number): DreamThought {
  return {
    id, phase: 'theorem_induction', domain: 'math', premise: 'p', hypothesis, simulatedOutcome: '',
    intensity: 0.9, crystallizationReadiness: readiness, code, codeTests: tests, origin: 'api_model',
    invariantChecks: [{ name: '[PASS] x', passed: true }], tick: 0,
  };
}

describe('dream engine upgrades', () => {
  it('lucid phase now auto-crystallizes a verified MODEL-CODE thought (it used to require a genome)', async () => {
    const store = new InMemoryDreamStore();
    await store.save({ ...structuredClone(GENESIS), recentThoughts: [codeThought('dt_strong', 'add two numbers correctly', ADD, STRONG, 0.95)] });
    const engine = new DreamingEngine(store, 7);
    const { phaseReport, dreamState } = await engine.tick();
    expect(phaseReport).toContain('Auto-promoted 1');
    expect(dreamState.registry).toHaveLength(1);
    expect(dreamState.registry[0].kind).toBe('model_hypothesis');
    expect(dreamState.registry[0].invariantChecks.some((c) => c.name.startsWith('test_strength: killed'))).toBe(true);
  });

  it('...but holds back a thought whose model-written tests are weak', async () => {
    const code = GRADE;
    const store = new InMemoryDreamStore();
    await store.save({ ...structuredClone(GENESIS), recentThoughts: [codeThought('dt_weak', 'letter grade from a score', code, 'assert grade(95) === "A";', 0.95)] });
    const engine = new DreamingEngine(store, 7);
    const { dreamState } = await engine.tick();
    expect(dreamState.registry).toHaveLength(0);
    const t = dreamState.recentThoughts.find((x) => x.id === 'dt_weak')!;
    expect(t.simulatedOutcome).toMatch(/held back: weak tests/);
    expect(t.invariantChecks!.some((c) => c.name === 'test_strength' && !c.passed)).toBe(true);
    expect(t.crystallizationReadiness).toBeLessThan(0.95);
  });

  it('a failed first attempt gets exactly one repair round, tagged in provenance', async () => {
    const seen: DreamGeneratorInput[] = [];
    const engine = new DreamingEngine(new InMemoryDreamStore(), 7, async (input) => {
      seen.push(input);
      return input.repair
        ? { premise: 'p', hypothesis: 'double a number', sourceCode: 'export function dbl(x) { return x * 2; }', testSuiteCode: 'assert dbl(2) === 4;' }
        : { premise: 'p', hypothesis: 'double a number', sourceCode: 'export function dbl(x) { return x + 2; }', testSuiteCode: 'assert dbl(5) === 10;' };
    });
    const st = await new InMemoryDreamStore().load();
    expect(st).toBeNull();
    const store = new InMemoryDreamStore();
    await store.save({ ...structuredClone(GENESIS), currentPhase: 'rem_counterfactual_sim' });
    const e2 = new DreamingEngine(store, 7, async (input) => {
      seen.push(input);
      return input.repair
        ? { premise: 'p', hypothesis: 'double a number', sourceCode: 'export function dbl(x) { return x * 2; }', testSuiteCode: 'assert dbl(5) === 10;' }
        : { premise: 'p', hypothesis: 'double a number', sourceCode: 'export function dbl(x) { return x + 2; }', testSuiteCode: 'assert dbl(5) === 10;' };
    });
    const { newThought } = await e2.tick();
    const calls = seen.filter((s) => s.repair !== undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0].repair!.failure.length).toBeGreaterThan(0);
    expect(newThought!.provenance).toContain('repaired');
    expect(newThought!.crystallizationReadiness).toBeGreaterThanOrEqual(0.6);
    void engine;
  });

  it('no repair round when the first attempt already passed', async () => {
    const store = new InMemoryDreamStore();
    await store.save({ ...structuredClone(GENESIS), currentPhase: 'rem_counterfactual_sim' });
    let calls = 0;
    const e = new DreamingEngine(store, 7, async () => {
      calls++;
      return { premise: 'p', hypothesis: 'double ok', sourceCode: 'export function dbl(x) { return x * 2; }', testSuiteCode: 'assert dbl(5) === 10;' };
    });
    await e.tick();
    expect(calls).toBe(1);
  });

  it('ingestExternalCandidates re-verifies locally, drops repeats, and never trusts the sender', async () => {
    const store = new InMemoryDreamStore();
    await store.save({ ...structuredClone(GENESIS), currentPhase: 'idle' as never, recentThoughts: [] });
    const engine = new DreamingEngine(store, 7);
    const good: DreamGeneratorResult & { domain: 'math' } = {
      domain: 'math', premise: 'p', hypothesis: 'triple a number exactly', sourceCode: 'export function tri(x) { return x * 3; }', testSuiteCode: 'assert tri(2) === 6;',
    };
    const lying = { domain: 'math' as const, premise: 'p', hypothesis: 'claims to negate numbers', sourceCode: 'export function neg(x) { return x; }', testSuiteCode: 'assert neg(2) === -2;' };
    const nocode = { premise: 'p', hypothesis: 'has no code at all', sourceCode: '', testSuiteCode: '' };
    const r = await engine.ingestExternalCandidates([good, good, lying, nocode], 'kaggle_dream');
    expect(r).toMatchObject({ ingested: 2, verified: 1, duplicates: 1, rejected: 1 });
    const s = await engine.status();
    const g = s.recentThoughts.find((t) => t.hypothesis === good.hypothesis)!;
    const l = s.recentThoughts.find((t) => t.hypothesis === lying.hypothesis)!;
    expect(g.provenance).toContain('kaggle_dream');
    expect(g.crystallizationReadiness).toBeGreaterThanOrEqual(0.6);
    expect(l.crystallizationReadiness).toBeLessThan(0.6); // sandbox said no, whatever the sender claimed
  });
});

describe('dream_candidates remote task', () => {
  it('is a CPU job on a stable kernel, reads secrets via Kaggle Secrets, and never ships a key', () => {
    const job = buildRemoteJob('dream_candidates', { domains: ['math', 'coding'], perDomain: 2 })!;
    expect(job.hardware).toEqual({ type: 'cpu' });
    expect(job.meta?.kernelSlug).toBe('recourse-dream-candidates');
    const src = JSON.stringify(job.payload);
    expect(src).toContain('kaggle_secrets');
    expect(src).not.toMatch(/sk-[A-Za-z0-9]/);
  });
  it('forge_precompute and train_small_model no longer burn GPU quota by default', () => {
    expect(buildRemoteJob('forge_precompute', { specs: [{ name: 'a', prompt: 'b' }] })!.hardware).toEqual({ type: 'cpu' });
    expect(buildRemoteJob('train_small_model', { rows: [[1], [2]], target: [1, 2] })!.hardware).toEqual({ type: 'cpu' });
  });
  it('rejects an empty domain list; clamps perDomain', () => {
    expect(buildRemoteJob('dream_candidates', { domains: [] })).toBeNull();
    expect(buildDreamCandidatesNotebook({ domains: ['math'], perDomain: 99 }).notebook.cells[0].source).toContain('perDomain\\":4');
  });

  it('end to end through drain: parsed envelope → applier → local ingest (sender untrusted)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
    process.env.REMOTE_COMPUTE_FILE = path.join(dir, 'rc.json');
    clearRemoteAppliers();
    const engine = new DreamingEngine(new InMemoryDreamStore(), 7);
    await engine.status();
    registerRemoteComputeAppliers({ ingestDreamCandidates: (c) => engine.ingestExternalCandidates(c as never, 'kaggle_dream') });
    const envelope = {
      ok: true,
      thoughts: [
        { domain: 'math', premise: 'p', hypothesis: 'square a number exactly', sourceCode: 'export function sq(x) { return x * x; }', testSuiteCode: 'assert sq(3) === 9;' },
        { domain: 'math', premise: 'p', hypothesis: 'bogus entry with no code', sourceCode: 'x', testSuiteCode: '' },
      ],
    };
    const client: UnifiedComputeClient = {
      async submit(j: ComputeJob) { return { id: j.id, platform: 'kaggle', externalId: j.id, submittedAt: Date.now(), status: 'running' } as ComputeJobHandle; },
      async submitTo(p, j: ComputeJob) { return { id: j.id, platform: p, externalId: j.id, submittedAt: Date.now(), status: 'running' } as ComputeJobHandle; },
      async poll(h) { return { handle: h, state: 'completed' }; },
      async await(h) { return { handle: h, success: true, stdout: `noise\n__RECOURSE_RESULT__${JSON.stringify(envelope)}\n`, stderr: '', durationMs: 5 }; },
      async cancel() { return true; },
      status() { return []; },
    };
    const q = await enqueueRemoteTask('dream_candidates', { domains: ['math'], perDomain: 2 }, { platform: 'kaggle' }, { client });
    expect(q.queued).toBe(true);
    const summary = await drainRemoteTasks({ client });
    expect(summary.completed).toHaveLength(1);
    expect(summary.applied).toBe(1);
    const s = await engine.status();
    expect(s.recentThoughts.map((t) => t.hypothesis)).toContain('square a number exactly');
    expect(s.recentThoughts.map((t) => t.hypothesis)).not.toContain('bogus entry with no code');
    delete process.env.REMOTE_COMPUTE_FILE;
    clearRemoteAppliers();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
