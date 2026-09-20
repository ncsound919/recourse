/**
 * Test-DSL `assert` shim for the execution sandbox.
 *
 * Both sandbox paths rewrite top-level `assert ...` statements into `__assert`,
 * which records per-assertion pass/fail. But model-written suites sometimes
 * wrap assertions in a function/loop/callback, or use an `assert` form the
 * rewriter did not recognize. Without a real `assert` binding those abort with
 * "assert is not defined" even when the implementation is correct.
 *
 * This shim is injected into the suite scope (NOT into the statement list, so
 * the "no assertions declared" fallback is unaffected). It is the test DSL, not
 * a fixture: symbols under test must still be defined by the candidate.
 * Strictness matches `__assert` — only `true` passes.
 */
export const ASSERT_SHIM = [
  'const assert = function (cond, msg) { if (cond !== true) throw new Error(String(msg || "assertion failed")); };',
  'assert.ok = function (v, m) { if (!v) throw new Error(String(m || "assert.ok failed")); };',
  'assert.equal = function (a, b, m) { if (a != b) throw new Error(String(m || "assert.equal failed")); };',
  'assert.strictEqual = function (a, b, m) { if (a !== b) throw new Error(String(m || "assert.strictEqual failed")); };',
  'assert.notEqual = function (a, b, m) { if (a == b) throw new Error(String(m || "assert.notEqual failed")); };',
  'assert.notStrictEqual = function (a, b, m) { if (a === b) throw new Error(String(m || "assert.notStrictEqual failed")); };',
  'assert.deepEqual = function (a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(String(m || "assert.deepEqual failed")); };',
].join('\n');
