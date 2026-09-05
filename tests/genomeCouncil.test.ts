import { describe, expect, it } from 'vitest';

import {
  buildCouncilProblem,
  councilDecide,
  councilLessons,
  councilPostMortem,
  councilState,
} from '../src/lib/genomeCouncil.js';

describe('genomeCouncil problem builder', () => {
  it('names the weakness and reasons when a finding is given', () => {
    const problem = buildCouncilProblem({
      name: 'Degraded registry tools',
      reasons: ['tool x (degraded) is not verified-healthy', 'tool y (healing) is stale'],
    });
    expect(problem).toContain('Degraded registry tools');
    expect(problem).toContain('tool x (degraded)');
    expect(problem).toContain('leader-archetype strategy lens');
  });

  it('falls back to a generic next-step question without a finding', () => {
    const problem = buildCouncilProblem();
    expect(problem).toContain('highest-value next repair');
    const also = buildCouncilProblem({ reasons: ['ignored without a name'] });
    expect(also).toBe(problem);
  });
});

describe('genomeCouncil honest offline behavior', () => {
  // url:'' forces the not-configured path deterministically, independent of any
  // BRAIN_URL in the environment — no network is ever attempted.
  it('decide reports not-configured when no url', async () => {
    const r = await councilDecide({ url: '', problem: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
  });

  it('state reports not-configured when no url', async () => {
    const r = await councilState({ url: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
  });

  it('lessons reports not-configured when no url', async () => {
    const r = await councilLessons({ url: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
  });

  it('post-mortem validates required inputs before any network', async () => {
    const missing = await councilPostMortem({
      url: '',
      input: {
        decisionTitle: '',
        predictedProbability: 0.8,
        actualOutcome: 'success',
        leaderIds: [],
      },
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/decisionTitle and at least one leaderIds/);
  });
});
