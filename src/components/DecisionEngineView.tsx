import React, { useState, useEffect } from 'react';
import {
  GrowthFactorWeights,
  GrowthDecisionReport,
  ToolDomain
} from '../types';
import {
  Sliders,
  Play,
  Zap,
  TrendingUp,
  ShieldCheck,
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
  const [synergyMeta, setSynergyMeta] = useState<{ source: 'map' | 'none'; manifestHash?: string } | null>(null);

  const fetchDecision = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recourse/decision/evaluate').then(r => r.json());
      if (res.success && res.decision) {
        setDecision(res.decision);
        if (res.decision.weights) {
          setWeights(res.decision.weights);
        }
        if (res.synergy) {
          setSynergyMeta(res.synergy);
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
      case 'coding': return 'text-accent-400 bg-accent-950/60 border-accent-800';
      case 'math': return 'text-warn-400 bg-warn-950/60 border-warn-800';
      case 'biotech': return 'text-ok-400 bg-ok-950/60 border-ok-800';
      case 'systemic': return 'text-accent-400 bg-accent-950/60 border-accent-800';
      case 'neuro_symbolic': return 'text-accent-400 bg-accent-950/60 border-accent-800';
      case 'cyber_defense': return 'text-bad-400 bg-bad-950/60 border-bad-800';
      case 'quantum_sim': return 'text-accent-400 bg-accent-950/60 border-accent-800';
      default: return 'text-ink-400 bg-ink-900 border-ink-800';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Mathematical Scoring Paradigm */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/30 text-accent-400">
                <Brain className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Deterministic growth decision engine
                </h2>
                <p className="text-xs text-ink-400">
                  Calculates multi-objective utility matrix <span className="text-accent-300">U(a) = ∑(w_i · s_i)</span> to eliminate random stochastic drift.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDecision}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-ink-800 hover:bg-ink-700 text-ink-200 rounded-xl text-xs border border-ink-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Recalculate Matrix</span>
            </button>

            <button
              onClick={() => handleExecute()}
              disabled={isExecuting || !decision?.selectedAction}
              className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-semibold shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-4 h-4 fill-current ${isExecuting ? 'animate-pulse' : ''}`} />
              <span>{isExecuting ? 'Executing Decision...' : 'EXECUTE TOP DETERMINISTIC STEP'}</span>
            </button>
          </div>
        </div>

        {/* Math Vector Metrics HUD */}
        {decision && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-ink-800 text-xs">
            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Decision Shannon entropy</div>
              <div className="text-base font-semibold text-accent-300 mt-0.5 flex items-center gap-1.5">
                <span>{decision.decisionEntropy.toFixed(3)} bits</span>
                <span className="text-[10px] text-ok-400">(-{decision.entropyReduction.toFixed(2)})</span>
              </div>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Selected action utility</div>
              <div className="text-base font-semibold text-ok-400 mt-0.5">
                {(decision.selectedAction.computedUtilityScore * 100).toFixed(1)}% Max
              </div>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">System health vector</div>
              <div className="text-base font-semibold text-accent-400 mt-0.5">
                {(decision.stateVectorSummary.healthIndex * 100).toFixed(0)}% Stable
              </div>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Active domain spectrum</div>
              <div className="text-base font-semibold text-warn-400 mt-0.5">
                {decision.stateVectorSummary.activeDomains}/7 Covered
              </div>
            </div>
          </div>
        )}

        {lastExecutionMsg && (
          <div className="mt-4 p-3 bg-ok-950/60 border border-ok-800/60 rounded-xl text-xs text-ok-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-ok-400 shrink-0" />
            <span>{lastExecutionMsg}</span>
          </div>
        )}

        {decision && synergyMeta && (
          <div className="mt-4 text-[11px] text-ink-400">
            Cross-domain synergy source:{' '}
            <span className={synergyMeta.source === 'map' ? 'text-ok-400' : 'text-warn-400'}>
              {synergyMeta.source}
            </span>
            {synergyMeta.manifestHash ? (
              <>
                {' '}· manifest <span className="text-ink-300">{synergyMeta.manifestHash.slice(0, 12)}</span>
              </>
            ) : null}
            {synergyMeta.source === 'none' ? (
              <span className="text-warn-400"> - no synergy map read, factor is honestly 0</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Growth Factor Weight Tuning Sliders */}
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 shadow-xl space-y-5">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-semibold text-white">Growth objective weights</h3>
          </div>
          <p className="text-xs text-ink-400">
            Tune weight preferences. The decision matrix instantly recalculates deterministic action rankings.
          </p>

          <div className="space-y-4 text-xs">
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-ink-300">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-accent-400" />
                  <span>Domain Deficit Gap (w₁)</span>
                </span>
                <span className="font-semibold text-accent-400">{weights.domainGapWeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.domainGapWeight}
                onChange={e => handleWeightChange('domainGapWeight', parseFloat(e.target.value))}
                className="w-full accent-accent-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-ink-300">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-bad-400" />
                  <span>Vulnerability Hardening (w₂)</span>
                </span>
                <span className="font-semibold text-bad-400">{weights.vulnerabilityWeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.vulnerabilityWeight}
                onChange={e => handleWeightChange('vulnerabilityWeight', parseFloat(e.target.value))}
                className="w-full accent-bad-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-ink-300">
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-warn-400" />
                  <span>Pass Rate Optimization (w₃)</span>
                </span>
                <span className="font-semibold text-warn-400">{weights.passRateImprovement.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.passRateImprovement}
                onChange={e => handleWeightChange('passRateImprovement', parseFloat(e.target.value))}
                className="w-full accent-warn-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-ink-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent-400" />
                  <span>Novelty Exploration (w₄)</span>
                </span>
                <span className="font-semibold text-accent-400">{weights.noveltyExploration.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.noveltyExploration}
                onChange={e => handleWeightChange('noveltyExploration', parseFloat(e.target.value))}
                className="w-full accent-accent-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-ink-300">
                <span className="flex items-center gap-1.5">
                  <GitPullRequest className="w-3.5 h-3.5 text-ok-400" />
                  <span>Cross-Domain Synergy (w₅)</span>
                </span>
                <span className="font-semibold text-ok-400">{weights.crossDomainSynergy.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights.crossDomainSynergy}
                onChange={e => handleWeightChange('crossDomainSynergy', parseFloat(e.target.value))}
                className="w-full accent-ok-500 cursor-pointer"
              />
            </div>

          </div>

          <div className="p-3 bg-ink-950 rounded-xl border border-ink-800 text-[11px] text-ink-400 space-y-1">
            <div className="font-semibold text-ink-300 flex items-center gap-1">
              <Info className="w-3 h-3 text-accent-400" />
              <span>Mathematical Guarantee</span>
            </div>
            <div>
              Total utility sum is computed via deterministic inner product <span className="text-accent-300">W · S</span> with strict tie-breaking by lexical action ID.
            </div>
          </div>
        </div>

        {/* Center/Right Column: Candidate Growth Action Priority Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-warn-400" />
              <span>Deterministic candidate priority queue</span>
            </h3>
            <span className="text-xs text-ink-400">
              {decision?.candidateActions.length || 0} Evaluated Actions
            </span>
          </div>

          <div className="space-y-3">
            {decision?.candidateActions.map((action, _idx) => {
              const isTop = action.rank === 1;
              return (
                <div
                  key={action.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isTop
                      ? 'bg-accent-950/30 border-accent-500/50 shadow-lg'
                      : 'bg-ink-900/90 border-ink-800 hover:border-ink-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        isTop ? 'bg-accent-500 text-white' : 'bg-ink-800 text-ink-400'
                      }`}>
                        #{action.rank}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getDomainColor(action.targetDomain)}`}>
                        {action.targetDomain.toUpperCase()}
                      </span>
                      <h4 className="font-semibold text-white text-sm">{action.title}</h4>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] text-ink-400">Utility score</div>
                        <div className="text-sm font-semibold text-ok-400">
                          {action.computedUtilityScore.toFixed(4)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleExecute(action.id)}
                        disabled={isExecuting}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                          isTop
                            ? 'bg-accent-600 hover:bg-accent-500 text-white shadow'
                            : 'bg-ink-800 hover:bg-ink-700 text-ink-200'
                        }`}
                      >
                        Execute #{action.rank}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-ink-300 mt-2 font-sans">{action.description}</p>

                  {/* Factor Breakdown Bars */}
                  <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-ink-800/80 text-[10px]">
                    <div>
                      <div className="text-ink-400 flex justify-between">
                        <span>Deficit</span>
                        <span className="text-accent-400">{(action.rawFactorScores.domainDeficit * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-ink-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-accent-500 h-full" style={{ width: `${action.rawFactorScores.domainDeficit * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-ink-400 flex justify-between">
                        <span>Vuln</span>
                        <span className="text-bad-400">{(action.rawFactorScores.vulnerabilityUrgency * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-ink-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-bad-500 h-full" style={{ width: `${action.rawFactorScores.vulnerabilityUrgency * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-ink-400 flex justify-between">
                        <span>Pass Gap</span>
                        <span className="text-warn-400">{(action.rawFactorScores.passRateGap * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-ink-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-warn-500 h-full" style={{ width: `${action.rawFactorScores.passRateGap * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-ink-400 flex justify-between">
                        <span>Novelty</span>
                        <span className="text-accent-400">{(action.rawFactorScores.noveltyPotential * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-ink-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-accent-500 h-full" style={{ width: `${action.rawFactorScores.noveltyPotential * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="text-ink-400 flex justify-between">
                        <span>Synergy</span>
                        <span className="text-ok-400">{(action.rawFactorScores.crossDomainSynergy * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-ink-950 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div className="bg-ok-500 h-full" style={{ width: `${action.rawFactorScores.crossDomainSynergy * 100}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] text-ink-400 italic">
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
