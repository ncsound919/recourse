// src/lib/recursiveMathEngine.ts — Deterministic Five-Formula Recursive Learning Engine
// Implements the complete closed loop:
// 1. Euler's Formula: e^(ix) = cos(x) + i*sin(x) -> Spectral feature encoding & phasor decomposition
// 2. Pythagorean Theorem: d = sqrt(sum(a_i - b_i)^2) -> Invariant loss metric & similarity scoring
// 3. The Derivative: theta_(t+1) = theta_t - eta * grad_L -> Recursive parameter optimization step
// 4. Schrödinger Equation: Psi_(t+dt) = exp(-i*H*dt / hbar) * Psi_t -> Unitary state-space memory evolution
// 5. E = mc^2: Energy & Compute Budget Gate -> Relativistic resource accounting & ROI sentinel

import type {
  ComplexPhasor,
  DerivativeUpdate,
  EulerEncoding,
  EnergyBudget,
  PythagoreanMetric,
  RecursiveIterationResult,
  RecursiveLoopParameters,
  RecursiveLoopState,
  SchrodingerEvolution,
  BellmanValue,
  BayesianUpdate,
  ChainRuleGradient,
  CoreArchitecture
} from '../types';

export const DEFAULT_LOOP_CONFIG: RecursiveLoopParameters = {
  learningRateEta: 0.12,
  momentumMu: 0.85,
  energyBudgetCap: 5000,
  timeStepDeltaT: 0.05,
  planckConstantHbar: 1.0,
  spectralBinsN: 8,
  invariantTolerance: 0.04,
  targetInvariantVector: [1.0, 0.85, 0.70, 0.55, 0.40, 0.25, 0.15, 0.05],
};

// =========================================================================
// 1. EULER'S FORMULA: e^(ix) = cos(x) + i*sin(x)
// Spectral Encoding & Phasor Decomposition
// =========================================================================
export function computeEulerEncoding(
  signal: number[],
  spectralBins: number = 8
): EulerEncoding {
  const N = Math.max(1, signal.length);
  const phasors: ComplexPhasor[] = [];
  let totalMagnitude = 0;

  for (let k = 0; k < spectralBins; k++) {
    let sumReal = 0;
    let sumImag = 0;

    for (let n = 0; n < N; n++) {
      // Euler's formula: exp(-i * 2 * pi * k * n / N) = cos(...) - i * sin(...)
      const angle = (2 * Math.PI * k * n) / N;
      const x_n = signal[n] ?? 0;
      sumReal += x_n * Math.cos(angle);
      sumImag -= x_n * Math.sin(angle);
    }

    const mag = Math.sqrt(sumReal * sumReal + sumImag * sumImag) / N;
    const phase = Math.atan2(sumImag, sumReal);
    totalMagnitude += mag;

    phasors.push({
      frequency: k,
      real: Math.round(sumReal * 10000) / 10000,
      imag: Math.round(sumImag * 10000) / 10000,
      magnitude: Math.round(mag * 10000) / 10000,
      phaseAngleRad: Math.round(phase * 10000) / 10000,
      spectralContribution: 0, // filled below
    });
  }

  // Calculate spectral contribution & Shannon spectral entropy
  let entropy = 0;
  let primaryHarmonic = 0;
  let maxMag = -1;

  for (const p of phasors) {
    p.spectralContribution =
      totalMagnitude > 0
        ? Math.round((p.magnitude / totalMagnitude) * 10000) / 10000
        : 0;
    if (p.spectralContribution > 1e-9) {
      entropy -= p.spectralContribution * Math.log2(p.spectralContribution);
    }
    if (p.magnitude > maxMag && p.frequency > 0) {
      maxMag = p.magnitude;
      primaryHarmonic = p.frequency;
    }
  }

  // Phase coherence: vector sum of normalized unit phasors
  let sumCos = 0;
  let sumSin = 0;
  for (const p of phasors) {
    sumCos += Math.cos(p.phaseAngleRad);
    sumSin += Math.sin(p.phaseAngleRad);
  }
  const phaseCoherence =
    Math.round((Math.sqrt(sumCos * sumCos + sumSin * sumSin) / spectralBins) * 10000) /
    10000;

  const encodedFeatureVector = phasors.map((p) => p.magnitude);

  return {
    formulaLatex: 'e^{ix} = \\cos x + i\\sin x',
    phasors,
    primaryHarmonicHz: primaryHarmonic,
    spectralEntropy: Math.round(entropy * 1000) / 1000,
    phaseCoherence,
    encodedFeatureVector,
  };
}

