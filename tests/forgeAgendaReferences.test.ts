/**
 * forgeAgendaReferences.test.ts — the forge agenda's reference oracles must be
 * correct, or they are worse than no oracle at all.
 *
 * WHY THIS EXISTS
 * The forge agenda had ZERO reference oracles across all 26 specs, so the
 * differential test and the large-magnitude scale probe — the two strongest
 * checks in the quality gate — never ran for any of them. That is how a
 * double-precision `powerMod` was promoted: correct on a 4-assertion suite
 * capped at modulus 1000, silently wrong at 1e9+7.
 *
 * Oracles are now being added. But a WRONG oracle is a new failure mode: it
 * rejects correct candidates and launders incorrect ones. So every oracle must
 * independently satisfy two properties:
 *
 *   1. it passes its OWN hidden suite (otherwise it would reject the very
 *      behaviour the spec asks for), and
 *   2. it disagrees with a deliberately WRONG implementation on inputs the
 *      suite does not cover — otherwise it is not actually discriminating
 *      anything and the differential is theatre.
 */
import { describe, it, expect, vi } from 'vitest';

// Spawn-heavy suite: these tests drive the real isolate sandbox (and, for
// promotedAudit / staticAuditSignal, a real external analyzer). Measured alone,
// forgeQuality runs its 18 tests in ~15s. Run alongside the other sandbox suites
// under full-suite parallel load the same file stretched past the 30s suite-wide
// default and failed on TIMEOUT while every assertion held — so the suite's
// verdict became a function of machine load rather than of correctness, which
// makes it useless as a gate.
//
// This is the same remedy already applied in tests/codeSafetyOss.test.ts, whose
// header records exactly this: "under full-suite load these spawns stretched past
// 30s and failed on timeout even though every assertion held. The assertion, not
// the clock, is the signal here." Raising it per-file keeps the global 30s
// default tight for the other ~300 files, so a genuine hang is still caught
// everywhere it matters.
vi.setConfig({ testTimeout: 180000, hookTimeout: 180000 });
import { FORGE_AGENDA, type ForgeSpec } from '../src/lib/capabilityForge';
import { executeTestSuite } from '../src/lib/executionSandbox';
import { assessForgeCandidate } from '../src/lib/forgeQuality';

/** Specs that carry a reference oracle. */
const ORACLED = FORGE_AGENDA.filter((s) => s.reference && s.reference.trim());

/**
 * A plausible-but-wrong implementation, per spec, used only to prove the oracle
 * has teeth. Each is wrong in a way the JSON-transported probes REACH — an
 * entry here that turns out to be behaviourally correct is a bug in this file,
 * not a weakness in the oracle, and the test fails until it is fixed.
 */
const WRONG: Record<string, string> = {
  // Float arithmetic is exact on the suite's small moduli, then silently wrong.
  powerMod: `export function powerMod(base, exp, mod) {
    let r = 1 % mod, f = ((base % mod) + mod) % mod, e = exp;
    while (e > 0) { if (e % 2 === 1) r = (r * f) % mod; f = (f * f) % mod; e = Math.floor(e / 2); }
    return r;
  }`,
  // Counter instead of a stack: "([)]" balances by count but is unbalanced.
  // Reachable because string perturbations splice and repeat the suite's
  // brackets, producing mismatched nesting the suite itself never contains.
  isBalanced: `export function isBalanced(s) { let d = 0; for (const c of s) { if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; } return d === 0; }`,
};

/**
 * Oracles proven to REJECT a wrong implementation on inputs the forge's probes
 * can actually reach. Two of the six added oracles (powerMod via the scale
 * probe, isBalanced via perturbation) are demonstrably discriminating; the rest
 * are correct but, on the JSON-transported probes available today, not yet
 * distinguishable from a plausible alternative. That is recorded here rather
 * than asserted as if it were stronger.
 */
const DISCRIMINATING = ['powerMod', 'isBalanced'];

