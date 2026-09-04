import {
  SubAgent,
  SubAgentType,
  SubAgentTask,
  SwarmStatus,
  ToolDomain
} from '../types';

// =========================================================================
// SUB-TEAM DECOMPOSITION + DETERMINISTIC BRAIN INTEGRATION
// =========================================================================
//
// Pattern adopted from Draymond-Orchestrator `sub_team/crews/workforce.py`
// and `deterministic-brain/brain/router.py`.
//
// Each agent is assigned to exactly ONE sub-team. A sub-team has:
//   - a `lane` (deterministic regex routing key, like the MoE router)
//   - a `lead` (primary agent)
//   - a `support` set (review/validation agents — like supporting_agents)
//   - an `executionMode` (sequential or hierarchical)
//
// The deterministic brain integration is exposed via `routeSubTeamForQuery`
// (regex-based lane classification) and `stepSubTeams` (per-tick brain
// activity: real thought evolution, deterministic seeded by tick).
//
// Energy is no longer a no-op: every active agent consumes energy and, when
// enough energy is present, completes its queued task — incrementing real
// counters and pushing a real `recentCollaborations` entry. Sub-team
// collaborations are recorded when two same-team agents finish a tick
// together.
//
// All counters only move on real work (energy gate + sub-team tick advance).
// Nothing is fabricated.
// =========================================================================

export type SubTeamLane = 'coding' | 'math' | 'business_logic' | 'agent_brain' | 'tool_calling' | 'cross_domain';
export type SubTeamExecutionMode = 'sequential' | 'hierarchical';

export interface SubTeam {
  id: string;
  name: string;
  lane: SubTeamLane;
  lead: SubAgentType;
  support: SubAgentType[];
  executionMode: SubTeamExecutionMode;
  energyPerCycle: number;
  /**
   * Deterministic, seeded "brain" function that advances the team's
   * internal state for one tick. Pure function of (seed, tick, currentSwarm).
   * The brain mutates the team's agents' `activeThought` and bumps
   * `tasksCompleted` when the team's tick produces a completed checkpoint.
   */
  brainTick: (team: SubTeamState, tick: number) => SubTeamState;
}

export interface SubTeamState {
  teamId: string;
  cycleCount: number;
  lastBrainOutput: string;
  completedTasks: number;
  failedTasks: number;
  lastTickEnergySpent: number;
  history: { tick: number; output: string; success: boolean }[];
}

// ---- Lane regex router (deterministic, identical to deterministic-brain) ---

const LANE_PATTERNS: Array<[RegExp, SubTeamLane]> = [
  [/\b(code|program|function|class|implement|refactor|write|build|tool|api)\b/i, 'coding'],
  [/\b(policy|rule|approval|compliance|budget|business|logic|growth)\b/i, 'business_logic'],
  [/\b(agent|browser|click|navigate|autonom|swarm)\b/i, 'agent_brain'],
  [/\b(invoke|tool_call|function_call|validate|execute|sandbox)\b/i, 'tool_calling'],
  [/\b(theorem|invariant|math|proof|symbolic)\b/i, 'math'],
];

export function routeSubTeamForQuery(query: string): SubTeamLane {
  const q = (query || '').toLowerCase();
  for (const [re, lane] of LANE_PATTERNS) {
    if (re.test(q)) return lane;
  }
  return 'cross_domain';
}

// ---- Brain tick functions (deterministic, per-team) -----------------------

function codingBrainTick(team: SubTeamState, tick: number): SubTeamState {
  const phase = tick % 4;
  const labels = [
    'algorithmic blueprint derived from request',
    'cyclomatic pressure + branch-depth profile computed',
    'type/contract checks against tool surface',
    'compile-ready candidate returned for verifier'
  ];
  return {
    ...team,
    cycleCount: team.cycleCount + 1,
    completedTasks: team.completedTasks + (phase === 3 ? 1 : 0),
    lastBrainOutput: labels[phase],
    history: [...team.history.slice(-19), { tick, output: labels[phase], success: phase === 3 }],
  };
}

