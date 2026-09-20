/**
 * Axiom loop efficiency profile.
 *
 * Reads the most recent Axiom project loop and aggregates per-stage wall time
 * so the harness benchmark can report WHERE an Axiom run spends its budget.
 * Writes a compact JSON the Benchmark Olympics Harness Benchmark panel renders.
 *
 *   tsx scripts/axiom-profile.ts <out.json>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { axiomProjectLatest } from '../src/lib/axiomBridge.js';

export interface AxiomStageTiming {
  key: string;
  ms: number;
  pct: number;
}

export interface AxiomProfile {
  generatedAt: string;
  loopId: string;
  status: string;
  iterations: number;
  maxIterations: number;
  totalMs: number;
  stages: AxiomStageTiming[];
}

export function aggregateAxiomStages(state: Record<string, unknown>): AxiomProfile {
  const iterations = Array.isArray(state.iterations) ? (state.iterations as Array<Record<string, unknown>>) : [];
  const totals = new Map<string, number>();
  for (const it of iterations) {
    const stages = Array.isArray(it.stages) ? (it.stages as Array<Record<string, unknown>>) : [];
    for (const st of stages) {
      const key = typeof st.key === 'string' ? st.key : 'unknown';
      const ms = typeof st.ms === 'number' ? st.ms : 0;
      totals.set(key, (totals.get(key) ?? 0) + ms);
    }
  }
  const startedAt = typeof state.startedAt === 'number' ? state.startedAt : 0;
  const endedAt = typeof state.endedAt === 'number' ? state.endedAt : Date.now();
  const totalMs = Math.max(0, endedAt - startedAt);
  const denom = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  const stages = [...totals.entries()]
    .map(([key, ms]) => ({ key, ms, pct: Math.round((ms / denom) * 1000) / 10 }))
    .sort((a, b) => b.ms - a.ms);

  return {
    generatedAt: new Date().toISOString(),
    loopId: typeof state.id === 'string' ? state.id : '',
    status: typeof state.status === 'string' ? state.status : 'unknown',
    iterations: typeof state.iteration === 'number' ? state.iteration : iterations.length,
    maxIterations: typeof state.maxIterations === 'number' ? state.maxIterations : iterations.length,
    totalMs,
    stages,
  };
}

async function main(): Promise<void> {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error('usage: axiom-profile.ts <out.json>');
    process.exitCode = 1;
    return;
  }
  const r = await axiomProjectLatest();
  if (!r.ok || !r.state) {
    console.error(`axiom latest loop unavailable: ${r.error ?? 'unknown'}`);
    process.exitCode = 1;
    return;
  }
  const profile = aggregateAxiomStages(r.state);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2) + '\n', 'utf-8');
  console.log(JSON.stringify({ out: outPath, loopId: profile.loopId, totalMs: profile.totalMs, top: profile.stages.slice(0, 4) }));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('axiom-profile.ts')) {
  void main();
}
