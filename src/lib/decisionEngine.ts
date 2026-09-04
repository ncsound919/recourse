import {
  ToolDomain,
  ToolEntry,
  AnomalyReport,
  GrowthFactorWeights,
  CandidateGrowthAction,
  GrowthDecisionReport,
  GrowthActionType,
  DreamThought,
  GitHubRepoBlueprint
} from '../types';

export const DEFAULT_GROWTH_WEIGHTS: GrowthFactorWeights = {
  domainGapWeight: 0.30,
  vulnerabilityWeight: 0.25,
  passRateImprovement: 0.20,
  noveltyExploration: 0.15,
  crossDomainSynergy: 0.10
};

const ALL_DOMAINS: ToolDomain[] = [
  'coding',
  'math',
  'biotech',
  'systemic',
  'neuro_symbolic',
  'cyber_defense',
  'quantum_sim'
];

/**
 * Deterministically evaluates the entire system state and generates a scored candidate action list.
 * Computes utility: U(action) = sum(w_i * factor_i) with zero non-deterministic random variance.
 */
export function evaluateGrowthDecision(
  registry: ToolEntry[],
  anomalies: AnomalyReport[],
  weights: GrowthFactorWeights = DEFAULT_GROWTH_WEIGHTS,
  generation: number = 1,
  recentThoughts: DreamThought[] = [],
  availableBlueprints: GitHubRepoBlueprint[] = []
): GrowthDecisionReport {
  // 1. Calculate Domain Coverage and Deficits
  const domainCounts: Record<ToolDomain, number> = {
    coding: 0,
    math: 0,
    biotech: 0,
    systemic: 0,
    neuro_symbolic: 0,
    cyber_defense: 0,
    quantum_sim: 0
  };

  const domainPassRates: Record<ToolDomain, number> = {
    coding: 1.0,
    math: 1.0,
    biotech: 1.0,
    systemic: 1.0,
    neuro_symbolic: 1.0,
    cyber_defense: 1.0,
    quantum_sim: 1.0
  };

  const domainScoresAcc: Record<ToolDomain, { totalScore: number; count: number }> = {
    coding: { totalScore: 0, count: 0 },
    math: { totalScore: 0, count: 0 },
    biotech: { totalScore: 0, count: 0 },
    systemic: { totalScore: 0, count: 0 },
    neuro_symbolic: { totalScore: 0, count: 0 },
    cyber_defense: { totalScore: 0, count: 0 },
    quantum_sim: { totalScore: 0, count: 0 }
  };

  registry.forEach(tool => {
    domainCounts[tool.domain] = (domainCounts[tool.domain] || 0) + 1;
    const promoted = tool.versions.find(v => v.promoted) || tool.versions[tool.versions.length - 1];
    if (promoted) {
      domainScoresAcc[tool.domain].totalScore += promoted.score || 0.8;
      domainScoresAcc[tool.domain].count += 1;
    }
  });

  ALL_DOMAINS.forEach(d => {
    if (domainScoresAcc[d].count > 0) {
      domainPassRates[d] = domainScoresAcc[d].totalScore / domainScoresAcc[d].count;
    } else {
      domainPassRates[d] = 0.0;
    }
  });

  const maxDomainCount = Math.max(...Object.values(domainCounts), 1);
  const activeAnomalies = anomalies.filter(a => a.status === 'detected');
  const candidateActions: CandidateGrowthAction[] = [];

  // 2. Formulate Candidate Action A: Domain Gap Expansions for under-represented domains
  ALL_DOMAINS.forEach(domain => {
    const count = domainCounts[domain] || 0;
    const domainDeficit = 1.0 - (count / maxDomainCount);
    const passRateGap = 1.0 - (domainPassRates[domain] || 0.0);
    const domainAnomalies = activeAnomalies.filter(a => a.domain === domain).length;
    const vulnerabilityUrgency = domainAnomalies > 0 ? Math.min(1.0, domainAnomalies * 0.5) : 0.05;

    // Novelty is higher for frontier domains (quantum, neuro_symbolic, biotech)
    const frontierBoost = (domain === 'quantum_sim' || domain === 'neuro_symbolic' || domain === 'biotech') ? 0.85 : 0.6;
    const noveltyPotential = domainDeficit * frontierBoost;
    const crossDomainSynergy = 0.4;

    const rawFactorScores = {
      domainDeficit,
      vulnerabilityUrgency,
      passRateGap,
      noveltyPotential,
      crossDomainSynergy
    };

    const computedUtilityScore =
      weights.domainGapWeight * domainDeficit +
      weights.vulnerabilityWeight * vulnerabilityUrgency +
      weights.passRateImprovement * passRateGap +
      weights.noveltyExploration * noveltyPotential +
      weights.crossDomainSynergy * crossDomainSynergy;

    candidateActions.push({
      id: `act_expand_${domain}_${generation}`,
      actionType: 'domain_gap_expansion',
      targetDomain: domain,
      title: `Expand Frontier Coverage: ${domain.toUpperCase().replace('_', ' ')}`,
      description: `Target deficit gap in ${domain} (active genes: ${count}/${maxDomainCount}) with specialized verifier-backed synthesis.`,
      rawFactorScores,
      computedUtilityScore: Number(computedUtilityScore.toFixed(4)),
      rank: 0,
      deterministicRationale: `Domain deficit is ${(domainDeficit * 100).toFixed(1)}% with pass rate gap ${(passRateGap * 100).toFixed(1)}%. Weight vector prioritization = ${computedUtilityScore.toFixed(3)}`,
      suggestedParameters: { domain }
    });
  });

  // 3. Formulate Candidate Action B: Deep Security Hardening if any anomalies or corrupted genes exist
  if (activeAnomalies.length > 0) {
    const topAnomaly = activeAnomalies[0];
    const vulnerabilityUrgency = Math.min(1.0, 0.6 + activeAnomalies.length * 0.15);
    const rawFactorScores = {
      domainDeficit: 0.1,
      vulnerabilityUrgency,
      passRateGap: 0.8,
      noveltyPotential: 0.2,
      crossDomainSynergy: 0.3
    };

    const computedUtilityScore =
      weights.domainGapWeight * 0.1 +
      weights.vulnerabilityWeight * vulnerabilityUrgency +
      weights.passRateImprovement * 0.8 +
      weights.noveltyExploration * 0.2 +
      weights.crossDomainSynergy * 0.3;

    candidateActions.push({
      id: `act_repair_${topAnomaly.toolName}_${generation}`,
      actionType: 'deep_security_hardening',
      targetDomain: topAnomaly.domain,
      targetToolName: topAnomaly.toolName,
      title: `Immediate Root-Cause Patch: ${topAnomaly.toolName}`,
      description: `Autonomous healing pipeline for ${topAnomaly.errorType} in ${topAnomaly.toolName} (${activeAnomalies.length} active anomalies).`,
      rawFactorScores,
      computedUtilityScore: Number(computedUtilityScore.toFixed(4)),
      rank: 0,
      deterministicRationale: `Critical anomaly ${topAnomaly.errorType} detected with severity ${topAnomaly.severity}. Vulnerability weight ${weights.vulnerabilityWeight} pushes utility to ${computedUtilityScore.toFixed(3)}`,
      suggestedParameters: { toolName: topAnomaly.toolName, faultHint: topAnomaly.errorType }
    });
  }

  // 4. Formulate Candidate Action C: GitHub Research Ingestion if un-ingested blueprints exist
  const unIngested = availableBlueprints.filter(b => !b.isIngested);
  if (unIngested.length > 0) {
    const topBp = unIngested[0];
    const domainDeficit = 1.0 - ((domainCounts[topBp.domain] || 0) / maxDomainCount);
    const rawFactorScores = {
      domainDeficit,
      vulnerabilityUrgency: 0.1,
      passRateGap: 0.3,
      noveltyPotential: 0.9,
      crossDomainSynergy: 0.5
    };

    const computedUtilityScore =
      weights.domainGapWeight * domainDeficit +
      weights.vulnerabilityWeight * 0.1 +
      weights.passRateImprovement * 0.3 +
      weights.noveltyExploration * 0.9 +
      weights.crossDomainSynergy * 0.5;

    candidateActions.push({
      id: `act_github_ingest_${topBp.id}_${generation}`,
      actionType: 'github_research_import',
      targetDomain: topBp.domain,
      targetToolName: topBp.algorithmName,
      title: `Ingest Open-Source Blueprint: ${topBp.repoName} (${topBp.algorithmName})`,
      description: `Transpile, sandbox-verify, and promote deterministic algorithm from open-source research catalog (${topBp.stars} stars).`,
      rawFactorScores,
      computedUtilityScore: Number(computedUtilityScore.toFixed(4)),
      rank: 0,
      deterministicRationale: `High novelty potential (0.90) from verified open source repository with asymptotic complexity ${topBp.asymptoticComplexity}`,
      suggestedParameters: { blueprintId: topBp.id }
    });
  }

  // 5. Formulate Candidate Action D: Lucid Dream State Crystallization
  const crystallizableThought = recentThoughts.find(t => t.crystallizationReadiness >= 0.75);
  if (crystallizableThought) {
    const rawFactorScores = {
      domainDeficit: 0.4,
      vulnerabilityUrgency: 0.1,
      passRateGap: 0.2,
      noveltyPotential: 0.95,
      crossDomainSynergy: 0.85
    };

    const computedUtilityScore =
      weights.domainGapWeight * 0.4 +
      weights.vulnerabilityWeight * 0.1 +
      weights.passRateImprovement * 0.2 +
      weights.noveltyExploration * 0.95 +
      weights.crossDomainSynergy * 0.85;

    candidateActions.push({
      id: `act_dream_crystallize_${crystallizableThought.id}`,
      actionType: 'dream_crystallization',
      targetDomain: crystallizableThought.domain,
      title: `Crystallize Subconscious Dream: ${crystallizableThought.hypothesis.slice(0, 45)}...`,
      description: `Promote dream phase insight (${crystallizableThought.phase}) with ${(crystallizableThought.crystallizationReadiness * 100).toFixed(0)}% readiness into verified gene.`,
      rawFactorScores,
      computedUtilityScore: Number(computedUtilityScore.toFixed(4)),
      rank: 0,
      deterministicRationale: `Dream thought reached ${(crystallizableThought.crystallizationReadiness * 100).toFixed(0)}% cognitive coherence with high novelty potential (0.95).`,
      suggestedParameters: { thoughtId: crystallizableThought.id }
    });
  }

  // 6. Formulate Candidate Action E: Cross-Domain Hybridization (Genetic Crossover)
  if (registry.length >= 2) {
    const rawFactorScores = {
      domainDeficit: 0.3,
      vulnerabilityUrgency: 0.05,
      passRateGap: 0.2,
      noveltyPotential: 0.8,
      crossDomainSynergy: 0.95
    };

    const computedUtilityScore =
      weights.domainGapWeight * 0.3 +
      weights.vulnerabilityWeight * 0.05 +
      weights.passRateImprovement * 0.2 +
      weights.noveltyExploration * 0.8 +
      weights.crossDomainSynergy * 0.95;

    candidateActions.push({
      id: `act_crossover_${generation}`,
      actionType: 'cross_domain_hybridization',
      targetDomain: 'cyber_defense',
      title: 'Synthesize Multi-Genome Hybrid (Genetic Crossover)',
      description: 'Recombine disparate domain invariants (e.g. quantum unitary logic x lockless ring buffer) into a hybrid architecture.',
      rawFactorScores,
      computedUtilityScore: Number(computedUtilityScore.toFixed(4)),
      rank: 0,
      deterministicRationale: `Maximum cross-domain synergy potential (0.95) with weights.crossDomainSynergy = ${weights.crossDomainSynergy}`,
      suggestedParameters: {
        parentA: registry[0]?.name,
        parentB: registry[registry.length - 1]?.name,
        targetDomain: 'cyber_defense'
      }
    });
  }

  // 7. Sort candidate actions deterministically by computedUtilityScore descending
  candidateActions.sort((a, b) => {
    if (b.computedUtilityScore !== a.computedUtilityScore) {
      return b.computedUtilityScore - a.computedUtilityScore;
    }
    return a.id.localeCompare(b.id);
  });

  candidateActions.forEach((act, idx) => {
    act.rank = idx + 1;
  });

  const selectedAction = candidateActions[0] || {
    id: `act_fallback_${generation}`,
    actionType: 'domain_gap_expansion',
    targetDomain: 'coding',
    title: 'Baseline Architectural Expansion: Coding',
    description: 'Autonomous standard gene evolution step.',
    rawFactorScores: { domainDeficit: 0.5, vulnerabilityUrgency: 0.1, passRateGap: 0.1, noveltyPotential: 0.5, crossDomainSynergy: 0.2 },
    computedUtilityScore: 0.5,
    rank: 1,
    deterministicRationale: 'Fallback baseline progression'
  };

  // Compute Shannon Entropy H(X) = -sum(p_i * log2(p_i)) of utility distribution
  const totalUtility = candidateActions.reduce((sum, c) => sum + Math.max(0.001, c.computedUtilityScore), 0);
  let decisionEntropy = 0;
  candidateActions.forEach(c => {
    const p = Math.max(0.001, c.computedUtilityScore) / totalUtility;
    decisionEntropy -= p * Math.log2(p);
  });

  const entropyReduction = Math.max(0, 2.80 - decisionEntropy);

  const activeDomainCount = Object.values(domainCounts).filter(c => c > 0).length;
  const healthIndex = activeAnomalies.length === 0 ? 1.0 : Math.max(0.2, 1.0 - activeAnomalies.length * 0.25);
  const overallPassRate = Object.values(domainPassRates).reduce((s, r) => s + r, 0) / ALL_DOMAINS.length;

  return {
    timestamp: Date.now(),
    generation,
    weights,
    candidateActions,
    selectedAction,
    decisionEntropy: Number(decisionEntropy.toFixed(3)),
    entropyReduction: Number(entropyReduction.toFixed(3)),
    stateVectorSummary: {
      totalGenes: registry.length,
      activeDomains: activeDomainCount,
      healthIndex: Number(healthIndex.toFixed(2)),
      overallPassRate: Number(overallPassRate.toFixed(2))
    }
  };
}