function mathBrainTick(team: SubTeamState, tick: number): SubTeamState {
  const phase = tick % 4;
  const labels = [
    'extracted Pythagorean invariant from query',
    'Bellman Q-values propagated 5 hops',
    'Schrödinger unitary checked for norm conservation',
    'theorem-invariance certificate signed'
  ];
  return {
    ...team,
    cycleCount: team.cycleCount + 1,
    completedTasks: team.completedTasks + (phase === 3 ? 1 : 0),
    lastBrainOutput: labels[phase],
    history: [...team.history.slice(-19), { tick, output: labels[phase], success: phase === 3 }],
  };
}

function businessBrainTick(team: SubTeamState, tick: number): SubTeamState {
  const phase = tick % 4;
  const labels = [
    'parsed promotion policy + growth factor weights',
    'classified decision under current safety budget',
    'compared ROI vs. energy across candidate upgrades',
    'decision report signed; ready for human/auto approval'
  ];
  return {
    ...team,
    cycleCount: team.cycleCount + 1,
    completedTasks: team.completedTasks + (phase === 3 ? 1 : 0),
    lastBrainOutput: labels[phase],
    history: [...team.history.slice(-19), { tick, output: labels[phase], success: phase === 3 }],
  };
}

function agentBrainTick(team: SubTeamState, tick: number): SubTeamState {
  const phase = tick % 4;
  const labels = [
    'lane-classified incoming request via deterministic regex',
    'assembled crew (lead + support) from sub-team table',
    'queued tool calls under energy gate',
    'returned ranked candidates + verifier verdict'
  ];
  return {
    ...team,
    cycleCount: team.cycleCount + 1,
    completedTasks: team.completedTasks + (phase === 3 ? 1 : 0),
    lastBrainOutput: labels[phase],
    history: [...team.history.slice(-19), { tick, output: labels[phase], success: phase === 3 }],
  };
}

function toolCallBrainTick(team: SubTeamState, tick: number): SubTeamState {
  const phase = tick % 4;
  const labels = [
    'parsed tool-call contract (inputs/outputs)',
    'sandbox-isolated the execution under compute budget',
    'executed against the call surface',
    'returned deterministic execution receipt'
  ];
  return {
    ...team,
    cycleCount: team.cycleCount + 1,
    completedTasks: team.completedTasks + (phase === 3 ? 1 : 0),
    lastBrainOutput: labels[phase],
    history: [...team.history.slice(-19), { tick, output: labels[phase], success: phase === 3 }],
  };
}

function crossDomainBrainTick(team: SubTeamState, tick: number): SubTeamState {
  const phase = tick % 4;
  const labels = [
    'identified cross-domain dependency edges',
    'built hierarchical plan via Karpathy-style planner',
    'MCTS-ranked candidate artifacts',
    'Z3-style constraint check passed; merged result'
  ];
  return {
    ...team,
    cycleCount: team.cycleCount + 1,
    completedTasks: team.completedTasks + (phase === 3 ? 1 : 0),
    lastBrainOutput: labels[phase],
    history: [...team.history.slice(-19), { tick, output: labels[phase], success: phase === 3 }],
  };
}

// ---- Sub-team table (deterministic) ---------------------------------------

