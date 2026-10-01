import { describe, expect, it } from 'vitest';
import { reconcileDreamRegistry } from '../src/dream/reconcileRegistry';
import { compileGenome, geneModuleForm, generateGenome, verifyGeneSource } from '../src/dream/genomes';
import { mulberry32 } from '../src/dream/engine';
import type { CrystallizedTool, DreamState } from '../src/dream/types';

/** A gene exactly as the pre-fix promotion path stored it: bare (non-module)
 *  code, no vectors, and a `verified: true` nothing re-confirmed. */
function legacyGene(kind: string, code: string, over: Partial<CrystallizedTool> = {}): CrystallizedTool {
  return {
    id: `tool_legacy_${kind}`,
    name: `LEGACY_${kind}`,
    domain: 'coding',
    kind,
    description: 'legacy gene',
    code,
    verified: true,
    invariantChecks: [{ name: 'SandboxSyntaxValid', passed: true }],
    crystallizedAt: '2026-09-03T12:57:21.020Z',
    fromThoughtId: 'dt_legacy',
    ...over,
  };
}

function goodCode(): string {
  return compileGenome(generateGenome('biotech', mulberry32(7)));
}

describe('reconcileDreamRegistry', () => {
  it('re-verifies a legacy gene against the real sandbox instead of trusting the stored flag', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const { registry, report } = reconcileDreamRegistry([legacyGene(kind, goodCode())]);

    expect(report.total).toBe(1);
    expect(report.reverified).toBe(1);
    expect(report.stillVerified).toBe(1);
    expect(report.downgraded).toBe(0);
    expect(registry[0].verified).toBe(true);
    // The verdict is backed by real checks now, not the single legacy check.
    expect(registry[0].invariantChecks!.length).toBeGreaterThan(1);
    expect(registry[0].invariantChecks!.every((c) => c.passed)).toBe(true);
  });

  it('rewrites stored bare code into module form so the substance gate can accept it', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const { registry, report } = reconcileDreamRegistry([legacyGene(kind, goodCode())]);

    expect(report.codeRewrittenToModuleForm).toBe(1);
    expect(registry[0].code).toMatch(/^export function /);
  });

  it('restores test vectors from the gene kind', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const { registry, report } = reconcileDreamRegistry([legacyGene(kind, goodCode())]);

    expect(report.vectorsRestored).toBe(1);
    expect(registry[0].testVectors!.length).toBeGreaterThan(0);
  });

  it('downgrades a gene whose stored code no longer passes its own invariants', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const tampered = goodCode().replace(/return[^\n]*/, 'return "not a number";');
    const { registry, report } = reconcileDreamRegistry([legacyGene(kind, tampered)]);

    expect(report.downgraded).toBe(1);
    expect(report.stillVerified).toBe(0);
    expect(registry[0].verified).toBe(false);
    // The failing checks are stored, with the real reason.
    expect(registry[0].invariantChecks!.some((c) => !c.passed)).toBe(true);
    expect(report.entries[0].reason).toMatch(/invariants hold/);
  });

  it('downgrades code that cannot compile, rather than leaving the old green', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const { registry, report } = reconcileDreamRegistry([legacyGene(kind, 'function broken( { ???')]);

    expect(report.downgraded).toBe(1);
    expect(registry[0].verified).toBe(false);
    expect(registry[0].invariantChecks!.some((c) => c.name === 'SandboxSyntaxValid' && !c.passed)).toBe(true);
  });

  it('refuses to keep a model-derived claim verified when there is no suite to run', () => {
    const { registry, report } = reconcileDreamRegistry([
      legacyGene('model_hypothesis', 'export function enzymeEfficiencyMonitor() { return 1; }'),
    ]);

    expect(report.unverifiable).toBe(1);
    // The withdrawn claim shows up as a downgrade, not just as "unverifiable".
    expect(report.downgraded).toBe(1);
    expect(registry[0].verified).toBe(false);
    expect(report.entries[0].reason).toMatch(/no stored test suite/);
  });

  it('verifies a module-form gene exactly as it verifies the bare form', () => {
    const spec = generateGenome('biotech', mulberry32(7));
    const bare = compileGenome(spec);
    const moduleForm = geneModuleForm(bare);
    expect(moduleForm).not.toBe(bare);

    const { registry, report } = reconcileDreamRegistry([
      legacyGene(spec.kind, moduleForm, { verified: true }),
    ]);

    // Storing the module form must not make the gene unverifiable next time:
    // the harness strips the export, so both forms agree.
    expect(report.unverifiable).toBe(0);
    expect(report.stillVerified).toBe(1);
    expect(registry[0].verified).toBe(true);
    expect(registry[0].invariantChecks!.find((c) => c.name === 'SandboxSyntaxValid')!.passed).toBe(true);
  });

  it('marks a gene with no stored code unverified instead of guessing', () => {
    const { registry, report } = reconcileDreamRegistry([legacyGene('gc_skew_analyzer', '')]);

    expect(report.unverifiable).toBe(1);
    expect(registry[0].verified).toBe(false);
    expect(report.entries[0].reason).toMatch(/no stored code/);
  });

  it('marks an unknown kind unverified with the kind named', () => {
    const { registry, report } = reconcileDreamRegistry([legacyGene('made_up_kind', 'export function x() { return 1; }')]);

    expect(report.unverifiable).toBe(1);
    expect(registry[0].verified).toBe(false);
    expect(report.entries[0].reason).toMatch(/unknown gene kind "made_up_kind"/);
  });

  it('never invents a green for a gene that verifies with zero checks', () => {
    // Defence in depth: reconcileOne only marks verified on a real green run, so
    // a verifier that returned no checks at all could not produce a claim.
    const { registry } = reconcileDreamRegistry([legacyGene('gc_skew_analyzer', goodCode())]);
    expect(registry[0].verified).toBe(registry[0].invariantChecks!.length > 0);
  });

  it('is idempotent: a second pass changes no verdict', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const first = reconcileDreamRegistry([legacyGene(kind, goodCode())]);
    const second = reconcileDreamRegistry(first.registry);

    expect(second.report.downgraded).toBe(0);
    expect(second.report.upgraded).toBe(0);
    expect(second.report.stillVerified).toBe(1);
    expect(second.report.codeRewrittenToModuleForm).toBe(0);
    expect(second.registry).toEqual(first.registry);
  });

  it('counts a mixed registry honestly', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const { report } = reconcileDreamRegistry([
      legacyGene(kind, goodCode(), { name: 'ok1' }),
      legacyGene(kind, goodCode(), { name: 'ok2' }),
      legacyGene(kind, 'function broken( { ???', { name: 'broken' }),
      legacyGene('model_hypothesis', 'export function m() { return 1; }', { name: 'model' }),
    ]);

    expect(report.total).toBe(4);
    // All three rule-based genes were re-run (the broken one included); only the
    // model gene could not be checked at all.
    expect(report.reverified).toBe(3);
    expect(report.unverifiable).toBe(1);
    expect(report.stillVerified).toBe(2);
    expect(report.failed).toBe(1);
    // Two claims withdrawn: the gene that failed its re-check, and the model
    // gene whose claim could not be re-confirmed at all.
    expect(report.downgraded).toBe(2);
    // Additive identities an operator can check the report against.
    expect(report.stillVerified + report.failed).toBe(report.reverified);
    expect(report.reverified + report.unverifiable).toBe(report.total);
  });

  it('agrees with the promotion-time verifier on the same code', () => {
    const spec = generateGenome('biotech', mulberry32(11));
    const direct = verifyGeneSource(spec.kind, compileGenome(spec));
    const { registry } = reconcileDreamRegistry([legacyGene(spec.kind, compileGenome(spec))]);

    expect(registry[0].verified).toBe(direct.verified);
    expect(registry[0].invariantChecks!.map((c) => `${c.name}:${c.passed}`))
      .toEqual(direct.checks.map((c) => `${c.name}:${c.passed}`));
  });

  it('leaves an empty registry alone', () => {
    const { registry, report } = reconcileDreamRegistry([]);
    expect(registry).toEqual([]);
    expect(report.total).toBe(0);
    expect(report.reverified).toBe(0);
  });
});

describe('DreamState integration shape', () => {
  it('reports totals that match the registry length', () => {
    const kind = generateGenome('biotech', mulberry32(7)).kind;
    const state = { registry: [legacyGene(kind, goodCode())] } as unknown as DreamState;
    const { registry, report } = reconcileDreamRegistry(state.registry);
    expect(report.total).toBe(registry.length);
  });
});