// =========================================================================
// 2. PYTHAGOREAN THEOREM: d = sqrt( sum( (a_i - b_i)^2 ) )
// Loss Calculation & Invariant Distance Metric
// =========================================================================
export function computePythagoreanMetric(
  currentVector: number[],
  targetVector: number[],
  tolerance: number = 0.04
): PythagoreanMetric {
  const len = Math.min(currentVector.length, targetVector.length);
  let sumSquaredDelta = 0;
  let dotProd = 0;
  let magA2 = 0;
  let magB2 = 0;
  const violations: string[] = [];

  for (let i = 0; i < len; i++) {
    const cur = currentVector[i] ?? 0;
    const tgt = targetVector[i] ?? 0;
    const delta = cur - tgt;
    sumSquaredDelta += delta * delta;

    dotProd += cur * tgt;
    magA2 += cur * cur;
    magB2 += tgt * tgt;

    if (Math.abs(delta) > tolerance) {
      violations.push(`Dim[${i}]: Δ=${(Math.abs(delta)).toFixed(4)} > tol(${tolerance})`);
    }
  }

  const euclideanDistance = Math.sqrt(sumSquaredDelta);
  const squaredErrorLoss = 0.5 * sumSquaredDelta;

  const denom = Math.sqrt(magA2) * Math.sqrt(magB2);
  const cosineSimilarity = denom > 0 ? dotProd / denom : 0;

  // Readiness Score: R = 1 / (1 + d) bounded in [0, 1]
  const readinessScore = 1 / (1 + euclideanDistance);

  return {
    formulaLatex: 'd = \\sqrt{\\sum_{i=1}^n (a_i - b_i)^2}',
    currentVector: currentVector.map((v) => Math.round(v * 10000) / 10000),
    targetVector: targetVector.map((v) => Math.round(v * 10000) / 10000),
    euclideanDistance: Math.round(euclideanDistance * 10000) / 10000,
    squaredErrorLoss: Math.round(squaredErrorLoss * 10000) / 10000,
    cosineSimilarity: Math.round(cosineSimilarity * 10000) / 10000,
    readinessScore: Math.round(readinessScore * 10000) / 10000,
    invariantViolations: violations,
    isWithinInvariantTolerance: violations.length === 0,
  };
}

// =========================================================================
// 3. THE DERIVATIVE: theta_(t+1) = theta_t - eta * grad_L
// Recursive Parameter Update via Gradient Descent
// =========================================================================
export function computeDerivativeUpdate(
  currentParams: number[],
  targetVector: number[],
  priorDeltas: number[],
  eta: number = 0.12,
  mu: number = 0.85
): DerivativeUpdate {
  const len = currentParams.length;
  const gradients: number[] = [];
  const parameterDeltas: number[] = [];
  const updatedParameters: number[] = [];
  let gradNormSq = 0;

  for (let i = 0; i < len; i++) {
    const cur = currentParams[i] ?? 0;
    const tgt = targetVector[i] ?? 0;

    // Gradient of L = 0.5 * sum( (cur - tgt)^2 ) w.r.t cur is (cur - tgt)
    const g = cur - tgt;
    gradients.push(Math.round(g * 10000) / 10000);
    gradNormSq += g * g;

    // Momentum update: delta_t = mu * delta_(t-1) - eta * g
    const prevDelta = priorDeltas[i] ?? 0;
    const delta = mu * prevDelta - eta * g;
    parameterDeltas.push(Math.round(delta * 10000) / 10000);

    const nextVal = Math.max(0, cur + delta);
    updatedParameters.push(Math.round(nextVal * 10000) / 10000);
  }

  const gradientNorm = Math.sqrt(gradNormSq);

  // Compute loss delta before & after
  let lossBefore = 0;
  let lossAfter = 0;
  for (let i = 0; i < len; i++) {
    const tgt = targetVector[i] ?? 0;
    lossBefore += 0.5 * Math.pow((currentParams[i] ?? 0) - tgt, 2);
    lossAfter += 0.5 * Math.pow(updatedParameters[i] - tgt, 2);
  }

  return {
    formulaLatex: '\\theta_{t+1} = \\theta_t - \\eta \\nabla L(\\theta_t)',
    gradients,
    parameterDeltas,
    learningRateEta: eta,
    momentumMu: mu,
    gradientNorm: Math.round(gradientNorm * 10000) / 10000,
    priorParameters: currentParams.map((p) => Math.round(p * 10000) / 10000),
    updatedParameters,
    backpropChainDepth: len,
    lossDelta: Math.round((lossAfter - lossBefore) * 10000) / 10000,
  };
}

