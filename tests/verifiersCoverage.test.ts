import { describe, it, expect } from 'vitest';
import {
  verifyCodingCode,
  verifySystemicCode,
  verifyMathCode,
  verifyBiotechClaim,
  verifyNeuroSymbolicCode,
  verifyCyberDefenseCode,
  verifyQuantumSimCode,
  diagnoseAndRepairCode,
  BIOTECH_LEGS,
  BIOTECH_TIERS,
  BASELINE_KG_ASSETS,
} from '../src/lib/verifiers';

describe('verifiers — shared code-bearing suite verifier', () => {
  it('rejects empty source honestly for coding/systemic', () => {
    for (const fn of [verifyCodingCode, verifySystemicCode]) {
      const r = fn('', 'assert true;');
      expect(r.passed).toBe(false);
      expect(r.summary).toContain('Empty Source');
      expect(r.detectedFault).toBe('syntax_ast_error');
    }
  });

  it('passes real code against a passing suite with captured stdout', () => {
    const r = verifyCodingCode(
      'function foo(){ console.log("hello"); return 1; }',
      'assert foo() === 1;'
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.details.some((d) => d.startsWith('[SANDBOX]'))).toBe(true);
    expect(r.details.some((d) => d.startsWith('[STDOUT]'))).toBe(true);
    expect(r.stdout).toContain('hello');
  });

  it('passes real systemic code and reports stdout', () => {
    const r = verifySystemicCode('function plan(){ return 3; }', 'assert plan() === 3;');
    expect(r.passed).toBe(true);
  });

  it('fails when the suite fails, carrying real failure details', () => {
    const r = verifyCodingCode('function foo(){ return 1; }', 'assert foo() === 2;');
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('FAILED');
    expect(r.detectedFault).toBe('logic_regression');
    expect(r.details.some((d) => d.startsWith('[FAIL]'))).toBe(true);
  });
});

