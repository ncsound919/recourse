import { describe, it, expect } from 'vitest';
import { evaluateGrowthDecision, DEFAULT_GROWTH_WEIGHTS } from '../src/lib/decisionEngine';
import type { ToolEntry, AnomalyReport, GrowthFactorWeights, GitHubRepoBlueprint } from '../src/types';

const ALL = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'] as const;

// Re-implements the engine's own utility definition so assertions are a real
// cross-check of the reported numbers rather than copies of the output.
function expectedUtility(raw: { domainDeficit: number; vulnerabilityUrgency: number; passRateGap: number; noveltyPotential: number; crossDomainSynergy: number }, w: GrowthFactorWeights): number {
  return Number(
    (
      w.domainGapWeight * raw.domainDeficit +
      w.vulnerabilityWeight * raw.vulnerabilityUrgency +
      w.passRateImprovement * raw.passRateGap +
      w.noveltyExploration * raw.noveltyPotential +
      w.crossDomainSynergy * raw.crossDomainSynergy
    ).toFixed(4),
  );
}

function expectedEntropyAndReduction(actions: Array<{ computedUtilityScore: number }>): { entropy: number; reduction: number } {
  const total = actions.reduce((s, c) => s + Math.max(0.001, c.computedUtilityScore), 0);
  let h = 0;
  for (const c of actions) {
    const p = Math.max(0.001, c.computedUtilityScore) / total;
    h -= p * Math.log2(p);
  }
  return { entropy: h, reduction: Math.max(0, 2.8 - h) };
}

function version(partial: Partial<{ score: number; promoted: boolean }> = {}) {
  return {
    version: '1.0.0',
    hash: 'abc123',
    created_at: 1,
    passed_verifier: true,
    score: 0.9,
    promoted: false,
    verifier_notes: '',
    ...partial,
  };
}

function tool(name: string, domain: (typeof ALL)[number], versions: ReturnType<typeof version>[]): ToolEntry {
  return { name, domain, entrypoint: `${name}.mjs`, description: '', versions } as ToolEntry;
}

function anomaly(partial: Partial<AnomalyReport>): AnomalyReport {
  return {
    id: 'a1',
    timestamp: 1,
    toolName: 't',
    domain: 'coding',
    severity: 'critical',
    errorType: 'security_taint',
    description: '',
    rootCause: '',
    brokenCode: 'x',
    status: 'detected',
    ...partial,
  } as AnomalyReport;
}

function blueprint(partial: Partial<GitHubRepoBlueprint>): GitHubRepoBlueprint {
  return {
    id: 'bp',
    repoName: 'repo',
    repoUrl: 'https://example.com/repo',
    author: 'a',
    stars: 10,
    domain: 'coding',
    algorithmName: 'alg',
    description: '',
    license: 'MIT',
    securityAuditStatus: 'clean',
    extractedSourceCode: '',
    generatedTestSuite: '',
    asymptoticComplexity: 'O(n)',
    deterministicProof: '',
    provenanceSourceTag: 'gh',
    ...partial,
  } as GitHubRepoBlueprint;
}

function thought(partial: Partial<{ id: string; readiness: number; phase: string; domain: string; hypothesis: string }>) {
  return {
    id: partial.id ?? 't',
    phase: partial.phase ?? 'rem_counterfactual_sim',
    domain: partial.domain ?? 'coding',
    premise: 'p',
    hypothesis: partial.hypothesis ?? 'hypothesis text',
    simulatedOutcome: 'o',
    intensity: 0.5,
    crystallizationReadiness: partial.readiness ?? 0,
  } as any;
}

