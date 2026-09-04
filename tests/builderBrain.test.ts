import { describe, it, expect } from 'vitest';
import {
  BUILDER_SEED_PROFILES,
  computeBuilderBeliefs,
  chooseBuilderProfile,
  builderMutateDue,
  proposeBuilderProfile,
} from '../src/lib/builderBrain';
import type { BuilderOutcome } from '../src/lib/builderBrain';

function outcome(profileId: string, passed: boolean): BuilderOutcome {
  return { at: 0, profileId, specId: 's', domain: 'coding', passed, attemptsUsed: 1 };
}

describe('Builder Brain (meta-loop over the generator)', () => {
  it('seeds three distinct strategies and defaults to the first with no data', () => {
    expect(BUILDER_SEED_PROFILES.map((p) => p.id)).toEqual(['concise', 'edge-correctness', 'minimal']);
    expect(chooseBuilderProfile(BUILDER_SEED_PROFILES, []).id).toBe('concise');
  });

  it('folds real outcomes into beta pass-rate beliefs', () => {
    const journal: BuilderOutcome[] = [
      outcome('concise', true),
      outcome('concise', true),
      outcome('concise', false),
      outcome('edge-correctness', true),
    ];
    const beliefs = computeBuilderBeliefs(BUILDER_SEED_PROFILES, journal);
    const edge = beliefs.find((b) => b.profileId === 'edge-correctness')!;
    const concise = beliefs.find((b) => b.profileId === 'concise')!;
    expect(edge.passes).toBe(1);
    expect(edge.posteriorMean).toBe((1 + 1) / (2 + 1)); // 2/3
    expect(concise.posteriorMean).toBe((1 + 2) / (2 + 3)); // 3/5
    // best (highest posterior) first
    expect(beliefs[0].profileId).toBe('edge-correctness');
  });

  it('selects the best-performing profile from the journal', () => {
    const journal: BuilderOutcome[] = Array.from({ length: 10 }, () => outcome('minimal', true)).concat(
      Array.from({ length: 10 }, () => outcome('concise', false)),
    );
    expect(chooseBuilderProfile(BUILDER_SEED_PROFILES, journal).id).toBe('minimal');
  });

  it('proposes a bounded mutation of the current best, capped at 8 profiles', () => {
    const rng = () => 0.1;
    const journal: BuilderOutcome[] = [outcome('minimal', true), outcome('minimal', true)];
    const best = chooseBuilderProfile(BUILDER_SEED_PROFILES, journal);
    const v1 = proposeBuilderProfile(BUILDER_SEED_PROFILES, journal, rng);
    expect(v1).not.toBeNull();
    expect(v1!.id).not.toBe(best.id);
    expect(v1!.temperature).toBeGreaterThanOrEqual(best.temperature);
    expect(v1!.systemPrompt).toMatch(/Experiment directive/);

    const eight = Array.from({ length: 8 }, (_, i) => ({ ...BUILDER_SEED_PROFILES[0], id: `p${i}` }));
    expect(proposeBuilderProfile(eight, journal, rng)).toBeNull();
  });

  it('only mutates after enough new outcomes since the last mutation', () => {
    expect(builderMutateDue([], BUILDER_SEED_PROFILES, 0)).toBe(false); // no outcomes yet
    const journal = Array.from({ length: 6 }, (_, i) => outcome('concise', i % 2 === 0));
    expect(builderMutateDue(journal, BUILDER_SEED_PROFILES, 0)).toBe(true);
    expect(builderMutateDue(journal, BUILDER_SEED_PROFILES, 6)).toBe(false);
  });
});