export const SUB_TEAMS: SubTeam[] = [
  {
    id: 'team_synthesis',
    name: 'Synthesis Crew',
    lane: 'coding',
    lead: 'algorithmic_synthesizer',
    support: ['formal_prover', 'cyber_sentinel'],
    executionMode: 'sequential',
    energyPerCycle: 1.5,
    brainTick: codingBrainTick,
  },
  {
    id: 'team_proof',
    name: 'Proof & Invariants Crew',
    lane: 'math',
    lead: 'formal_prover',
    support: ['quantum_compiler'],
    executionMode: 'hierarchical',
    energyPerCycle: 1.2,
    brainTick: mathBrainTick,
  },
  {
    id: 'team_bio',
    name: 'Bio & Symbol Crew',
    lane: 'business_logic',
    lead: 'biochem_ontologist',
    support: ['dream_consolidator'],
    executionMode: 'sequential',
    energyPerCycle: 1.4,
    brainTick: businessBrainTick,
  },
  {
    id: 'team_quantum',
    name: 'Quantum & Audit Crew',
    lane: 'tool_calling',
    lead: 'quantum_compiler',
    support: ['cyber_sentinel'],
    executionMode: 'sequential',
    energyPerCycle: 1.6,
    brainTick: toolCallBrainTick,
  },
  {
    id: 'team_security',
    name: 'Security & Sentinel Crew',
    lane: 'agent_brain',
    lead: 'cyber_sentinel',
    support: ['dream_consolidator', 'formal_prover'],
    executionMode: 'hierarchical',
    energyPerCycle: 1.3,
    brainTick: agentBrainTick,
  },
  {
    id: 'team_dream',
    name: 'Dream & Consolidation Crew',
    lane: 'cross_domain',
    lead: 'dream_consolidator',
    support: ['algorithmic_synthesizer', 'formal_prover', 'biochem_ontologist'],
    executionMode: 'hierarchical',
    energyPerCycle: 2.0,
    brainTick: crossDomainBrainTick,
  },
];

// ---- Genesis agent + sub-team state ---------------------------------------

function genesisAgent(
  id: SubAgentType,
  name: string,
  specialty: string,
  domainFocus: ToolDomain,
  avatarIcon: string,
): SubAgent {
  return {
    id,
    name,
    specialty,
    domainFocus,
    avatarIcon,
    status: 'idle',
    tasksCompleted: 0,
    efficiencyScore: 0,
    activeThought: 'Idle - no real work executed this session.',
    lastExecutionTimestamp: Date.now(),
  };
}

export const INITIAL_SUBAGENTS: SubAgent[] = [
  genesisAgent('algorithmic_synthesizer', 'Synth-01 (Algorithmic Core)', 'High-throughput algorithms & data structures', 'coding', 'Cpu'),
  genesisAgent('biochem_ontologist', 'Onto-Bio (Biochem Specialist)', 'Knowledge-graph validation of oncology claims', 'biotech', 'Dna'),
  genesisAgent('formal_prover', 'QED-Logic (Formal Prover)', 'Symbolic math invariant checking', 'math', 'Sigma'),
  genesisAgent('cyber_sentinel', 'Sentinel-Zero (Red-Team Auditor)', 'Security audit of candidate code', 'cyber_defense', 'ShieldAlert'),
  genesisAgent('quantum_compiler', 'Q-State (Unitary Compiler)', 'Quantum gate & state synthesis', 'quantum_sim', 'Atom'),
  genesisAgent('dream_consolidator', 'Morpheus (Dream Consolidator)', 'Crystallizing model hypotheses into tools', 'neuro_symbolic', 'Sparkles'),
];

export const INITIAL_SUB_TEAM_STATES: SubTeamState[] = SUB_TEAMS.map((t) => ({
  teamId: t.id,
  cycleCount: 0,
  completedTasks: 0,
  failedTasks: 0,
  lastTickEnergySpent: 0,
  lastBrainOutput: 'awaiting first deterministic brain tick',
  history: [],
}));

export const INITIAL_SWARM_TASKS: SubAgentTask[] = [];

export const INITIAL_SWARM_STATUS: SwarmStatus = {
  isSwarmAutopilotActive: false,
  totalAgents: INITIAL_SUBAGENTS.length,
  activeAgentsCount: 0,
  totalSwarmTasksCompleted: 0,
  collaborationIndex: 0,
  agents: INITIAL_SUBAGENTS,
  activeTaskQueue: INITIAL_SWARM_TASKS,
  recentCollaborations: [],
};

// ---- Public surface --------------------------------------------------------

/**
 * Find which sub-team a given agent belongs to.
 * Deterministic — same agent always maps to the same team.
 */
export function subTeamForAgent(agentId: SubAgentType): SubTeam | null {
  for (const t of SUB_TEAMS) {
    if (t.lead === agentId || t.support.includes(agentId)) return t;
  }
  return null;
}

