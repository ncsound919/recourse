import { describe, expect, it } from 'vitest';
import {
  growthDecisionAdvisory,
  buildChoiceAdvisory,
  buildNoulAdvisory,
  decideSystemOne,
  jevEnabled,
  chordAdvisoryQuestions,
  buildChordAdvisory,
  chordRerankQuestions,
  buildChordRerankAdvisory,
  type JevResult,
} from '../src/lib/jevClient';
import type { CandidateGrowthAction, GrowthDecisionReport } from '../src/types';

const ACTION_A: CandidateGrowthAction = {
  id: 'act_expand_coding_3',
  actionType: 'domain_gap_expansion',
  targetDomain: 'coding',
  title: 'Expand Frontier Coverage: CODING',
  description: 'd',
  rawFactorScores: { domainDeficit: 0.5, vulnerabilityUrgency: 0.1, passRateGap: 0.2, noveltyPotential: 0.6, crossDomainSynergy: 0 },
  computedUtilityScore: 0.42,
  rank: 1,
  deterministicRationale: 'r',
};

const ACTION_B: CandidateGrowthAction = {
  id: 'act_repair_foo_3',
  actionType: 'deep_security_hardening',
  targetDomain: 'cyber_defense',
  targetToolName: 'foo',
  title: 'Immediate Root-Cause Patch: foo',
  description: 'd',
  rawFactorScores: { domainDeficit: 0.1, vulnerabilityUrgency: 0.9, passRateGap: 0.8, noveltyPotential: 0.2, crossDomainSynergy: 0 },
  computedUtilityScore: 0.61,
  rank: 2,
  deterministicRationale: 'r',
};

function decision(): GrowthDecisionReport {
  return {
    timestamp: 0,
    generation: 3,
    weights: {} as any,
    candidateActions: [ACTION_A, ACTION_B],
    selectedAction: ACTION_A,
    decisionEntropy: 1.1,
    entropyReduction: 1.7,
    stateVectorSummary: { totalGenes: 12, activeDomains: 7, healthIndex: 0.9, overallPassRate: 0.85 },
  };
}

describe('growthDecisionAdvisory', () => {
  it('builds a compact state plus one choice question with an entry per action', () => {
    const { state, questions, actions } = growthDecisionAdvisory(decision());
    expect(actions.length).toBe(2);
    const choice = questions.priority;
    expect(choice.type).toBe('choice');
    if (choice.type !== 'choice') return;
    expect(Object.keys(choice.criteria)).toEqual([ACTION_A.id, ACTION_B.id]);
    expect(JSON.stringify(state)).not.toContain('deterministicRationale'); // cost discipline: no prose
    expect((state as any).actions[1].utility).toBe(0.61);
  });
});

describe('buildChoiceAdvisory', () => {
  it('maps the Jev choice answer to a recommended action id + probability', () => {
    const result: JevResult = {
      ok: true,
      source: 'localjev',
      model: 'localjev-0.2',
      answers: {
        priority: {
          type: 'choice',
          choice: ACTION_B.id,
          probabilities: { [ACTION_A.id]: 0.3, [ACTION_B.id]: 0.7 },
          confidence: 0.9,
        },
      },
      usage: { inputTokens: 120, outputTokens: 4 },
      latencyMs: 180,
    };
    const advisory = buildChoiceAdvisory(result, decision().candidateActions);
    expect(advisory.ok).toBe(true);
    expect(advisory.recommendedActionId).toBe(ACTION_B.id);
    expect(advisory.recommendedActionType).toBe('deep_security_hardening');
    expect(advisory.probability).toBeCloseTo(0.7);
    expect(advisory.confidence).toBe(0.9);
  });

  it('reports offline honestly when the call failed', () => {
    const advisory = buildChoiceAdvisory({ ok: false, source: 'offline', latencyMs: 5, error: 'nope' }, decision().candidateActions);
    expect(advisory.ok).toBe(false);
    expect(advisory.source).toBe('offline');
    expect(advisory.recommendedActionId).toBeUndefined();
  });
});

describe('buildNoulAdvisory', () => {
  it('extracts the noul probability and boolean decision', () => {
    const result: JevResult = {
      ok: true,
      source: 'localjev',
      model: 'localjev-0.2',
      answers: { proceed: { type: 'noul', noul: 0.97 } },
      latencyMs: 90,
    };
    const advisory = buildNoulAdvisory(result);
    expect(advisory.proceed).toBe(true);
    expect(advisory.noul).toBeCloseTo(0.97);
  });
});

