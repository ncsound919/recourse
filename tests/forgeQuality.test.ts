import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assessForgeCandidate,
  extractToolDoc,
  hardcodedSuiteLiterals,
  isSubstantivelyClean,
  perturbVectors,
  splitSuiteForHoldout,
  suiteVectors,
} from '../src/lib/forgeQuality';
import { attemptForgeSpec, benchmarkGapSpecs, defaultForgeSystemPrompt } from '../src/lib/capabilityForge';
import type { ForgeSpec } from '../src/lib/capabilityForge';
import { GENERATED_PROBLEMS } from '../src/benchmark/generatedProblems';
import { executeTestSuite } from '../src/lib/executionSandbox';

vi.mock('../src/lib/axiomBridge.js', () => ({
  axiomReachable: vi.fn(async () => false),
  integrateAxiomTool: vi.fn(async () => ({ ok: false, error: 'unused' })),
}));

const GCD_SUITE = [
  'assert gcdPair(48,18) === 6;',
  'assert gcdPair(17,5) === 1;',
  'assert gcdPair(0,12) === 12;',
  'assert gcdPair(100,0) === 100;',
].join('\n');
const GCD_REF = 'export function gcdPair(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }';
const GCD_GOOD =
  '/**\n * Greatest common divisor (Euclid).\n * @param {number} a - first\n * @param {number} b - second\n * @returns {number} gcd\n */\n' +
  'export function gcdPair(a, b) { let x = a, y = b; while (y) { const t = x % y; x = y; y = t; } return x; }';
// Passes the 4-assert suite by special-casing its inputs.
const GCD_OVERFIT =
  'export function gcdPair(a, b) { if (a === 48 && b === 18) return 6; if (a === 17 && b === 5) return 1; if (b === 0) return a; if (a === 0) return b; return 1; }';

describe('suite analysis', () => {
  it('extracts JSON-safe argument vectors from the suite', () => {
    expect(suiteVectors(GCD_SUITE, 'gcdPair')).toEqual([[48, 18], [17, 5], [0, 12], [100, 0]]);
    expect(suiteVectors('assert f("a,b", [1,[2]]) === 1;', 'f')).toEqual([['a,b', [1, [2]]]]);
    expect(suiteVectors("assert f('x') === 1;", 'f')).toEqual([['x']]);
  });

  it('splits simple suites into visible + holdout, keeps complex suites whole', () => {
    const { visible, holdout } = splitSuiteForHoldout(GCD_SUITE);
    expect(holdout.split('\n')).toHaveLength(1);
    expect(visible.split('\n')).toHaveLength(3);
    const setup = 'const c = new X(2);\nassert c.get(1) === -1;\nassert 1;\nassert 2;';
    expect(splitSuiteForHoldout(setup)).toEqual({ visible: setup, holdout: '' });
  });

  it('perturbs inputs deterministically without negatives unless seeded', () => {
    const a = perturbVectors([[3, 4]], 50);
    const b = perturbVectors([[3, 4]], 50);
    expect(a).toEqual(b);
    expect(a.flat().every((x) => (x as number) >= 0)).toBe(true);
    expect(perturbVectors([[[1, 2, 3]]], 50)).toContainEqual([[]]);
  });

  it('detects special-cased suite literals', () => {
    expect(hardcodedSuiteLiterals(GCD_OVERFIT, GCD_SUITE, 'gcdPair').length).toBeGreaterThanOrEqual(2);
    expect(hardcodedSuiteLiterals(GCD_GOOD, GCD_SUITE, 'gcdPair')).toEqual([]);
  });

  it('parses JSDoc into a tool description', () => {
    const doc = extractToolDoc(GCD_GOOD, 'gcdPair');
    expect(doc.summary).toBe('Greatest common divisor (Euclid).');
    expect(doc.params.map((p) => p.name)).toEqual(['a', 'b']);
    expect(doc.params[0].type).toBe('number');
    expect(doc.returns?.type).toBe('number');
  });
});

