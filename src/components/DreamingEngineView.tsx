import React, { useState, useEffect } from 'react';
import {
  DreamState,
  DreamPhase,
  DreamThought,
  ToolDomain
} from '../types';
import {
  Moon,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  BrainCircuit,
  Layers,
  Flame,
  Code,
  ArrowRight,
  Lightbulb,
  Radio
} from 'lucide-react';

interface DreamingEngineViewProps {
  onDreamCrystallize?: (thoughtId: string) => Promise<any>;
}

export const DreamingEngineView: React.FC<DreamingEngineViewProps> = ({
  onDreamCrystallize
}) => {
  const [dreamState, setDreamState] = useState<DreamState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isTicking, setIsTicking] = useState<boolean>(false);
  const [selectedThought, setSelectedThought] = useState<DreamThought | null>(null);
  const [crystallizingId, setCrystallizingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchDreamState = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recourse/dream/status').then(r => r.json());
      if (res.success && res.dreamState) {
        setDreamState(res.dreamState);
        if (!selectedThought && res.dreamState.recentThoughts.length > 0) {
          setSelectedThought(res.dreamState.recentThoughts[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch dream state:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDreamState();
    // Auto-poll dream state every 6 seconds if active
    const timer = setInterval(() => {
      if (dreamState?.isDreamingActive) {
        fetchDreamState();
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [dreamState?.isDreamingActive]);

  const handleToggleAlwaysOn = async () => {
    try {
      const res = await fetch('/api/recourse/dream/toggle', { method: 'POST' }).then(r => r.json());
      if (res.success) {
        setDreamState(prev => prev ? { ...prev, isDreamingActive: res.isDreamingActive } : prev);
        setActionMsg(`Always-On Dreaming ${res.isDreamingActive ? 'Engaged (24/7 Cognitive Loop)' : 'Paused (Standby)'}`);
      }
    } catch (e) {
      console.error('Toggle dreaming error:', e);
    }
  };

  const handleDreamTick = async () => {
    try {
      setIsTicking(true);
      const res = await fetch('/api/recourse/dream/tick', { method: 'POST' }).then(r => r.json());
      if (res.success) {
        setDreamState(res.dreamState);
        if (res.newThought) {
          setSelectedThought(res.newThought);
        }
        setActionMsg(`Cognitive Dream Cycle Completed: Phase shifted to ${res.dreamState.currentPhase}`);
      }
    } catch (e) {
      console.error('Dream tick error:', e);
    } finally {
      setIsTicking(false);
    }
  };

  const handleCrystallize = async (thoughtId: string) => {
    try {
      setCrystallizingId(thoughtId);
      let res;
      if (onDreamCrystallize) {
        res = await onDreamCrystallize(thoughtId);
      } else {
        res = await fetch('/api/recourse/dream/crystallize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thoughtId })
        }).then(r => r.json());
      }

      if (res.success) {
        setActionMsg(`✨ Lucid Crystallization Complete: Promoted gene ${res.crystallizedTool?.name || 'Dream Gene'} to Registry!`);
        fetchDreamState();
      }
    } catch (e: any) {
      setActionMsg(`Crystallization failed: ${e.message}`);
    } finally {
      setCrystallizingId(null);
    }
  };

  const getPhaseDetails = (phase: DreamPhase) => {
    switch (phase) {
      case 'rem_counterfactual_sim':
        return { label: 'REM Counterfactual Sim', desc: 'Simulating novel failure states, edge-case memory bounds, & stress mutations', color: 'text-purple-400 bg-purple-950/60 border-purple-800' };
      case 'synaptic_pruning':
        return { label: 'Synaptic Pruning', desc: 'Eliminating dead syntactic code paths & optimizing asymptotic complexity', color: 'text-blue-400 bg-blue-950/60 border-blue-800' };
      case 'cross_pollination':
        return { label: 'Cross-Pollination', desc: 'Synthesizing analogical transfers across disparate domain genomes', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
      case 'theorem_induction':
        return { label: 'Theorem Induction', desc: 'Synthesizing mathematical lemmas & symbolic invariant proofs', color: 'text-amber-400 bg-amber-950/60 border-amber-800' };
      case 'lucid_crystallization':
        return { label: 'Lucid Crystallization', desc: 'Promoting subconscious hypotheses into sandbox-verified tool genes', color: 'text-rose-400 bg-rose-950/60 border-rose-800' };
      case 'memory_consolidation':
        return { label: 'Memory Consolidation', desc: 'Recording real system signals (readiness, lego, learner) into cognitive coherence', color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800' };
      default:
        return { label: 'Subconscious Idle', desc: 'Background cognitive consolidation', color: 'text-slate-400 bg-slate-900 border-slate-800' };
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

      {/* Main HUD Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Moon className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                  <span>ALWAYS-ON SUBCONSCIOUS DREAMING ENGINE</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    24/7 Cognitive Loop
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Continuous subconscious exploration across counterfactual simulation, synaptic pruning, and cross-domain gene synthesis.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleAlwaysOn}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                dreamState?.isDreamingActive
                  ? 'bg-purple-950/80 border-purple-500 text-purple-300 shadow-lg shadow-purple-950/50'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${dreamState?.isDreamingActive ? 'text-purple-400 animate-pulse' : ''}`} />
              <span>{dreamState?.isDreamingActive ? 'Always-On Dreaming: ACTIVE' : 'Dreaming: STANDBY'}</span>
            </button>

            <button
              onClick={handleDreamTick}
              disabled={isTicking}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold font-mono shadow-lg shadow-purple-600/30 transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 fill-current ${isTicking ? 'animate-spin' : ''}`} />
              <span>{isTicking ? 'Cycling Dream...' : 'TRIGGER DREAM CYCLE'}</span>
            </button>
          </div>
        </div>

        {/* Cognitive Health & Phase HUD */}
        {dreamState && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 font-mono text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">CURRENT COGNITIVE PHASE</div>
              <div className="text-sm font-bold text-purple-400 mt-0.5">
                {getPhaseDetails(dreamState.currentPhase).label}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">COGNITIVE COHERENCE</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                {(dreamState.cognitiveCoherence * 100).toFixed(1)}% Coherent
              </div>
              <div className="mt-2 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-purple-600 to-emerald-500"
                  style={{ width: `${Math.min(100, (dreamState.cognitiveCoherence ?? 0) * 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">TOTAL DREAM CYCLES</div>
              <div className="text-sm font-bold text-cyan-400 mt-0.5">
                {dreamState.dreamCyclesCompleted} Cycles
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">CRYSTALLIZED GENES</div>
              <div className="text-sm font-bold text-amber-400 mt-0.5">
                {dreamState.totalCrystallizedGenes} Promoted
              </div>
            </div>
          </div>
        )}

        {/* Mission-Control Telemetry Readout */}
        {dreamState && (dreamState.lastSignalSnapshot || (dreamState.tick ?? 0) > 0) && (
          <div className="mt-3 rounded-lg border border-cyan-800/40 bg-slate-950 overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px]">
              <span className="text-slate-600 uppercase tracking-widest text-[10px] shrink-0">SIGNAL TELEMETRY</span>
              <span className="text-slate-500 shrink-0">TICK <span className="text-cyan-300 font-bold">{dreamState.tick ?? 0}</span></span>
              {typeof dreamState.consolidationCount === 'number' && (
                <span className="text-slate-500 shrink-0">CONSOLIDATED <span className="text-purple-300 font-bold">{dreamState.consolidationCount}</span></span>
              )}
              {dreamState.lastSignalSnapshot && (
                <>
                  {dreamState.lastSignalSnapshot.readinessScore != null && (
                    <span className="text-slate-500 shrink-0">READINESS <span className="text-emerald-400 font-bold">{(dreamState.lastSignalSnapshot.readinessScore * 100).toFixed(1)}%</span></span>
                  )}
                  {dreamState.lastSignalSnapshot.learnerEpisode != null && (
                    <span className="text-slate-500 shrink-0">LEARNER ep <span className="text-indigo-300 font-bold">{dreamState.lastSignalSnapshot.learnerEpisode}</span></span>
                  )}
                  {dreamState.lastSignalSnapshot.learnerCalibration != null && (
                    <span className="text-slate-500 shrink-0">CAL <span className="text-amber-300 font-bold">{dreamState.lastSignalSnapshot.learnerCalibration.toFixed(3)}</span></span>
                  )}
                  {dreamState.lastSignalSnapshot.legoAssemblyCount != null && (
                    <span className="text-slate-500 shrink-0">LEGO asm <span className="text-amber-300 font-bold">{dreamState.lastSignalSnapshot.legoAssemblyCount}</span></span>
                  )}
                </>
              )}
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
          </div>
        )}

        {actionMsg && (
          <div className="mt-4 p-3 bg-purple-950/60 border border-purple-800/60 rounded-xl text-xs font-mono text-purple-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>{actionMsg}</span>
          </div>
        )}
      </div>

      {/* 6-Phase Cognitive Carousel */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {[
          'rem_counterfactual_sim',
          'synaptic_pruning',
          'cross_pollination',
          'theorem_induction',
          'lucid_crystallization',
          'memory_consolidation'
        ].map((phaseKey) => {
          const isCurrent = dreamState?.currentPhase === phaseKey;
          const details = getPhaseDetails(phaseKey as DreamPhase);
          return (
            <div
              key={phaseKey}
              className={`p-3.5 rounded-xl border transition-all ${
                isCurrent
                  ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-950/40'
                  : 'bg-slate-900/80 border-slate-800 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className={`px-1.5 py-0.5 rounded font-bold ${details.color}`}>
                  {isCurrent ? 'ACTIVE' : 'PHASE'}
                </span>
                {isCurrent && <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />}
              </div>
              <h4 className="font-bold text-white text-xs font-mono mt-2">{details.label}</h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{details.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Live Thought Stream vs Selected Insight Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Subconscious Thought Stream */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-purple-400" />
              <span>SUBCONSCIOUS THOUGHT STREAM</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {dreamState?.recentThoughts.length || 0} Hypotheses
            </span>
          </div>

          <div className="space-y-3">
            {dreamState?.recentThoughts.map((thought) => {
              const isSelected = selectedThought?.id === thought.id;
              const isReady = thought.crystallizationReadiness >= 0.75;
              return (
                <div
                  key={thought.id}
                  onClick={() => setSelectedThought(thought)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-purple-950/30 border-purple-500 shadow-md shadow-purple-950/40'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getDomainColor(thought.domain)}`}>
                        {thought.domain.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
                        {thought.phase.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400">
                        Readiness: <strong className={isReady ? 'text-emerald-400' : 'text-amber-400'}>{(thought.crystallizationReadiness * 100).toFixed(0)}%</strong>
                      </span>
                      {isReady && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 text-[9px] font-mono font-bold">
                          READY
                        </span>
                      )}
                    </div>
                  </div>

                  <h4 className="font-bold text-white text-xs font-mono mt-2">{thought.premise}</h4>
                  <p className="text-xs text-slate-300 mt-1 font-sans line-clamp-2">{thought.hypothesis}</p>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                    <span>Intensity: {(thought.intensity * 100).toFixed(0)}%</span>
                    <span className="flex items-center gap-1 text-purple-400">
                      <span>Inspect Draft</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Thought Inspector & Lucid Crystallizer */}
        <div className="lg:col-span-6 space-y-4">
          {dreamState?.registry && dreamState.registry.length > 0 && (
            <div className="rounded-lg border border-amber-800/40 bg-slate-950 overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">CRYSTALLIZED GENE REGISTRY</span>
                <span className="text-[10px] font-mono text-amber-300">{dreamState.registry.length} promoted</span>
              </div>
              <div className="px-3 pb-2 space-y-1.5 max-h-40 overflow-y-auto">
                {dreamState.registry.slice().reverse().map((tool) => (
                  <div key={tool.id} className="flex items-center justify-between gap-2 bg-slate-900/70 border border-slate-800/70 rounded px-2.5 py-1.5 font-mono text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <span className="text-slate-200 truncate">{tool.name}</span>
                    </div>
                    <span className="text-slate-500 text-[10px] shrink-0">{tool.domain.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span>LUCID CRYSTALLIZATION BENCH</span>
            </h3>
            {selectedThought && (
              <span className="text-xs font-mono text-slate-400">
                Cognitive Readiness: {(selectedThought.crystallizationReadiness * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {selectedThought ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getDomainColor(selectedThought.domain)}`}>
                    {selectedThought.domain.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-purple-400">
                    Phase: {selectedThought.phase.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <h4 className="font-bold text-white text-sm font-mono mt-2">{selectedThought.premise}</h4>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
                <div className="text-slate-400 text-[10px]">SUBCONSCIOUS HYPOTHESIS</div>
                <p className="text-slate-200 font-sans">{selectedThought.hypothesis}</p>
                <div className="text-slate-400 text-[10px] pt-1">SIMULATED TRAJECTORY OUTCOME</div>
                <p className="text-emerald-400 text-xs">{selectedThought.simulatedOutcome}</p>
              </div>

              {selectedThought.abstractGenomeDraft && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="flex items-center gap-1">
                      <Code className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Synthesized Gene Blueprint Code</span>
                    </span>
                    <span className="text-emerald-400 text-[10px]">Verified AST Sandbox Compatible</span>
                  </div>
                  <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-indigo-300 font-mono text-xs overflow-x-auto max-h-48 leading-relaxed">
                    {selectedThought.abstractGenomeDraft}
                  </pre>
                </div>
              )}

              {selectedThought.invariantChecks && selectedThought.invariantChecks.length > 0 && (
                <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs">
                  <div className="text-slate-400 text-[10px] font-bold flex items-center justify-between">
                    <span>DETERMINISTIC INVARIANT CHECKS ({selectedThought.invariantChecks.filter(c => c.passed).length}/{selectedThought.invariantChecks.length} PASSED)</span>
                    <span className="text-emerald-400 text-[10px]">Replay-Stable</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 pt-1">
                    {selectedThought.invariantChecks.map((check, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-900/70 px-2.5 py-1 rounded border border-slate-800/80">
                        <div className="flex items-center space-x-1.5">
                          <CheckCircle2 className={`w-3.5 h-3.5 ${check.passed ? 'text-emerald-400' : 'text-rose-400'}`} />
                          <span className={check.passed ? 'text-slate-200' : 'text-rose-300'}>{check.name}</span>
                        </div>
                        {check.detail && <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{check.detail}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedThought.provenance && selectedThought.provenance.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-slate-400 pt-1">
                  <span className="text-slate-500">Provenance:</span>
                  {selectedThought.provenance.map((tag, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/50 text-purple-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={() => handleCrystallize(selectedThought.id)}
                  disabled={crystallizingId === selectedThought.id}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold font-mono text-xs shadow-lg shadow-purple-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 fill-current" />
                  <span>{crystallizingId === selectedThought.id ? 'Crystallizing & Verifying Gene...' : 'LUCID CRYSTALLIZE INTO ACTIVE REGISTRY'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-2xl text-slate-400 font-mono text-xs">
              Select a subconscious thought from the stream to inspect and crystallize.
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
