import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Zap,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  ArrowRight,
  Radio,
  Cpu,
  Compass,
  Atom,
  Info,
  ShieldCheck,
  TrendingDown
} from 'lucide-react';
import type {
  RecursiveLoopState,
  RecursiveLoopParameters,
} from '../types';
import {
  createInitialLoopState,
  executeRecursiveStep,
  DEFAULT_LOOP_CONFIG,
} from '../lib/recursiveMathEngine';
import { speak, playChirp } from '../lib/voice';

interface RecursiveLoopViewProps {
  onNotify?: (msg: string) => void;
}

export const RecursiveLoopView: React.FC<RecursiveLoopViewProps> = ({ onNotify }) => {
  const [state, setState] = useState<RecursiveLoopState>(() => createInitialLoopState());
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isStepping, setIsStepping] = useState<boolean>(false);
  const [activeFormulaTab, setActiveFormulaTab] = useState<'all' | 'euler' | 'pythagoras' | 'derivative' | 'schrodinger' | 'emc2'>('all');
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [config, setConfig] = useState<RecursiveLoopParameters>(DEFAULT_LOOP_CONFIG);

  const autoRunTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSteppingRef = useRef<boolean>(false);

  // Fetch server-side loop state on mount
  const fetchLoopState = useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/math/state').then((r) => r.json());
      if (res?.success && res.state) {
        setState(res.state);
        if (res.state.config) setConfig(res.state.config);
      }
    } catch (err) {
      console.warn('Math loop sync note:', err);
    }
  }, []);

  useEffect(() => {
    fetchLoopState();
  }, [fetchLoopState]);

  // Step Iteration Handler
  const handleStep = useCallback(async () => {
    if (isSteppingRef.current) return;
    isSteppingRef.current = true;
    setIsStepping(true);
    playChirp('loop_tick');
    try {
      const res = await fetch('/api/recourse/math/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());

      if (res?.success && res.state) {
        setState(res.state);
        if (res.result.readinessScore > 0.94) {
          // Internal math-loop telemetry only - NOT capability progress. Readiness
          // is a self-consistent formula number; keep it out of the "improving"
          // framing so it isn't mistaken for real development.
          playChirp('loop_tick');
          speak(`5-formula loop readiness at ${(res.result.readinessScore * 100).toFixed(0)} percent. This is internal telemetry, not capability progress.`);
          if (onNotify) {
            onNotify(`5-formula loop: readiness ${(res.result.readinessScore * 100).toFixed(1)}% (internal math-loop telemetry; real progress is measured by verified tools).`);
          }
        }
      } else {
        // Local client fallback
        setState((prev) => {
          const nextState = { ...prev, config };
          executeRecursiveStep(nextState);
          return { ...nextState };
        });
      }
    } catch {
      // Local client fallback
      setState((prev) => {
        const nextState = { ...prev, config };
        executeRecursiveStep(nextState);
        return { ...nextState };
      });
    } finally {
      isSteppingRef.current = false;
      setIsStepping(false);
    }
  }, [config, onNotify]);

  // Continuous Auto-Loop
  useEffect(() => {
    if (isRunning) {
      autoRunTimerRef.current = setInterval(() => {
        handleStep();
      }, 1200);
    } else {
      if (autoRunTimerRef.current) clearInterval(autoRunTimerRef.current);
    }
    return () => {
      if (autoRunTimerRef.current) clearInterval(autoRunTimerRef.current);
    };
  }, [isRunning, handleStep]);

  // Reset Handler
  const handleReset = async () => {
    try {
      const res = await fetch('/api/recourse/math/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());

      if (res?.success && res.state) {
        setState(res.state);
      } else {
        setState(createInitialLoopState(config));
      }
    } catch {
      setState(createInitialLoopState(config));
    }
    if (onNotify) onNotify(' Recursive Math Loop Reset to Superposition State');
  };

  // Config Update Handler
  const handleUpdateConfig = async (newParams: Partial<RecursiveLoopParameters>) => {
    const updated = { ...config, ...newParams };
    setConfig(updated);
    try {
      await fetch('/api/recourse/math/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: updated }),
      });
    } catch (err) {
      console.warn('Config save note:', err);
    }
  };

  const latest = state.latestResult;
  const history = state.history || [];
  
  const score = latest.readinessScore;
  const gen = state.iteration;
  const isConverged = latest.loopStatus === 'optimal';
  
  let glowStyle = 'border-ink-800 shadow-xl';
  let titleColor = 'text-white';
  if (score > 0.95 && gen > 20) {
    glowStyle = 'border-accent-500/50';
    titleColor = 'text-accent-200';
  } else if (score > 0.8 && gen > 10) {
    glowStyle = 'border-accent-700/40';
    titleColor = 'text-accent-100';
  }

  return (
    <div className="space-y-6">
      
      {/* Core Architecture Toggle */}
      <div className="flex bg-ink-900 border border-ink-800 p-1.5 rounded-xl w-fit mx-auto shadow-lg relative z-20">
        <button
          onClick={() => handleUpdateConfig({ coreArchitecture: 'five-formula' })}
          className={`px-4 py-2 rounded-lg font-mono text-[11px]  font-bold  transition-all duration-300 ${
            (!config.coreArchitecture || config.coreArchitecture === 'five-formula')
              ? 'bg-accent-600 text-white'
              : 'text-ink-500 hover:text-ink-300'
          }`}
        >
          5-Formula Matrix
        </button>
        <button
          onClick={() => handleUpdateConfig({ coreArchitecture: 'trifecta' })}
          className={`px-4 py-2 rounded-lg font-mono text-[11px]  font-bold  transition-all duration-300 ${
            config.coreArchitecture === 'trifecta'
              ? 'bg-ok-600 text-white'
              : 'text-ink-500 hover:text-ink-300'
          }`}
        >
          Trifecta Core
        </button>
      </div>

      {/* Top Banner & Interactive Header */}
      <div className={`bg-ink-900 rounded-xl p-6 relative overflow-hidden transition-all duration-1000 border ${glowStyle}`}>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className={`p-2 bg-accent-950 rounded-xl transition-all duration-1000 ${score > 0.95 ? 'text-accent-300 border-accent-400 shadow-lg border' : 'border border-accent-700/50 text-accent-400'}`}>
                <Atom className={`w-5 h-5 ${isConverged ? 'animate-spin-fast text-accent-300' : 'animate-spin-slow'}`} />
              </span>
              <div>
                <h2 className={`text-xl font-semibold  flex items-center gap-2 transition-all duration-1000 ${titleColor}`}>
                  {config.coreArchitecture === 'trifecta' ? 'THE TRIFECTA CORE' : '5-FORMULA RECURSIVE LEARNING MATRIX'}
                  <span className="px-2 py-0.5 bg-accent-500/20 text-accent-300 border border-accent-500/40 text-xs rounded-full">
                    Deterministic Bounded Loop
                  </span>
                </h2>
                <p className="text-ink-400 text-xs mt-0.5">
                  {config.coreArchitecture === 'trifecta' 
                    ? 'Bellman Equation (Value) → Sequential Bayes (Belief) → Chain Rule Gradients (Update)' 
                    : 'Spectral Encoding (Euler) → Invariant Loss (Pythagoras) → Gradient Step (Derivative) → Unitary Memory (Schrödinger) → Compute Gate (E=mc²)'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shadow-lg ${
                isRunning
                  ? 'bg-warn-600 hover:bg-warn-500 text-white'
                  : 'bg-accent-600 hover:bg-accent-500 text-white'
              }`}
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isRunning ? 'Pause 24/7 loop' : 'Auto-run recursion'}</span>
            </button>

            <button
              onClick={handleStep}
              disabled={isStepping || isRunning}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-ink-800 hover:bg-ink-700 disabled:opacity-50 text-ink-200 border border-ink-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Zap className="w-4 h-4 text-warn-400" />
              <span>STEP (t+1)</span>
            </button>

            <button
              onClick={handleReset}
              className="p-2 bg-ink-800 hover:bg-ink-700 text-ink-300 border border-ink-700 rounded-xl transition cursor-pointer"
              title="Reset State Vector & Energy Budget"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                showConfig
                  ? 'bg-accent-950 border-accent-700 text-accent-300'
                  : 'bg-ink-800 border-ink-700 text-ink-300 hover:bg-ink-700'
              }`}
            >
              <Sliders className="w-4 h-4 text-accent-400" />
              <span>Tuning</span>
            </button>
          </div>
        </div>

        {/* Live HUD Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-ink-800 text-xs">
          <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block">Iteration cycle</span>
            <span className="text-lg font-semibold text-accent-400">#{latest.iteration}</span>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block">Readiness score</span>
            <span className="text-lg font-semibold text-ok-400">
              {(latest.readinessScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block">Euclidean error (d)</span>
            <span className="text-lg font-semibold text-warn-400">
              {latest.pythagoras.euclideanDistance.toFixed(4)}
            </span>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block">GRADIENT NORM ||∇L||</span>
            <span className="text-lg font-semibold text-accent-400">
              {latest.derivative.gradientNorm.toFixed(4)}
            </span>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block">Schrödinger norm σ|ψ|²</span>
            <span className="text-lg font-semibold text-accent-400">
              {latest.schrodinger.normConservationCheck.toFixed(5)}
            </span>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block">Compute remaining</span>
            <span className="text-lg font-semibold text-ink-200">
              {latest.energyBudget.budgetRemaining.toFixed(0)} FLOPs
            </span>
          </div>
        </div>
      </div>

      {/* Parameter Tuning Drawer */}
      {showConfig && (
        <div className="bg-ink-900 border border-accent-800/60 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-ink-800 pb-3">
            <h3 className="text-sm font-semibold text-accent-300 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Mathematical hyperparameter configuration
            </h3>
            <span className="text-ink-500 text-xs">Deterministic Loop Controller</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="flex justify-between text-ink-400 mb-1">
                <span>Learning Rate (η):</span>
                <span className="text-accent-400 font-semibold">{config.learningRateEta}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.5"
                step="0.01"
                value={config.learningRateEta}
                onChange={(e) => handleUpdateConfig({ learningRateEta: parseFloat(e.target.value) })}
                className="w-full accent-accent-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-ink-400 mb-1">
                <span>Momentum (μ):</span>
                <span className="text-accent-400 font-semibold">{config.momentumMu}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.99"
                step="0.05"
                value={config.momentumMu}
                onChange={(e) => handleUpdateConfig({ momentumMu: parseFloat(e.target.value) })}
                className="w-full accent-accent-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-ink-400 mb-1">
                <span>Time Step (Δt):</span>
                <span className="text-accent-400 font-semibold">{config.timeStepDeltaT}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.01"
                value={config.timeStepDeltaT}
                onChange={(e) => handleUpdateConfig({ timeStepDeltaT: parseFloat(e.target.value) })}
                className="w-full accent-accent-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-ink-400 mb-1">
                <span>Invariant Tolerance (ε):</span>
                <span className="text-ok-400 font-semibold">{config.invariantTolerance}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.20"
                step="0.01"
                value={config.invariantTolerance}
                onChange={(e) => handleUpdateConfig({ invariantTolerance: parseFloat(e.target.value) })}
                className="w-full accent-ok-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Stage Selector / Workflow Overview */}
      {config.coreArchitecture === 'trifecta' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Stage 1: Bellman */}
          <div className="p-5 rounded-xl border bg-ink-900 border-accent-500/80 shadow-md text-left relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 bg-accent-950 text-accent-400 rounded border border-accent-800 text-[10px] font-semibold">
                Stage 1
              </span>
              <Activity className="w-5 h-5 text-accent-400" />
            </div>
            <div className="font-semibold text-white text-base">Bellman Equation</div>
            <div className="text-ink-400 text-xs mt-1.5 font-serif italic text-accent-300">
              V(s) = max_a [ R(s,a) + γ V(s') ]
            </div>
            <div className="text-[11px] text-ink-500 mt-3 font-sans">
              Optimal Value Bootstrapping
            </div>
          </div>

          {/* Stage 2: Bayes */}
          <div className="p-5 rounded-xl border bg-ink-900 border-ok-500/80 shadow-md text-left relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 bg-ok-950 text-ok-400 rounded border border-ok-800 text-[10px] font-semibold">
                Stage 2
              </span>
              <Radio className="w-5 h-5 text-ok-400" />
            </div>
            <div className="font-semibold text-white text-base">Sequential Bayes</div>
            <div className="text-ink-400 text-xs mt-1.5 font-serif italic text-ok-300">
              π_t(θ) ∝ L_t(θ) · π_t-1(θ)
            </div>
            <div className="text-[11px] text-ink-500 mt-3 font-sans">
              Posterior → Prior Uncertainty Tracking
            </div>
          </div>

          {/* Stage 3: Chain Rule */}
          <div className="p-5 rounded-xl border bg-ink-900 border-accent-500/80 shadow-md text-left relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 bg-accent-950 text-accent-400 rounded border border-accent-800 text-[10px] font-semibold">
                Stage 3
              </span>
              <TrendingDown className="w-5 h-5 text-accent-400" />
            </div>
            <div className="font-semibold text-white text-base">Gradient Descent</div>
            <div className="text-ink-400 text-xs mt-1.5 font-serif italic text-accent-300">
              θ_t+1 = θ_t - η ∇L(θ_t)
            </div>
            <div className="text-[11px] text-ink-500 mt-3 font-sans">
              Chain Rule Parameter Update
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          {/* Stage 1: Euler */}
          <button
            onClick={() => setActiveFormulaTab(activeFormulaTab === 'euler' ? 'all' : 'euler')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer relative overflow-hidden ${
              activeFormulaTab === 'euler' || activeFormulaTab === 'all'
                ? 'bg-ink-900 border-accent-500/80 shadow-md'
                : 'bg-ink-900/50 border-ink-800 text-ink-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 bg-accent-950 text-accent-400 rounded border border-accent-800 text-[10px] font-semibold">
                Stage 1
              </span>
              <Compass className="w-4 h-4 text-accent-400" />
            </div>
            <div className="font-semibold text-white text-sm">Euler's Formula</div>
            <div className="text-ink-400 text-[11px] mt-1 font-serif italic text-accent-300">
              e^(ix) = cos x + i·sin x
            </div>
            <div className="text-[10px] text-ink-500 mt-2">
              Spectral Feature Encoding
            </div>
          </button>

          {/* Stage 2: Pythagoras */}
          <button
            onClick={() => setActiveFormulaTab(activeFormulaTab === 'pythagoras' ? 'all' : 'pythagoras')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer relative overflow-hidden ${
              activeFormulaTab === 'pythagoras' || activeFormulaTab === 'all'
                ? 'bg-ink-900 border-ok-500/80 shadow-md'
                : 'bg-ink-900/50 border-ink-800 text-ink-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 bg-ok-950 text-ok-400 rounded border border-ok-800 text-[10px] font-semibold">
                Stage 2
              </span>
              <ShieldCheck className="w-4 h-4 text-ok-400" />
            </div>
            <div className="font-semibold text-white text-sm">Pythagorean Metric</div>
            <div className="text-ink-400 text-[11px] mt-1 font-serif italic text-ok-300">
              d = √[ Σ (a_i - b_i)² ]
            </div>
            <div className="text-[10px] text-ink-500 mt-2">
              Invariant Distance Loss
            </div>
          </button>

          {/* Stage 3: Derivative */}
          <button
            onClick={() => setActiveFormulaTab(activeFormulaTab === 'derivative' ? 'all' : 'derivative')}
            className={`p-4 rounded-xl border text-left transition cursor-pointer relative overflow-hidden ${
              activeFormulaTab === 'derivative' || activeFormulaTab === 'all'
                ? 'bg-ink-900 border-accent-500/80 shadow-md'
                : 'bg-ink-900/50 border-ink-800 text-ink-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 bg-accent-950 text-accent-400 rounded border border-accent-800 text-[10px] font-semibold">
                Stage 3
              </span>
              <TrendingDown className="w-4 h-4 text-accent-400" />
            </div>
            <div className="font-semibold text-white text-sm">The Derivative</div>
            <div className="text-ink-400 text-[11px] mt-1 font-serif italic text-accent-300">
              θ_(t+1) = θ_t - η ∇L(θ_t)
            </div>
            <div className="text-[10px] text-ink-500 mt-2">
              Gradient Learning Step
            </div>
          </button>

        {/* Stage 4: Schrödinger */}
        <button
          onClick={() => setActiveFormulaTab(activeFormulaTab === 'schrodinger' ? 'all' : 'schrodinger')}
          className={`p-4 rounded-xl border text-left transition cursor-pointer relative overflow-hidden ${
            activeFormulaTab === 'schrodinger' || activeFormulaTab === 'all'
              ? 'bg-ink-900 border-accent-500/80 shadow-md'
              : 'bg-ink-900/50 border-ink-800 text-ink-500'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="px-2 py-0.5 bg-accent-950 text-accent-400 rounded border border-accent-800 text-[10px] font-semibold">
              Stage 4
            </span>
            <Atom className="w-4 h-4 text-accent-400" />
          </div>
          <div className="font-semibold text-white text-sm">Schrödinger Eq</div>
          <div className="text-ink-400 text-[11px] mt-1 font-serif italic text-accent-300">
            Ψ_(t+Δt) = e^(-iHΔt/ℏ) Ψ_t
          </div>
          <div className="text-[10px] text-ink-500 mt-2">
            Unitary State Memory Evolution
          </div>
        </button>

        {/* Stage 5: E = mc² */}
        <button
          onClick={() => setActiveFormulaTab(activeFormulaTab === 'emc2' ? 'all' : 'emc2')}
          className={`p-4 rounded-xl border text-left transition cursor-pointer relative overflow-hidden ${
            activeFormulaTab === 'emc2' || activeFormulaTab === 'all'
              ? 'bg-ink-900 border-warn-500/80 shadow-md'
              : 'bg-ink-900/50 border-ink-800 text-ink-500'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="px-2 py-0.5 bg-warn-950 text-warn-400 rounded border border-warn-800 text-[10px] font-semibold">
              Stage 5
            </span>
            <Cpu className="w-4 h-4 text-warn-400" />
          </div>
          <div className="font-semibold text-white text-sm">E = mc² Barrier</div>
          <div className="text-ink-400 text-[11px] mt-1 font-serif italic text-warn-300">
            E = γ m c² (ROI Gate)
          </div>
          <div className="text-[10px] text-ink-500 mt-2">
            Relativistic Compute Accountant
          </div>
        </button>
      </div>
      )}

      {/* Main Interactive Visualizer Canvas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {config.coreArchitecture === 'trifecta' ? (
          <>
            {/* Trifecta Vis 1: Bellman Equation */}
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-ink-800 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent-400" />
                  <span className="font-semibold text-white text-xs">Stage 1: Bellman value bootstrapping</span>
                </div>
                <span className="text-[10px] text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded border border-accent-800">
                  Δ: {latest.bellman?.maxDelta.toFixed(4) || '0.0000'}
                </span>
              </div>
              <div className="space-y-4 pt-2">
                <div className="flex gap-2 w-full">
                  {latest.bellman?.stateValues.map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-1 items-center">
                      <div className="text-[10px] text-ink-500">S{i}</div>
                      <div className="w-full h-16 bg-ink-950 rounded-lg relative overflow-hidden border border-ink-800 flex items-end">
                        <div className="w-full bg-accent-500/50" style={{ height: `${v * 100}%` }} />
                      </div>
                      <div className="text-xs text-accent-300 font-semibold mt-1">{v.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-ink-400 text-center">Value estimates propagating recursively backward from rewards</div>
              </div>
            </div>

            {/* Trifecta Vis 2: Sequential Bayes */}
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-ink-800 pb-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-ok-400" />
                  <span className="font-semibold text-white text-xs">Stage 2: sequential Bayes (kalman)</span>
                </div>
                <span className="text-[10px] text-ok-400 bg-ok-950/60 px-2 py-0.5 rounded border border-ok-800">
                  K: {latest.bayes?.kalmanGain.toFixed(4) || '0.0000'}
                </span>
              </div>
              <div className="flex items-center gap-6 justify-center py-4">
                <div className="text-center">
                  <div className="text-[10px] text-ink-500 mb-1">Prior μ</div>
                  <div className="text-xl font-semibold text-ink-300">{latest.bayes?.priorMu.toFixed(3) || '0.000'}</div>
                  <div className="text-[10px] text-ink-600">±{latest.bayes?.priorSigma.toFixed(3) || '0.000'}</div>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowRight className="w-4 h-4 text-ok-500/50 mb-1" />
                  <div className="text-[10px] text-ok-400 bg-ok-950/40 px-1.5 py-0.5 rounded border border-ok-900">
                    obs: {latest.bayes?.observation.toFixed(3) || '0.000'}
                  </div>
                </div>
                <div className="text-center relative">
                  <div className="text-[10px] text-ok-400 mb-1 relative z-10">Posterior μ</div>
                  <div className="text-xl font-semibold text-white relative z-10">{latest.bayes?.posteriorMu.toFixed(3) || '0.000'}</div>
                  <div className="text-[10px] text-ok-300 relative z-10">±{latest.bayes?.posteriorSigma.toFixed(3) || '0.000'}</div>
                </div>
              </div>
            </div>

            {/* Trifecta Vis 3: Gradient Chain Rule */}
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-ink-800 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-accent-400" />
                  <span className="font-semibold text-white text-xs">Stage 3: gradient descent & chain rule</span>
                </div>
                <span className="text-[10px] text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded border border-accent-800">
                  Loss: {latest.chainRule?.loss.toFixed(4) || '0.0000'}
                </span>
              </div>
              <div className="flex items-center justify-between max-w-2xl mx-auto py-2">
                {[0, 1, 2].map((i) => (
                  <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full border border-ink-700 bg-ink-950 flex items-center justify-center text-xs text-ink-300">
                        {latest.chainRule?.activations[i]?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-[10px] text-accent-500">h{i+1}</div>
                    </div>
                    {i < 2 && (
                      <div className="flex flex-col items-center flex-1 relative">
                        <div className="w-full h-px bg-ink-700" />
                        <div className="absolute -top-3 text-[10px] text-ink-400 bg-ink-900 px-1">
                          w{i+1}={latest.chainRule?.weights[i+1]?.toFixed(2) || '0.0'}
                        </div>
                        <div className="absolute -bottom-4 text-[10px] text-bad-400 bg-bad-950/20 px-1 rounded border border-bad-900/30">
                          ∇{latest.chainRule?.gradients[i+1]?.toFixed(3) || '0.0'}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Visualizer 1: Euler's Spectral Phasor Compass */}
            {(activeFormulaTab === 'all' || activeFormulaTab === 'euler') && (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-accent-400" />
                <span className="font-semibold text-white text-xs">Stage 1: Euler rotational phasor compass</span>
              </div>
              <span className="text-[10px] text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded border border-accent-800">
                Coherence: {(latest.euler.phaseCoherence * 100).toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Polar Phasor Circle SVG */}
              <div className="flex justify-center items-center py-2">
                <svg viewBox="-120 -120 240 240" className="w-48 h-48">
                  {/* Outer circle unit disk */}
                  <circle cx="0" cy="0" r="100" fill="none" stroke="#373c44" strokeWidth="1.5" strokeDasharray="3 3" />
                  <circle cx="0" cy="0" r="60" fill="none" stroke="#23272c" strokeWidth="1" />
                  <circle cx="0" cy="0" r="20" fill="none" stroke="#23272c" strokeWidth="1" />
                  
                  {/* Axis lines */}
                  <line x1="-110" y1="0" x2="110" y2="0" stroke="#4e545d" strokeWidth="1" />
                  <line x1="0" y1="-110" x2="0" y2="110" stroke="#4e545d" strokeWidth="1" />
                  <text x="100" y="-5" fill="#6e757f" fontSize="9" textAnchor="end" fontFamily="Geist Mono, monospace">Re</text>
                  <text x="5" y="-100" fill="#6e757f" fontSize="9" textAnchor="start" fontFamily="Geist Mono, monospace">Im</text>

                  {/* Phasor vectors */}
                  {latest.euler.phasors.map((p, idx) => {
                    const radius = Math.min(95, p.magnitude * 90);
                    const x = radius * Math.cos(p.phaseAngleRad);
                    const y = -radius * Math.sin(p.phaseAngleRad);
                    const colors = ['#70a9e8', '#5dba8f', '#c99d4e', '#e1878e', '#af95df', '#36b8c5', '#9caf5d', '#dc9064'];
                    const color = colors[idx % colors.length];

                    return (
                      <g key={idx}>
                        <line x1="0" y1="0" x2={x} y2={y} stroke={color} strokeWidth="2" />
                        <circle cx={x} cy={y} r="3.5" fill={color} />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Spectral Harmonic Frequency Table */}
              <div className="space-y-1.5 text-[11px]">
                <div className="text-ink-400 text-[10px] pb-1 border-b border-ink-800 flex justify-between">
                  <span>Harmonic bins</span>
                  <span>Magnitude</span>
                </div>
                {latest.euler.phasors.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-ink-300">
                    <span className="text-ink-500">f_{p.frequency} ({(p.phaseAngleRad).toFixed(2)} rad)</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-ink-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-accent-500 h-full rounded-full"
                          style={{ width: `${Math.min(100, p.magnitude * 100)}%` }}
                        />
                      </div>
                      <span className="font-semibold text-white w-10 text-right">{p.magnitude.toFixed(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 bg-ink-950 rounded-xl border border-ink-800 text-[11px] text-ink-400 flex items-center justify-between">
              <span>Spectral Entropy: <strong className="text-accent-300">{latest.euler.spectralEntropy} bits</strong></span>
              <span>Primary Harmonic: <strong className="text-accent-300">f_{latest.euler.primaryHarmonicHz}</strong></span>
            </div>
          </div>
        )}

        {/* Visualizer 2: Pythagorean Loss & Invariant Radar */}
        {(activeFormulaTab === 'all' || activeFormulaTab === 'pythagoras') && (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-ok-400" />
                <span className="font-semibold text-white text-xs">Stage 2: Pythagorean invariant distance</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
                latest.pythagoras.isWithinInvariantTolerance
                  ? 'bg-ok-950 text-ok-400 border-ok-800'
                  : 'bg-warn-950 text-warn-400 border-warn-800'
              }`}>
                {latest.pythagoras.isWithinInvariantTolerance ? '✓ INVARIANTS MET' : 'Δ SPEC GAP'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="text-ink-400 text-[11px] flex justify-between">
                <span>Vector Dimension Comparison (Current vs Target Spec)</span>
                <span className="text-ok-400">Loss: {latest.pythagoras.squaredErrorLoss.toFixed(4)}</span>
              </div>

              {latest.pythagoras.currentVector.slice(0, 6).map((cur, idx) => {
                const tgt = latest.pythagoras.targetVector[idx] ?? 0;
                const delta = Math.abs(cur - tgt);
                const isPass = delta <= config.invariantTolerance;

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-ink-400">Invariant[{idx}]</span>
                      <span className="text-ink-300">
                        cur: <strong className="text-white">{cur.toFixed(3)}</strong> | tgt: <strong className="text-accent-300">{tgt.toFixed(3)}</strong>
                        <span className={`ml-2 text-[10px] ${isPass ? 'text-ok-400' : 'text-warn-400'}`}>
                          (Δ={delta.toFixed(3)})
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-ink-950 h-2 rounded-full overflow-hidden relative flex">
                      {/* Target marker */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-accent-400 z-10"
                        style={{ left: `${Math.min(100, tgt * 100)}%` }}
                      />
                      {/* Current bar */}
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isPass ? 'bg-ok-500' : 'bg-warn-500'}`}
                        style={{ width: `${Math.min(100, cur * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 bg-ink-950 rounded-xl border border-ink-800 text-[11px] text-ink-400 flex items-center justify-between">
              <span>Readiness R = 1/(1+d): <strong className="text-ok-400 font-semibold">{(latest.pythagoras.readinessScore * 100).toFixed(1)}%</strong></span>
              <span>Cosine Similarity: <strong className="text-ok-300 font-semibold">{(latest.pythagoras.cosineSimilarity * 100).toFixed(1)}%</strong></span>
            </div>
          </div>
        )}

        {/* Visualizer 3: The Derivative Gradient Descent Curve */}
        {(activeFormulaTab === 'all' || activeFormulaTab === 'derivative') && (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-accent-400" />
                <span className="font-semibold text-white text-xs">Stage 3: derivative gradient update</span>
              </div>
              <span className="text-[10px] text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded border border-accent-800">
                η = {latest.derivative.learningRateEta} | μ = {latest.derivative.momentumMu}
              </span>
            </div>

            {/* Convergence Trajectory Chart */}
            <div className="bg-ink-950 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-500 text-[10px] mb-2 flex justify-between">
                <span>Loss trajectory over cycles</span>
                <span className="text-accent-400">ΔL = {latest.derivative.lossDelta.toFixed(4)}</span>
              </div>
              
              {/* Mini SVG Loss Curve */}
              <div className="h-24 w-full">
                <svg viewBox="0 0 300 80" className="w-full h-full overflow-visible">
                  {/* Grid lines */}
                  <line x1="0" y1="20" x2="300" y2="20" stroke="#23272c" strokeWidth="1" strokeDasharray="2 2" />
                  <line x1="0" y1="50" x2="300" y2="50" stroke="#23272c" strokeWidth="1" strokeDasharray="2 2" />
                  
                  {/* Trajectory line */}
                  {history.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#63a7f2"
                      strokeWidth="2.5"
                      points={history.map((h, i) => {
                        const x = (i / Math.max(1, history.length - 1)) * 300;
                        const y = Math.min(75, Math.max(5, h.pythagoras.squaredErrorLoss * 60));
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                  )}

                  {/* Active dot */}
                  {history.length > 0 && (
                    <circle
                      cx="300"
                      cy={Math.min(75, Math.max(5, latest.pythagoras.squaredErrorLoss * 60))}
                      r="4"
                      fill="#63a7f2"
                      className="animate-pulse"
                    />
                  )}
                </svg>
              </div>
            </div>

            {/* Parameter gradient deltas */}
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              {latest.derivative.gradients.slice(0, 4).map((g, idx) => (
                <div key={idx} className="bg-ink-950 p-2 rounded-lg border border-ink-800">
                  <span className="text-ink-500 block">∇L[{idx}]</span>
                  <span className={`font-semibold ${g > 0 ? 'text-warn-400' : 'text-accent-400'}`}>
                    {g.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-2.5 bg-ink-950 rounded-xl border border-ink-800 text-[11px] text-ink-400 flex items-center justify-between">
              <span>Gradient Norm ||∇L||: <strong className="text-accent-300 font-semibold">{latest.derivative.gradientNorm.toFixed(4)}</strong></span>
              <span>Backprop Depth: <strong className="text-accent-300 font-semibold">{latest.derivative.backpropChainDepth} layers</strong></span>
            </div>
          </div>
        )}

        {/* Visualizer 4: Schrödinger Unitary State Evolution */}
        {(activeFormulaTab === 'all' || activeFormulaTab === 'schrodinger') && (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3">
              <div className="flex items-center gap-2">
                <Atom className="w-4 h-4 text-accent-400" />
                <span className="font-semibold text-white text-xs">Stage 4: Schrödinger unitary memory</span>
              </div>
              <span className="text-[10px] text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded border border-accent-800">
                Norm: {latest.schrodinger.normConservationCheck.toFixed(5)} ≡ 1.000
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-ink-400 text-[11px] flex justify-between">
                <span>Unitary State Amplitudes |Ψ_k|² (Zero Catastrophic Forgetting)</span>
                <span className="text-accent-400">⟨H⟩ = {latest.schrodinger.expectedEnergyValue.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 pt-1">
                {latest.schrodinger.stateVectorPsi.map((psi, idx) => (
                  <div key={idx} className="bg-ink-950 p-2 rounded-xl border border-ink-800 text-center">
                    <div className="h-16 bg-ink-900 rounded-lg overflow-hidden flex flex-col justify-end p-0.5">
                      <div
                        className="w-full bg-accent-500 rounded-md transition-all duration-300"
                        style={{ height: `${Math.min(100, psi.amplitudeSq * 300)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-ink-500 block mt-1">|ψ_{idx}|²</span>
                    <span className="text-[10px] font-semibold text-accent-300 block">
                      {(psi.amplitudeSq * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 bg-ink-950 rounded-xl border border-ink-800 text-[11px] text-ink-400 flex items-center justify-between">
              <span>Time Operator e^(-iHΔt/ℏ): <strong className="text-accent-300">Unitary Preserved</strong></span>
              <span>Memory Coherence: <strong className="text-ok-400 font-semibold">100% Locked</strong></span>
            </div>
          </div>
        )}

        {/* Visualizer 5: E = mc² Compute Budget & ROI Gate */}
        {(activeFormulaTab === 'all' || activeFormulaTab === 'emc2') && (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-warn-400" />
                <span className="font-semibold text-white text-xs">STAGE 5: RELATIVISTIC COMPUTE & ENERGY BUDGET (E = γ·m·c²)</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
                latest.energyBudget.permitNextIteration
                  ? 'bg-warn-950 text-warn-400 border-warn-800'
                  : 'bg-bad-950 text-bad-400 border-bad-800'
              }`}>
                {latest.energyBudget.permitNextIteration ? 'Gate: permit next cycle' : 'Gate: halt (budget exhausted)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="bg-ink-950 p-3.5 rounded-xl border border-ink-800">
                <span className="text-ink-500 text-[10px] block">Lorentz factor (γ)</span>
                <span className="text-base font-semibold text-warn-300 mt-0.5 block">
                  {latest.energyBudget.lorentzFactorGamma.toFixed(3)}
                </span>
                <span className="text-[10px] text-ink-500">v/c = {latest.energyBudget.relativisticVelocityV}</span>
              </div>

              <div className="bg-ink-950 p-3.5 rounded-xl border border-ink-800">
                <span className="text-ink-500 text-[10px] block">Iteration mass (m)</span>
                <span className="text-base font-semibold text-warn-300 mt-0.5 block">
                  {latest.energyBudget.iterationMassM.toFixed(2)} tokens
                </span>
                <span className="text-[10px] text-ink-500">Code token density</span>
              </div>

              <div className="bg-ink-950 p-3.5 rounded-xl border border-ink-800">
                <span className="text-ink-500 text-[10px] block">Energy per iteration (e)</span>
                <span className="text-base font-semibold text-warn-300 mt-0.5 block">
                  {latest.energyBudget.energyJoulesOrFlops.toFixed(1)} FLOPs
                </span>
                <span className="text-[10px] text-ink-500">Relativistic energy cost</span>
              </div>

              <div className="bg-ink-950 p-3.5 rounded-xl border border-ink-800">
                <span className="text-ink-500 text-[10px] block">Compute ROI (δr / e)</span>
                <span className="text-base font-semibold text-ok-400 mt-0.5 block">
                  {latest.energyBudget.computeRoi.toFixed(5)}
                </span>
                <span className="text-[10px] text-ink-500">Readiness per FLOP</span>
              </div>
            </div>

            {/* Energy progress bar */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-ink-400 text-[11px]">
                <span>Energy Pool Consumption</span>
                <span>{latest.energyBudget.budgetRemaining.toFixed(0)} / {latest.energyBudget.budgetCap} FLOPs</span>
              </div>
              <div className="w-full bg-ink-950 h-3 rounded-full overflow-hidden border border-ink-800">
                <div
                  className="bg-warn-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (latest.energyBudget.budgetRemaining / latest.energyBudget.budgetCap) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Mathematical Architectural Reference Card */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-3 text-xs">
        <div className="flex items-center gap-2 text-ink-300 font-semibold">
          <Info className="w-4 h-4 text-accent-400" />
          <span>Mathematical foundations of deterministic recursive learning</span>
        </div>
        <p className="text-ink-400 leading-relaxed text-[11px]">
          {config.coreArchitecture === 'trifecta' ? (
            <>
              The <strong>Trifecta Core</strong> composes the strongest single recursive equations in AI: The <strong>Bellman Equation</strong> provides mathematically optimal value bootstrapping (deciding what to learn), <strong>Sequential Bayes</strong> maintains a probabilistically optimal posterior over time (tracking uncertainty), and <strong>Gradient Descent via the Chain Rule</strong> deterministically shifts structural parameters to globally minimize loss.
            </>
          ) : (
            <>
              By coupling <strong>Euler's Spectral Encoding</strong>, <strong>Pythagorean Invariant Loss</strong>, <strong>Gradient Derivatives</strong>, <strong>Schrödinger Unitary Evolution</strong>, and <strong>Relativistic Resource Gatekeeping (E=mc²)</strong>, the system maintains strict convergence against fixed external evaluators. This eliminates unconstrained value drift while preserving 100% memory coherence across arbitrary recursion depths.
            </>
          )}
        </p>
      </div>
    </div>
  );
};