describe('assessForgeCandidate', () => {
  it('scores a correct, documented implementation as clean', () => {
    const r = assessForgeCandidate({ name: 'gcdPair', refSuite: GCD_SUITE, reference: GCD_REF }, GCD_GOOD);
    expect(r.gate.ok).toBe(true);
    expect(isSubstantivelyClean(r)).toBe(true);
    expect(r.differential!.checked).toBeGreaterThan(4);
    expect(r.differential!.agreed).toBe(r.differential!.checked);
    expect(r.score).toBeGreaterThan(0.9);
  });

  it('rejects an overfit implementation that still passes the suite', () => {
    expect(executeTestSuite(GCD_OVERFIT, GCD_SUITE).passed).toBe(true);
    const r = assessForgeCandidate({ name: 'gcdPair', refSuite: GCD_SUITE, reference: GCD_REF }, GCD_OVERFIT);
    expect(r.gate.ok).toBe(false);
    expect(r.gate.reasons.join(' ')).toMatch(/special-cases suite inputs|disagrees with the reference/);
  });

  it('flags input mutation and nondeterminism', () => {
    const suite = 'assert JSON.stringify(sortNums([3,1,2])) === "[1,2,3]";';
    const mutating = 'export function sortNums(a) { return a.sort((x, y) => x - y); }';
    const r1 = assessForgeCandidate({ name: 'sortNums', refSuite: suite }, mutating);
    expect(r1.robustness!.mutatesInput).toBe(true);
    expect(r1.gate.ok).toBe(false);
    expect(r1.gate.reasons.join(' ')).toMatch(/mutates the caller/);
    expect(isSubstantivelyClean(r1)).toBe(false);

    const random = 'export function sortNums(a) { const c = [...a].sort((x, y) => x - y); if (Math.random() > 2) c.push(0); return c; }';
    const r2 = assessForgeCandidate({ name: 'sortNums', refSuite: suite }, random);
    expect(r2.gate.ok).toBe(false);
    expect(r2.static.nondeterministicApis).toContain('Math.random');
  });

  it('rejects a candidate that special-cases even one suite literal', () => {
    const suite = 'assert pick(7) === 1;';
    const oneLiteral = 'export function pick(x) { if (x === 7) return 1; return 0; }';
    const r = assessForgeCandidate({ name: 'pick', refSuite: suite }, oneLiteral);
    expect(r.static.hardcodedSuiteLiterals).toContain('7');
    expect(r.gate.ok).toBe(false);
    expect(r.gate.reasons.join(' ')).toMatch(/special-cases suite inputs/);
  });

  it('never scores a throwing reference oracle as agreement', () => {
    const suite = 'assert f(2) === 4;';
    const brokenRef = 'export function f(x) { throw new Error("reference is broken"); }';
    const candidate = 'export function f(x) { return x * x; }';
    const r = assessForgeCandidate({ name: 'f', refSuite: suite, reference: brokenRef }, candidate);
    // The throwing reference must not be counted as a passing comparison.
    expect(r.differential?.agreed ?? 0).toBe(0);
  });

  it('refuses a candidate with no behavioral evidence at all', () => {
    // Unquoted object key is not JSON-safe → no seeds, and there is no reference.
    const suite = 'assert f({ a: 1 }) === 1;';
    const candidate = 'export function f(o) { return o.a; }';
    const r = assessForgeCandidate({ name: 'f', refSuite: suite }, candidate);
    expect(r.gate.ok).toBe(false);
    expect(r.gate.reasons.join(' ')).toMatch(/no behavioral verification/);
  });
});

describe('generated benchmark references', () => {
  it('every template reference passes its own hidden suite', () => {
    for (const p of GENERATED_PROBLEMS) {
      expect(p.referenceSource, p.id).toBeTruthy();
      expect(executeTestSuite(p.referenceSource!, p.hiddenSuite).passed, p.id).toBe(true);
    }
  });

  it('benchmark gap specs carry the reference oracle', () => {
    const specs = benchmarkGapSpecs({ solvedIds: [] });
    expect(specs.length).toBe(GENERATED_PROBLEMS.length);
    expect(specs.every((s) => s.reference && Array.isArray(s.vectors))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// attemptForgeSpec best-of-N selection (model boundary stubbed via fetch)
// ---------------------------------------------------------------------------
const ORIG = { ...process.env };
let replies: string[] = [];
let prompts: string[] = [];
function fetchImpl(url: any, init?: any): Promise<Response> {
  const u = String(url);
  if (u.endsWith('/models')) return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
  if (u.endsWith('/chat/completions')) {
    const body = JSON.parse(init?.body ?? '{}');
    prompts.push(body.messages?.map((m: any) => m.content).join('\n---\n') ?? '');
    const content = replies.length > 1 ? replies.shift()! : replies[0];
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return Promise.resolve(new Response('{}', { status: 200 }));
}

describe('attemptForgeSpec quality selection', () => {
  const spec: ForgeSpec = {
    id: 'q_gcd', name: 'gcdPair', domain: 'math', title: 'gcd', prompt: 'gcd of two non-negative ints', refSuite: GCD_SUITE, reference: GCD_REF,
  };
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchImpl as unknown as typeof fetch);
    process.env.API_MODEL_BASE_URL = 'https://forge.test/v1';
    process.env.API_MODEL_NAME = 'forge-model';
    delete process.env.FORGE_MODEL_BASE_URL;
    delete process.env.LOCAL_MODEL_BASE_URL;
    delete process.env.MODEL_BASE_URL;
    prompts = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIG };
  });

  it('does not promote an overfit first candidate; promotes the clean retry', async () => {
    replies = [GCD_OVERFIT, GCD_GOOD];
    const out = await attemptForgeSpec(spec, 1);
    expect(out.ok).toBe(true);
    expect(out.source).toBe(GCD_GOOD);
    expect(out.attemptsUsed).toBe(2); // budget 1 + one quality-repair sample
    expect(out.candidatesPassed).toBe(2);
    expect(prompts[1]).toMatch(/Quality gate/);
    expect(out.doc?.summary).toMatch(/Greatest common divisor/);
  });

  it('reports reason "quality" when only overfit candidates pass the suite', async () => {
    replies = [GCD_OVERFIT];
    const out = await attemptForgeSpec(spec, 1);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('quality');
    expect(out.quality?.gate.ok).toBe(false);
  });

  it('stops after one sample when the first candidate is clean', async () => {
    replies = [GCD_GOOD];
    const out = await attemptForgeSpec(spec, 3);
    expect(out.ok).toBe(true);
    expect(out.attemptsUsed).toBe(1);
  });

  it('never reveals holdout assertions in retry feedback', async () => {
    const wrong = 'export function gcdPair(a, b) { return a; }';
    replies = [wrong, GCD_GOOD];
    await attemptForgeSpec(spec, 2);
    const { holdout } = splitSuiteForHoldout(GCD_SUITE);
    expect(prompts[1]).not.toContain(holdout.trim());
  });

  it('asks for documented, pure code in the default prompt', () => {
    const p = defaultForgeSystemPrompt('gcdPair');
    expect(p).toMatch(/JSDoc/);
    expect(p).toMatch(/Never mutate the arguments/);
  });
});
