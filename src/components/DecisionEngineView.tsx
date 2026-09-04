import React, { useState, useEffect } from 'react';
import {
  GrowthFactorWeights,
  CandidateGrowthAction,
  GrowthDecisionReport,
  ToolDomain
} from '../types';
import {
  Sliders,
  Play,
  Zap,
  TrendingUp,
  ShieldCheck,
  Cpu,
  Brain,
  Award,
  CheckCircle2,
  RefreshCw,
  GitPullRequest,
  Sparkles,
  Info
} from 'lucide-react';

interface DecisionEngineViewProps {
  onExecuteAction: (actionId?: string) => Promise<any>;
  isExecuting?: boolean;
}

export const DecisionEngineView: React.FC<DecisionEngineViewProps> = ({
  onExecuteAction,
  isExecuting = false
}) => {
  const [decision, setDecision] = useState<GrowthDecisionReport | null>(null);
  const [weights, setWeights] = useState<GrowthFactorWeights>({
    domainGapWeight: 0.30,
    vulnerabilityWeight: 0.25,
    passRateImprovement: 0.20,
    noveltyExploration: 0.15,
    crossDomainSynergy: 0.10
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [lastExecutionMsg, setLastExecutionMsg] = useState<string | null>(null);

  const fetchDecision = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recourse/decision/evaluate').then(r => r.json());
      if (res.success && res.decision) {
        setDecision(res.decision);
        if (res.decision.weights) {
          setWeights(res.decision.weights);
        }
      }
    } catch (e) {
      console.error('Failed to evaluate growth decision:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecision();
  }, []);

  const handleWeightChange = async (key: keyof GrowthFactorWeights, val: number) => {
    const updated = { ...weights, [key]: val };
    setWeights(updated);
    try {
      const res = await fetch('/api/recourse/decision/weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: updated })
      }).then(r => r.json());
      if (res.success && res.decision) {
        setDecision(res.decision);
      }
    } catch (e) {
      console.error('Failed to sync weights:', e);
    }
  };

  const handleExecute = async (actionId?: string) => {
    setLastExecutionMsg(null);
    const res = await onExecuteAction(actionId);
    if (res?.success) {
      setLastExecutionMsg(res.result?.message || `Successfully executed action ${actionId || 'Top-Ranked Action'}`);
      fetchDecision();
    }
  };

  const getDomainColor = (domain: ToolDomain) => {
    switch (domain) {
      case 'coding': return 'text-blue-400 bg-blue-950/60 border-blue-800';
      case 'math': return 'text-amber-400 bg-amber-950/60 border-amber-800';
      case 'biotech': return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      case 'systemic': return 'text-purple-400 bg-purple-950/60 border-purple-800';
      case 'neuro_symbolic': return 'text-pink-400 bg-pink-950/60 border-pink-800';
      case 'cyber_defense': return 'text-rose-400 bg-rose-950/60 border-rose-800';
      case 'quantum_sim': return 'text-cyan-400 bg-cyan-950/60 border-cyan-800';
      default: return 'text-slate-400 bg-slate-900 border-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Mathematical Scoring Paradigm */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <Brain className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white font-mono">
                  DETERMINISTIC GROWTH DECISION ENGINE
                </h2>
                <p className="text-xs text-slate-400">
                  Calculates multi-objective utility matrix <span className="font-mono text-indigo-300">U(a) = ∑(w_i · s_i)</span> to eliminate random stochastic drift.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDecision}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-mono border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Recalculate Matrix</span>
            </button>

            <button
              onClick={() => handleExecute()}
              disabled={isExecuting || !decision?.selectedAction}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-mono shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-4 h-4 fill-current ${isExecuting ? 'animate-pulse' : ''}`} />
              <span>{isExecuting ? 'Executing Decision...' : 'EXECUTE TOP DETERMINISTIC STEP'}</span>
            </button>
          </div>
        </div>

        {/* Math Vector Metrics HUD */}
        {decision && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 font-mono text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">DECISION SHANNON ENTROPY</div>
              <div className="text-base font-bold text-indigo-300 mt-0.5 flex items-center gap-1.5">
                <span>{decision.decisionEntropy.toFixed(3)} bits</span>
                <span className="text-[10px] text-emerald-400">(-{decision.entropyReduction.toFixed(2)})</span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">SELECTED ACTION UTILITY</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {(decision.selectedAction.computedUtilityScore * 100).toFixed(1)}% Max
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">SYSTEM HEALTH VECTOR</div>
              <div className="text-base font-bold text-cyan-400 mt-0.5">
                {(decision.stateVectorSummary.healthIndex * 100).toFixed(0)}% Stable
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">ACTIVE DOMAIN SPECTRUM</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">
                {decision.stateVectorSummary.activeDomains}/7 Covered
              </div>
            </div>
          </div>
        )}

        {lastExecutionMsg && (
          <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs font-mono text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lastExecutionMsg}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Growth Factor Weight Tuning Sliders */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white font-mono">GROWTH OBJECTIVE WEIGHTS</h3>
          </div>
          <p className="text-xs text-slate-400">
            Tune weight preferences. The decision matrix instantly recalculates deterministic action rankings.
          </p>

          <div className="space-y-4 font-mono text-xs">
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>Domain Deficit Gap (w₁)</span>
                </span>
                <span className="font-bold text-blue-400">{weights.domainGapWeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.domainGapWeight}
                onChange={e => handleWeightChange('domainGapWeight', parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                  <span>Vulnerability Hardening (w₂)</span>
                </span>
                <span className="font-bold text-rose-400">{weights.vulnerabilityWeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.vulnerabilityWeight}
                onChange={e => handleWeightChange('vulnerabilityWeight', parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pass Rate Optimization (w₃)</span>
                </span>
                <span className="font-bold text-amber-400">{weights.passRateImprovement.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.passRateImprovement}
                onChange={e => handleWeightChange('passRateImprovement', parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Novelty Exploration (w₄)</span>
                </span>
                <span className="font-bold text-purple-400">{weights.noveltyExploration.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.noveltyExploration}
                onChange={e => handleWeightChange('noveltyExploration', parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <GitPullRequest className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Cross-Domain Synergy (w₅)</span>
                </span>
                <span className="font-bold text-emerald-400">{weights.crossDomainSynergy.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.crossDomainSynergy}
                onChange={e => handleWeightChange('crossDomainSynergy', parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono space-y-1">
            <div className="font-bold text-slate-300 flex items-center gap-1">
              <Info className="w-3 h-3 text-indigo-400" />
              <span>Mathematical Guarantee</span>
            </div>
            <div>
              Total utility sum is computed via deterministic inner product <span className="text-indigo-300">W · S</span> with strict tie-breaking by lexical action ID.
            </div>
          </div>
        </div>

        {/* Center/Right Column: Candidate Growth Action Priority Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>DETERMINISTIC CANDIDATE PRIORITY QUEUE</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {decision?.candidateActions.length || 0} Evaluated Actions
            </span>
          </div>

          <div className="space-y-3">
            {decision?.candidateActions.map((action, idx) => {
              const isTop = action.rank === 1;
              return (
                <div
                  key={action.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isTop
                      ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-950/40'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        isTop ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        #{action.rank}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getDomainColor(action.targetDomain)}`}>
                        {action.targetDomain.toUpperCase()}
                      </span>
                      <h4 className="font-bold text-white text-sm font-mono">{action.title}</h4>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono">
                        <div className="text-[10px] text-slate-400">UTILITY SCORE</div>
                        <div className="text-sm font-bold text-emerald-400">
                          {action.computedUtilityScore.toFixed(4)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleExecute(action.id)}
                        disabled={isExecuting}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                          isTop
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        Execute #{action.rank}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 font-sans">{action.description}</p>

                  {/* Factor Breakdown Bars */}
                  <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-800/80 font-mono text-[10px]">
                    <div>
                      <div className="text-slate-400 flex justify-between">
                        <span>Deficit</span>
                        <span className="text-blue-400">{(action.rawFactorScores.domainDeficit * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-blue-500 h-full" style={{ width: `${action.rawFactorScores.domainDeficit * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 flex justify-between">
                        <span>Vuln</span>
                        <span className="text-rose-400">{(action.rawFactorScores.vulnerabilityUrgency * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-rose-500 h-full" style={{ width: `${action.rawFactorScores.vulnerabilityUrgency * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 flex justify-between">
                        <span>Pass Gap</span>
                        <span className="text-amber-400">{(action.rawFactorScores.passRateGap * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-amber-500 h-full" style={{ width: `${action.rawFactorScores.passRateGap * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 flex justify-between">
                        <span>Novelty</span>
                        <span className="text-purple-400">{(action.rawFactorScores.noveltyPotential * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-purple-500 h-full" style={{ width: `${action.rawFactorScores.noveltyPotential * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 flex justify-between">
                        <span>Synergy</span>
                        <span className="text-emerald-400">{(action.rawFactorScores.crossDomainSynergy * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-emerald-500 h-full" style={{ width: `${action.rawFactorScores.crossDomainSynergy * 100}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 font-mono italic">
                    Rationale: {action.deterministicRationale}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
};
