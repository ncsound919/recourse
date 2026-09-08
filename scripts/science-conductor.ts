#!/usr/bin/env tsx
/**
 * Standalone 24/7 science-conductor runner.
 *
 * Runs the same research cycles as the in-server conductor WITHOUT the UI
 * server — for pm2 / nohup / Task Scheduler deployments:
 *
 *   pm2 start scripts/science-conductor.ts --interpreter npx --name science-conductor
 *   nohup npx tsx scripts/science-conductor.ts > science-conductor.log 2>&1 &
 *
 * Env:
 *   SCIENCE_CONDUCTOR_INTERVAL_MS  cycle cadence (default 900000 = 15min)
 *   SCIENCE_CONDUCTOR_MAX_CYCLES   optional stop-after-N for testing
 *   BIOSIM_SIDECAR_URL / UMOE_URL / ...  service overrides (see .env.example)
 *
 * Honest: every cycle is recorded to data/science-loop/*.jsonl whether or not
 * it found anything; offline services are skipped, never simulated.
 */
import {
  startScienceConductor,
  getConductorStatus,
  stopScienceConductor,
  runScienceCycle,
} from '../src/lib/scienceConductor.js';

const intervalMs = Math.max(60_000, Number(process.env.SCIENCE_CONDUCTOR_INTERVAL_MS) || 15 * 60 * 1000);
const maxCycles = Number(process.env.SCIENCE_CONDUCTOR_MAX_CYCLES) || 0;

console.log(`[science-conductor] starting — interval ${Math.round(intervalMs / 60000)}min${maxCycles ? `, stop after ${maxCycles} cycles` : ''}`);

if (maxCycles > 0) {
  for (let i = 0; i < maxCycles; i++) {
    try {
      const c = await runScienceCycle();
      console.log(`[science-conductor] cycle ${c.cycle} done — mode=${c.experimentMode} findings=${c.findings.length} problem=${c.problemId}`);
    } catch (err) {
      console.error('[science-conductor] cycle failed:', (err as Error)?.message ?? err);
    }
  }
  stopScienceConductor();
  process.exit(0);
}

startScienceConductor({ intervalMs });

const report = setInterval(() => {
  const s = getConductorStatus();
  console.log(`[science-conductor] status: running=${s.running} cycles=${s.cyclesRun} uptime=${s.uptimeSeconds}s`);
}, 10 * 60 * 1000);

process.on('SIGINT', () => {
  console.log('[science-conductor] SIGINT — stopping.');
  clearInterval(report);
  stopScienceConductor();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[science-conductor] SIGTERM — stopping.');
  clearInterval(report);
  stopScienceConductor();
  process.exit(0);
});
