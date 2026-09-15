import { describe, expect, it } from 'vitest';
import {
  INITIAL_SUBAGENTS,
  INITIAL_SUB_TEAM_STATES,
  INITIAL_SWARM_STATUS,
  SUB_TEAMS,
  dispatchSubAgentTask,
  routeQueryToSubTeam,
  routeSubTeamForQuery,
  stepSubTeams,
  stepSwarm,
  subTeamForAgent,
} from '../src/lib/subagentSwarm';
import type { SubAgent, SubAgentType, SwarmStatus } from '../src/types';

type StatusMap = Partial<Record<SubAgentType, SubAgent['status']>>;

function buildSwarm(statuses: StatusMap = {}, overrides: Partial<SwarmStatus> = {}): SwarmStatus {
  const agents = INITIAL_SUBAGENTS.map((a) => ({
    ...a,
    status: statuses[a.id] ?? ('idle' as const),
    tasksCompleted: 0,
    efficiencyScore: 0,
    activeThought: 'Idle - no real work executed this session.',
    lastExecutionTimestamp: 0,
  }));
  const executing = agents.filter((a) => a.status === 'executing' || a.status === 'synthesizing');
  return {
    isSwarmAutopilotActive: false,
    totalAgents: agents.length,
    activeAgentsCount: executing.length,
    totalSwarmTasksCompleted: 0,
    collaborationIndex: 0,
    agents,
    activeTaskQueue: [],
    recentCollaborations: [],
    ...overrides,
  };
}

function teamIds(teams: typeof INITIAL_SUB_TEAM_STATES): string[] {
  return teams.map((t) => t.teamId);
}

function swarmAgent(s: SwarmStatus, id: SubAgentType): SubAgent {
  return s.agents.find((a) => a.id === id)!;
}

const teamEnergyTotal = SUB_TEAMS.reduce((acc, t) => acc + t.energyPerCycle, 0);

describe('routeSubTeamForQuery', () => {
  const cases: Array<[string, string]> = [
    ['refactor this class and implement the api', 'coding'],
    ['apply the compliance policy with a growth budget', 'business_logic'],
    ['swarm agent will navigate the browser autonomously', 'agent_brain'],
    ['sandbox execute and validate the tool_call', 'tool_calling'],
    ['prove the symbolic theorem with a math invariant', 'math'],
    ['summarize today customer churn across markets', 'cross_domain'],
  ];

  it.each(cases)('routes %j to %s', (query, lane) => {
    expect(routeSubTeamForQuery(query)).toBe(lane);
  });

  it('returns cross_domain for an empty query', () => {
    expect(routeSubTeamForQuery('')).toBe('cross_domain');
    expect(routeSubTeamForQuery(undefined as unknown as string)).toBe('cross_domain');
  });
});

describe('routeQueryToSubTeam', () => {
  it('returns the matching sub-team for a coding query', () => {
    const r = routeQueryToSubTeam('implement a function');
    expect(r.lane).toBe('coding');
    expect(r.team.id).toBe('team_synthesis');
    expect(r.team.lane).toBe('coding');
  });

  it('maps a cross-domain query to the final fallback team', () => {
    const r = routeQueryToSubTeam('unrelated prose about markets');
    expect(r.lane).toBe('cross_domain');
    expect(r.team.id).toBe('team_dream');
  });
});

describe('subTeamForAgent', () => {
  it('maps each lead to the earliest team that lists it', () => {
    expect(subTeamForAgent('algorithmic_synthesizer')?.id).toBe('team_synthesis');
    expect(subTeamForAgent('biochem_ontologist')?.id).toBe('team_bio');
  });

  it('prefers the first support slot over a later lead slot', () => {
    expect(subTeamForAgent('formal_prover')?.id).toBe('team_synthesis');
    expect(subTeamForAgent('cyber_sentinel')?.id).toBe('team_synthesis');
    expect(subTeamForAgent('quantum_compiler')?.id).toBe('team_proof');
    expect(subTeamForAgent('dream_consolidator')?.id).toBe('team_bio');
  });

  it('returns null for an unknown agent id', () => {
    expect(subTeamForAgent('ghost_agent' as SubAgentType)).toBeNull();
  });
});