// =========================================================================
// 4. SCHRÖDINGER EQUATION: Psi_(t+dt) = exp(-i * H * dt / hbar) * Psi_t
// Unitary State-Space Evolution & Memory Preservation
// =========================================================================
export function computeSchrodingerEvolution(
  currentPsi: Array<{ real: number; imag: number; amplitudeSq: number }>,
  dt: number = 0.05,
  hbar: number = 1.0,
  energyLevels: number[] = [1.0, 1.5, 2.0, 2.7, 3.5, 4.4, 5.5, 6.8]
): SchrodingerEvolution {
  const len = currentPsi.length;
  const nextPsi: Array<{ real: number; imag: number; amplitudeSq: number }> = [];
  let normSum = 0;
  let expectedEnergy = 0;

  for (let k = 0; k < len; k++) {
    const psi_k = currentPsi[k] || { real: 1 / Math.sqrt(len), imag: 0, amplitudeSq: 1 / len };
    const E_k = energyLevels[k] ?? (1.0 + k * 0.5);

    // Unitary phase rotation angle: theta = - (E_k * dt) / hbar
    const theta = -(E_k * dt) / hbar;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    // Complex multiplication: (a + ib) * (cos + i sin) = (a cos - b sin) + i (a sin + b cos)
    const nextReal = psi_k.real * cosTheta - psi_k.imag * sinTheta;
    const nextImag = psi_k.real * sinTheta + psi_k.imag * cosTheta;
    const ampSq = nextReal * nextReal + nextImag * nextImag;

    normSum += ampSq;
    expectedEnergy += ampSq * E_k;

    nextPsi.push({
      real: Math.round(nextReal * 10000) / 10000,
      imag: Math.round(nextImag * 10000) / 10000,
      amplitudeSq: Math.round(ampSq * 10000) / 10000,
    });
  }

  // Exact norm preservation verification
  const normPreserved = Math.abs(normSum - 1.0) < 0.005;

  return {
    formulaLatex: '\\Psi_{t+\\Delta t} = e^{-i\\hat{H}\\Delta t / \\hbar}\\Psi_t',
    stateVectorPsi: nextPsi,
    timeStepDeltaT: dt,
    planckConstantHbar: hbar,
    hamiltonianEnergyLevels: energyLevels,
    normConservationCheck: Math.round(normSum * 100000) / 100000,
    expectedEnergyValue: Math.round(expectedEnergy * 1000) / 1000,
    coherencePreserved: normPreserved,
  };
}

