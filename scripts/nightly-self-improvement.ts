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
import { pathToFileURL } from 'node:url';
import {
  isProposeEnabled,
  listBusinessSlugs,
  loadBusinessProfile,
  repoBinding,
  type BusinessProfileT,
} from '../src/autopilot/businessProfile.js';
import { runLoop, type LoopOutcome } from '../src/autopilot/loopStateMachine.js';
import { createCodePlanner } from '../src/autopilot/codePlanner.js';
import { chatComplete } from '../src/lib/modelProvider.js';
import { createLearnerStore, RecursiveLearner } from '../src/dream/learner.js';
import { defaultAuditAdapters } from '../src/autopilot/auditAdapters.js';
import { domainsForGap, type SynergyPair } from '../src/autopilot/gapAnalyzer.js';
import type { GapT } from '../src/autopilot/loopTypes.js';
import type { Directive } from '../src/dream/learner-types.js';
import { readSynergyMap } from '../src/lib/synergy/store.js';
import { renderRunReportSummary } from '../src/autopilot/runReport.js';

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

  // The autopilot loop itself, called DIRECTLY — not through another HTTP hop.
  // An HTTP driver cannot prove the loop ran: it can only see a status code. This
  // passes the same pieces the cron passes (planner with this repo's index,
  // synergy pairs from the persisted map, learner directives) and reads the F11
  // run report off each outcome, so the exit code reflects what the run proved.
  const loop = await runAutopilotPass();
  for (const line of loop.events) events.push(line);

  const after = toSnapshot(await fetchDossier());

  const { renderUpgradeReport } = await import('../src/lib/upgradeReport.js');
  const md = renderUpgradeReport({ before, after, events, date: new Date() });
  fs.writeFileSync(OUT, md, 'utf-8');
  console.log(`Wrote ${OUT}`);
  console.log(md);

  // Exit 1 unless the night proved something: at least one merged change with a
  // non-doc file, and not every proposal skipped. `significant` on the F11 report
  // is exactly that verdict, aggregated across the profiles this pass ran.
  if (!loop.ok) {
    console.error(`nightly-self-improvement: ${loop.why}`);
    process.exitCode = 1;
  }
}

/**
 * One in-process autopilot pass per profiled business.
 *
 * Mirrors scripts/autopilot-cron.ts (same planner, learner, adapters, synergy
 * and directive wiring) minus the scheduling and PR-advancing: the cron owns
 * the calendar, this owns the verdict. A run that cannot prove it changed a
 * non-doc file fails the night on purpose.
 */
async function runAutopilotPass(): Promise<{ ok: boolean; why: string; events: string[] }> {
  const events: string[] = [];

  const learner = new RecursiveLearner(createLearnerStore());
  const slugs = listBusinessSlugs();
  if (slugs.length === 0) {
    return { ok: false, why: 'no business profiles found', events: ['autopilot: no business profiles found'] };
  }

  const outcomes: LoopOutcome[] = [];
  for (const slug of slugs) {
    let profile: BusinessProfileT;
    try {
      profile = loadBusinessProfile(slug);
    } catch (err) {
      events.push(`autopilot ${slug}: profile unreadable (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    const repo = repoBinding(profile);
    if (!repo) {
      events.push(`autopilot ${slug}: no repo binding, skipping`);
      continue;
    }
    const effectiveDryRun = !isProposeEnabled(profile);
    const synergy = (gaps: GapT[]): SynergyPair[] => {
      if (String(process.env.SYNERGY_IN_LOOP ?? '').trim() !== '1') return [];
      try {
        const map = readSynergyMap();
        if (!map || map.candidates.length === 0) return [];
        // analyzeGaps hands this its own scored gaps, so domainsForGap reads a
        // real ToolDomain signal off each one rather than a guess made here.
        const domainsByGap = new Map<string, Set<string>>();
        for (const g of gaps) domainsByGap.set(g.id, new Set(domainsForGap(g)));
        const out: SynergyPair[] = [];
        const used = new Set<string>();
        for (const c of map.candidates) {
          if (c.score < 0.5) continue;
          const a = gaps.find((g) => (domainsByGap.get(g.id)?.has(c.fromDomain) ?? false) && !used.has(g.id));
          const b = gaps.find((g) => (domainsByGap.get(g.id)?.has(c.toDomain) ?? false) && !used.has(g.id));
          if (!a || !b || a.id === b.id) continue;
          used.add(a.id);
          used.add(b.id);
          out.push({
            a: a.id, b: b.id,
            domainA: c.fromDomain, domainB: c.toDomain,
            score: c.score,
            rationale: `nightly: ${c.fromDomain}->${c.toDomain} at ${c.score.toFixed(2)}`,
          });
          if (out.length >= 5) break;
        }
        return out;
      } catch (err) {
        console.warn(`[nightly] synergy unavailable: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    };
    let directives: Directive[] = [];
    try {
      const state = await learner.status();
      directives = state.directives;
    } catch (err) {
      console.warn(`[nightly] learner directives unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }

    const outcome = await runLoop({
      profile,
      dryRun: effectiveDryRun,
      planner: createCodePlanner((messages) => chatComplete(messages), { repoRoot: repo.localPath }),
      learner,
      adapters: defaultAuditAdapters(),
      synergy,
      directives,
    });
    outcomes.push(outcome);
    if (outcome.report) {
      events.push(`autopilot ${slug}:\n${renderRunReportSummary(outcome.report)}`);
    } else {
      events.push(`autopilot ${slug}: ${outcome.state.status} (no report built)`);
    }
  }

  if (outcomes.length === 0) return { ok: false, why: 'no profile produced an outcome', events };
  return { ...nightlyVerdict(outcomes), events };
}

/**
 * The night's verdict, read off the F11 reports.
 *
 * Pure: outcomes in, verdict out. The script's exit code is this function's
 * return, nothing else.
 */
export function nightlyVerdict(outcomes: LoopOutcome[]): { ok: boolean; why: string } {
  if (outcomes.length === 0) return { ok: false, why: 'no profile produced an outcome' };
  //   - every proposal skipped (or nothing proposed at all) => fail;
  //   - zero non-doc files merged across all outcomes => fail.
  const allSkipped = outcomes.every(
    (o) => (o.report ? o.report.proposals === 0 : true) &&
      (o.skipped?.length ?? 0) > 0,
  );
  // A file counts as a "non-doc" change when it is not markdown and not under
  // docs/: `.gitignore`, `.env.example`, source files — the things an upgrade
  // actually changes. A docs-only run is activity, not improvement.
  const nonDocMerged = outcomes.some((o) => {
    const files = o.context.currentProposal?.files ?? [];
    return files.some((f) => !/\.md$/i.test(f.path) && !/^docs\//i.test(f.path));
  });
  if (allSkipped) {
    return { ok: false, why: 'every proposal was skipped (planner offline or unusable plans)' };
  }
  if (!nonDocMerged) {
    return { ok: false, why: 'zero non-doc files merged across all profiles' };
  }
  return { ok: true, why: '' };
}

export { runAutopilotPass };

/** Importing this file has no side effects: the run starts only when executed. */
async function cli(): Promise<void> {
  await main();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((err) => {
    console.error('nightly-self-improvement failed:', err?.message ?? err);
    process.exit(1);
  });
}
