import React, { useState, useEffect, useRef } from 'react';
import {
  SwarmStatus,
  SubAgent,
  SubAgentType,
  ToolDomain
} from '../types';
import {
  Users,
  Bot,
  Play,
  CheckCircle2,
  Cpu,
  Dna,
  ShieldAlert,
  Atom,
  Sparkles,
  Sigma,
  Radio,
  PlusCircle,
  GitMerge,
  Clock,
  Award
} from 'lucide-react';

interface SubagentSwarmViewProps {
  onDispatchTask?: (agentType: SubAgentType, title: string, domain: ToolDomain) => Promise<any>;
}

export const SubagentSwarmView: React.FC<SubagentSwarmViewProps> = ({
  onDispatchTask
}) => {
  const [swarm, setSwarm] = useState<SwarmStatus | null>(null);
  const [_loading, setLoading] = useState<boolean>(true);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [selectedAgentType, setSelectedAgentType] = useState<SubAgentType>('algorithmic_synthesizer');
  const [selectedDomain, setSelectedDomain] = useState<ToolDomain>('coding');
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const fetchSwarmStatus = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch('/api/recourse/subagents/status').then(r => r.json());
      if (res.success && res.swarmStatus && isMountedRef.current) {
        setSwarm(res.swarmStatus);
      }
    } catch (e) {
      console.error('Fetch swarm status error:', e);
    } finally {
      if (isInitial && isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchSwarmStatus(true);
    // Auto-poll swarm tasks every 5 seconds silently
    const timer = setInterval(() => fetchSwarmStatus(false), 5000);
    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  const handleToggleAutopilot = async () => {
    try {
      const res = await fetch('/api/recourse/subagents/toggle-autopilot', { method: 'POST' }).then(r => r.json());
      if (res.success) {
        setSwarm(prev => prev ? { ...prev, isSwarmAutopilotActive: res.isSwarmAutopilotActive } : prev);
        setDispatchMsg(`Swarm Autopilot ${res.isSwarmAutopilotActive ? 'ENGAGED - tasks will run through the local model when reachable' : 'PAUSED'}`);
      }
    } catch (e) {
      console.error('Toggle autopilot error:', e);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);

  /** Manually run queued tasks through the real local-model executor. */
  const handleProcessQueue = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setDispatchMsg('Processing queue with the local model (this runs real verification)...');
    try {
      const res = await fetch('/api/recourse/subagents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1 })
      }).then(r => r.json());
      if (res.success) {
        setDispatchMsg(res.processedCount > 0
          ? `Real executor processed ${res.processedCount} task(s) - only verified code was accepted.`
          : 'No task was completed. Check that a local model server is reachable (see Local Model view), then try again.');
      }
      fetchSwarmStatus();
    } catch (err: any) {
      setDispatchMsg(`Process queue failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    try {
      setIsDispatching(true);
      setDispatchMsg(null);
      let res;
      if (onDispatchTask) {
        res = await onDispatchTask(selectedAgentType, customTitle, selectedDomain);
      } else {
        res = await fetch('/api/recourse/subagents/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentType: selectedAgentType,
            title: customTitle,
            domain: selectedDomain
          })
        }).then(r => r.json());
      }

      if (res.success) {
        setDispatchMsg(`Queued "${customTitle}" for ${selectedAgentType}. The task runs through the local model and is completed only if its code passes the sandbox verifier.`);
        setCustomTitle('');
        fetchSwarmStatus();
      }
    } catch (err: any) {
      setDispatchMsg(`Dispatch failed: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  const getAgentIcon = (id: SubAgentType) => {
    switch (id) {
      case 'algorithmic_synthesizer': return <Cpu className="w-5 h-5 text-accent-400" />;
      case 'biochem_ontologist': return <Dna className="w-5 h-5 text-ok-400" />;
      case 'formal_prover': return <Sigma className="w-5 h-5 text-warn-400" />;
      case 'cyber_sentinel': return <ShieldAlert className="w-5 h-5 text-bad-400" />;
      case 'quantum_compiler': return <Atom className="w-5 h-5 text-accent-400" />;
      case 'dream_consolidator': return <Sparkles className="w-5 h-5 text-accent-400" />;
      default: return <Bot className="w-5 h-5 text-ink-400" />;
    }
  };

  const getStatusBadge = (status: SubAgent['status']) => {
    switch (status) {
      case 'executing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-warn-950 text-warn-300 border border-warn-800">Executing</span>;
      case 'synthesizing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-950 text-accent-300 border border-accent-800">Synthesizing</span>;
      case 'dreaming':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-950 text-accent-300 border border-accent-800">Dreaming</span>;
      case 'idle':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-ink-950 text-ink-400 border border-ink-800">Standby</span>;
    }
  };

  return (
    <div className="space-y-6">

      {/* Main HUD Banner */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/30 text-accent-400">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>Autonomous subagent builders (specialist swarm)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-500/20 text-accent-300 border border-accent-500/30">
                    6 Active Agents
                  </span>
                </h2>
                <p className="text-xs text-ink-400">
                  Subagent swarm driven by your local open-source model. Dispatched tasks are queued and only complete when the model produces code that passes the real sandbox verifier.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleProcessQueue}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer bg-ok-950/70 border-ok-700 text-ok-300 hover:bg-ok-900 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Processing (real)...' : 'Run queued tasks (real)'}</span>
            </button>
            <button
              onClick={handleToggleAutopilot}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                swarm?.isSwarmAutopilotActive
                  ? 'bg-accent-950/80 border-accent-500 text-accent-300 shadow-lg'
                  : 'bg-ink-800 border-ink-700 text-ink-400'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${swarm?.isSwarmAutopilotActive ? 'text-accent-400' : ''}`} />
              <span>{swarm?.isSwarmAutopilotActive ? 'Swarm Autopilot: ENGAGED' : 'Autopilot: STANDBY'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        {swarm && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-ink-800 text-xs">
            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Active specialist agents</div>
              <div className="text-base font-semibold text-accent-400 mt-0.5">
                {swarm.agents.filter(a => a.status !== 'idle').length}/{swarm.totalAgents} Active
              </div>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Total tasks completed</div>
              <div className="text-base font-semibold text-ok-400 mt-0.5">
                {swarm.totalSwarmTasksCompleted} Missions
              </div>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Swarm collaboration index</div>
              <div className="text-base font-semibold text-accent-300 mt-0.5">
                {(swarm.collaborationIndex * 100).toFixed(0)}% Unified
              </div>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <div className="text-ink-400 text-[10px]">Active queued tasks</div>
              <div className="text-base font-semibold text-warn-400 mt-0.5">
                {swarm.activeTaskQueue.filter(t => t.status === 'running' || t.status === 'queued').length} In Progress
              </div>
            </div>
          </div>
        )}

        {dispatchMsg && (
          <div className="mt-4 p-3 bg-accent-950/60 border border-accent-800/60 rounded-xl text-xs text-accent-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-accent-400 shrink-0" />
            <span>{dispatchMsg}</span>
          </div>
        )}
      </div>

      {/* Sub-Team Brain Status (deterministic, per-tick) */}
      <SubTeamStatusPanel />

      {/* 6 Specialist Agents Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {swarm?.agents.map((agent) => (
          <div
            key={agent.id}
            className="bg-ink-900 border border-ink-800 rounded-xl p-5 shadow-lg flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="p-2 rounded-xl bg-ink-950 border border-ink-800">
                    {getAgentIcon(agent.id)}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white text-xs">{agent.name}</h3>
                    <span className="text-[10px] text-ink-400">
                      Domain: <strong className="text-accent-400">{agent.domainFocus.toUpperCase()}</strong>
                    </span>
                  </div>
                </div>
                {getStatusBadge(agent.status)}
              </div>

              <p className="text-xs text-ink-300 mt-3 font-sans leading-relaxed">{agent.specialty}</p>

              {/* Active Subagent Thought Bubble */}
              <div className="mt-3 p-3 bg-ink-950 rounded-xl border border-ink-800 text-[11px] text-accent-300/90 leading-relaxed italic">
                "{agent.activeThought}"
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-ink-800/80 text-[10px] text-ink-400">
              <span className="flex items-center gap-1">
                <Award className="w-3 h-3 text-warn-400" />
                <span>Efficiency: <strong className="text-ink-200">{(agent.efficiencyScore * 100).toFixed(0)}%</strong></span>
              </span>
              <span>Missions: <strong className="text-ink-200">{agent.tasksCompleted}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* Dispatch Custom Task & Task Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Task Dispatcher */}
        <div className="lg:col-span-5 bg-ink-900 border border-ink-800 rounded-xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2">
            <PlusCircle className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-semibold text-white">Dispatch custom subagent mission</h3>
          </div>
          <p className="text-xs text-ink-400">
            Commission a dedicated autonomous subagent to formulate new invariants, fuzz boundaries, or synthesize genes.
          </p>

          <form onSubmit={handleDispatch} className="space-y-3 text-xs">
            <div>
              <label className="block text-ink-400 mb-1 text-[10px]">Select specialist builder</label>
              <select
                value={selectedAgentType}
                onChange={e => setSelectedAgentType(e.target.value as SubAgentType)}
                className="w-full bg-ink-950 border border-ink-800 rounded-xl p-2.5 text-ink-200 focus:outline-none focus:border-accent-500"
              >
                <option value="algorithmic_synthesizer">Synth-01 (Algorithmic Core / O(1) Memory)</option>
                <option value="biochem_ontologist">Onto-Bio (Biochem Specialist / Oncology KG)</option>
                <option value="formal_prover">QED-Logic (Formal Prover / Vieta Proofs)</option>
                <option value="cyber_sentinel">Sentinel-Zero (Red-Team Auditor / Memory Taint)</option>
                <option value="quantum_compiler">Q-State (Unitary Compiler / Bell Entanglement)</option>
                <option value="dream_consolidator">Morpheus (Dream Consolidator / Hypotheses)</option>
              </select>
            </div>

            <div>
              <label className="block text-ink-400 mb-1 text-[10px]">Target domain</label>
              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value as ToolDomain)}
                className="w-full bg-ink-950 border border-ink-800 rounded-xl p-2.5 text-ink-200 focus:outline-none focus:border-accent-500"
              >
                <option value="coding">CODING (SIMD / Asymptotic Performance)</option>
                <option value="math">MATH (Vieta Identities / Proofs)</option>
                <option value="biotech">BIOTECH (PROTAC / Oncology Synergy)</option>
                <option value="systemic">SYSTEMIC (Concurrency / Lockless Buffers)</option>
                <option value="neuro_symbolic">NEURO_SYMBOLIC (Horn DPLL / Knowledge Graphs)</option>
                <option value="cyber_defense">CYBER_DEFENSE (Zero-Trust Memory / Merkle)</option>
                <option value="quantum_sim">QUANTUM_SIM (Unitary Gates / Bell States)</option>
              </select>
            </div>

            <div>
              <label className="block text-ink-400 mb-1 text-[10px]">Mission directive</label>
              <textarea
                rows={3}
                placeholder="e.g. Synthesize high-throughput SIMD vector cosine distance kernel with zero allocations..."
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                className="w-full bg-ink-950 border border-ink-800 rounded-xl p-2.5 text-ink-200 placeholder-ink-500 focus:outline-none focus:border-accent-500"
              />
            </div>

            <button
              type="submit"
              disabled={isDispatching || !customTitle.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-600 hover:bg-accent-500 text-white rounded-xl font-semibold text-xs shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isDispatching ? 'Dispatching Mission...' : 'LAUNCH AUTONOMOUS MISSION'}</span>
            </button>
          </form>
        </div>

        {/* Task Queue & Swarm Collaborations */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-warn-400" />
              <span>Active swarm task queue & artifacts</span>
            </h3>
            <span className="text-xs text-ink-400">
              {swarm?.activeTaskQueue.length || 0} Total Tasks
            </span>
          </div>

          <div className="space-y-3">
            {swarm?.activeTaskQueue.map((task) => (
              <div
                key={task.id}
                className="p-4 bg-ink-900 border border-ink-800 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-accent-400 bg-accent-950/60 px-2 py-0.5 rounded border border-accent-800">
                      {task.agentType.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="text-[10px] text-ink-400 bg-ink-950 px-2 py-0.5 rounded border border-ink-800">
                      {task.domain.toUpperCase()}
                    </span>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    task.status === 'completed'
                      ? 'bg-ok-950 text-ok-400 border border-ok-800'
                      : 'bg-warn-950 text-warn-400 border border-warn-800'
                  }`}>
                    {task.status.toUpperCase()}
                  </span>
                </div>

                <h4 className="font-semibold text-white text-xs">{task.title}</h4>

                {task.outputArtifact && (
                  <div className="p-2.5 bg-ink-950 rounded-lg border border-ink-800/80 text-[11px] space-y-1">
                    <div className="text-ok-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-ok-400" />
                      <span>Synthesized Gene: {task.outputArtifact.toolName} v{task.outputArtifact.version}</span>
                    </div>
                    <p className="text-ink-400 text-[10px]">{task.outputArtifact.summary}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Joint Multi-Agent Collaborations */}
          {swarm?.recentCollaborations && swarm.recentCollaborations.length > 0 && (
            <div className="pt-2 space-y-2">
              <h4 className="text-xs font-semibold text-ink-300 flex items-center gap-1.5">
                <GitMerge className="w-3.5 h-3.5 text-accent-400" />
                <span>Cross-agent joint collaborations</span>
              </h4>
              <div className="space-y-2">
                {swarm.recentCollaborations.map((collab) => (
                  <div key={collab.id} className="p-3 bg-ink-950 rounded-xl border border-ink-800 font-mono text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-ink-400">
                      <span className="text-accent-400 font-semibold">{collab.participants.join(' + ') || '-'}</span>
                      <span>sub-team {collab.teamId}</span>
                    </div>
                    <div className="text-white font-semibold text-xs">{collab.title}</div>
                    {collab.artifacts && collab.artifacts.length > 0 && (
                      <div className="text-ok-400 text-[11px]">artifacts: {collab.artifacts.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

// ============================================================================
// Sub-Team Status Panel
// Shows deterministic brain activity per sub-team (deterministic brain pattern
// from Draymond-Orchestrator `deterministic-brain/brain/router.py`).
// ============================================================================

const SUB_TEAMS_META = [
  { id: 'team_synthesis',  name: 'Synthesis Crew',    lane: 'coding',           lead: 'algorithmic_synthesizer', color: 'text-accent-400',   border: 'border-accent-800',   badge: 'bg-accent-950 text-accent-300' },
  { id: 'team_proof',     name: 'Proof & Invariants', lane: 'math',             lead: 'formal_prover',            color: 'text-accent-400', border: 'border-accent-800', badge: 'bg-accent-950 text-accent-300' },
  { id: 'team_bio',      name: 'Bio & Symbol Crew', lane: 'business_logic',   lead: 'biochem_ontologist',      color: 'text-ok-400', border: 'border-ok-800', badge: 'bg-ok-950 text-ok-300' },
  { id: 'team_security',  name: 'Security & Sentinel',lane: 'agent_brain',      lead: 'cyber_sentinel',          color: 'text-bad-400',   border: 'border-bad-800',   badge: 'bg-bad-950 text-bad-300' },
  { id: 'team_quantum',   name: 'Quantum & Audit',   lane: 'tool_calling',     lead: 'quantum_compiler',        color: 'text-warn-400',  border: 'border-warn-800',  badge: 'bg-warn-950 text-warn-300' },
  { id: 'team_dream',    name: 'Dream & Consolidate',lane: 'cross_domain',     lead: 'dream_consolidator',      color: 'text-accent-400', border: 'border-accent-800', badge: 'bg-accent-950 text-accent-300' },
];

function timeAgoMs(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const SubTeamStatusPanel: React.FC = () => {
  const [teams, setTeams] = React.useState<any[]>([]);
  const [tick, setTick] = React.useState(0);
  const prevTickRef = React.useRef(0);

  const fetchBrainOutputs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/subagents/status').then(r => r.json());
      if (res.success && res.swarmStatus) {
        setTeams(res.swarmStatus.subTeamStates || []);
        const gen = res.swarmStatus.generation || 0;
        if (gen !== prevTickRef.current) {
          prevTickRef.current = gen;
          setTick(gen);
        }
      }
    } catch { /* silently continue */ }
  }, []);

  React.useEffect(() => {
    fetchBrainOutputs();
    const id = setInterval(fetchBrainOutputs, 5000);
    return () => clearInterval(id);
  }, [fetchBrainOutputs]);

  return (
    <div className="mb-6 bg-ink-900 border border-ink-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-4 h-4 text-accent-400" />
        <h3 className="text-sm font-semibold text-white">Sub-team deterministic brains</h3>
        <span className="ml-auto text-[10px] text-ink-500">gen {tick}</span>
      </div>
      <p className="text-[11px] text-ink-500 mb-4">
        Each team runs a deterministic brain tick every generation (regex lane routing + seeded output). Same tick → same thought, always.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SUB_TEAMS_META.map((meta) => {
          const state = teams.find((t) => t.teamId === meta.id);
          const brainPhase = state?.history?.slice(-1)[0];
          const lastTick = state?.history?.length > 0 ? brainPhase?.tick : null;
          return (
            <div
              key={meta.id}
              className={`bg-ink-950 border ${meta.border} rounded-xl p-3 space-y-1.5`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${meta.color}`}>{meta.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${meta.badge}`}>
                  {meta.lane}
                </span>
              </div>
              <div className="text-[10px] text-ink-400">
                lead: <span className="text-ink-300">{meta.lead}</span>
              </div>
              <div className="flex gap-3 text-[10px]">
                <span className="text-ink-500">cycles: <span className="text-ink-200">{state?.cycleCount ?? 0}</span></span>
                <span className="text-ink-500">done: <span className="text-ok-400">{state?.completedTasks ?? 0}</span></span>
                <span className="text-ink-500">fail: <span className="text-bad-400">{state?.failedTasks ?? 0}</span></span>
              </div>
              {brainPhase && (
                <div className="text-[10px] text-accent-300 italic truncate" title={brainPhase.output}>
                  → {brainPhase.output}
                </div>
              )}
              {lastTick && (
                <div className="text-[9px] text-ink-600">
                  tick {lastTick} · {timeAgoMs(Date.now())}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
