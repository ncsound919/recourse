import { describe, expect, it } from 'vitest';
import {
  BIOTECH_LEGS,
  BIOTECH_TIERS,
  BASELINE_KG_ASSETS,
  verifyCodingCode,
  verifySystemicCode,
  verifyMathCode,
  verifyBiotechClaim,
  verifyNeuroSymbolicCode,
  verifyCyberDefenseCode,
  verifyQuantumSimCode,
  diagnoseAndRepairCode,
} from '../src/lib/verifiers';
import { CANONICAL_ONCOLOGY_KG } from '../src/lib/biotechKnowledgeGraph';
import { sha256Sync } from '../src/lib/cyberDefenseEngine';

const SUM_OF_ROOTS_SRC = 'export function sumOfRoots(a, b, c) { return -b / a; }';

describe('BIOTECH constants', () => {
  it('exposes the four canonical legs and six evidence tiers', () => {
    expect(Object.keys(BIOTECH_LEGS)).toEqual(['debulking', 'blocking', 'resistance', 'cleanup']);
    expect(Object.keys(BIOTECH_TIERS).map(Number)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('aliases the canonical oncology knowledge graph', () => {
    expect(BASELINE_KG_ASSETS).toBe(CANONICAL_ONCOLOGY_KG);
    expect(Object.keys(BASELINE_KG_ASSETS).length).toBe(7);
  });
});

describe('verifyCodingCode / verifySystemicCode', () => {
  it('passes when the real assertions execute green in the sandbox', () => {
    const res = verifyCodingCode(
      'export function double(x) { return x * 2; }',
      'assert double(2) === 4; assert double(0) === 0;'
    );
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.summary).toMatch(/^PASSED \(100% of \d+ assertions executed green in /);
    expect(res.details[0]).toMatch(/^\[SANDBOX\] Evaluated in isolated sandbox \(\d/);
    expect(res.details).toContain('[PASS] assert double(2) === 4');
    expect(res.details).toContain('[PASS] assert double(0) === 0');
  });

  it('reports the failing assertion percentage honestly', () => {
    const res = verifyCodingCode('export function double(x) { return x * 3; }', 'assert double(2) === 4;');
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('FAILED (100% assertions failed)');
    expect(res.detectedFault).toBe('logic_regression');
    expect(res.suggestedPatch).toBe('Fix logical branching or incorrect return values');
    expect(res.details).toContain('[FAIL] assert double(2) === 4 -> returned false');
  });

  it('rejects empty source before sandboxing', () => {
    const res = verifyCodingCode('', 'assert true;');
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('FAILED (Empty Source Code)');
    expect(res.details).toEqual(['Source code cannot be empty.']);
    expect(res.score).toBe(0.0);
    expect(res.detectedFault).toBe('syntax_ast_error');
    expect(res.suggestedPatch).toBe('Provide valid executable function entrypoint');
  });

  it('rejects whitespace-only source as empty', () => {
    const res = verifyCodingCode('   \n\t ', 'assert true;');
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('FAILED (Empty Source Code)');
  });

  it('surfaces captured stdout in details and result when the source logs', () => {
    const res = verifyCodingCode(
      "export function double(x) { return x * 2; }\nconsole.log('greetings');",
      'assert double(2) === 4;'
    );
    expect(res.passed).toBe(true);
    expect(res.details).toContain('[STDOUT] greetings');
    expect(res.stdout).toBe('greetings');
  });

  it('falls back to the default stdout message when the passing source is silent', () => {
    const res = verifySystemicCode('export function ping() { return 1; }', 'assert ping() === 1;');
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.stdout).toMatch(/^All test cases passed in \d/);
  });

  it('defaults an empty test suite to a trivial passing assertion', () => {
    const res = verifyCodingCode('export function double(x) { return x * 2; }', '');
    expect(res.passed).toBe(true);
  });
});

describe('verifyMathCode', () => {
  it('passes real Vieta root-sum evaluations across test cases', () => {
    const res = verifyMathCode(SUM_OF_ROOTS_SRC, 'sumOfRoots', [
      { args: [1, -5, 6], expected: 5 },
      { args: [2, 8, -10], expected: -4 },
    ]);
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.summary).toBe('PASSED (Algebraic Vieta & Numeric Identity Verified)');
    expect(res.details).toContain('[PASS] sumOfRoots(1, -5, 6) = 5 (expected: 5, Δ=0.00e+0)');
    expect(res.details).toContain('[PASS] sumOfRoots(2, 8, -10) = -4 (expected: -4, Δ=0.00e+0)');
    expect(res.details).toContain('✓ Vieta algebraic theorem r₁ + r₂ = -b/a verified on test polynomials');
  });

  it('flags the Vieta sign inversion bug (+b/a) as a hard failure', () => {
    const res = verifyMathCode('export function sumOfRoots(a, b, c) { return b / a; }', 'sumOfRoots', [
      { args: [2, 8, -10], expected: -4 },
    ]);
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('FAILED (Vieta Sign Inversion Bug)');
    expect(res.detectedFault).toBe('vieta_sign_bug');
    expect(res.suggestedPatch).toBe('Return -b / a to satisfy the Vieta root sum algebraic identity');
    expect(res.details).toContain('[FAIL] Vieta formula returned positive b/a (-5) instead of -b/a (5.0)');
  });

  it('reports a numeric mismatch with the fixed-point delta', () => {
    const res = verifyMathCode(SUM_OF_ROOTS_SRC, 'sumOfRoots', [{ args: [1, -5, 6], expected: 4 }]);
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('FAILED (1 test cases failed)');
    expect(res.details).toContain('[FAIL] sumOfRoots(1, -5, 6) = 5 (expected: 4, Δ=1.0000)');
  });

  it('counts an executing crash as a failed test case', () => {
    const res = verifyMathCode('export function add(a, b) { return a + b; }', 'missingFn', [
      { args: [1, 2], expected: 3 },
    ]);
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('FAILED (1 test cases failed)');
    expect(res.details[0]).toContain('[FAIL] missingFn(1, 2) execution crashed:');
  });

  it('records symbolic equivalence details when requested', () => {
    const res = verifyMathCode(
      'export function polyRoots(a, b, c) { return -b / a; }',
      'polyRoots',
      [{ args: [1, -5, 6], expected: 5 }],
      { candidate: '(a+b)^2', reference: 'a^2+2ab+b^2', vars: ['a', 'b'] }
    );
    expect(res.passed).toBe(true);
    expect(res.details).toContain('✓ Symbolic equivalence: (a+b)^2 == a^2+2ab+b^2');
    expect(res.details).toContain('✓ Algebraic simplify(diff) == 0 verified across vars [a, b]');
  });

  it('returns score 1.0 but not passed when there are zero test cases', () => {
    const res = verifyMathCode('export function add(a, b) { return a + b; }', 'add', []);
    expect(res.passed).toBe(false);
    expect(res.score).toBe(1.0);
    expect(res.summary).toBe('FAILED (0 test cases failed)');
  });

  it('rejects empty math source', () => {
    const res = verifyMathCode('', 'sumOfRoots', [{ args: [1, -5, 6], expected: 5 }]);
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('FAILED (Empty Math Source)');
    expect(res.details).toEqual(['Source code is empty.']);
    expect(res.score).toBe(0.0);
  });

  it('crashes honestly when funcName is omitted (lowercased directly, not defaulted)', () => {
    expect(() =>
      verifyMathCode(SUM_OF_ROOTS_SRC, undefined as unknown as string, [{ args: [1, -5, 6], expected: 5 }])
    ).toThrow(TypeError);
  });
});

describe('verifyBiotechClaim', () => {
  const base = {
    asset_name: 'sotorasib',
    mechanism: 'Covalent irreversible binding to switch II pocket of GDP-bound KRAS G12C',
    leg: 'debulking' as const,
    evidence_tier: 5,
    source: 'Skoulidis F, et al. N Engl J Med 2021; 384:2371-2381.',
  };

  it('passes a canonical-leg, tier-5, cited claim with score 1.0', () => {
    const res = verifyBiotechClaim(base);
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.summary).toContain('PASSED (consistency): declared Tier 5');
    expect(res.details).toContain("✓ Biological leg 'debulking' verified within 4-leg oncology framework");
  });

  it('rejects an invalid biological leg', () => {
    const res = verifyBiotechClaim({ ...base, leg: 'proliferation' as never });
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe("REJECTED: Invalid biological leg 'proliferation'");
  });

  it('rejects an out-of-range evidence tier', () => {
    const res = verifyBiotechClaim({ ...base, evidence_tier: 7 });
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('REJECTED: Invalid evidence tier 7');
  });

  it('rejects an unsourced claim', () => {
    const res = verifyBiotechClaim({ ...base, source: 'ab' });
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('REJECTED: Unsourced biomedical assertion');
  });

  it('rejects a leg conflict with the clinical knowledge graph', () => {
    const res = verifyBiotechClaim({ ...base, leg: 'blocking' });
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('REJECTED: Leg Conflict with Clinical Knowledge Graph');
  });

  it('provisions a novel frontier candidate with tier held below the Phase 1 floor', () => {
    const res = verifyBiotechClaim({
      asset_name: 'NOVEL_KINASE_9',
      mechanism: 'Hypothetical target',
      leg: 'cleanup',
      evidence_tier: 1,
      source: 'AACR 2024 Abstract #0001',
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toContain('HELD: Tier 1 is below the Phase 1 safety floor');
    expect(res.details).toContain("ℹ Frontier candidate 'NOVEL_KINASE_9' is novel; provisioned for preliminary safety queue");
  });
});

describe('verifyNeuroSymbolicCode', () => {
  it('derives the full Horn-chain fixed point and vector grounding', () => {
    const res = verifyNeuroSymbolicCode(
      'export function classify(x) { return x > 0 ? 1 : 0; }',
      'assert classify(5) === 1;'
    );
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.summary).toMatch(/^PASSED \(/);
    expect(res.details[0]).toBe('✓ Horn clause theorem prover derived 8 true facts in 2 saturation cycles');
    expect(res.details[1]).toBe(
      '✓ Deductive path: oncogene_active&kras_mutant -> hyper_proliferation | hyper_proliferation -> tumor_growth | tumor_growth&mdsc_infiltrate -> immune_cold_state | immune_cold_state&ep4_antagonist -> t_cell_activation'
    );
    expect(res.details[2]).toBe('✓ Semantic vector grounding cosine similarity: 0.9992 (distance: 0.0008)');
    expect(res.details).toContain('[PASS] assert classify(5) === 1');
  });

  it('fails when the submitted assertions do not hold even though Horn/vector pass', () => {
    const res = verifyNeuroSymbolicCode(
      'export function classify(x) { return x > 0 ? 1 : 0; }',
      'assert classify(5) === 0;'
    );
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('FAILED (Horn/vector benchmark OK, but 100% of submitted assertions failed)');
    expect(res.score).toBe(0.0);
  });

  it('rejects empty neuro-symbolic source', () => {
    const res = verifyNeuroSymbolicCode('', 'assert true;');
    expect(res.passed).toBe(false);
    expect(res.summary).toBe('FAILED (Empty Neuro-Symbolic Source)');
    expect(res.score).toBe(0.0);
  });

  it('defaults an empty test suite to a passing assertion after the Horn/vector benchmark', () => {
    const res = verifyNeuroSymbolicCode('export function classify(x) { return x > 0 ? 1 : 0; }', '');
    expect(res.passed).toBe(true);
    expect(res.details[0]).toBe('✓ Horn clause theorem prover derived 8 true facts in 2 saturation cycles');
  });
});

describe('verifyCyberDefenseCode', () => {
  const clean = 'export function double(x) { return x * 2; }';

  it('passes a clean AST audit with timing-safe and SHA-256 integrity checks', () => {
    const res = verifyCyberDefenseCode(clean, 'assert double(2) === 4;');
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.summary).toMatch(/^PASSED \(/);
    expect(res.details[0]).toBe('✓ Static AST security scan: zero dynamic eval, prototype pollution, or memory injection vectors');
    expect(res.details[1]).toBe('✓ Constant-time bitwise timing-attack resistance verified (Match)');
    const expectedHashPrefix = sha256Sync('recourse_cryptographic_root_test').slice(0, 16);
    expect(res.details).toContain(`✓ Deterministic SHA-256 cryptographic entropy validated: ${expectedHashPrefix}...`);
  });

  it('blocks source containing dynamic eval with a security taint', () => {
    const res = verifyCyberDefenseCode('export function evil(x) { return eval(x); }', 'assert evil(1) === 1;');
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('FAILED (Security Taint: DYNAMIC_EVAL_INJECTION)');
    expect(res.detectedFault).toBe('security_taint');
    expect(res.suggestedPatch).toBe('Eliminate dynamic eval() and dangerous reflection constructors');
    expect(res.details[0]).toBe('[CRITICAL SECURITY DEFECT] Unsafe dynamic eval() statement detected allowing arbitrary execution vectors');
    expect(res.details).toContain('• [CRITICAL] DYNAMIC_EVAL_INJECTION: Unsafe dynamic eval() statement detected allowing arbitrary execution vectors');
  });

  it('fails when a clean AST audit still has failing assertions', () => {
    const res = verifyCyberDefenseCode(clean, 'assert double(2) === 5;');
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('FAILED (100% of submitted assertions failed)');
  });

  it('defaults an empty test suite to a passing assertion after the AST audit', () => {
    const res = verifyCyberDefenseCode(clean, '');
    expect(res.passed).toBe(true);
    expect(res.details[0]).toBe('✓ Static AST security scan: zero dynamic eval, prototype pollution, or memory injection vectors');
  });
});

describe('verifyQuantumSimCode', () => {
  it('verifies the Bell state norm, entanglement entropy, and basis probabilities', () => {
    const res = verifyQuantumSimCode('export function bell() { return 42; }', 'assert bell() === 42;');
    expect(res.passed).toBe(true);
    expect(res.score).toBe(1.0);
    expect(res.summary).toMatch(/^PASSED \(/);
    expect(res.details[0]).toBe('✓ Quantum state vector L2 normalization: ||ψ|| = 1.000000 (exact 1.000000)');
    expect(res.details[1]).toBe('✓ Bell state (|00⟩ + |11⟩)/√2 Von Neumann entanglement entropy: 1.0000 bits (maximal entanglement: true)');
    expect(res.details[2]).toBe('✓ Basis state probabilities: P(|00⟩)=0.500, P(|01⟩)=0.000, P(|10⟩)=0.000, P(|11⟩)=0.500');
    expect(res.details).toContain('[PASS] assert bell() === 42');
  });

  it('fails when the submitted assertions fail inside the Bell context', () => {
    const res = verifyQuantumSimCode('export function bell() { return 42; }', 'assert bell() === 1;');
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0.0);
    expect(res.summary).toBe('FAILED (100% of submitted assertions failed)');
  });

  it('defaults an empty test suite to a passing assertion in the Bell context', () => {
    const res = verifyQuantumSimCode('export function bell() { return 42; }', '');
    expect(res.passed).toBe(true);
    expect(res.details[0]).toBe('✓ Quantum state vector L2 normalization: ||ψ|| = 1.000000 (exact 1.000000)');
  });
});

describe('diagnoseAndRepairCode', () => {
  it('repairs the Vieta sign bug by restoring the -b/a sign', () => {
    const res = diagnoseAndRepairCode('math', 'export function sumOfRoots(a, b, c) { return b / a; }');
    expect(res.repairedCode).toBe('export function sumOfRoots(a, b, c) { return -b / a; }');
    expect(res.rootCause).toBe('Vieta quadratic root sum formula returned +b/a instead of algebraically correct -b/a');
    expect(res.errorType).toBe('vieta_sign_bug');
    expect(res.templateApplied).toBe('tpl_newton_raphson');
    expect(res.confidence).toBe(1.0);
    expect(res.patchSummary).toBe('Restored unary negative sign to Vieta formula (-b/a) and verified symbolic equality');
    expect(res.preventativeMeasures).toEqual(['Verified algebraic identity (-b/a)', 'Added zero-division constraint check on coefficient a']);
  });

  it('regenerates the Vieta function from template when the code has no return to patch', () => {
    const res = diagnoseAndRepairCode('math', 'function nothing() { return 0; }', 'vieta_sign_bug');
    expect(res.errorType).toBe('vieta_sign_bug');
    expect(res.templateApplied).toBe('tpl_newton_raphson');
    expect(res.confidence).toBe(1.0);
    expect(res.repairedCode).toContain('return -b / a; // Repaired: algebraic Vieta root sum identity');
  });

  it('injects an epsilon floor for division by zero', () => {
    const res = diagnoseAndRepairCode('math', 'export function f(x) { return x / 0; }');
    expect(res.repairedCode).toBe('export function f(x) { return x / 1e-7 /* Repaired: epsilon guard */; }');
    expect(res.errorType).toBe('division_by_zero');
    expect(res.templateApplied).toBe('tpl_newton_raphson');
    expect(res.confidence).toBe(0.99);
  });

  it('guards a literal denominator = 0 assignment', () => {
    const res = diagnoseAndRepairCode('math', 'denominator = 0;');
    expect(res.repairedCode).toBe('denominator = 1e-7;');
    expect(res.errorType).toBe('division_by_zero');
  });

  it('tolerates an undefined domain via the math fallback for division-by-zero', () => {
    const res = diagnoseAndRepairCode(undefined as unknown as string, 'export function f(x) { return x / 0; }');
    expect(res.errorType).toBe('division_by_zero');
    expect(res.templateApplied).toBe('tpl_newton_raphson');
    expect(res.confidence).toBe(0.99);
  });

  it('repairs an off-by-one <= arr.length loop condition', () => {
    const res = diagnoseAndRepairCode('coding', 'for (let i = 0; i <= arr.length; i++) { }');
    expect(res.repairedCode).toBe('for (let i = 0; i < arr.length; i++) { }');
    expect(res.errorType).toBe('boundary_off_by_one');
    expect(res.rootCause).toBe('Array index off-by-one condition (<= length) causing undefined dereference');
    expect(res.confidence).toBe(0.98);
    expect(res.templateApplied).toBeUndefined();
  });

  it('honors the boundary fault hint even when no .length comparison exists', () => {
    const res = diagnoseAndRepairCode('coding', 'for (let i = 0; i < len; i++) {}', 'boundary_off_by_one');
    expect(res.errorType).toBe('boundary_off_by_one');
    expect(res.repairedCode).toBe('for (let i = 0; i < len; i++) {}');
  });

  it('tolerates an undefined domain via the coding fallback for off-by-one', () => {
    const res = diagnoseAndRepairCode(undefined as unknown as string, 'for (let i = 0; i <= arr.length; i++) { }');
    expect(res.errorType).toBe('boundary_off_by_one');
    expect(res.confidence).toBe(0.98);
  });

  it('repairs a never-resolving Promise as an async deadlock with the token-bucket template', () => {
    const res = diagnoseAndRepairCode('systemic', 'const p = new Promise(() => {});');
    expect(res.errorType).toBe('async_deadlock');
    expect(res.rootCause).toBe('Deadlock in asynchronous executor: Promise never resolves or rejects');
    expect(res.templateApplied).toBe('tpl_token_bucket');
    expect(res.confidence).toBe(0.97);
    expect(res.patchSummary).toBe('Resolved async contention by substituting bounded rate limiter template');
  });

  it('honors the async fault hint even when the Promise resolves', () => {
    const res = diagnoseAndRepairCode('systemic', 'const p = new Promise((resolve) => resolve(1));', 'async_deadlock');
    expect(res.errorType).toBe('async_deadlock');
    expect(res.templateApplied).toBe('tpl_token_bucket');
  });

  it('tolerates an undefined domain via the coding fallback for async deadlock', () => {
    const res = diagnoseAndRepairCode(undefined as unknown as string, 'const p = new Promise(() => {});');
    expect(res.errorType).toBe('async_deadlock');
    expect(res.templateApplied).toBe('tpl_token_bucket');
  });

  it('cleans a corrupted fontFinally token inline when the code is long enough', () => {
    const res = diagnoseAndRepairCode('coding', 'try { run() } fontFinally: { cleanup() }');
    expect(res.repairedCode).toBe('try { run() } finally { cleanup() }');
    expect(res.errorType).toBe('syntax_ast_error');
    expect(res.rootCause).toBe('Corrupted AST token sequence / unclosed block syntax');
    expect(res.patchSummary).toBe('Cleaned invalid token markers and regenerated valid TypeScript AST syntax node');
    expect(res.templateApplied).toBeUndefined();
    expect(res.confidence).toBe(0.95);
  });

  it('renames an anonymous export function to execute()', () => {
    const res = diagnoseAndRepairCode('coding', 'export function () { return 1; }');
    expect(res.repairedCode).toBe('export function execute() { return 1; }');
    expect(res.errorType).toBe('syntax_ast_error');
    expect(res.templateApplied).toBeUndefined();
  });

  it('rebuilds a short corrupted fragment from the LRU template', () => {
    const res = diagnoseAndRepairCode('coding', 'x', 'syntax_ast_error');
    expect(res.errorType).toBe('syntax_ast_error');
    expect(res.templateApplied).toBe('tpl_lru_cache');
    expect(res.confidence).toBe(0.99);
    expect(res.repairedCode.length).toBeGreaterThan(20);
  });

  it('tolerates an undefined domain via the coding fallback for corrupted syntax', () => {
    const res = diagnoseAndRepairCode(undefined as unknown as string, 'x', 'syntax_ast_error');
    expect(res.errorType).toBe('syntax_ast_error');
    expect(res.templateApplied).toBe('tpl_lru_cache');
  });

  it('replaces dynamic eval with JSON.parse under the HMAC sanitizer template', () => {
    const res = diagnoseAndRepairCode('cyber_defense', 'export function f(x) { return eval(x); }');
    expect(res.repairedCode).toBe('export function f(x) { return JSON.parse(x); }');
    expect(res.errorType).toBe('security_taint');
    expect(res.rootCause).toBe('Dynamic eval execution detected violating zero-trust container policy');
    expect(res.templateApplied).toBe('tpl_hmac_sanitizer');
    expect(res.confidence).toBe(1.0);
  });

  it('reconciles an invalid biotech leg and tier with the knowledge graph', () => {
    const res = diagnoseAndRepairCode('biotech', '{"asset": "x", "leg": "invalid", "evidence_tier": 0}');
    expect(res.repairedCode).toBe('{"asset": "x", "leg": "debulking", "evidence_tier": 4}');
    expect(res.errorType).toBe('biotech_kg_conflict');
    expect(res.templateApplied).toBe('tpl_protac_optimizer');
    expect(res.confidence).toBe(0.98);
  });

  it('projects a non-unitary probability sum back to 1.0', () => {
    const res = diagnoseAndRepairCode('quantum_sim', 'probabilities_sum = 1.45');
    expect(res.repairedCode).toBe('probabilities_sum = 1.0');
    expect(res.errorType).toBe('quantum_decoherence');
    expect(res.templateApplied).toBe('tpl_bell_entangler');
    expect(res.confidence).toBe(0.99);
  });

  it('falls back to template synthesis for an unrecognized defect', () => {
    const res = diagnoseAndRepairCode('coding', 'export function identity(x) { return x; }');
    expect(res.errorType).toBe('logic_regression');
    expect(res.rootCause).toBe('Invariant condition failure under high-load stress testing');
    expect(res.templateApplied).toBe('tpl_lru_cache');
    expect(res.confidence).toBe(0.99);
    expect(res.repairedCode.length).toBeGreaterThan(20);
  });

  it('tolerates an undefined domain via the coding fallback for a generic defect', () => {
    const res = diagnoseAndRepairCode(undefined as unknown as string, 'export function identity(x) { return x; }');
    expect(res.errorType).toBe('logic_regression');
    expect(res.templateApplied).toBe('tpl_lru_cache');
  });
});