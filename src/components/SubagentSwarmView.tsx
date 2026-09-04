import React, { useState, useEffect, useRef } from 'react';
import {
  SwarmStatus,
  SubAgent,
  SubAgentTask,
  SubAgentType,
  ToolDomain
} from '../types';
import {
  Users,
  Bot,
  Zap,
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
  const [loading, setLoading] = useState<boolean>(true);
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
      case 'algorithmic_synthesizer': return <Cpu className="w-5 h-5 text-blue-400" />;
      case 'biochem_ontologist': return <Dna className="w-5 h-5 text-emerald-400" />;
      case 'formal_prover': return <Sigma className="w-5 h-5 text-amber-400" />;
      case 'cyber_sentinel': return <ShieldAlert className="w-5 h-5 text-rose-400" />;
      case 'quantum_compiler': return <Atom className="w-5 h-5 text-cyan-400" />;
      case 'dream_consolidator': return <Sparkles className="w-5 h-5 text-purple-400" />;
      default: return <Bot className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: SubAgent['status']) => {
    switch (status) {
      case 'executing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">EXECUTING</span>;
      case 'synthesizing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 animate-pulse">SYNTHESIZING</span>;
      case 'dreaming':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">DREAMING</span>;
      case 'idle':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-slate-400 border border-slate-800">STANDBY</span>;
    }
  };

  return (
    <div className="space-y-6">

      {/* Main HUD Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                  <span>AUTONOMOUS SUBAGENT BUILDERS (SPECIALIST SWARM)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    6 Active Agents
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Subagent swarm driven by your local open-source model. Dispatched tasks are queued and only complete when the model produces code that passes the real sandbox verifier.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleProcessQueue}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer bg-emerald-950/70 border-emerald-700 text-emerald-300 hover:bg-emerald-900 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'PROCESSING (REAL)...' : 'RUN QUEUED TASKS (REAL)'}</span>
            </button>
            <button
              onClick={handleToggleAutopilot}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                swarm?.isSwarmAutopilotActive
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 shadow-lg shadow-cyan-950/50'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${swarm?.isSwarmAutopilotActive ? 'text-cyan-400 animate-pulse' : ''}`} />
              <span>{swarm?.isSwarmAutopilotActive ? 'Swarm Autopilot: ENGAGED' : 'Autopilot: STANDBY'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        {swarm && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 font-mono text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">ACTIVE SPECIALIST AGENTS</div>
              <div className="text-base font-bold text-cyan-400 mt-0.5">
                {swarm.agents.filter(a => a.status !== 'idle').length}/{swarm.totalAgents} Active
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">TOTAL TASKS COMPLETED</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {swarm.totalSwarmTasksCompleted} Missions
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">SWARM COLLABORATION INDEX</div>
              <div className="text-base font-bold text-indigo-300 mt-0.5">
                {(swarm.collaborationIndex * 100).toFixed(0)}% Unified
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <div className="text-slate-400 text-[10px]">ACTIVE QUEUED TASKS</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">
                {swarm.activeTaskQueue.filter(t => t.status === 'running' || t.status === 'queued').length} In Progress
              </div>
            </div>
          </div>
        )}

        {dispatchMsg && (
          <div className="mt-4 p-3 bg-cyan-950/60 border border-cyan-800/60 rounded-xl text-xs font-mono text-cyan-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
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
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    {getAgentIcon(agent.id)}
                  </span>
                  <div>
                    <h3 className="font-bold text-white text-xs font-mono">{agent.name}</h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      Domain: <strong className="text-indigo-400">{agent.domainFocus.toUpperCase()}</strong>
                    </span>
                  </div>
                </div>
                {getStatusBadge(agent.status)}
              </div>

              <p className="text-xs text-slate-300 mt-3 font-sans leading-relaxed">{agent.specialty}</p>

              {/* Active Subagent Thought Bubble */}
              <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300/90 leading-relaxed italic">
                "{agent.activeThought}"
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-400" />
                <span>Efficiency: <strong className="text-slate-200">{(agent.efficiencyScore * 100).toFixed(0)}%</strong></span>
              </span>
              <span>Missions: <strong className="text-slate-200">{agent.tasksCompleted}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* Dispatch Custom Task & Task Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Task Dispatcher */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2">
            <PlusCircle className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white font-mono">DISPATCH CUSTOM SUBAGENT MISSION</h3>
          </div>
          <p className="text-xs text-slate-400">
            Commission a dedicated autonomous subagent to formulate new invariants, fuzz boundaries, or synthesize genes.
          </p>

          <form onSubmit={handleDispatch} className="space-y-3 font-mono text-xs">
            <div>
              <label className="block text-slate-400 mb-1 text-[10px]">SELECT SPECIALIST BUILDER</label>
              <select
                value={selectedAgentType}
                onChange={e => setSelectedAgentType(e.target.value as SubAgentType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
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
              <label className="block text-slate-400 mb-1 text-[10px]">TARGET DOMAIN</label>
              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value as ToolDomain)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
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
              <label className="block text-slate-400 mb-1 text-[10px]">MISSION DIRECTIVE</label>
              <textarea
                rows={3}
                placeholder="e.g. Synthesize high-throughput SIMD vector cosine distance kernel with zero allocations..."
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={isDispatching || !customTitle.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold font-mono text-xs shadow-lg shadow-cyan-600/30 transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isDispatching ? 'Dispatching Mission...' : 'LAUNCH AUTONOMOUS MISSION'}</span>
            </button>
          </form>
        </div>

        {/* Task Queue & Swarm Collaborations */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>ACTIVE SWARM TASK QUEUE & ARTIFACTS</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {swarm?.activeTaskQueue.length || 0} Total Tasks
            </span>
          </div>

          <div className="space-y-3">
            {swarm?.activeTaskQueue.map((task) => (
              <div
                key={task.id}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                      {task.agentType.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {task.domain.toUpperCase()}
                    </span>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    task.status === 'completed'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                  }`}>
                    {task.status.toUpperCase()}
                  </span>
                </div>

                <h4 className="font-bold text-white text-xs font-mono">{task.title}</h4>

                {task.outputArtifact && (
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-[11px] font-mono space-y-1">
                    <div className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Synthesized Gene: {task.outputArtifact.toolName} v{task.outputArtifact.version}</span>
                    </div>
                    <p className="text-slate-400 text-[10px]">{task.outputArtifact.summary}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Joint Multi-Agent Collaborations */}
          {swarm?.recentCollaborations && swarm.recentCollaborations.length > 0 && (
            <div className="pt-2 space-y-2">
              <h4 className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1.5">
                <GitMerge className="w-3.5 h-3.5 text-indigo-400" />
                <span>CROSS-AGENT JOINT COLLABORATIONS</span>
              </h4>
              <div className="space-y-2">
                {swarm.recentCollaborations.map((collab) => (
                  <div key={collab.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="text-indigo-400 font-bold">{collab.participants.join(' + ') || '—'}</span>
                      <span>sub-team {collab.teamId}</span>
                    </div>
                    <div className="text-white font-bold text-xs">{collab.title}</div>
                    {collab.artifacts && collab.artifacts.length > 0 && (
                      <div className="text-emerald-400 text-[11px]">artifacts: {collab.artifacts.join(', ')}</div>
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
  { id: 'team_synthesis',  name: 'Synthesis Crew',    lane: 'coding',           lead: 'algorithmic_synthesizer', color: 'text-cyan-400',   border: 'border-cyan-800',   badge: 'bg-cyan-950 text-cyan-300' },
  { id: 'team_proof',     name: 'Proof & Invariants', lane: 'math',             lead: 'formal_prover',            color: 'text-purple-400', border: 'border-purple-800', badge: 'bg-purple-950 text-purple-300' },
  { id: 'team_bio',      name: 'Bio & Symbol Crew', lane: 'business_logic',   lead: 'biochem_ontologist',      color: 'text-emerald-400', border: 'border-emerald-800', badge: 'bg-emerald-950 text-emerald-300' },
  { id: 'team_security',  name: 'Security & Sentinel',lane: 'agent_brain',      lead: 'cyber_sentinel',          color: 'text-rose-400',   border: 'border-rose-800',   badge: 'bg-rose-950 text-rose-300' },
  { id: 'team_quantum',   name: 'Quantum & Audit',   lane: 'tool_calling',     lead: 'quantum_compiler',        color: 'text-amber-400',  border: 'border-amber-800',  badge: 'bg-amber-950 text-amber-300' },
  { id: 'team_dream',    name: 'Dream & Consolidate',lane: 'cross_domain',     lead: 'dream_consolidator',      color: 'text-indigo-400', border: 'border-indigo-800', badge: 'bg-indigo-950 text-indigo-300' },
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
    <div className="mb-6 bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold text-white font-mono">SUB-TEAM DETERMINISTIC BRAINS</h3>
        <span className="ml-auto text-[10px] font-mono text-slate-500">gen {tick}</span>
      </div>
      <p className="text-[11px] text-slate-500 font-mono mb-4">
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
              className={`bg-slate-950 border ${meta.border} rounded-xl p-3 space-y-1.5`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold font-mono ${meta.color}`}>{meta.name}</span>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${meta.badge}`}>
                  {meta.lane}
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                lead: <span className="text-slate-300">{meta.lead}</span>
              </div>
              <div className="flex gap-3 text-[10px] font-mono">
                <span className="text-slate-500">cycles: <span className="text-slate-200">{state?.cycleCount ?? 0}</span></span>
                <span className="text-slate-500">done: <span className="text-emerald-400">{state?.completedTasks ?? 0}</span></span>
                <span className="text-slate-500">fail: <span className="text-rose-400">{state?.failedTasks ?? 0}</span></span>
              </div>
              {brainPhase && (
                <div className="text-[10px] font-mono text-indigo-300 italic truncate" title={brainPhase.output}>
                  → {brainPhase.output}
                </div>
              )}
              {lastTick && (
                <div className="text-[9px] font-mono text-slate-600">
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