describe('evaluateGrowthDecision', () => {
  it('empty system → seven domain-gap candidates with deterministic frontier-first ranking', () => {
    const report = evaluateGrowthDecision([], [], DEFAULT_GROWTH_WEIGHTS, 1, [], []);

    expect(report.generation).toBe(1);
    expect(report.weights).toBe(DEFAULT_GROWTH_WEIGHTS);
    expect(report.stateVectorSummary.totalGenes).toBe(0);
    expect(report.stateVectorSummary.activeDomains).toBe(0);
    expect(report.stateVectorSummary.healthIndex).toBe(1);
    expect(report.stateVectorSummary.overallPassRate).toBe(0);

    const actions = report.candidateActions;
    expect(actions).toHaveLength(7);
    expect(actions.every((a) => a.actionType === 'domain_gap_expansion')).toBe(true);
    // No anomalies / blueprints / crystallizable thoughts / <2 genes → only family A.
    expect(actions.some((a) => a.actionType !== 'domain_gap_expansion')).toBe(false);

    // Every domain has equal deficit (0 tools → deficit 1.0); frontier domains
    // (biotech, neuro_symbolic, quantum_sim) carry higher novelty potential.
    const frontier = actions.filter((a) => ['biotech', 'neuro_symbolic', 'quantum_sim'].includes(a.targetDomain));
    const rest = actions.filter((a) => !['biotech', 'neuro_symbolic', 'quantum_sim'].includes(a.targetDomain));
    for (const a of frontier) {
      expect(a.computedUtilityScore).toBeCloseTo(0.68, 6);
      expect(expectedUtility(a.rawFactorScores, DEFAULT_GROWTH_WEIGHTS)).toBe(a.computedUtilityScore);
    }
    for (const a of rest) {
      expect(a.computedUtilityScore).toBeCloseTo(0.6425, 6);
      expect(expectedUtility(a.rawFactorScores, DEFAULT_GROWTH_WEIGHTS)).toBe(a.computedUtilityScore);
    }

    // Ties are broken deterministically by id (localeCompare), so the first
    // three are the frontier domains in lexical order.
    expect(actions.slice(0, 3).map((a) => a.id)).toEqual([
      'act_expand_biotech_1',
      'act_expand_neuro_symbolic_1',
      'act_expand_quantum_sim_1',
    ]);
    expect(report.selectedAction.id).toBe('act_expand_biotech_1');
    expect(report.selectedAction.rank).toBe(1);

    // Ranks are 1..7 assigned in sorted order.
    expect(actions.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i - 1].computedUtilityScore).toBeGreaterThanOrEqual(actions[i].computedUtilityScore);
    }

    // Entropy / reduction match an independent computation from the same scores.
    const { entropy, reduction } = expectedEntropyAndReduction(actions);
    expect(report.decisionEntropy).toBeCloseTo(Number(entropy.toFixed(3)), 3);
    expect(report.entropyReduction).toBeCloseTo(Number(reduction.toFixed(3)), 3);
  });

  it('rich system → anomaly repair, blueprint ingest, dream crystallization, and crossover actions with real factor math', () => {
    const weights: GrowthFactorWeights = { domainGapWeight: 0.15, vulnerabilityWeight: 0.35, passRateImprovement: 0.1, noveltyExploration: 0.25, crossDomainSynergy: 0.15 };
    const registry: ToolEntry[] = [
      tool('t1', 'coding', [version({ score: 0.9, promoted: true })]),
      tool('t2', 'math', [version({ score: 0.5, promoted: false }), version({ score: 0.7, promoted: true })]),
      tool('t3', 'math', [version({ score: 0, promoted: true })]), // score 0 → 0.8 default
      tool('t4', 'biotech', []), // no versions → no score accumulator entry
      tool('t5', 'quantum_sim', [version({ score: 0.9, promoted: false })]), // promoted fallback = last
    ];
    const anomalies: AnomalyReport[] = [
      anomaly({ id: 'a1', domain: 'coding', toolName: 't1', severity: 'critical', errorType: 'security_taint', status: 'detected' }),
      anomaly({ id: 'a2', domain: 'coding', toolName: 't1', severity: 'warning', errorType: 'logic_regression', status: 'detected' }),
      anomaly({ id: 'a3', domain: 'biotech', toolName: 't4', severity: 'degraded', errorType: 'biotech_kg_conflict', status: 'detected' }),
      anomaly({ id: 'a4', domain: 'math', toolName: 't2', severity: 'warning', errorType: 'vieta_sign_bug', status: 'repaired' }),
    ];
    const blueprints: GitHubRepoBlueprint[] = [
      blueprint({ id: 'bp1', domain: 'coding', isIngested: true }),
      blueprint({ id: 'bp2', repoName: 'cblas-re', algorithmName: 'gemm', domain: 'math', stars: 4200, asymptoticComplexity: 'O(n^3)', isIngested: false }),
    ];
    const longHypothesis = 'z'.repeat(120);
    const recentThoughts = [
      thought({ id: 'low', readiness: 0.2, hypothesis: 'nothing here' }),
      thought({ id: 'ready', readiness: 0.9, phase: 'lucid_crystallization', domain: 'cyber_defense', hypothesis: longHypothesis }),
      thought({ id: 'mid', readiness: 0.74, hypothesis: 'just below the 0.75 bar' }),
    ];
    const generation = 7;
    const report = evaluateGrowthDecision(registry, anomalies, weights, generation, recentThoughts, blueprints);

    expect(report.weights).toBe(weights);
    expect(report.stateVectorSummary.totalGenes).toBe(5);
    expect(report.stateVectorSummary.activeDomains).toBe(4); // coding, math, biotech, quantum_sim
    expect(report.stateVectorSummary.healthIndex).toBe(0.25); // 1 - 3*0.25, floor 0.2
    // Pass rates: coding 0.9, math (0.7+0.8)/2 = 0.75, quantum_sim 0.9, others 0 → /7
    expect(report.stateVectorSummary.overallPassRate).toBe(Number(((0.9 + 0.75 + 0 + 0.9) / 7).toFixed(2)));

    const byType = new Map<string, number>();
    for (const a of report.candidateActions) byType.set(a.actionType, (byType.get(a.actionType) ?? 0) + 1);
    expect(byType.get('domain_gap_expansion')).toBe(7);
    expect(byType.get('deep_security_hardening')).toBe(1);
    expect(byType.get('github_research_import')).toBe(1);
    expect(byType.get('dream_crystallization')).toBe(1);
    expect(byType.get('cross_domain_hybridization')).toBe(1);
    expect(report.candidateActions).toHaveLength(11);

    // Every candidate's score is the real weighted sum of its factor scores.
    for (const a of report.candidateActions) {
      expect(a.computedUtilityScore).toBe(expectedUtility(a.rawFactorScores, weights));
    }

    const repair = report.candidateActions.find((a) => a.actionType === 'deep_security_hardening');
    expect(repair?.targetToolName).toBe('t1'); // top active anomaly
    expect(repair?.suggestedParameters).toEqual({ toolName: 't1', faultHint: 'security_taint' });
    expect(repair?.id).toBe('act_repair_t1_7');

    const ingest = report.candidateActions.find((a) => a.actionType === 'github_research_import');
    expect(ingest?.targetToolName).toBe('gemm'); // bp2 was the only non-ingested blueprint
    expect(ingest?.suggestedParameters).toEqual({ blueprintId: 'bp2' });
    expect(ingest?.description).toContain('4200 stars');
    expect(ingest?.id).toBe('act_github_ingest_bp2_7');

    const dream = report.candidateActions.find((a) => a.actionType === 'dream_crystallization');
    expect(dream?.id).toBe('act_dream_crystallize_ready'); // readiness 0.74 thought excluded
    expect(dream?.targetDomain).toBe('cyber_defense');
    expect(dream?.suggestedParameters).toEqual({ thoughtId: 'ready' });
    expect(dream?.title).toBe(`Crystallize Subconscious Dream: ${longHypothesis.slice(0, 45)}...`);
    expect(dream?.description).toContain('lucid_crystallization');
    expect(dream?.description).toContain('90%');

    const crossover = report.candidateActions.find((a) => a.actionType === 'cross_domain_hybridization');
    expect(crossover?.suggestedParameters).toEqual({ parentA: 't1', parentB: 't5', targetDomain: 'cyber_defense' });
    expect(crossover?.id).toBe('act_crossover_7');

    // Deterministic descending rank, ties broken by id.
    expect(report.selectedAction.rank).toBe(1);
    expect(report.candidateActions[0]).toBe(report.selectedAction);
    for (let i = 1; i < report.candidateActions.length; i++) {
      const prev = report.candidateActions[i - 1];
      const cur = report.candidateActions[i];
      if (prev.computedUtilityScore === cur.computedUtilityScore) {
        expect(prev.id.localeCompare(cur.id)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.computedUtilityScore).toBeGreaterThan(cur.computedUtilityScore);
      }
    }
    const ranks = report.candidateActions.map((a) => a.rank).sort((x, y) => x - y);
    expect(ranks).toEqual(Array.from({ length: report.candidateActions.length }, (_, i) => i + 1));

    const { entropy, reduction } = expectedEntropyAndReduction(report.candidateActions);
    expect(report.decisionEntropy).toBeCloseTo(Number(entropy.toFixed(3)), 3);
    expect(report.entropyReduction).toBeCloseTo(Number(reduction.toFixed(3)), 3);
  });

  it('non-detected anomalies do not trigger hardening and health stays 1.0', () => {
    const anomalies: AnomalyReport[] = [
      anomaly({ id: 'a1', domain: 'coding', status: 'repaired' }),
      anomaly({ id: 'a2', domain: 'math', status: 'quarantined' }),
    ];
    const report = evaluateGrowthDecision([], anomalies);
    expect(report.stateVectorSummary.healthIndex).toBe(1);
    expect(report.candidateActions.some((a) => a.actionType === 'deep_security_hardening')).toBe(false);
  });

  it('cross-domain hybridization requires at least two registered genes', () => {
    const one = evaluateGrowthDecision([tool('solo', 'coding', [version({ score: 0.8, promoted: true })])], []);
    expect(one.candidateActions.some((a) => a.actionType === 'cross_domain_hybridization')).toBe(false);
    const none = evaluateGrowthDecision([], []);
    expect(none.candidateActions.some((a) => a.actionType === 'cross_domain_hybridization')).toBe(false);
  });

  it('domain pass rates average real promoted scores and default a missing score to 0.8', () => {
    const registry: ToolEntry[] = [
      tool('t1', 'coding', [version({ score: 0.8, promoted: true })]),
      tool('t2', 'coding', [version({ score: 0.6, promoted: true })]), // avg (0.8 + 0.6)/2 = 0.7
      tool('t3', 'math', [version({ score: 0, promoted: true })]), // 0 → default 0.8
    ];
    const report = evaluateGrowthDecision(registry, []);
    // overallPassRate is the mean rounded to 2 dp, so *7 is within ±0.035 of 1.5.
    const passRate = (report.stateVectorSummary.overallPassRate as number) * 7;
    expect(passRate).toBeCloseTo(0.7 + 0.8, 1);
    expect(report.stateVectorSummary.activeDomains).toBe(2);
  });

  it('reports current timestamp and generation-derived ids', () => {
    const before = Date.now();
    const report = evaluateGrowthDecision([], [], undefined, 99, [], []);
    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(Date.now());
    expect(report.candidateActions.every((a) => a.id.endsWith('_99'))).toBe(true);
  });
});