describe('verifiers — math', () => {
  it('rejects empty math source', () => {
    const r = verifyMathCode('', 'sumOfRoots', [{ args: [1, 2, 3], expected: 5 }]);
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Empty Math Source');
  });

  it('counts passing and failing numeric cases with a tolerance', () => {
    const r = verifyMathCode(
      'function add(a, b) { return a + b; }',
      'add',
      [
        { args: [1, 2], expected: 3 },
        { args: [1, 2], expected: 99 },
      ]
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBeCloseTo(0.5);
    expect(r.details.some((d) => d.startsWith('[PASS]'))).toBe(true);
    expect(r.details.some((d) => d.startsWith('[FAIL]'))).toBe(true);
  });

  it('records a crashed case as a failed numeric check', () => {
    const r = verifyMathCode(
      'function crash() { throw new Error("nope"); }',
      'crash',
      [{ args: [1], expected: 1 }]
    );
    expect(r.passed).toBe(false);
    expect(r.details.some((d) => d.startsWith('[FAIL]') && d.includes('crashed'))).toBe(true);
  });

  it('detects a Vieta sign inversion bug (returns +b/a)', () => {
    const r = verifyMathCode(
      'function sumOfRoots(a, b, c) { return b / a; }',
      'sumOfRoots',
      [{ args: [1, -5, 6], expected: 5 }]
    );
    expect(r.passed).toBe(false);
    expect(r.detectedFault).toBe('vieta_sign_bug');
    expect(r.summary).toContain('Vieta Sign Inversion Bug');
  });

  it('accepts a correct Vieta sum and adds symbolic notes', () => {
    const r = verifyMathCode(
      'function sumOfRoots(a, b, c) { return -b / a; }',
      'sumOfRoots',
      [{ args: [1, -5, 6], expected: 5 }],
      { candidate: '-b/a', reference: '-b/a', vars: ['a', 'b', 'c'] }
    );
    expect(r.passed).toBe(true);
    expect(r.details.some((d) => d.includes('Vieta'))).toBe(true);
    expect(r.details.some((d) => d.includes('Symbolic equivalence'))).toBe(true);
  });
});

describe('verifiers — biotech', () => {
  it('rejects an invalid leg', () => {
    const r = verifyBiotechClaim({
      asset_name: 'mystery',
      mechanism: 'x',
      leg: 'nonsense',
      evidence_tier: 3,
      source: 'a peer reviewed source',
    } as any);
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('REJECTED');
  });

  it('passes a known KG asset with a matching leg and tier', () => {
    const r = verifyBiotechClaim({
      asset_name: 'sotorasib',
      mechanism: 'KRAS G12C inhibition',
      leg: 'debulking',
      evidence_tier: 5,
      source: 'Skoulidis F, et al. N Engl J Med 2021',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('holds a known asset below the Phase 1 safety floor', () => {
    const r = verifyBiotechClaim({
      asset_name: 'PT0511',
      mechanism: 'x',
      leg: 'debulking',
      evidence_tier: 1,
      source: 'AACR Annual Meeting 2024 Abstract #3812',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('HELD');
  });
});

describe('verifiers — neuro-symbolic', () => {
  it('rejects empty source', () => {
    const r = verifyNeuroSymbolicCode('', 'assert true;');
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Empty Neuro-Symbolic Source');
  });

  it('passes when Horn saturation + vector grounding + suite all hold', () => {
    const r = verifyNeuroSymbolicCode(
      'function f() { return 1; }',
      'assert f() === 1;'
    );
    expect(r.passed).toBe(true);
    expect(r.details.some((d) => d.includes('Horn clause theorem prover'))).toBe(true);
    expect(r.details.some((d) => d.includes('cosine'))).toBe(true);
  });

  it('fails honestly when the submitted assertions fail', () => {
    const r = verifyNeuroSymbolicCode('function f() { return 1; }', 'assert f() === 2;');
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('FAILED');
  });
});

describe('verifiers — cyber defense', () => {
  it('blocks insecure code containing dynamic eval', () => {
    const r = verifyCyberDefenseCode('function run(p) { return eval(p); }', 'assert true;');
    expect(r.passed).toBe(false);
    expect(r.detectedFault).toBe('security_taint');
    expect(r.summary).toContain('Security Taint');
  });

  it('passes secure code with timing + hash checks and a green suite', () => {
    const r = verifyCyberDefenseCode(
      'function sanitize(b) { return b.map(x => x % 256); }',
      'assert sanitize([1, 300])[1] === 44;'
    );
    expect(r.passed).toBe(true);
    expect(r.details.some((d) => d.includes('Constant-time'))).toBe(true);
    expect(r.details.some((d) => d.includes('SHA-256'))).toBe(true);
  });

  it('fails secure code when its assertions fail', () => {
    const r = verifyCyberDefenseCode('function sanitize(b) { return b; }', 'assert sanitize([1]) === 99;');
    expect(r.passed).toBe(false);
  });
});

describe('verifiers — quantum simulation', () => {
  it('passes with a normalized Bell state and green suite', () => {
    const r = verifyQuantumSimCode('function f() { return 1; }', 'assert f() === 1;');
    expect(r.passed).toBe(true);
    expect(r.details.some((d) => d.includes('Bell state'))).toBe(true);
  });

  it('fails when the submitted assertions fail', () => {
    const r = verifyQuantumSimCode('function f() { return 1; }', 'assert f() === 2;');
    expect(r.passed).toBe(false);
  });
});

describe('verifiers — diagnoseAndRepairCode fault catalog', () => {
  it('repairs a Vieta sign bug and records the experience', () => {
    const r = diagnoseAndRepairCode('math', 'export function sumOfRoots(a,b,c){ return b / a; }');
    expect(r.errorType).toBe('vieta_sign_bug');
    expect(r.repairedCode).toContain('return -b / a');
    expect(r.confidence).toBe(1);
  });

  it('uses the template fallback when the Vieta source cannot be regex-repaired', () => {
    const r = diagnoseAndRepairCode('math', 'export function f(){ return 1; }', 'vieta_sign_bug');
    expect(r.errorType).toBe('vieta_sign_bug');
    expect(r.repairedCode).toContain('sumOfRoots');
  });

  it('repairs a division-by-zero with an epsilon guard', () => {
    const r = diagnoseAndRepairCode('math', 'export function f(x){ const denominator = 0; return x / 0; }');
    expect(r.errorType).toBe('division_by_zero');
    expect(r.repairedCode).toContain('1e-7');
  });

  it('repairs an off-by-one boundary error', () => {
    const r = diagnoseAndRepairCode('coding', 'export function f(arr){ for(let i=0; i <= arr.length; i++){} return 1; }');
    expect(r.errorType).toBe('boundary_off_by_one');
    expect(r.repairedCode).toContain('< arr.length');
  });

  it('repairs an async deadlock via template synthesis', () => {
    const r = diagnoseAndRepairCode('coding', 'export function f(){ return new Promise(() => {}); }');
    expect(r.errorType).toBe('async_deadlock');
    expect(r.templateApplied).toBeDefined();
  });

  it('repairs long syntax corruption by cleaning markers', () => {
    const r = diagnoseAndRepairCode('coding', 'export function f(){ fontFinally: return 1; }');
    expect(r.errorType).toBe('syntax_ast_error');
    expect(r.repairedCode).not.toContain('fontFinally');
  });

  it('repairs short syntax corruption via template synthesis', () => {
    const r = diagnoseAndRepairCode('coding', '<<<SYNTAX_CORRUPT>>>');
    expect(r.errorType).toBe('syntax_ast_error');
    expect(r.repairedCode.length).toBeGreaterThanOrEqual(20);
  });

  it('replaces dynamic eval with a safe parser', () => {
    const r = diagnoseAndRepairCode('cyber_defense', 'export function f(p){ return eval(p); }');
    expect(r.errorType).toBe('security_taint');
    expect(r.repairedCode).not.toContain('eval(');
    expect(r.repairedCode).toContain('JSON.parse');
  });

  it('reconciles a biotech leg conflict', () => {
    const r = diagnoseAndRepairCode('biotech', 'export const x = { "leg": "invalid" };');
    expect(r.errorType).toBe('biotech_kg_conflict');
    expect(r.repairedCode).toContain('"leg": "debulking"');
  });

  it('projects a quantum state back onto the unit norm', () => {
    const r = diagnoseAndRepairCode('quantum_sim', 'export const y = probabilities_sum = 1.45;');
    expect(r.errorType).toBe('quantum_decoherence');
    expect(r.repairedCode).toContain('1.0');
  });

  it('falls back to generic logic-regression repair', () => {
    const r = diagnoseAndRepairCode('coding', 'export function f(){ return 1; }');
    expect(r.errorType).toBe('logic_regression');
    expect(r.templateApplied).toBeDefined();
    expect(r.confidence).toBeGreaterThan(0);
  });
});

describe('verifiers — exported constants', () => {
  it('exposes the biotech leg/tier vocabulary and baseline KG assets', () => {
    expect(BIOTECH_LEGS.debulking).toContain('Debulk');
    expect(BIOTECH_TIERS[5]).toContain('FDA');
    expect(Object.keys(BASELINE_KG_ASSETS)).toContain('sotorasib');
  });
});
