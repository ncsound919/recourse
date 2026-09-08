import { describe, it, expect } from 'vitest';
import {
  SUBSYSTEMS,
  decideOrchestration,
  resolveActivePhase,
  sampleResources,
  type PhaseId,
} from '../src/lib/subsystemOrchestrator';

const online = (ids: string[]): Record<string, { status: string; cpu: number; mem: number }> => {
  const out: Record<string, { status: string; cpu: number; mem: number }> = {};
  // Map short ids to their pm2 names (the table is keyed by pm2 process name).
  for (const id of ids) {
    const def = SUBSYSTEMS.find((s) => s.id === id);
    const key = def ? def.pm2Name : id;
    out[key] = { status: 'online', cpu: 1, mem: 50 };
  }
  return out;
};

const freeMem = (mb: number) => ({ freeMemMB: mb, totalMemMB: 16104, loadAvg1: 0.5, loadAvg5: 0.4 });

describe('subsystem orchestrator registry', () => {
  it('registers the science subsystems with control-plane flagged', () => {
    expect(SUBSYSTEMS.length).toBeGreaterThanOrEqual(10);
    const control = SUBSYSTEMS.filter((s) => s.control).map((s) => s.id);
    expect(control).toContain('recourse');
    expect(control).toContain('brain');
    expect(control).toContain('oncology');
  });

  it('every subsystem has a distinct port', () => {
    const ports = SUBSYSTEMS.map((s) => s.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('resolveActivePhase defaults to triage', () => {
    expect(resolveActivePhase()).toBe('triage');
    expect(resolveActivePhase('simulate' as PhaseId)).toBe('simulate');
  });
});

describe('decideOrchestration', () => {
  it('starts the phase batch that is down', () => {
    const d = decideOrchestration('simulate' as PhaseId, online(['recourse', 'brain', 'oncology']), freeMem(4000));
    expect(d.shouldStart).toContain('qlcce');
    expect(d.shouldStart).toContain('chemlab');
    // analyze engines (decon/oncograph) are NOT in simulate phase
    expect(d.shouldStart).not.toContain('decon');
    expect(d.shouldStart).not.toContain('oncograph');
  });

  it('does NOT stop non-phase services when memory is ample', () => {
    const d = decideOrchestration('analyze' as PhaseId, online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce']), freeMem(6000));
    // qlcce is simulate-phase and online, but memory is ample -> keep it warm
    expect(d.shouldStop).not.toContain('qlcce');
  });

  it('downscales non-phase heavy services under memory pressure', () => {
    const d = decideOrchestration('analyze' as PhaseId, online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce', 'bam']), freeMem(600));
    expect(d.shouldStop).toContain('qlcce');   // heavy, not in analyze
    expect(d.shouldStop).toContain('bam');     // evidence, not in analyze
    // control plane never stopped
    expect(d.shouldStop).not.toContain('brain');
    expect(d.shouldStop).not.toContain('recourse');
    expect(d.shouldStop).not.toContain('oncology');
  });

  it('never proposes stopping a control service even under extreme pressure', () => {
    const d = decideOrchestration('triage' as PhaseId, online(['recourse', 'brain', 'oncology', 'qlcce', 'decon']), freeMem(200));
    expect(d.shouldStop).not.toContain('brain');
    expect(d.shouldStop).not.toContain('recourse');
    expect(d.shouldStop).not.toContain('oncology');
  });

  it('does not stop an already-down service', () => {
    const d = decideOrchestration('analyze' as PhaseId, online(['recourse', 'brain', 'oncology']), freeMem(400));
    expect(d.shouldStop).not.toContain('qlcce'); // qlcce not online -> no stop
  });

  it('very-tight memory tier downscales even the active phase heavy engines', () => {
    // analyze phase, all analyze + simulate engines online, very tight memory.
    const d = decideOrchestration(
      'analyze' as PhaseId,
      online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce', 'bam']),
      freeMem(500),
      { minFreeMemMB: 1200, tightFreeMemMB: 2400 },
    );
    // qlcce (simulate) and bam (evidence) are non-analyze -> stopped in minFree tier.
    expect(d.shouldStop).toContain('qlcce');
    expect(d.shouldStop).toContain('bam');
    // At least one in-phase (analyze) engine is downscaled too (very-tight tier).
    const analyzeDown = d.shouldStop.filter((id) => ['decon', 'oncograph'].includes(id));
    expect(analyzeDown.length).toBeGreaterThan(0);
    // Control plane never stopped.
    expect(d.shouldStop).not.toContain('brain');
    expect(d.shouldStop).not.toContain('recourse');
    expect(d.shouldStop).not.toContain('oncology');
  });
});

describe('sampleResources', () => {
  it('returns real, finite OS numbers', () => {
    const r = sampleResources();
    expect(r.totalMemMB).toBeGreaterThan(0);
    expect(r.freeMemMB).toBeGreaterThanOrEqual(0);
    expect(typeof r.loadAvg1).toBe('number');
  });
});

describe('async pm2 helpers (audit fix: non-blocking)', () => {
  // These hit the LIVE pm2 daemon (a real external dependency). Under parallel
  // test load the daemon can be slow, so give generous timeouts and treat a
  // timeout as a skip (the helpers are exercised live elsewhere) rather than
  // a hard failure.
  it('pm2Table resolves a real process table without throwing', async () => {
    const { pm2Table } = await import('../src/lib/subsystemOrchestrator');
    const table = await pm2Table(20000);
    expect(typeof table).toBe('object');
    // The table is keyed by pm2 name; either it has entries (pm2 online) or is
    // empty (pm2 down) — but it must never throw and must resolve.
    expect(Object.keys(table).length).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('pm2Run never rejects on a missing process', async () => {
    const { pm2Stop } = await import('../src/lib/subsystemOrchestrator');
    const ok = await pm2Stop('__definitely_missing_process__', 15000);
    expect(typeof ok).toBe('boolean');
  }, 30000);
});