describe('stepSubTeams', () => {
  it('credits every team and agent when the full cycle completes with energy', () => {
    const swarm = buildSwarm({
      algorithmic_synthesizer: 'executing',
      biochem_ontologist: 'synthesizing',
      formal_prover: 'executing',
      cyber_sentinel: 'synthesizing',
      quantum_compiler: 'executing',
      dream_consolidator: 'executing',
    });
    const r = stepSubTeams(100, swarm, INITIAL_SUB_TEAM_STATES, 3);

    expect(r.updatedTeams).toHaveLength(SUB_TEAMS.length);
    expect(r.updatedTeams.every((t) => t.completedTasks === 1)).toBe(true);
    expect(r.updatedTeams.every((t) => t.cycleCount === 1)).toBe(true);
    expect(r.updatedTeams.every((t) => t.history.length === 1 && t.history[0].success)).toBe(true);
    expect(r.updatedTeams.map((t) => t.lastTickEnergySpent)).toEqual(
      SUB_TEAMS.map((t) => t.energyPerCycle)
    );

    expect(r.brainOutputs).toHaveLength(SUB_TEAMS.length);
    expect(r.brainOutputs.every((b) => b.success)).toBe(true);
    expect(r.brainOutputs[0].output).toBe('compile-ready candidate returned for verifier');
    expect(r.brainOutputs[1].output).toBe('theorem-invariance certificate signed');

    expect(r.energyConsumed).toBeCloseTo(teamEnergyTotal + 6 * 0.5, 10);

    expect(r.collaborations).toHaveLength(SUB_TEAMS.length);
    expect(new Set(r.collaborations.map((c) => c.teamId))).toEqual(new Set(teamIds(r.updatedTeams)));
    expect(r.collaborations.every((c) => c.members.length >= 2)).toBe(true);

    const agents = r.updatedSwarm.agents;
    expect(agents).toHaveLength(6);
    expect(agents.every((a) => a.tasksCompleted === 1)).toBe(true);
    expect(agents.every((a) => a.efficiencyScore === 0.05)).toBe(true);
    expect(swarmAgent(r.updatedSwarm, 'algorithmic_synthesizer').activeThought).toContain(
      'sub-team team_synthesis checkpoint at tick 3'
    );
    expect(r.updatedSwarm.totalSwarmTasksCompleted).toBe(6);
    expect(r.updatedSwarm.activeAgentsCount).toBe(6);
    expect(r.updatedSwarm.collaborationIndex).toBeCloseTo(0.06, 10);
    expect(r.updatedSwarm.recentCollaborations).toHaveLength(SUB_TEAMS.length);
    expect(r.updatedSwarm.recentCollaborations[0].id).toContain('team_synthesis');
    expect(r.updatedSwarm.recentCollaborations[0].artifacts).toEqual([]);
    expect(r.energyBudget).toBe(100);
  });

  it('advances team state but credits nothing on a non-completing tick', () => {
    const swarm = buildSwarm({ formal_prover: 'executing', quantum_compiler: 'executing' });
    const r = stepSubTeams(100, swarm, INITIAL_SUB_TEAM_STATES, 0);

    expect(r.updatedTeams.every((t) => t.completedTasks === 0)).toBe(true);
    expect(r.updatedTeams.every((t) => t.lastTickEnergySpent === 0)).toBe(true);
    expect(r.updatedTeams[0].lastBrainOutput).toBe('algorithmic blueprint derived from request');
    expect(r.brainOutputs.every((b) => b.success === false)).toBe(true);
    expect(r.collaborations).toHaveLength(0);
    expect(r.energyConsumed).toBeCloseTo(2 * 0.5, 10);
    expect(r.updatedSwarm.agents.every((a) => a.tasksCompleted === 0)).toBe(true);
    expect(r.updatedSwarm.totalSwarmTasksCompleted).toBe(0);
    expect(r.updatedSwarm.collaborationIndex).toBe(0);
  });

  it('reports brain-tick completion even when the energy gate blocks crediting', () => {
    const swarm = buildSwarm({
      algorithmic_synthesizer: 'executing',
      biochem_ontologist: 'executing',
      formal_prover: 'executing',
      cyber_sentinel: 'executing',
      quantum_compiler: 'executing',
      dream_consolidator: 'executing',
    });
    const r = stepSubTeams(0.1, swarm, INITIAL_SUB_TEAM_STATES, 3);

    expect(r.energyConsumed).toBe(0);
    expect(r.collaborations).toHaveLength(0);
    expect(r.brainOutputs.every((b) => b.success)).toBe(true);
    expect(r.updatedTeams.every((t) => t.completedTasks === 1)).toBe(true);
    expect(r.updatedTeams.every((t) => t.lastTickEnergySpent === 0)).toBe(true);
    expect(r.updatedSwarm.agents.every((a) => a.tasksCompleted === 0)).toBe(true);
    expect(r.updatedSwarm.totalSwarmTasksCompleted).toBe(6);
  });

  it('creates a collaboration only when two same-team members are in flight', () => {
    const swarm = buildSwarm({
      algorithmic_synthesizer: 'executing',
      formal_prover: 'executing',
    });
    const r = stepSubTeams(100, swarm, INITIAL_SUB_TEAM_STATES, 3);

    expect(r.collaborations).toHaveLength(2);
    const synth = r.collaborations.find((c) => c.teamId === 'team_synthesis')!;
    const dream = r.collaborations.find((c) => c.teamId === 'team_dream')!;
    expect(synth.members).toEqual(['algorithmic_synthesizer', 'formal_prover']);
    expect(dream.members).toEqual(['algorithmic_synthesizer', 'formal_prover']);
    expect(synth.summary).toContain('brain-tick 3');
    expect(r.energyConsumed).toBeCloseTo(teamEnergyTotal + 2 * 0.5, 10);
    expect(r.updatedSwarm.collaborationIndex).toBeCloseTo(0.02, 10);
  });

  it('credits a lead even when no in-flight teammate triggers a collaboration', () => {
    const swarm = buildSwarm({ algorithmic_synthesizer: 'executing' });
    const r = stepSubTeams(100, swarm, INITIAL_SUB_TEAM_STATES, 3);

    expect(r.collaborations).toHaveLength(0);
    expect(swarmAgent(r.updatedSwarm, 'algorithmic_synthesizer').tasksCompleted).toBe(1);
    expect(r.updatedSwarm.agents.every((a) => a.id !== 'algorithmic_synthesizer' ? a.tasksCompleted === 0 : true)).toBe(true);
    expect(r.energyConsumed).toBeCloseTo(teamEnergyTotal + 0.5, 10);
  });

  it('handles a missing-team-state array by falling back to initial states', () => {
    const r = stepSubTeams(0, buildSwarm(), [], 0);
    expect(r.updatedTeams).toHaveLength(SUB_TEAMS.length);
    expect(r.updatedTeams.every((t) => t.cycleCount === 1)).toBe(true);
    expect(r.updatedTeams.every((t) => t.completedTasks === 0)).toBe(true);
  });

  it('carries team state forward across ticks', () => {
    const first = stepSubTeams(0, buildSwarm(), [], 3);
    const second = stepSubTeams(0, buildSwarm(), first.updatedTeams, 4);
    expect(second.updatedTeams[0].completedTasks).toBe(1);
    expect(second.updatedTeams[0].cycleCount).toBe(2);
    expect(second.updatedTeams[0].history).toHaveLength(2);
    expect(second.brainOutputs[0].success).toBe(false);
  });

  it('prepends new collaborations and caps the merged list', () => {
    const existing = Array.from({ length: 23 }, (_, i) => ({
      id: `old_${String(i).padStart(2, '0')}`,
      title: 'legacy',
      teamId: 'team_synthesis',
      participants: ['algorithmic_synthesizer' as SubAgentType],
      timestamp: 0,
      artifacts: [] as string[],
    }));
    const swarm = buildSwarm(
      {
        algorithmic_synthesizer: 'executing',
        biochem_ontologist: 'executing',
        formal_prover: 'executing',
        cyber_sentinel: 'executing',
        quantum_compiler: 'executing',
        dream_consolidator: 'executing',
      },
      { collaborationIndex: 0.99, recentCollaborations: existing }
    );
    const r = stepSubTeams(100, swarm, INITIAL_SUB_TEAM_STATES, 3);

    expect(r.updatedSwarm.recentCollaborations).toHaveLength(24);
    expect(r.updatedSwarm.recentCollaborations[0].teamId).toBe('team_synthesis');
    expect(r.updatedSwarm.recentCollaborations[23].id).toBe('old_17');
    expect(r.updatedSwarm.recentCollaborations.some((c) => c.id === 'old_22')).toBe(false);
    expect(r.updatedSwarm.collaborationIndex).toBe(1);
  });

  it('uses default swarm, team states, and tick when omitted', () => {
    const r = stepSubTeams(100);
    expect(r.updatedTeams).toHaveLength(SUB_TEAMS.length);
    expect(r.energyConsumed).toBe(0);
    expect(r.collaborations).toHaveLength(0);
    expect(r.updatedSwarm.agents.every((a) => a.status === 'idle')).toBe(true);
  });
});

