import { describe, it, expect } from 'vitest';
import {
  rankForgeSpecsByLearnerPlan,
  forgeOutcomeReward,
  forgeLearnUpdate,
  chooseMintTarget,
  mintContextForTarget,
  mintedProblemToForgeSpec,
} from '../src/lib/forgeLearningLoop';
import type { ForgeSpec } from '../src/lib/capabilityForge';
import type { GenerationTarget } from '../src/lib/learnerGenerationPlan';
import type { GeneBelief, Directive } from '../src/dream/learner-types';
import type { MintedProblem } from '../src/lib/openEnded/problemMint';
import { RecursiveLearner, InMemoryLearnerStore } from '../src/dream/learner';

function belief(p: Partial<GeneBelief> & Pick<GeneBelief, 'domain' | 'alpha' | 'beta' | 'meanReward'>): GeneBelief {
  return {
    geneId: p.geneId ?? `g_${p.domain}`,
    geneName: p.geneName ?? `gene_${p.domain}`,
    domain: p.domain,
    alpha: p.alpha,
    beta: p.beta,
    attempts: p.attempts ?? p.alpha + p.beta,
    meanReward: p.meanReward,
    weight: p.weight ?? p.meanReward,
    lastEpisode: p.lastEpisode ?? 1,
  };
}

function spec(name: string, domain: ForgeSpec['domain']): ForgeSpec {
  return { id: `spec_${name}`, name, domain, title: name, prompt: `do ${name}`, refSuite: 'assert true;' };
}

const healthyCoding = belief({ domain: 'coding', alpha: 20, beta: 1, meanReward: 0.9 });
const weakMath = belief({ domain: 'math', alpha: 2, beta: 8, meanReward: 0.3 });

describe('rankForgeSpecsByLearnerPlan — the learner orders tool generation', () => {
  const specs = [spec('codeFn', 'coding'), spec('mathFn', 'math'), spec('bioFn', 'biotech')];

  it('puts the least-known domain first and the healthiest last', () => {
    const r = rankForgeSpecsByLearnerPlan(specs, { geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] });
    expect(r.ordered.map((s) => s.domain)).toEqual(['biotech', 'math', 'coding']);
    expect(r.reasons['spec_bioFn']).toContain('synthesize');
    expect(r.reasons['spec_bioFn']).toContain('biotech');
  });

  it('is deterministic and stable', () => {
    const state = { geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] };
    const a = rankForgeSpecsByLearnerPlan(specs, state);
    const b = rankForgeSpecsByLearnerPlan(specs, state);
    expect(a.ordered.map((s) => s.name)).toEqual(b.ordered.map((s) => s.name));
  });

  it('honours priorityDomains as an ordering boost without changing priorities', () => {
    const state = { geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] };
    const boosted = rankForgeSpecsByLearnerPlan(specs, state, { priorityDomains: ['coding'] });
    expect(boosted.ordered[0].domain).toBe('coding');
  });

  it('ranks a spec named by a directive ahead of its domain peers', () => {
    // Two coding specs under identical domain need; the directive breaks the tie.
    const peers = [spec('codeA', 'coding'), spec('codeB', 'coding')];
    const directives: Directive[] = [{
      id: 'dir_1', kind: 'synthesize_template', geneName: 'codeB',
      reason: 'explicitly requested', episode: 3, targetDomain: 'coding',
    }];
    const r = rankForgeSpecsByLearnerPlan(peers, { geneBeliefs: { a: healthyCoding }, directives });
    const idxA = r.ordered.findIndex((s) => s.name === 'codeA');
    const idxB = r.ordered.findIndex((s) => s.name === 'codeB');
    expect(idxB).toBeLessThan(idxA);
  });
});

describe('forgeOutcomeReward — graded, honest forge reward', () => {
  const ok = { ok: true, attemptsUsed: 1 };
  const bad = { ok: false, attemptsUsed: 3 };

  it('maps each terminal status to a real reward or null', () => {
    expect(forgeOutcomeReward(ok, 'materialized')).toBe(1);
    expect(forgeOutcomeReward(ok, 'materialize_failed')).toBe(0.7);
    expect(forgeOutcomeReward(bad, 'failed')).toBe(0.15);
    expect(forgeOutcomeReward({ ok: false, attemptsUsed: 0 }, 'failed')).toBe(0);
    // No real signal -> never a fabricated reward.
    expect(forgeOutcomeReward(bad, 'offline')).toBeNull();
    expect(forgeOutcomeReward(ok, 'exists')).toBeNull();
  });
});