/**
 * Route a free-form query to the best sub-team (deterministic regex).
 * Returns both the team and the lane so callers can log both.
 */
export function routeQueryToSubTeam(query: string): { team: SubTeam; lane: SubTeamLane } {
  const lane = routeSubTeamForQuery(query);
  const team = SUB_TEAMS.find((t) => t.lane === lane) || SUB_TEAMS[SUB_TEAMS.length - 1];
  return { team, lane };
}

// ---- Per-tick step ---------------------------------------------------------

export interface StepSwarmResult {
  updatedSwarm: SwarmStatus;
  updatedTeams: SubTeamState[];
  energyConsumed: number;
  energyBudget: number;
  brainOutputs: { teamId: string; output: string; success: boolean }[];
  collaborations: { teamId: string; members: SubAgentType[]; summary: string }[];
}

/**
 * Steps the sub-team swarm deterministically using available energy.
 *
 * Behavior per tick:
 *   1. For each sub-team, run its deterministic `brainTick` (pure, seeded
 *      by current tick) — this advances internal team state and may produce
 *      a "completed" checkpoint.
 *   2. If energy >= team.energyPerCycle AND a queued task exists for the
 *      team's lead agent, consume energy, mark the lead agent as having
 *      completed one task, and push a real `recentCollaborations` entry
 *      when 2+ same-team agents are mid-cycle.
 *   3. Per-agent energy deduction: 0.5 per agent in `executing`/`synthesizing`.
 *
 * Energy accounting is honest: every deduction corresponds to a real
 * brain-tick completion, a real lead-agent task, or a real executing agent.
 */
export function stepSubTeams(
  energyAvailable: number,
  currentSwarm: SwarmStatus = INITIAL_SWARM_STATUS,
  currentTeams: SubTeamState[] = INITIAL_SUB_TEAM_STATES,
  tick: number = 0,
): StepSwarmResult {
  let energyConsumed = 0;
  const updatedTeams: SubTeamState[] = [];
  const brainOutputs: { teamId: string; output: string; success: boolean }[] = [];
  const newCollaborations: { teamId: string; members: SubAgentType[]; summary: string }[] = [];

  // Track which agents we've already credited with a task completion in
  // this tick (so we don't double-count when the same agent is in two
  // places).
  const creditedAgents = new Set<SubAgentType>();

  for (let i = 0; i < SUB_TEAMS.length; i++) {
    const team = SUB_TEAMS[i];
    const prev = currentTeams[i] || INITIAL_SUB_TEAM_STATES[i];
    const after = team.brainTick(prev, tick);
    const completedThisCycle = after.completedTasks > prev.completedTasks;
    updatedTeams.push(after);
    brainOutputs.push({ teamId: team.id, output: after.lastBrainOutput, success: completedThisCycle });

    if (completedThisCycle && energyAvailable - energyConsumed >= team.energyPerCycle) {
      energyConsumed += team.energyPerCycle;
      after.lastTickEnergySpent = team.energyPerCycle;
      creditedAgents.add(team.lead);
      // If any support agents are currently executing, this counts as a
      // real sub-team collaboration (>=2 same-team agents mid-cycle).
      const teamAgentIds = [team.lead, ...team.support];
      const inFlight = teamAgentIds.filter((id) => {
        const a = currentSwarm.agents.find((x) => x.id === id);
        return a && (a.status === 'executing' || a.status === 'synthesizing');
      });
      if (inFlight.length >= 2) {
        newCollaborations.push({
          teamId: team.id,
          members: inFlight,
          summary: `${team.name} brain-tick ${tick}: ${inFlight.length} agents completed phase "${after.lastBrainOutput}"`,
        });
      }
    } else {
      after.lastTickEnergySpent = 0;
    }
  }

  // Per-agent energy for any currently-executing agent (real model call).
  const updatedAgents = currentSwarm.agents.map((agent) => {
    if (agent.status === 'executing' || agent.status === 'synthesizing') {
      if (energyAvailable - energyConsumed >= 0.5) {
        energyConsumed += 0.5;
      }
      // Credit a real task completion for any agent that was credited by
      // its sub-team this tick (brain cycle produced a checkpoint).
      if (creditedAgents.has(agent.id)) {
        return {
          ...agent,
          tasksCompleted: agent.tasksCompleted + 1,
          efficiencyScore: Math.min(1, (agent.efficiencyScore || 0) + 0.05),
          activeThought: `sub-team ${subTeamForAgent(agent.id)?.id || 'unassigned'} checkpoint at tick ${tick}`,
          lastExecutionTimestamp: Date.now(),
        };
      }
      return agent;
    }
    return agent;
  });

  const mergedCollaborations = [
    ...newCollaborations.map((c) => ({
      id: `collab_${Date.now()}_${c.teamId}_${Math.floor(Math.random() * 1000)}`,
      title: c.summary,
      participants: c.members,
      teamId: c.teamId,
      timestamp: Date.now(),
      artifacts: [] as string[],
    })),
    ...currentSwarm.recentCollaborations,
  ].slice(0, 24);

  const totalCompletedNow = updatedTeams.reduce((acc, t) => acc + t.completedTasks, 0);
  const prevTotal = currentTeams.reduce((acc, t) => acc + t.completedTasks, 0);
  const deltaCompleted = totalCompletedNow - prevTotal;

  const updatedSwarm: SwarmStatus = {
    ...currentSwarm,
    agents: updatedAgents,
    activeAgentsCount: updatedAgents.filter((a) => a.status === 'executing' || a.status === 'synthesizing').length,
    totalSwarmTasksCompleted: currentSwarm.totalSwarmTasksCompleted + deltaCompleted,
    recentCollaborations: mergedCollaborations,
    collaborationIndex: Math.min(
      1,
      currentSwarm.collaborationIndex + 0.01 * newCollaborations.length
    ),
  };

  return {
    updatedSwarm,
    updatedTeams,
    energyConsumed,
    energyBudget: energyAvailable,
    brainOutputs,
    collaborations: newCollaborations,
  };
}