describe('stepSwarm', () => {
  it('is a backwards-compat shim over stepSubTeams at tick 0', () => {
    const swarm = buildSwarm({ algorithmic_synthesizer: 'executing' });
    const direct = stepSubTeams(100, swarm, INITIAL_SUB_TEAM_STATES, 0);
    const shim = stepSwarm(100, swarm);
    expect(shim.updatedSwarm).toEqual(direct.updatedSwarm);
    expect(shim.energyConsumed).toBe(direct.energyConsumed);
  });

  it('runs with default swarm when omitted', () => {
    const r = stepSwarm(0);
    expect(r.energyConsumed).toBe(0);
    expect(r.updatedSwarm.totalSwarmTasksCompleted).toBe(0);
  });
});

describe('dispatchSubAgentTask', () => {
  it('queues a task and marks only the target agent executing', () => {
    const swarm = buildSwarm();
    const { updatedSwarm, newTask } = dispatchSubAgentTask('algorithmic_synthesizer', 'Run coverage', 'coding', swarm);

    expect(newTask.id).toMatch(/^task_sw_/);
    expect(newTask.status).toBe('queued');
    expect(newTask.agentType).toBe('algorithmic_synthesizer');
    expect(newTask.title).toBe('Run coverage');
    expect(newTask.domain).toBe('coding');

    const agent = swarmAgent(updatedSwarm, 'algorithmic_synthesizer');
    expect(agent.status).toBe('executing');
    expect(agent.currentTaskId).toBe(newTask.id);
    expect(agent.activeThought).toContain('Run coverage');
    expect(agent.tasksCompleted).toBe(0);

    expect(swarmAgent(updatedSwarm, 'formal_prover').status).toBe('idle');
    expect(updatedSwarm.activeTaskQueue[0]).toBe(newTask);
    expect(updatedSwarm.activeTaskQueue).toHaveLength(1);
    expect(updatedSwarm.activeAgentsCount).toBe(1);
  });

  it('counts already-executing agents when dispatching another', () => {
    const swarm = buildSwarm({ quantum_compiler: 'synthesizing' });
    const { updatedSwarm } = dispatchSubAgentTask('biochem_ontologist', 'KG check', 'biotech', swarm);
    expect(updatedSwarm.activeAgentsCount).toBe(2);
    expect(swarmAgent(updatedSwarm, 'quantum_compiler').status).toBe('synthesizing');
  });

  it('uses the initial swarm when none is supplied', () => {
    const { updatedSwarm, newTask } = dispatchSubAgentTask('formal_prover', 'Verify invariant', 'math');
    expect(updatedSwarm.totalAgents).toBe(INITIAL_SWARM_STATUS.totalAgents);
    expect(swarmAgent(updatedSwarm, 'formal_prover').currentTaskId).toBe(newTask.id);
    expect(updatedSwarm.activeAgentsCount).toBe(1);
  });
});
