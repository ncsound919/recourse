import React, { useState, useEffect } from 'react';

interface StatusData {
  generation: number;
  readinessScore: number;
  uptimeSeconds: number;
  activeAnomaliesCount: number;
  permitNextIteration: boolean;
  dreamState?: { isDreamingActive: boolean; currentPhase: string; tick: number };
  artifacts?: unknown[];
  selfRepair?: { activeAnomaliesCount: number };
}

interface SwarmData {
  subTeamStates?: Array<{ teamId: string; cycleCount: number; completedTasks: number }>;
  totalSwarmTasksCompleted: number;
}

type Health = { label: 'Nominal' | 'Caution' | 'Critical'; reasons: string[]; tone: string; bar: string };

function assess(readiness: number, anomalies: number, permitNext: boolean): Health {
  const reasons: string[] = [];
  if (permitNext === false) reasons.push('compute gate halted the next iteration');
  if (readiness < 0.85) reasons.push(`readiness ${(readiness * 100).toFixed(1)}%`);
  if (anomalies > 0) reasons.push(`${anomalies} open defect${anomalies === 1 ? '' : 's'}`);
  if (readiness < 0.6 || permitNext === false) return { label: 'Critical', reasons, tone: 'text-bad-300', bar: 'bg-bad-500' };
  if (reasons.length) return { label: 'Caution', reasons, tone: 'text-warn-300', bar: 'bg-warn-500' };
  return { label: 'Nominal', reasons: ['all checks passing'], tone: 'text-ok-300', bar: 'bg-ok-500' };
}

/** One-line system health: the state, why, and the live subsystem counters. */
export const MissionStatusStrip: React.FC = () => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [swarm, setSwarm] = useState<SwarmData | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [sRes, swRes] = await Promise.all([
          fetch('/api/recourse/status').then((r) => r.json()),
          fetch('/api/recourse/subagents/status').then((r) => r.json()),
        ]);
        if (!alive) return;
        if (sRes?.status) setStatus(sRes.status);
        if (swRes?.swarmStatus) setSwarm(swRes.swarmStatus);
      } catch {
        /* next poll retries */
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!status) return null;

  const anomalies = status.selfRepair?.activeAnomaliesCount ?? 0;
  const h = assess(status.readinessScore ?? 0, anomalies, status.permitNextIteration !== false);
  const tasks = swarm?.subTeamStates?.reduce((a, t) => a + t.completedTasks, 0) ?? 0;
  const cycles = swarm?.subTeamStates?.reduce((a, t) => a + t.cycleCount, 0) ?? 0;
  const dream = status.dreamState?.isDreamingActive ? status.dreamState.currentPhase.replace(/_/g, ' ') : 'off';

  return (
    <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60 px-5 py-3 pl-6 md:flex-row md:items-center md:gap-6">
      <span className={`absolute inset-y-0 left-0 w-1 ${h.bar}`} aria-hidden="true" />
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`text-sm font-semibold ${h.tone}`}>{h.label}</span>
        <span className="truncate text-sm text-ink-400">{h.reasons.join(', ')}</span>
      </div>
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs md:ml-auto">
        <div className="flex gap-1.5"><dt className="text-ink-500">Dream</dt><dd className="text-ink-200">{dream}</dd></div>
        <div className="flex gap-1.5"><dt className="text-ink-500">Lego</dt><dd className="text-ink-200">{status.artifacts?.length ?? 0} assemblies</dd></div>
        <div className="flex gap-1.5"><dt className="text-ink-500">Swarm</dt><dd className="text-ink-200">{cycles} cycles, {tasks} tasks</dd></div>
      </dl>
    </div>
  );
};
