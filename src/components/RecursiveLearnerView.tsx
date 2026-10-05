import React, { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  Zap,
  Play,
  History,
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
          const r = res.replay;
          if (r.matchesHead) {
            onNotify(`Ledger Verified: ${r.replayed} episodes deterministic.`);
          } else if (r.partial) {
            const drift = r.driftAtEpisode !== null ? ` — gene set drifted at episode ${r.driftAtEpisode}` : '';
            onNotify(`Ledger Replay Incomplete: ${r.replayed}/${r.totalEpisodes} episodes reproduced${drift}.`);
          } else if (r.driftAtEpisode !== null) {
            onNotify(`Ledger Inputs Drifted at episode ${r.driftAtEpisode}: recorded genes no longer resolve.`);
          } else {
            onNotify(`Ledger Diverged at episode ${r.divergedAtEpisode}!`);
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
      <div className="flex items-center justify-center p-12 text-ink-500 text-sm">
        <Activity className="w-4 h-4 mr-2 animate-pulse" />
        Initializing recursive learner...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 relative overflow-hidden shadow-xl">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-ok-950 border border-ok-800 rounded-xl text-ok-400">
              <BrainCircuit className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                Recursive learner
                <span className="px-2 py-0.5 bg-ok-500/20 text-ok-300 border border-ok-500/40 text-xs rounded-full">
                  Beta-Posterior Core
                </span>
              </h2>
              <p className="text-ink-400 text-xs mt-1">
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
              className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition shadow-md cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Synthesize template</span>
            </button>

            <button
              onClick={runEpisode}
              disabled={isLearning}
              className="flex items-center gap-2 px-4 py-2 bg-ink-800 hover:bg-ink-700 disabled:opacity-50 text-ink-200 border border-ink-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Zap className="w-4 h-4 text-ok-400" />
              <span>Run 1 episode</span>
            </button>
            <button
              onClick={() => runBatch(10)}
              disabled={isLearning}
              className="flex items-center gap-2 px-4 py-2 bg-ok-600 hover:bg-ok-500 disabled:opacity-50 text-white shadow-lg rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>RUN 10x BATCH</span>
            </button>
            <button
              onClick={verifyLedger}
              disabled={isLearning}
              className="p-2 bg-ink-800 hover:bg-ink-700 text-ink-300 border border-ink-700 rounded-xl transition cursor-pointer"
              title="Verify Deterministic Ledger"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* HUD Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-ink-800 text-xs">
          <div className="bg-ink-950/60 p-4 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block mb-1">Total episodes</span>
            <span className="text-xl font-semibold text-white">{state.episode}</span>
          </div>
          <div className="bg-ink-950/60 p-4 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block mb-1">Self score (ema)</span>
            <span className="text-xl font-semibold text-ok-400">
              {(state.selfScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-ink-950/60 p-4 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block mb-1" title="Expected calibration error over GENE forecasts only. Self-forecasts are scored separately.">
              Gene ECE
            </span>
            <span className="text-xl font-semibold text-warn-400">
              {state.ece.toFixed(4)}
            </span>
          </div>
          <div className="bg-ink-950/60 p-4 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block mb-1" title="Mean |realized - predicted| over gene forecasts. This is SURPRISE, not calibration — see Gene ECE.">
              Mean |surprise|
            </span>
            <span className="text-xl font-semibold text-warn-400">
              {state.meanAbsSurprise.toFixed(4)}
            </span>
          </div>
          <div className="bg-ink-950/60 p-4 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block mb-1" title="Expected calibration error over SELF forecasts (selfScore vs external outcome) only.">
              Self ECE
            </span>
            <span className="text-xl font-semibold text-warn-400">
              {state.selfEce.toFixed(4)}
            </span>
          </div>
          <div className="bg-ink-950/60 p-4 rounded-xl border border-ink-800/80">
            <span className="text-ink-500 text-[10px] block mb-1">Meta: learning rate</span>
            <span className="text-xl font-semibold text-accent-400">
              {state.meta.learningRate.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Top Genes & Beliefs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between border-b border-ink-800 pb-3 mb-4">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Sparkles className="w-4 h-4 text-ok-400" />
                Top gene beliefs (posterior)
              </div>
              <span className="text-xs text-ink-500">{(state as any).geneCount} Total Genes</span>
            </div>

            <div className="space-y-3 text-xs">
              {((state as any).topGenes || []).length > 0 ? (
                ((state as any).topGenes || []).map((gene: any, idx: number) => (
                  <div key={idx} className="bg-ink-950 p-3 rounded-xl border border-ink-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ink-900 border border-ink-700 flex items-center justify-center text-ink-400 font-semibold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-ok-300">{gene.geneName || `Gene-${idx}`}</div>
                        <div className="text-[10px] text-ink-500">{gene.domain} • {gene.attempts} attempts</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">{((gene.posteriorMean || 0) * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-ink-500">Posterior Mean</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center p-8 text-ink-500 italic">No genes evaluated yet. Run an episode.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Ledger & Directives */}
        <div className="space-y-4">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-white font-semibold text-sm border-b border-ink-800 pb-3 mb-4">
              <Layers className="w-4 h-4 text-accent-400" />
              Active directives
            </div>
            <div className="space-y-2 text-xs">
              {state.directives.length > 0 ? (
                state.directives.map((dir, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-ink-950 border border-ink-800 border-l-2" style={{ borderLeftColor: dir.kind === 'amplify' ? '#10b981' : dir.kind === 'synthesize_template' ? '#6366f1' : dir.kind === 'retire' ? '#ef4444' : '#f59e0b' }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-white text-[10px]">{dir.kind.replace('_', ' ')}</span>
                      <span className="text-[10px] text-ink-500">Ep {dir.episode}</span>
                    </div>
                    <div className="text-ink-200 font-semibold">{dir.geneName}</div>
                    <div className="text-[10px] text-ink-400 mt-1">{dir.reason}</div>
                    {dir.templateId && (
                      <div className="mt-2 pt-2 border-t border-ink-800/80 flex items-center justify-between">
                        <span className="text-[10px] text-accent-400">Tpl: {dir.templateId}</span>
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
                          className="px-2 py-0.5 bg-accent-950 hover:bg-accent-900 border border-accent-800 text-accent-300 rounded text-[10px] transition cursor-pointer"
                        >
                          Synthesize
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center p-4 text-ink-500 italic border border-dashed border-ink-800 rounded-xl">No active directives.</div>
              )}
            </div>
          </div>

          {lastReport && (
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
              <div className="flex items-center gap-2 text-white font-semibold text-sm border-b border-ink-800 pb-3 mb-4">
                <History className="w-4 h-4 text-warn-400" />
                Last episode report
              </div>
              <div className="space-y-2 text-xs text-ink-400">
                <div className="flex justify-between">
                  <span>Episode</span>
                  <span className="text-white font-semibold">{lastReport.episode}</span>
                </div>
                <div className="flex justify-between">
                  <span>Genes Evaluated</span>
                  <span className="text-ok-400">{lastReport.genesEvaluated}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Reward</span>
                  <span className="text-warn-400">{lastReport.avgReward.toFixed(4)}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-ink-800 break-all text-[9px] text-ink-600">
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
