/**
 * decisionEngine coverage + determinism tests.
 *
 * evaluateGrowthDecision is a deterministic scorer: U(action) = sum(w_i * f_i)
 * with no randomness. The empty-registry utilities are hand-computable, so we
 * assert exact numbers, not ranges: for an empty registry every domain has
 * domainDeficit=1, passRateGap=1, vulnerabilityUrgency=0.05, novelty = boost,
 * synergy=0 (caller-supplied, defaults to 0). With the default weights, coding
 * (boost 0.6) = 0.6025 and quantum_sim (boost 0.85) = 0.64 exactly.
 */
import { describe, expect, it } from 'vitest';
import { evaluateGrowthDecision, DEFAULT_GROWTH_WEIGHTS } from '../src/lib/decisionEngine';
import type { ToolEntry, AnomalyReport, GitHubRepoBlueprint, DreamThought } from '../src/types';

function tool(name: string, domain: ToolEntry['domain'], versions: Array<{ promoted: boolean; score: number }>): ToolEntry {
  return {
    name,
    domain,
    versions: versions.map((v, i) => ({ id: `${name}_v${i}`, ts: i, promoted: v.promoted, score: v.score, checks: [], summary: '' })),
  } as unknown as ToolEntry;
}

function anomaly(toolName: string, domain: ToolEntry['domain'], severity: number, status: 'detected' | 'resolved'): AnomalyReport {
  return { toolName, domain, errorType: 'vieta_sign_bug', severity, status, ts: 1 } as unknown as AnomalyReport;
}

function blueprint(id: string, domain: ToolEntry['domain'], isIngested: boolean): GitHubRepoBlueprint {
  return {
    id,
    domain,
    repoName: `repo-${id}`,
    algorithmName: `algo-${id}`,
    stars: 100,
    isIngested,
    asymptoticComplexity: 'O(n)',
  } as unknown as GitHubRepoBlueprint;
}

function thought(id: string, domain: ToolEntry['domain'], readiness: number): DreamThought {
  return { id, domain, hypothesis: 'h', phase: 'REM', crystallizationReadiness: readiness } as unknown as DreamThought;
}