// =========================================================================
// 5. E = mc²: Energy & Compute Budget Gate
// Relativistic Resource Barrier & Early-Stopping Sentinel
// =========================================================================
export function computeEnergyBudget(
  currentMassM: number,
  iteration: number,
  deltaReadiness: number,
  budgetRemaining: number,
  budgetCap: number = 5000
): EnergyBudget {
  const c = 1.0; // Normalized compute speed constant
  // Relativistic velocity ratio increases as recursion approaches fine convergence
  const v = Math.min(0.95, 0.15 + (iteration % 20) * 0.035);
  // Lorentz factor: gamma = 1 / sqrt(1 - (v/c)^2)
  const gamma = 1 / Math.sqrt(Math.max(0.01, 1 - (v * v) / (c * c)));

  // Relativistic Energy Cost: E = gamma * m * c^2
  const energyConsumed = Math.round(gamma * currentMassM * c * c * 100) / 100;
  // Token-bucket renewal: the system harvests ambient compute each tick
  // (cooling/recharge). Without this the finite budget depletes after ~500
  // ticks and the gate sticks at HALT forever while ticks continue anyway.
  const ENERGY_TRICKLE = 15;
  const newBudgetRemaining = Math.min(budgetCap, Math.max(0, budgetRemaining - energyConsumed) + ENERGY_TRICKLE);

  // Compute ROI: Marginal readiness gained per unit of energy consumed
  const computeRoi =
    energyConsumed > 0 ? Math.round((Math.max(0, deltaReadiness) / energyConsumed) * 10000) / 10000 : 0;

  // Gate decision: Continue only if budget remains and not in extreme exhaustion
  const permitNext = newBudgetRemaining > 20;

  return {
    formulaLatex: 'E = \\gamma m c^2 = \\frac{m c^2}{\\sqrt{1 - v^2/c^2}}',
    iterationMassM: Math.round(currentMassM * 100) / 100,
    computeSpeedOfLightC: c,
    relativisticVelocityV: Math.round(v * 1000) / 1000,
    lorentzFactorGamma: Math.round(gamma * 1000) / 1000,
    energyJoulesOrFlops: energyConsumed,
    budgetCap,
    budgetRemaining: Math.round(newBudgetRemaining * 100) / 100,
    marginalReadinessGain: Math.round(deltaReadiness * 10000) / 10000,
    computeRoi,
    permitNextIteration: permitNext,
  };
}

// =========================================================================
// 6. BELLMAN EQUATION: V(s) = max_a [ R(s,a) + gamma * V(s') ]
// =========================================================================
export function computeBellmanUpdate(
  currentV: number[],
  rewards: number[],
  gamma: number = 0.9
): BellmanValue {
  const nextV: number[] = [];
  let maxDelta = 0;
  
  for (let i = 0; i < currentV.length; i++) {
    const curVal = currentV[i];
    // Simple deterministic chain: max_a is just taking the value of next state, or self if at end
    const nextStateVal = i < currentV.length - 1 ? currentV[i + 1] : currentV[i];
    const newVal = rewards[i] + gamma * nextStateVal;
    
    nextV.push(Math.round(newVal * 10000) / 10000);
    maxDelta = Math.max(maxDelta, Math.abs(newVal - curVal));
  }
  
  return {
    formulaLatex: 'V(s) = \\max_a \\left[ R(s,a) + \\gamma \\, V(s\') \\right]',
    stateValues: nextV,
    rewards,
    discountGamma: gamma,
    maxDelta: Math.round(maxDelta * 10000) / 10000
  };
}

// =========================================================================
// 7. SEQUENTIAL BAYES (KALMAN/GAUSSIAN): pi_t(theta) propto L_t(theta) * pi_{t-1}(theta)
// =========================================================================
export function computeBayesianUpdate(
  priorMu: number,
  priorSigma: number,
  observation: number,
  obsNoise: number = 0.1
): BayesianUpdate {
  // Kalman gain with zero-division safeguard
  const kalmanGain = priorSigma / Math.max(1e-9, priorSigma + obsNoise);
  
  // Posterior updates
  const posteriorMu = priorMu + kalmanGain * (observation - priorMu);
  let posteriorSigma = (1 - kalmanGain) * priorSigma;
  
  // Add tiny process noise to prevent absolute zero variance
  posteriorSigma = Math.max(posteriorSigma, 0.005);
  
  return {
    formulaLatex: '\\pi_t(\\theta) \\propto L_t(\\theta)\\,\\pi_{t-1}(\\theta)',
    priorMu: Math.round(priorMu * 10000) / 10000,
    priorSigma: Math.round(priorSigma * 10000) / 10000,
    observation: Math.round(observation * 10000) / 10000,
    kalmanGain: Math.round(kalmanGain * 10000) / 10000,
    posteriorMu: Math.round(posteriorMu * 10000) / 10000,
    posteriorSigma: Math.round(posteriorSigma * 10000) / 10000
  };
}

