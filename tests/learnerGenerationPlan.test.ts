import { describe, it, expect } from 'vitest';
import {
  generationTargets,
  nextGenerationTarget,
  summarizeBeliefsByDomain,
  generationPlanDigest,
} from '../src/lib/learnerGenerationPlan';
import { selectTemplateForLearnerDirective } from '../src/lib/componentTemplates';
import type { GeneBelief, Directive } from '../src/dream/learner-types';

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

const healthyCoding = belief({ domain: 'coding', alpha: 20, beta: 1, meanReward: 0.9 });
const weakMath = belief({ domain: 'math', alpha: 2, beta: 8, meanReward: 0.3 });

describe('summarizeBeliefsByDomain', () => {
  it('aggregates attempts-weighted reward and the failure-rate posterior', () => {
    const out = summarizeBeliefsByDomain([healthyCoding, weakMath]);
    const coding = out.find((s) => s.domain === 'coding')!;
    const math = out.find((s) => s.domain === 'math')!;
    expect(coding.meanReward).toBeCloseTo(0.9, 3);
    expect(coding.uncertainty).toBeCloseTo(1 / 21, 3);
    expect(math.uncertainty).toBeCloseTo(0.8, 3);
    expect(math.need).toBeGreaterThan(coding.need);
  });

  it('reports an unevidenced domain as maximum uncertainty and need', () => {
    const out = summarizeBeliefsByDomain([healthyCoding]);
    const biotech = out.find((s) => s.domain === 'biotech')!;
    expect(biotech.genes).toBe(0);
    expect(biotech.uncertainty).toBe(1);
    expect(biotech.need).toBe(1);
  });
});

describe('generationTargets — recursive learning feeds tool generation', () => {
  it('prioritises the least-known domain and asks for synthesis there', () => {
    const targets = generationTargets({ geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] });
    // biotech has no genes -> priority 1.0 -> synthesize, first.
    expect(targets[0].domain).toBe('biotech');
    expect(targets[0].action).toBe('synthesize');
    // coding is healthy -> amplify.
    expect(targets.find((t) => t.domain === 'coding')!.action).toBe('amplify');
  });

  it('asks to refine a low-reward domain and orders it above a healthy one', () => {
    const targets = generationTargets({ geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] });
    const math = targets.find((t) => t.domain === 'math')!;
    const coding = targets.find((t) => t.domain === 'coding')!;
    expect(math.action).toBe('refine');
    expect(math.priority).toBeGreaterThan(coding.priority);
    expect(targets.indexOf(math)).toBeLessThan(targets.indexOf(coding));
  });

  it('honours a learner synthesize_template directive and records its id', () => {
    const directives: Directive[] = [{
      id: 'dir_synth_systemic', kind: 'synthesize_template', geneName: 'systemic_template_archetype',
      reason: 'systemic deficit', episode: 7, targetDomain: 'systemic',
    }];
    const targets = generationTargets({ geneBeliefs: {}, directives });
    const systemic = targets.find((t) => t.domain === 'systemic')!;
    expect(systemic.action).toBe('synthesize');
    expect(systemic.directiveId).toBe('dir_synth_systemic');
    expect(systemic.reason).toBe('systemic deficit');
  });

  it('is deterministic and supports a limit; nextGenerationTarget returns the head', () => {
    const state = { geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] };
    const a = generationTargets(state);
    const b = generationTargets(state);
    expect(a.map((t) => t.domain)).toEqual(b.map((t) => t.domain));
    expect(generationTargets(state, { limit: 2 })).toHaveLength(2);
    expect(nextGenerationTarget(state)!.domain).toBe('biotech');
    expect(generationPlanDigest(a)).toContain('biotech:synthesize');
  });
});

describe('selectTemplateForLearnerDirective — synthesize picks the weakest', () => {
  it('amplify picks a stronger template than synthesize_template for math', () => {
    const amplify = selectTemplateForLearnerDirective('amplify', 'math');
    const synth = selectTemplateForLearnerDirective('synthesize_template', 'math');
    expect(amplify).toBeDefined();
    expect(synth).toBeDefined();
    expect(amplify!.defaultScore).toBeGreaterThanOrEqual(synth!.defaultScore);
  });
});

describe('generationTargets — fleet priority boost', () => {
  it('ranks a priority domain first without changing its priority score', () => {
    const state = { geneBeliefs: { a: healthyCoding, b: weakMath }, directives: [] };
    const plain = generationTargets(state);
    const boosted = generationTargets(state, { priorityDomains: ['coding'] });
    expect(plain[0].domain).not.toBe('coding');
    expect(boosted[0].domain).toBe('coding');
    // The boost changes ordering only — the reported priority is unchanged.
    expect(boosted.find((t) => t.domain === 'coding')!.priority).toBe(
      plain.find((t) => t.domain === 'coding')!.priority,
    );
  });
});