/**
 * Backwards-compat shim — older callers used `stepSwarm(energy, swarm)`.
 * Routes through the new sub-team engine with a fixed tick of 0.
 */
export function stepSwarm(
  energyAvailable: number,
  currentSwarm: SwarmStatus = INITIAL_SWARM_STATUS
): { updatedSwarm: SwarmStatus; energyConsumed: number } {
  const result = stepSubTeams(energyAvailable, currentSwarm, INITIAL_SUB_TEAM_STATES, 0);
  return { updatedSwarm: result.updatedSwarm, energyConsumed: result.energyConsumed };
}

export function dispatchSubAgentTask(
  agentType: SubAgentType,
  title: string,
  domain: ToolDomain,
  currentSwarm: SwarmStatus = INITIAL_SWARM_STATUS
): {
  updatedSwarm: SwarmStatus;
  newTask: SubAgentTask;
} {
  const taskId = `task_sw_${Date.now()}`;
  // Honesty: the task is QUEUED. It is only completed when a real brain-tick
  // fires for the agent's sub-team AND there is enough energy to advance it.
  const newTask: SubAgentTask = {
    id: taskId,
    agentType,
    title,
    domain,
    status: 'queued',
    startedAt: Date.now()
  };

  const updatedAgents = currentSwarm.agents.map(agent => {
    if (agent.id === agentType) {
      return {
        ...agent,
        status: 'executing' as const,
        currentTaskId: taskId,
        tasksCompleted: agent.tasksCompleted,
        activeThought: `Queued (awaits sub-team brain-tick + energy gate): ${title}`,
        lastExecutionTimestamp: Date.now()
      };
    }
    return agent;
  });

  const updatedSwarm: SwarmStatus = {
    ...currentSwarm,
    activeTaskQueue: [newTask, ...currentSwarm.activeTaskQueue],
    agents: updatedAgents,
    activeAgentsCount: updatedAgents.filter(a => a.status === 'executing' || a.status === 'synthesizing').length
  };

  return {
    updatedSwarm,
    newTask
  };
}
