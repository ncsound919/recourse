/**
 * Test-DSL `assert` shim for the execution sandbox.
 *
 * Both sandbox paths rewrite top-level `assert ...` statements into `__assert`,
 * which records per-assertion pass/fail. But assertions nested in a loop /
 * function / callback never go through that rewriter — the shim's methods were
 * throw-only, so a suite whose asserts all lived inside a for-loop finished
 * with pass=0 and was reported as failed even when every check actually
 * passed. Every shim call is therefore routed through the runner's `__assert`
 * (when one is in scope) so nested assertions count, then thrown on failure to
 * keep the abort-on-first-failure semantics. Record labels stay neutral (no
 * "failed" suffix) because the same call can record a PASS.
 *
 * This shim is injected into the suite scope (NOT into the statement list, so
 * the "no assertions declared" fallback is unaffected). It is the test DSL, not
 * a fixture: symbols under test must still be defined by the candidate.
 * Strictness matches `__assert` — only `true` passes (assert.ok keeps its
 * truthy semantics, recorded as Boolean(v)).
 */
export const ASSERT_SHIM = [
  'const __rec = typeof __assert === "function" ? __assert : function () {};',
  'const assert = function (cond, msg) { const m = msg == null ? null : String(msg); __rec(cond === true, m || "assert"); if (cond !== true) throw new Error(m || "assertion failed"); };',
  'assert.ok = function (v, m) { const s = m == null ? null : String(m); __rec(Boolean(v), s || "assert.ok"); if (!v) throw new Error(s || "assert.ok failed"); };',
  'assert.equal = function (a, b, m) { const s = m == null ? null : String(m); const ok = a == b; __rec(ok, s || "assert.equal"); if (!ok) throw new Error(s || "assert.equal failed"); };',
  'assert.strictEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = a === b; __rec(ok, s || "assert.strictEqual"); if (!ok) throw new Error(s || "assert.strictEqual failed"); };',
  'assert.notEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = !(a == b); __rec(ok, s || "assert.notEqual"); if (!ok) throw new Error(s || "assert.notEqual failed"); };',
  'assert.notStrictEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = a !== b; __rec(ok, s || "assert.notStrictEqual"); if (!ok) throw new Error(s || "assert.notStrictEqual failed"); };',
  // Structural equality (key-order independent — JSON.stringify compared
  // {a:1,b:2} and {b:2,a:1} as different). `strict` uses Object.is on leaves.
  'const __deq = function (a, b, strict) { if (strict ? Object.is(a, b) : (a == b)) return true; if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false; if (Array.isArray(a) !== Array.isArray(b)) return false; const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k) || !__deq(a[k], b[k], strict)) return false; } return true; };',
  'assert.deepEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = __deq(a, b, false); __rec(ok, s || "assert.deepEqual"); if (!ok) throw new Error(s || "assert.deepEqual failed"); };',
  'assert.deepStrictEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = __deq(a, b, true); __rec(ok, s || "assert.deepStrictEqual"); if (!ok) throw new Error(s || "assert.deepStrictEqual failed"); };',
  'assert.notDeepEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = !__deq(a, b, false); __rec(ok, s || "assert.notDeepEqual"); if (!ok) throw new Error(s || "assert.notDeepEqual failed"); };',
  'assert.notDeepStrictEqual = function (a, b, m) { const s = m == null ? null : String(m); const ok = !__deq(a, b, true); __rec(ok, s || "assert.notDeepStrictEqual"); if (!ok) throw new Error(s || "assert.notDeepStrictEqual failed"); };',
  'assert.throws = function (fn, _e, m) { let threw = false; try { fn(); } catch (e) { threw = true; } const lbl = (m == null ? (typeof _e === "string" ? _e : null) : String(m)) || "assert.throws"; __rec(threw, lbl); if (!threw) throw new Error(String((typeof _e === "string" ? _e : m) || "assert.throws failed")); };',
  'assert.doesNotThrow = function (fn, m) { const s = m == null ? null : String(m); try { fn(); __rec(true, s || "assert.doesNotThrow"); } catch (e) { const label = s || ("assert.doesNotThrow failed: " + (e && e.message)); __rec(false, label); throw new Error(label); } };',
].join('\n');
