import React, { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  Zap,
  Play,
  History,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { LearnerState, EpisodeReport } from '../types';

interface RecursiveLearnerViewProps {
  onNotify?: (msg: string) => void;
}

export const RecursiveLearnerView: React.FC<RecursiveLearnerViewProps> = ({ onNotify }) => {
  const [state, setState] = useState<LearnerState | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [lastReport, setLastReport] = useState<EpisodeReport | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/learn/status').then(r => r.json());
      if (res?.success && res.state) {
        setState(res.state);
      }
    } catch (err) {
      console.warn('Failed to fetch learner status', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const int = setInterval(fetchStatus, 5000);
    return () => clearInterval(int);
  }, [fetchStatus]);

  const runEpisode = async () => {
    setIsLearning(true);
    try {
      const res = await fetch('/api/recourse/learn/episode', { method: 'POST' }).then(r => r.json());
      if (res?.success && res.report) {
        setLastReport(res.report);
        if (onNotify) onNotify(`Completed Learning Episode #${res.report.episode}`);
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLearning(false);
    }
  };

  const runBatch = async (episodes: number) => {
    setIsLearning(true);
    try {
      const res = await fetch(`/api/recourse/learn/run?episodes=${episodes}`, { method: 'POST' }).then(r => r.json());
      if (res?.success) {
        if (onNotify) onNotify(`Completed Batch of ${episodes} Learning Episodes`);
        if (res.reports && res.reports.length > 0) {
          setLastReport(res.reports[res.reports.length - 1]);
        }
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLearning(false);
    }
  };

  const verifyLedger = async () => {
    setIsLearning(true);
    try {
      const res = await fetch('/api/recourse/learn/replay', { method: 'POST' }).then(r => r.json());
      if (res?.success && res.replay) {
        if (onNotify) {
          if (res.replay.matchesHead) {
            onNotify(`Ledger Verified: ${res.replay.replayed} episodes deterministic.`);
          } else {
            onNotify(`Ledger Diverged at episode ${res.replay.divergedAtEpisode}!`);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLearning(false);
    }
  };

  if (!state) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 font-mono text-sm">
        <Activity className="w-4 h-4 mr-2 animate-pulse" />
        INITIALIZING RECURSIVE LEARNER...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <BrainCircuit className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                RECURSIVE LEARNER
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs rounded-full font-mono">
                  Beta-Posterior Core
                </span>
              </h2>
              <p className="text-slate-400 text-xs mt-1 font-mono">
                Continuous Evaluation & Meta-Parameter Tuning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setIsLearning(true);
                try {
                  const res = await fetch('/api/recourse/learn/synthesize-directive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                  }).then(r => r.json());
                  if (res?.success) {
                    if (onNotify) onNotify(`Synthesized component: ${res.synthesizedTool?.name}`);
                    fetchStatus();
                  } else {
                    if (onNotify) onNotify(res?.message || 'Synthesis failed');
                  }
                } catch (e: any) {
                  if (onNotify) onNotify(`Error: ${e.message}`);
                } finally {
                  setIsLearning(false);
                }
              }}
              disabled={isLearning}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-mono text-xs font-bold transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>SYNTHESIZE TEMPLATE</span>
            </button>

            <button
              onClick={runEpisode}
              disabled={isLearning}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl font-mono text-xs font-bold transition cursor-pointer"
            >
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>RUN 1 EPISODE</span>
            </button>
            <button
              onClick={() => runBatch(10)}
              disabled={isLearning}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-lg shadow-emerald-600/20 rounded-xl font-mono text-xs font-bold transition cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>RUN 10x BATCH</span>
            </button>
            <button
              onClick={verifyLedger}
              disabled={isLearning}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition cursor-pointer"
              title="Verify Deterministic Ledger"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* HUD Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-800 font-mono text-xs">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <span className="text-slate-500 text-[10px] block mb-1">TOTAL EPISODES</span>
            <span className="text-xl font-bold text-white">{state.episode}</span>
          </div>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <span className="text-slate-500 text-[10px] block mb-1">SELF SCORE (EMA)</span>
            <span className="text-xl font-bold text-emerald-400">
              {(state.selfScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <span className="text-slate-500 text-[10px] block mb-1">CALIBRATION ERROR</span>
            <span className="text-xl font-bold text-amber-400">
              {state.calibrationError.toFixed(4)}
            </span>
          </div>
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <span className="text-slate-500 text-[10px] block mb-1">META: LEARNING RATE</span>
            <span className="text-xl font-bold text-indigo-400">
              {state.meta.learningRate.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Top Genes & Beliefs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 font-mono">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                TOP GENE BELIEFS (POSTERIOR)
              </div>
              <span className="text-xs text-slate-500">{(state as any).geneCount} Total Genes</span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {((state as any).topGenes || []).length > 0 ? (
                ((state as any).topGenes || []).map((gene: any, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 font-bold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-emerald-300">{gene.geneName || `Gene-${idx}`}</div>
                        <div className="text-[10px] text-slate-500">{gene.domain} • {gene.attempts} attempts</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold">{((gene.posteriorMean || 0) * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-slate-500">Posterior Mean</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center p-8 text-slate-500 italic">No genes evaluated yet. Run an episode.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Ledger & Directives */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-slate-800 pb-3 mb-4 font-mono">
              <Layers className="w-4 h-4 text-indigo-400" />
              ACTIVE DIRECTIVES
            </div>
            <div className="space-y-2 font-mono text-xs">
              {state.directives.length > 0 ? (
                state.directives.map((dir, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 border-l-2" style={{ borderLeftColor: dir.kind === 'amplify' ? '#10b981' : dir.kind === 'synthesize_template' ? '#6366f1' : dir.kind === 'retire' ? '#ef4444' : '#f59e0b' }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white uppercase text-[10px]">{dir.kind.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-500">Ep {dir.episode}</span>
                    </div>
                    <div className="text-slate-200 font-bold">{dir.geneName}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{dir.reason}</div>
                    {dir.templateId && (
                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[10px] text-indigo-400">Tpl: {dir.templateId}</span>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/recourse/learn/synthesize-directive', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ directiveId: dir.id })
                              }).then(r => r.json());
                              if (res?.success) {
                                if (onNotify) onNotify(`Synthesized: ${res.synthesizedTool?.name}`);
                                fetchStatus();
                              }
                            } catch (e: any) {
                              if (onNotify) onNotify(`Error: ${e.message}`);
                            }
                          }}
                          className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 rounded text-[10px] transition cursor-pointer"
                        >
                          Synthesize
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center p-4 text-slate-500 italic border border-dashed border-slate-800 rounded-xl">No active directives.</div>
              )}
            </div>
          </div>

          {lastReport && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-slate-800 pb-3 mb-4 font-mono">
                <History className="w-4 h-4 text-amber-400" />
                LAST EPISODE REPORT
              </div>
              <div className="space-y-2 font-mono text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Episode</span>
                  <span className="text-white font-bold">{lastReport.episode}</span>
                </div>
                <div className="flex justify-between">
                  <span>Genes Evaluated</span>
                  <span className="text-emerald-400">{lastReport.genesEvaluated}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Reward</span>
                  <span className="text-amber-400">{lastReport.avgReward.toFixed(4)}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-800 break-all text-[9px] text-slate-600">
                  Hash: {lastReport.stateHash}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