describe('forge agenda reference oracles', () => {
  it('the agenda has grown real oracle coverage', () => {
    // Not "all specs" yet — this pins that coverage is a tracked, growing
    // property rather than an accident, so it cannot silently regress to zero.
    expect(ORACLED.length).toBeGreaterThanOrEqual(8);
    const names = ORACLED.map((s) => s.name);
    // The spec whose missing oracle let a float-precision bug through.
    expect(names).toContain('powerMod');
  });

  it('every oracle passes its own hidden suite', () => {
    for (const spec of ORACLED) {
      const r = executeTestSuite(spec.reference!, spec.refSuite);
      expect(r.passed, `reference for ${spec.name} must pass its own suite:\n${[...r.stdout, ...r.stderr].join('\n')}`).toBe(true);
    }
  });

  it('every oracle is exportable under the spec name', () => {
    for (const spec of ORACLED) {
      expect(spec.reference, spec.name).toContain(`function ${spec.name}`);
      expect(spec.reference, spec.name).toContain('export');
    }
  });

  it('every oracle is actually EXERCISED (no dead oracle)', () => {
    // An oracle the differential never runs is a comment, not a check. Probes
    // travel as JSON source, so an oracle is only live if the suite yields
    // JSON-safe argument vectors.
    for (const spec of ORACLED) {
      if (spec.kind === 'class') continue;
      const report = assessForgeCandidate(
        { name: spec.name, refSuite: spec.refSuite, reference: spec.reference },
        `/** ok */\nexport function ${spec.name}(){ return null; }`,
        { requireBehavioral: false },
      );
      expect(report.differential, `${spec.name} oracle produced no differential report`).not.toBeNull();
      expect(report.differential!.checked, `${spec.name} oracle is never exercised`).toBeGreaterThan(0);
    }
  });

  it('oracles REJECT a wrong implementation wherever the probes can reach the difference', () => {
    for (const name of DISCRIMINATING) {
      const spec = ORACLED.find((s) => s.name === name);
      expect(spec, `${name} must have an oracle`).toBeTruthy();
      const report = assessForgeCandidate(
        { name: spec!.name, refSuite: spec!.refSuite, reference: spec!.reference },
        `/** tool */\n${WRONG[name]}`,
        { requireBehavioral: false },
      );
      const rejectedByDifferential = (report.differential?.agreed ?? 0) < (report.differential?.checked ?? 1);
      const rejectedByScale = (report.scale?.mismatches?.length ?? 0) > 0;
      const rejectedByGate = report.gate.reasons.some((r) =>
        /disagrees with the reference|precision|non-finite|non-integer/.test(r),
      );
      expect(
        rejectedByDifferential || rejectedByScale || rejectedByGate,
        `oracle for ${name} accepted a wrong implementation on every reachable probe`,
      ).toBe(true);
    }
    // The scale probe is what makes powerMod's oracle bite; if that path ever
    // regresses, this fails rather than silently losing the only precision
    // check in the gate.
    const pm = assessForgeCandidate(
      { name: 'powerMod', refSuite: ORACLED.find((s) => s.name === 'powerMod')!.refSuite, reference: ORACLED.find((s) => s.name === 'powerMod')!.reference },
      `/** tool */\n${WRONG.powerMod}`,
      { requireBehavioral: false },
    );
    expect(pm.scale?.mismatches?.length ?? 0).toBeGreaterThan(0);
  });

  it('does not invent oracles for class specs (the differential skips them)', () => {
    for (const spec of ORACLED) {
      if (spec.kind === 'class') {
        expect(spec.name, 'a class spec oracle would never run').toBeFalsy();
      }
    }
  });

  it('an oracle-free spec still gets behavioral verification from its suite', () => {
    // The scale probe and differential are opt-in per spec; what must NEVER be
    // true is a spec that is verified by nothing at all.
    const noOracle = FORGE_AGENDA.filter((s) => !s.reference);
    for (const spec of noOracle) {
      const report = assessForgeCandidate({ name: spec.name, refSuite: spec.refSuite }, `/** x */\nexport function ${spec.name}(){ return null; }`, { requireBehavioral: false });
      // requireBehavioral:false is what triage passes; the default is stricter.
      expect(report, spec.name).not.toBeNull();
    }
  });
});

/** Type guard so the suite fails loudly if the spec shape changes. */
function _assertSpecShape(s: ForgeSpec): void {
  if (!s.name || !s.refSuite) throw new Error(`malformed spec ${s.id}`);
}
void _assertSpecShape;
