import { describe, it, expect } from 'vitest';
import { BENCHMARK_PROBLEMS, runBenchmark, currentToolSource, benchmarkSummary } from '../src/benchmark/benchmark';
import { makeSignal } from '../src/intake/util';
import { classifyDomain, groundSignal, parseGroundedJson } from '../src/intake/grounding';

describe('external benchmark', () => {
  it('problem set is fixed and real (entrypoints + hidden suites present)', () => {
    expect(BENCHMARK_PROBLEMS.length).toBeGreaterThanOrEqual(7);
    for (const p of BENCHMARK_PROBLEMS) {
      expect(p.id).toMatch(/^p_/);
      expect(p.functionName).toBeTruthy();
      expect(p.hiddenSuite).toContain('assert');
    }
  });

  it('scores 0/7 against an empty registry — never fabricates', () => {
    const run = runBenchmark([]);
    expect(run.solved).toBe(0);
    expect(run.total).toBe(BENCHMARK_PROBLEMS.length);
  });

  it('solves problems that a real promoted gene satisfies in the sandbox', () => {
    const fizzGene = {
      name: 'fizzbuzz_solver',
      domain: 'coding' as const,
      entrypoint: 'src/tools/fizzbuzz.ts',
      description: 'x',
      currentVersion: '1.0.0',
      healthStatus: 'healthy' as const,
      versions: [{
        version: '1.0.0',
        hash: 'h1',
        created_at: Date.now(),
        passed_verifier: true,
        score: 1,
        promoted: true,
        source_code: `export function fizzbuzzFast(n) { if (n % 15 === 0) return 'FizzBuzz'; if (n % 3 === 0) return 'Fizz'; if (n % 5 === 0) return 'Buzz'; return String(n); }`,
      }],
    };
    const run = runBenchmark([fizzGene as any]);
    expect(run.solvedIds).toContain('p_fizzbuzz');
    expect(run.solved).toBeGreaterThanOrEqual(1);
  });

  it('currentToolSource returns the promoted live source', () => {
    const src = currentToolSource({
      name: 't', domain: 'coding', entrypoint: '', description: '',
      versions: [
        { version: '1', hash: 'a', created_at: 1, passed_verifier: false, score: 0, promoted: false, source_code: 'old' },
        { version: '2', hash: 'b', created_at: 2, passed_verifier: true, score: 1, promoted: true, source_code: 'live' },
      ],
    } as any);
    expect(src?.source).toBe('live');
  });

  it('benchmarkSummary formats pct without div-by-zero', () => {
    expect(benchmarkSummary(null)).toEqual({ solved: 0, total: BENCHMARK_PROBLEMS.length, pct: 0 });
    const s = benchmarkSummary({ at: 1, solved: 1, total: 4, solvedIds: [] });
    expect(s.pct).toBe(25);
  });
});

describe('grounding', () => {
  it('classifies a cancer paper as biotech', () => {
    const signal = makeSignal('arxiv', 'https://arxiv.org/abs/1', 'Oncogene resistance in lung cancer', 'Tumor drug resistance mechanism', ['cancer']);
    expect(classifyDomain(signal)).toBe('biotech');
  });

  it('classifies a quantum paper as quantum_sim', () => {
    const signal = makeSignal('arxiv', 'https://arxiv.org/abs/2', 'Quantum error correction with qubits', 'Entanglement and decoherence in circuits', ['quantum']);
    expect(classifyDomain(signal)).toBe('quantum_sim');
  });

  it('returns grounded:false + reason when model is offline', async () => {
    const signal = makeSignal('arxiv', 'https://arxiv.org/abs/3', 'Formal verification', 'Proof assistants', ['math']);
    const result = await groundSignal(signal, {
      chatComplete: async () => ({ ok: false, content: null, status: 'offline', model: '', error: 'down', latencyMs: 0 }),
      checkOnline: async () => false,
    });
    expect(result.grounded).toBe(false);
    expect(result.reason).toContain('offline');
  });

  it('grounds a signal into a VERIFIED tool when the model returns good code', async () => {
    const signal = makeSignal('arxiv', 'https://arxiv.org/abs/4', 'Guarded interpolation', 'Interpolation with epsilon guard', ['math']);
    const goodCode = 'export function guardedSum(a,b){ return a + b; }';
    const goodTests = 'assert guardedSum(1,2) === 3;\nassert guardedSum(-1,1) === 0;';
    const result = await groundSignal(signal, {
      chatComplete: async () => ({
        ok: true,
        content: JSON.stringify({ premise: 'p', hypothesis: 'h', sourceCode: goodCode, testSuiteCode: goodTests }),
        status: 'online', model: 'm', latencyMs: 1,
      }),
      checkOnline: async () => true,
    });
    expect(result.grounded).toBe(true);
    expect(result.toolName).toMatch(/^ground_/);
    expect(result.sourceCode).toContain('guardedSum');
    expect(result.verifierNote).toContain('GROUNDED');
  });

  it('rejects grounded code that fails its own suite', async () => {
    const signal = makeSignal('arxiv', 'https://arxiv.org/abs/5', 'x', 'y', []);
    const badCode = 'export function add(a,b){ return a - b; }';
    const badTests = 'assert add(2,2) === 4;';
    const result = await groundSignal(signal, {
      chatComplete: async () => ({
        ok: true,
        content: JSON.stringify({ premise: 'p', hypothesis: 'h', sourceCode: badCode, testSuiteCode: badTests }),
        status: 'online', model: 'm', latencyMs: 1,
      }),
      checkOnline: async () => true,
    });
    expect(result.grounded).toBe(false);
    expect(result.reason).toContain('FAILED');
  });

  it('parseGroundedJson tolerates code fences', () => {
    const parsed = parseGroundedJson('```json\n{"sourceCode":"export function x(){return 1;}", "testSuiteCode":"assert x()===1;"}\n```');
    expect(parsed?.sourceCode).toContain('export function x');
  });
});