describe('forgeLearnUpdate — canonical key ties forge outcomes to learner beliefs', () => {
  it('canonicalizes the name and carries the graded reward', () => {
    const u = forgeLearnUpdate(
      { ok: true, attemptsUsed: 1 },
      { name: 'MATH_LAGRANGE_4776', domain: 'math' },
      'materialized',
    );
    expect(u).not.toBeNull();
    expect(u!.key).toBe('mathlagrange');
    expect(u!.name).toBe('MATH_LAGRANGE_4776');
    expect(u!.domain).toBe('math');
    expect(u!.reward).toBe(1);
  });

  it('returns null when there is no real signal', () => {
    expect(forgeLearnUpdate({ ok: false, attemptsUsed: 0 }, { name: 'x', domain: 'coding' }, 'offline')).toBeNull();
  });
});

describe('chooseMintTarget — mint only where the learner has no build queued', () => {
  const target = (domain: string, action: GenerationTarget['action'], priority: number): GenerationTarget => ({
    domain: domain as GenerationTarget['domain'], action, priority, uncertainty: 0.5, meanReward: 0.5, genes: 0, reason: `${action} ${domain}`,
  });

  it('picks the highest-priority synthesize target whose domain has no spec', () => {
    const targets = [target('coding', 'amplify', 0.2), target('biotech', 'synthesize', 1.0), target('math', 'synthesize', 0.8)];
    // coding + math already have specs; biotech does not.
    const picked = chooseMintTarget(targets, ['coding', 'math']);
    expect(picked!.domain).toBe('biotech');
  });

  it('falls back to refine, then returns null when every actionable domain is covered', () => {
    const targets = [target('math', 'refine', 0.7), target('coding', 'amplify', 0.1)];
    expect(chooseMintTarget(targets, ['math', 'coding'])).toBeNull();
    expect(chooseMintTarget(targets, ['coding'])!.domain).toBe('math');
  });

  it('builds the mint context from the learner signal alone', () => {
    expect(mintContextForTarget(target('biotech', 'synthesize', 1.0))).toContain('biotech');
  });
});

describe('mintedProblemToForgeSpec — a proven problem becomes a forge contract', () => {
  it('uses the acceptance test as the hidden reference suite', () => {
    const problem: MintedProblem = {
      id: 'mint:math:fibonacciN',
      domain: 'math',
      title: 'Nth Fibonacci',
      statement: 'Return the nth Fibonacci number.',
      functionName: 'fibonacciN',
      acceptanceTest: 'assert fibonacciN(10) === 55;',
      referenceSource: 'export function fibonacciN(n){return n;}',
      hints: { requiredPrimitives: 1, acceptanceLines: 1, dataDims: 1 },
    };
    const s = mintedProblemToForgeSpec(problem, { sourceDirectiveId: 'dir_math' });
    expect(s.name).toBe('fibonacciN');
    expect(s.domain).toBe('math');
    expect(s.refSuite).toBe('assert fibonacciN(10) === 55;');
    expect(s.prompt).toContain('fibonacciN');
    expect(s.id.startsWith('learn_')).toBe(true);
  });
});

describe('learner key override — canonical keys compound, names stay human', () => {
  async function fresh() {
    (globalThis as unknown as Record<string, unknown>).__learnerState = undefined;
    (globalThis as unknown as Record<string, unknown>).__learnerLedger = undefined;
    return new RecursiveLearner(new InMemoryLearnerStore());
  }

  it('updates the canonical belief while preserving the display name', async () => {
    const learner = await fresh();
    const means = await learner.learnRealTools([
      { name: 'MATH_LAGRANGE_4776', key: 'mathlagrange', domain: 'math', reward: 1 },
    ]);
    // The return map still keys by the human name...
    expect(means.MATH_LAGRANGE_4776).toBeGreaterThan(0.5);
    const state = await learner.status();
    const b = state.geneBeliefs['real:mathlagrange'] as any;
    expect(b).toBeDefined();
    expect(b.geneName).toBe('MATH_LAGRANGE_4776');
  });
});

describe('groundedMintContext — corpus excerpts steer minting', () => {
  it('embeds the excerpt as data and forbids hash/echo tools', async () => {
    const { groundedMintContext } = await import('../src/lib/forgeLearningLoop');
    const target = { domain: 'biotech', action: 'synthesize', priority: 1, reason: 'weak domain', directiveId: 'd' } as any;
    const ctx = groundedMintContext(target, { title: 'Tumor doubling', project: 'cancer-pdfs', excerpt: 'Doubling time Td = t*ln2/ln(V2/V1).' });
    expect(ctx).toContain('Tumor doubling');
    expect(ctx).toContain('Td = t*ln2/ln(V2/V1)');
    expect(ctx).toMatch(/not a\s+hash/);
    expect(groundedMintContext(target, null)).not.toContain('Excerpt');
  });
});
