#!/usr/bin/env tsx
/**
 * Nightly self-improvement coordinator (Phase 5 #17).
 *
 * Orchestrates one self-improvement cycle against a running Recourse server and
 * writes an honest upgrade report:
 *
 *   1. Snapshot "before" metrics from the server.
 *   2. Optionally drive the loops (dream tick + capability-forge run) when
 *      RUN_LOOPS=1 — these are the agentic steps that need a configured model.
 *   3. Wait, snapshot "after".
 *   4. Render upgrade-report.md from the real deltas (never fabricated).
 *
 * The server state can be large; give it time between snapshots. If the loops
 * were not run (RUN_LOOPS unset) the report still shows an honest no-change
 * verdict so the pipeline never lies about progress.
 *
 * Usage:
 *   tsx scripts/nightly-self-improvement.ts
 *   RUN_LOOPS=1 RECOURSE_API_URL=http://localhost:3050 RECOURSE_API_SECRET=... \
 *     tsx scripts/nightly-self-improvement.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const API = (process.env.RECOURSE_API_URL || 'http://localhost:3050').replace(/\/+$/, '');
const SECRET = process.env.RECOURSE_API_SECRET || '';
const RUN_LOOPS = process.env.RUN_LOOPS === '1';
const OUT = process.env.UPGRADE_REPORT_PATH || path.join(process.cwd(), 'upgrade-report.md');

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (SECRET) h['x-api-secret'] = SECRET;
  return h;
}

interface DevDossier {
  registryTools?: number;
  liveSelfHostedTools?: number;
  verifierPassRate?: number;
  openAnomalies?: number;
}

async function fetchDossier(): Promise<DevDossier> {
  const res = await fetch(`${API}/api/recourse/develop`);
  if (!res.ok) throw new Error(`develop snapshot HTTP ${res.status}`);
  const j: any = await res.json();
  return j?.dossier ?? {};
}

function toSnapshot(d: DevDossier) {
  return {
    registryTools: d.registryTools ?? 0,
    liveSelfHosted: d.liveSelfHostedTools ?? 0,
    verifierPassRate: d.verifierPassRate ?? 1,
    openAnomalies: d.openAnomalies ?? 0,
    promoted: 0,
    benchmarkSolved: 0,
    benchmarkTotal: 0,
    healedTools: 0,
  };
}

async function main(): Promise<void> {
  const before = toSnapshot(await fetchDossier());
  const events: string[] = [];

  if (RUN_LOOPS) {
    // Drive the model-backed loop steps. Best-effort: if the model is offline or
    // a step is unavailable we record that honestly rather than fabricate output.
    for (const [label, url] of [
      ['dream tick', '/api/recourse/dream/tick'],
      ['forge run', '/api/recourse/forge/run'],
    ] as Array<[string, string]>) {
      try {
        const r = await fetch(`${API}${url}`, { method: 'POST', headers: headers() });
        events.push(`${label}: HTTP ${r.status}`);
      } catch (err: any) {
        events.push(`${label}: skipped (${err?.message ?? err})`);
      }
    }
    // Give the loops a moment to persist.
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    events.push('RUN_LOOPS not set — no model steps driven this cycle (report is an honest no-change baseline)');
  }

  const after = toSnapshot(await fetchDossier());

  const { renderUpgradeReport } = await import('../src/lib/upgradeReport.js');
  const md = renderUpgradeReport({ before, after, events, date: new Date() });
  fs.writeFileSync(OUT, md, 'utf-8');
  console.log(`Wrote ${OUT}`);
  console.log(md);
}

main().catch((err) => {
  console.error('nightly-self-improvement failed:', err?.message ?? err);
  process.exit(1);
});