describe('decideSystemOne offline gate', () => {
  it('returns ok:false offline when the tier is disabled, never fabricating', async () => {
    process.env.RECOURSE_JEV_ENABLED = '0';
    try {
      const result = await decideSystemOne({
        state: 'state',
        questions: { go: { type: 'noul', instructions: 'Go?' } },
      });
      expect(result.ok).toBe(false);
      expect(result.source).toBe('offline');
      expect(result.error).toMatch(/disabled/);
    } finally {
      delete process.env.RECOURSE_JEV_ENABLED;
    }
  });

  it('requires no API key and reports offline honestly when the server is unreachable', async () => {
    delete process.env.RECOURSE_JEV_ENABLED;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.TYPESAFE_BASE_URL;
    // localjev needs no key: a default base URL is sufficient to be "enabled".
    expect(jevEnabled()).toBe(true);

    // Point BOTH tiers at a closed port: the client must report offline,
    // never fabricate — regardless of what is running on :8080.
    const prevGateway = process.env.TYPESAFE_BASE_URL;
    const prevLocal = process.env.JEV_LOCAL_BASE_URL;
    process.env.TYPESAFE_BASE_URL = 'http://127.0.0.1:9';
    process.env.JEV_LOCAL_BASE_URL = 'http://127.0.0.1:9';
    try {
      const result = await decideSystemOne({ state: 's', questions: { go: { type: 'noul', instructions: 'Go?' } } });
      expect(result.ok).toBe(false);
      expect(result.source).toBe('offline');
    } finally {
      if (prevGateway !== undefined) process.env.TYPESAFE_BASE_URL = prevGateway;
      else delete process.env.TYPESAFE_BASE_URL;
      if (prevLocal !== undefined) process.env.JEV_LOCAL_BASE_URL = prevLocal;
      else delete process.env.JEV_LOCAL_BASE_URL;
    }
  });
});

describe('chordAdvisoryQuestions', () => {
  it('builds compact state plus fit/tension scores and a bar-choice', () => {
    const { state, questions } = chordAdvisoryQuestions({
      style: 'steely-dan',
      keyName: 'Fmaj7',
      chords: ['Fmaj7', 'G7', 'Am9', 'Dm7'],
      bpm: 120,
      bars: 4,
      mode: 'loop',
      mood: 'melancholic',
    });
    expect((state as any).progression).toEqual(['Fmaj7', 'G7', 'Am9', 'Dm7']);
    expect((state as any).mood).toBe('melancholic');
    expect(questions.fit.type).toBe('score');
    expect(questions.tension.type).toBe('score');
    const swap = questions.swap;
    expect(swap.type).toBe('choice');
    if (swap.type === 'choice') {
      expect(Object.keys(swap.criteria)).toEqual(['bar_1', 'bar_2', 'bar_3', 'bar_4']);
    }
  });
});

describe('buildChordAdvisory', () => {
  it('parses fit/tension scores and the flagged swap bar', () => {
    const result: JevResult = {
      ok: true,
      source: 'localjev',
      model: 'localjev-0.2',
      answers: {
        fit: { type: 'score', score: 2.3, legend: { '0': 'Poor', '1': 'Adequate', '2': 'Good', '3': 'Excellent' }, probabilities: { '0': 0.05, '1': 0.2, '2': 0.5, '3': 0.25 }, confidence: 0.8 },
        tension: { type: 'score', score: 1.1, legend: { '0': 'Static', '1': 'Gentle', '2': 'Moderate', '3': 'High' }, probabilities: {}, confidence: 0.7 },
        swap: { type: 'choice', choice: 'bar_3', probabilities: { bar_1: 0.1, bar_2: 0.2, bar_3: 0.7 }, confidence: 0.9 },
      },
      latencyMs: 120,
    };
    const advisory = buildChordAdvisory(result, ['Fmaj7', 'G7', 'Am9', 'Dm7']);
    expect(advisory.ok).toBe(true);
    expect(advisory.fitScore).toBeCloseTo(2.3);
    expect(advisory.tensionScore).toBeCloseTo(1.1);
    expect(advisory.swapBar).toBe(3);
    expect(advisory.swapChord).toBe('Am9');
  });

  it('reports offline honestly when the call failed', () => {
    const advisory = buildChordAdvisory({ ok: false, source: 'offline', latencyMs: 4, error: 'nope' });
    expect(advisory.ok).toBe(false);
    expect(advisory.fitScore).toBeUndefined();
  });
});

describe('chordRerankAdvisory', () => {
  it('builds a choice over real candidates and maps the winner', () => {
    const candidates = [
      { seed: 1, chords: ['Fmaj7', 'G7', 'Am9'] },
      { seed: 2, chords: ['Cmaj7', 'A7', 'Dm9'] },
      { seed: 3, chords: ['Em7', 'B7', 'Cmaj9'] },
    ];
    const { state, questions } = chordRerankQuestions(candidates, 'hopeful');
    expect((state as any).candidates.length).toBe(3);
    const q = questions.best;
    expect(q.type).toBe('choice');
    if (q.type === 'choice') {
      expect(Object.keys(q.criteria)).toEqual(['seed_1', 'seed_2', 'seed_3']);
    }

    const result: JevResult = {
      ok: true,
      source: 'localjev',
      model: 'localjev-0.2',
      answers: { best: { type: 'choice', choice: 'seed_3', probabilities: { seed_1: 0.1, seed_2: 0.2, seed_3: 0.7 }, confidence: 0.92 } },
      latencyMs: 90,
    };
    const advisory = buildChordRerankAdvisory(result, candidates);
    expect(advisory.bestSeed).toBe(3);
    expect(advisory.bestChords).toEqual(['Em7', 'B7', 'Cmaj9']);
    expect(advisory.probability).toBeCloseTo(0.7);
    expect(advisory.confidence).toBe(0.92);
  });
});