// =========================================================================
// 8. GRADIENT DESCENT + CHAIN RULE: theta_{t+1} = theta_t - eta * grad_L
// =========================================================================
export function computeChainRuleGradient(
  weights: number[],
  input: number,
  target: number,
  eta: number = 0.1
): ChainRuleGradient {
  // Simple forward pass: h1 = x*w1, h2 = h1*w2, y = h2*w3
  const h1 = input * weights[0];
  const h2 = h1 * weights[1];
  const y = h2 * weights[2];
  
  const loss = 0.5 * Math.pow(y - target, 2);
  
  // Backward pass
  const dL_dy = y - target;
  
  const dL_dw3 = dL_dy * h2;
  const dL_dh2 = dL_dy * weights[2];
  
  const dL_dw2 = dL_dh2 * h1;
  const dL_dh1 = dL_dh2 * weights[1];
  
  const dL_dw1 = dL_dh1 * input;
  
  const gradients = [dL_dw1, dL_dw2, dL_dw3];
  
  return {
    formulaLatex: '\\theta_{t+1} = \\theta_t - \\eta \\, \\nabla L(\\theta_t)',
    weights: weights.map(w => Math.round(w * 1000) / 1000),
    activations: [Math.round(h1 * 1000) / 1000, Math.round(h2 * 1000) / 1000, Math.round(y * 1000) / 1000],
    gradients: gradients.map(g => Math.round(g * 1000) / 1000),
    target,
    loss: Math.round(loss * 10000) / 10000
  };
}

// =========================================================================
// FULL RECURSIVE LEARNING LOOP CYCLE
// =========================================================================

export function createInitialLoopState(
  config: RecursiveLoopParameters = DEFAULT_LOOP_CONFIG
): RecursiveLoopState {
  const initialParams = [0.2, 0.4, 0.6, 0.8, 0.5, 0.3, 0.1, 0.05];
  const N = config.spectralBinsN;

  // Initialize state vector Psi with equal superposition
  const initialPsi = Array.from({ length: N }, () => ({
    real: Math.round((1 / Math.sqrt(N)) * 10000) / 10000,
    imag: 0,
    amplitudeSq: Math.round((1 / N) * 10000) / 10000,
  }));

  const euler = computeEulerEncoding(initialParams, N);
  const pythagoras = computePythagoreanMetric(
    initialParams,
    config.targetInvariantVector,
    config.invariantTolerance
  );
  const derivative = computeDerivativeUpdate(
    initialParams,
    config.targetInvariantVector,
    new Array(N).fill(0),
    config.learningRateEta,
    config.momentumMu
  );
  const schrodinger = computeSchrodingerEvolution(
    initialPsi,
    config.timeStepDeltaT,
    config.planckConstantHbar
  );
  const energyBudget = computeEnergyBudget(
    10.0,
    1,
    0.05,
    config.energyBudgetCap,
    config.energyBudgetCap
  );
  
  // Trifecta Init
  const initBellmanV = [0.0, 0.0, 0.0, 0.0, 0.0];
  const bellman = computeBellmanUpdate(initBellmanV, [0.1, 0.2, 0.4, 0.7, 1.0], config.bellmanGamma || 0.9);
  
  const initBayesMu = 0.5;
  const initBayesSigma = 0.2;
  const bayes = computeBayesianUpdate(initBayesMu, initBayesSigma, pythagoras.readinessScore, config.bayesObservationNoise || 0.1);
  
  const initChainWeights = [0.5, 0.5, 0.5];
  const chainRule = computeChainRuleGradient(initChainWeights, 1.0, 1.0, config.learningRateEta);

  const initialResult: RecursiveIterationResult = {
    iteration: 1,
    timestamp: Date.now(),
    euler,
    pythagoras,
    derivative,
    schrodinger,
    energyBudget,
    bellman,
    bayes,
    chainRule,
    readinessScore: pythagoras.readinessScore,
    overallConvergenceRatio: Math.min(1.0, pythagoras.readinessScore),
    loopStatus: 'converging',
  };

  return {
    isLoopRunning: false,
    iteration: 1,
    converged: false,
    currentParameters: initialParams,
    bellmanV: initBellmanV,
    bayesMu: initBayesMu,
    bayesSigma: initBayesSigma,
    chainWeights: initChainWeights,
    history: [initialResult],
    latestResult: initialResult,
    config: {
      ...config,
      coreArchitecture: config.coreArchitecture || 'five-formula'
    },
  };
}

