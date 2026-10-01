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
  // Structural equality (key-order independent — JSON.stringify compared
  // {a:1,b:2} and {b:2,a:1} as different). `strict` uses Object.is on leaves.
  'const __deq = function (a, b, strict) { if (strict ? Object.is(a, b) : (a == b)) return true; if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false; if (Array.isArray(a) !== Array.isArray(b)) return false; const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k) || !__deq(a[k], b[k], strict)) return false; } return true; };',
  'assert.deepEqual = function (a, b, m) { if (!__deq(a, b, false)) throw new Error(String(m || "assert.deepEqual failed")); };',
  'assert.deepStrictEqual = function (a, b, m) { if (!__deq(a, b, true)) throw new Error(String(m || "assert.deepStrictEqual failed")); };',
  'assert.notDeepEqual = function (a, b, m) { if (__deq(a, b, false)) throw new Error(String(m || "assert.notDeepEqual failed")); };',
  'assert.notDeepStrictEqual = function (a, b, m) { if (__deq(a, b, true)) throw new Error(String(m || "assert.notDeepStrictEqual failed")); };',
  'assert.throws = function (fn, _e, m) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) throw new Error(String((typeof _e === "string" ? _e : m) || "assert.throws failed")); };',
  'assert.doesNotThrow = function (fn, m) { try { fn(); } catch (e) { throw new Error(String(m || ("assert.doesNotThrow failed: " + (e && e.message)))); } };',
].join('\n');
