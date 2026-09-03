'use client';
import React, { useState, useEffect, useRef } from 'react';

interface StatusData {
  generation: number;
  readinessScore: number;
  uptimeSeconds: number;
  activeAnomaliesCount: number;
  permitNextIteration: boolean;
  dreamState?: { isDreamingActive: boolean; currentPhase: string; tick: number };
  artifacts?: any[];
  selfRepair?: { activeAnomaliesCount: number };
}

interface SwarmData {
  subTeamStates?: Array<{ teamId: string; cycleCount: number; completedTasks: number }>;
  totalSwarmTasksCompleted: number;
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

function statusBadge(readiness: number, anomalies: number, permitNext: boolean): {
  label: string; color: string; bg: string; border: string; dot: string
} {
  if (readiness < 0.6 || permitNext === false) {
    return { label: 'CRITICAL', color: 'text-rose-400', bg: 'bg-rose-950', border: 'border-rose-800', dot: 'bg-rose-500' };
  }
  if (readiness < 0.85 || anomalies > 0) {
    return { label: 'CAUTION', color: 'text-amber-400', bg: 'bg-amber-950', border: 'border-amber-800', dot: 'bg-amber-500' };
  }
  return { label: 'NOMINAL', color: 'text-emerald-400', bg: 'bg-emerald-950', border: 'border-emerald-800', dot: 'bg-emerald-500' };
}

export const MissionStatusStrip: React.FC = () => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [swarm, setSwarm] = useState<SwarmData | null>(null);
  const prevBadgeRef = useRef<string>('');

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [sRes, swRes] = await Promise.all([
          fetch('/api/recourse/status').then(r => r.json()),
          fetch('/api/recourse/subagents/status').then(r => r.json()),
        ]);
        if (!alive) return;
        if (sRes?.status) setStatus(sRes.status);
        if (swRes?.swarmStatus) setSwarm(swRes.swarmStatus);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!status) return null;

  const anomalies = status.selfRepair?.activeAnomaliesCount ?? 0;
  const badge = statusBadge(status.readinessScore ?? 0, anomalies, status.permitNextIteration !== false);
  const totalCompleted = swarm?.subTeamStates?.reduce((a, t) => a + t.completedTasks, 0) ?? 0;
  const totalCycles = swarm?.subTeamStates?.reduce((a, t) => a + t.cycleCount, 0) ?? 0;

  return (
    <div className="border-t border-cyan-500/40 bg-slate-950/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center gap-4 font-mono text-[11px] overflow-x-auto scrollbar-hide">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${badge.bg} ${badge.border} shrink-0`}>
            <span className={`relative flex h-2 w-2`}>
              {badge.label === 'NOMINAL' && (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              )}
              {badge.label === 'CRITICAL' && <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 animate-pulse"></span>}
              {badge.label === 'CAUTION' && <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>}
            </span>
            <span className={`font-bold tracking-wider ${badge.color}`}>{badge.label}</span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">GEN</span>
            <span className="text-cyan-300 font-bold">{status.generation ?? '—'}</span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">R:</span>
            <span className={status.readinessScore >= 0.85 ? 'text-emerald-400' : status.readinessScore >= 0.6 ? 'text-amber-400' : 'text-rose-400'}>
              {status.readinessScore != null ? `${(status.readinessScore * 100).toFixed(1)}%` : '—'}
            </span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">DREAM:</span>
            {status.dreamState?.isDreamingActive ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span className="text-purple-300">
                  {status.dreamState.currentPhase.replace(/_/g, ' ').toUpperCase().slice(0, 16)}
                </span>
              </>
            ) : (
              <span className="text-slate-600">OFF</span>
            )}
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">LEGO:</span>
            <span className="text-amber-300">
              {status.artifacts?.length ?? 0} asm
            </span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">SWARM:</span>
            <span className="text-indigo-300">{totalCycles}C/{totalCompleted}T</span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">UP:</span>
            <span className="text-slate-300">{formatUptime(status.uptimeSeconds ?? 0)}</span>
          </div>

          {anomalies > 0 && (
            <>
              <span className="text-slate-700 shrink-0">│</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-rose-400 animate-pulse">⚠ {anomalies} DEFECT{anomalies > 1 ? 'S' : ''}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