export function executeRecursiveStep(
  state: RecursiveLoopState
): RecursiveIterationResult {
  const currentGen = state.iteration + 1;
  const config = state.config;
  const prevResult = state.latestResult;

  // 1. Euler Encoding
  const euler = computeEulerEncoding(state.currentParameters, config.spectralBinsN);

  // 2. Pythagorean Loss & Invariant Distance
  const pythagoras = computePythagoreanMetric(
    state.currentParameters,
    config.targetInvariantVector,
    config.invariantTolerance
  );

  // 3. Derivative Gradient Update
  const derivative = computeDerivativeUpdate(
    state.currentParameters,
    config.targetInvariantVector,
    prevResult.derivative.parameterDeltas,
    config.learningRateEta,
    config.momentumMu
  );

  // 4. Schrödinger Unitary Evolution
  const schrodinger = computeSchrodingerEvolution(
    prevResult.schrodinger.stateVectorPsi,
    config.timeStepDeltaT,
    config.planckConstantHbar
  );

  // 5. Energy Budget Gate (E = mc^2)
  const massEstimate = 8.0 + derivative.gradientNorm * 4.0;
  const deltaReadiness = pythagoras.readinessScore - prevResult.readinessScore;
  const energyBudget = computeEnergyBudget(
    massEstimate,
    currentGen,
    deltaReadiness,
    prevResult.energyBudget.budgetRemaining,
    config.energyBudgetCap
  );
  
  // 6. Trifecta computations
  const bellman = computeBellmanUpdate(
    state.bellmanV || [0,0,0,0,0], 
    [0.1, 0.2, 0.4, 0.7, 1.0], 
    config.bellmanGamma || 0.9
  );
  
  const bayes = computeBayesianUpdate(
    state.bayesMu || 0.5,
    state.bayesSigma || 0.2,
    pythagoras.readinessScore,
    config.bayesObservationNoise || 0.1
  );
  
  const chainRule = computeChainRuleGradient(
    state.chainWeights || [0.5, 0.5, 0.5],
    1.0, 
    1.0, // target is 1.0 (perfect readiness)
    config.learningRateEta
  );

  // Assess loop status
  let status: 'converging' | 'optimal' | 'budget_gated' | 'divergent' = 'converging';
  if (pythagoras.isWithinInvariantTolerance && pythagoras.readinessScore >= 0.96) {
    status = 'optimal';
  } else if (!energyBudget.permitNextIteration) {
    status = 'budget_gated';
  } else if (pythagoras.euclideanDistance > 3.0) {
    status = 'divergent';
  }

  const result: RecursiveIterationResult = {
    iteration: currentGen,
    timestamp: Date.now(),
    euler,
    pythagoras,
    derivative,
    schrodinger,
    energyBudget,
    bellman,
    bayes,
    chainRule,
    readinessScore: pythagoras.readinessScore,
    overallConvergenceRatio: Math.min(1.0, pythagoras.readinessScore),
    loopStatus: status,
  };

  // Mutate state in memory
  state.iteration = currentGen;
  state.currentParameters = derivative.updatedParameters;
  state.bellmanV = bellman.stateValues;
  state.bayesMu = bayes.posteriorMu;
  state.bayesSigma = bayes.posteriorSigma;
  
  // Update chain weights using computed gradients
  if (state.chainWeights) {
    state.chainWeights = state.chainWeights.map((w, i) => Math.max(0, w - config.learningRateEta * chainRule.gradients[i]));
  }
  
  state.converged = status === 'optimal';
  state.latestResult = result;
  state.history.push(result);

  if (state.history.length > 50) {
    state.history.shift();
  }

  return result;
}