describe('evaluateGrowthDecision', () => {
  it('empty registry yields exactly one domain-gap action per domain with hand-verifiable utilities', () => {
    const r = evaluateGrowthDecision([], [], DEFAULT_GROWTH_WEIGHTS, 7, [], []);
    const domainActions = r.candidateActions.filter((a) => a.actionType === 'domain_gap_expansion');
    expect(domainActions).toHaveLength(7);
    const byDomain = Object.fromEntries(domainActions.map((a) => [a.targetDomain, a.computedUtilityScore]));
    // Hand-computed with default weights: coding boost 0.6 -> 0.6025; quantum 0.85 -> 0.64.
    expect(byDomain['coding']).toBe(0.6025);
    expect(byDomain['quantum_sim']).toBe(0.64);
    expect(byDomain['neuro_symbolic']).toBe(0.64);
    expect(byDomain['biotech']).toBe(0.64);
    expect(r.stateVectorSummary).toEqual({ totalGenes: 0, activeDomains: 0, healthIndex: 1, overallPassRate: 0 });
    expect(r.generation).toBe(7);
    expect(r.selectedAction).toBe(r.candidateActions[0]);
  });

  it('counts tools per domain and averages promoted scores into the pass rate', () => {
    const reg = [
      tool('a', 'coding', [{ promoted: true, score: 1.0 }, { promoted: false, score: 0.1 }]),
      tool('b', 'coding', [{ promoted: true, score: 0.5 }]),
      tool('c', 'math', [{ promoted: false, score: 0.9 }]), // last version used when none promoted
    ];
    const r = evaluateGrowthDecision(reg, [], DEFAULT_GROWTH_WEIGHTS, 1, [], []);
    expect(r.stateVectorSummary.totalGenes).toBe(3);
    expect(r.stateVectorSummary.activeDomains).toBe(2);
    // coding avg = (1.0 + 0.5)/2 = 0.75; math avg = 0.9; overall = (0.75+0.9)/7
    expect(r.stateVectorSummary.overallPassRate).toBe(Number(((0.75 + 0.9) / 7).toFixed(2)));
    expect(r.stateVectorSummary.healthIndex).toBe(1);
  });

  it('adds a deep-security action only for detected anomalies', () => {
    const reg = [tool('x', 'coding', [{ promoted: true, score: 0.8 }])];
    const anoms = [
      anomaly('victim', 'coding', 0.9, 'detected'),
      anomaly('victim', 'coding', 0.5, 'resolved'), // resolved must not count
    ];
    const r = evaluateGrowthDecision(reg, anoms, DEFAULT_GROWTH_WEIGHTS, 3, [], []);
    const harden = r.candidateActions.filter((a) => a.actionType === 'deep_security_hardening');
    expect(harden).toHaveLength(1);
    expect(harden[0].targetToolName).toBe('victim');
    expect(harden[0].id).toBe('act_repair_victim_3');
    // 1 detected anomaly -> urgency = min(1, 0.6 + 1*0.15) = 0.75
    expect(harden[0].rawFactorScores.vulnerabilityUrgency).toBe(0.75);
    // healthIndex with 1 active anomaly = max(0.2, 1 - 0.25) = 0.75
    expect(r.stateVectorSummary.healthIndex).toBe(0.75);
  });

  it('adds a github-ingest action only for un-ingested blueprints', () => {
    const bp = [blueprint('b1', 'math', false), blueprint('b2', 'math', true)];
    const r = evaluateGrowthDecision([], [], DEFAULT_GROWTH_WEIGHTS, 2, [], bp);
    const ingest = r.candidateActions.filter((a) => a.actionType === 'github_research_import');
    expect(ingest).toHaveLength(1);
    expect(ingest[0].targetToolName).toBe('algo-b1');
    expect(ingest[0].suggestedParameters.blueprintId).toBe('b1');
  });

  it('adds a dream-crystallization action only when a thought is ready', () => {
    const r1 = evaluateGrowthDecision([], [], DEFAULT_GROWTH_WEIGHTS, 1, [thought('t_ready', 'biotech', 0.9)], []);
    expect(r1.candidateActions.some((a) => a.actionType === 'dream_crystallization')).toBe(true);
    const r2 = evaluateGrowthDecision([], [], DEFAULT_GROWTH_WEIGHTS, 1, [thought('t_early', 'biotech', 0.5)], []);
    expect(r2.candidateActions.some((a) => a.actionType === 'dream_crystallization')).toBe(false);
  });

  it('adds a crossover action only with two or more registry genes', () => {
    const one = [tool('solo', 'coding', [{ promoted: true, score: 0.9 }])];
    const two = [tool('p1', 'coding', [{ promoted: true, score: 0.9 }]), tool('p2', 'math', [{ promoted: true, score: 0.9 }])];
    expect(evaluateGrowthDecision(one, [], DEFAULT_GROWTH_WEIGHTS, 1, [], []).candidateActions.some((a) => a.actionType === 'cross_domain_hybridization')).toBe(false);
    const r = evaluateGrowthDecision(two, [], DEFAULT_GROWTH_WEIGHTS, 5, [], []);
    const cross = r.candidateActions.find((a) => a.actionType === 'cross_domain_hybridization')!;
    expect(cross).toBeDefined();
    expect(cross.id).toBe('act_crossover_5');
    expect(cross.suggestedParameters.parentA).toBe('p1');
    expect(cross.suggestedParameters.parentB).toBe('p2');
  });

  it('sorts deterministically by utility desc then id, ranks are contiguous, and calls are reproducible', () => {
    const reg = [tool('p1', 'coding', [{ promoted: true, score: 0.9 }]), tool('p2', 'math', [{ promoted: true, score: 0.9 }])];
    const anoms = [anomaly('victim', 'coding', 0.9, 'detected')];
    const bp = [blueprint('b1', 'math', false)];
    const th = [thought('t1', 'biotech', 0.9)];
    const a = evaluateGrowthDecision(reg, anoms, DEFAULT_GROWTH_WEIGHTS, 9, th, bp);
    const b = evaluateGrowthDecision(reg, anoms, DEFAULT_GROWTH_WEIGHTS, 9, th, bp);
    const scores = a.candidateActions.map((c) => c.computedUtilityScore);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    a.candidateActions.forEach((c, idx) => expect(c.rank).toBe(idx + 1));
    expect(a.candidateActions.map((c) => c.id)).toEqual(b.candidateActions.map((c) => c.id));
    expect(a.candidateActions.map((c) => c.computedUtilityScore)).toEqual(b.candidateActions.map((c) => c.computedUtilityScore));
    // Entropy is bounded for a finite distribution.
    expect(a.decisionEntropy).toBeGreaterThan(0);
    expect(a.decisionEntropy).toBeLessThanOrEqual(Math.log2(a.candidateActions.length) + 0.001);
    expect(typeof a.entropyReduction).toBe('number');
  });

  it('uses caller-supplied cross-domain synergy and defaults to 0', () => {
    const reg = [{ name: 'a', domain: 'math', versions: [{ promoted: true, score: 1 }] }, { name: 'b', domain: 'coding', versions: [{ promoted: true, score: 1 }] }] as any;
    const zero = evaluateGrowthDecision(reg, [], DEFAULT_GROWTH_WEIGHTS, 1, [], []);
    const withMap = evaluateGrowthDecision(reg, [], DEFAULT_GROWTH_WEIGHTS, 1, [], [], { cyber_defense: 0.9 });
    const find = (r: any) => r.candidateActions.find((a: any) => a.actionType === 'cross_domain_hybridization');
    expect(find(zero)?.rawFactorScores.crossDomainSynergy).toBe(0);
    expect(find(withMap)?.rawFactorScores.crossDomainSynergy).toBe(0.9);
  });

  it('honors a caller-supplied weight vector in the computed utility', () => {
    const weights = { domainGapWeight: 1, vulnerabilityWeight: 0, passRateImprovement: 0, noveltyExploration: 0, crossDomainSynergy: 0 };
    const r = evaluateGrowthDecision([], [], weights, 1, [], []);
    const coding = r.candidateActions.find((a) => a.actionType === 'domain_gap_expansion' && a.targetDomain === 'coding')!;
    // domainDeficit=1 for empty registry, weighted by domainGapWeight=1 -> utility 1.0
    expect(coding.computedUtilityScore).toBe(1);
    expect(r.weights).toBe(weights);
  });
});
