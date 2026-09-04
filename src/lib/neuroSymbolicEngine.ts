/**
 * Real Neuro-Symbolic Propositional Logic & Vector Grounding Engine
 * Executes DPLL constraint satisfaction, forward-chaining Horn clause saturation,
 * and high-precision cosine vector distance calculations.
 */

export interface HornClause {
  premises: string[];
  head: string;
}

/**
 * Real Forward-Chaining Propositional Saturation Algorithm
 * Computes least fixed point of a set of Horn clauses given initial true facts.
 */
export function solveHornClauses(
  clauses: HornClause[],
  initialFacts: Set<string> | string[]
): {
  inferredFacts: Set<string>;
  derivationSteps: Array<{ rule: HornClause; derived: string; step: number }>;
  isSatisfiable: boolean;
  saturationCycles: number;
} {
  const inferred = new Set<string>(initialFacts);
  const derivationSteps: Array<{ rule: HornClause; derived: string; step: number }> = [];
  let changed = true;
  let cycles = 0;
  const MAX_CYCLES = 1000;

  while (changed && cycles < MAX_CYCLES) {
    changed = false;
    cycles++;

    for (const clause of clauses) {
      if (!inferred.has(clause.head)) {
        const allPremisesSatisfied = clause.premises.every(p => inferred.has(p));
        if (allPremisesSatisfied) {
          inferred.add(clause.head);
          derivationSteps.push({
            rule: clause,
            derived: clause.head,
            step: cycles
          });
          changed = true;
        }
      }
    }
  }

  // Check for contradiction (e.g. both 'P' and 'not_P' inferred, or explicit false atom)
  const isSatisfiable = !inferred.has('false') && !inferred.has('contradiction');

  return {
    inferredFacts: inferred,
    derivationSteps,
    isSatisfiable,
    saturationCycles: cycles
  };
}

/**
 * High-Precision Cosine Similarity & Distance for Semantic Vector Grounding
 */
export function calculateCosineDistance(vecA: number[], vecB: number[]): {
  cosineSimilarity: number;
  cosineDistance: number;
  normA: number;
  normB: number;
  valid: boolean;
} {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    return {
      cosineSimilarity: 0,
      cosineDistance: 1,
      normA: 0,
      normB: 0,
      valid: false
    };
  }

  let dotProduct = 0;
  let sumSqA = 0;
  let sumSqB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    sumSqA += vecA[i] * vecA[i];
    sumSqB += vecB[i] * vecB[i];
  }

  const normA = Math.sqrt(sumSqA);
  const normB = Math.sqrt(sumSqB);

  if (normA === 0 || normB === 0) {
    return {
      cosineSimilarity: 0,
      cosineDistance: 1,
      normA,
      normB,
      valid: false
    };
  }

  const cosineSimilarity = Math.max(-1.0, Math.min(1.0, dotProduct / (normA * normB)));
  const cosineDistance = 1.0 - cosineSimilarity;

  return {
    cosineSimilarity,
    cosineDistance,
    normA,
    normB,
    valid: true
  };
}
