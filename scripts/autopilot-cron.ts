#!/usr/bin/env tsx
/**
 * autopilot-cron.ts — scheduled entry point for the recursive audit loop.
 *
 * Runs the loop state machine for one business (--business=<slug>) or for every
 * profiled business (--all, the default). Designed to be invoked from an npm
 * script, pm2, or a system cron. Importing this file has no side effects: the
 * run only starts when it is the executed main module.
 *
 * Behavior:
 *   - A global kill switch (RECOURSE_AUTOPILOT_DISABLED=1) aborts the whole run
 *     with exit code 2 before anything is loaded.
 *   - Businesses with autoMergeEnabled: false are skipped with a real no-op log,
 *     unless --dry-run is passed — then the audit still runs read-only so the
 *     operator can see what the loop WOULD do without opening any PR.
 *   - H4/H5 (closing the loop): before opening a NEW PR for a business, the cron
 *     scans that business's prs/ dir and ADVANCES any PR still in its veto
 *     window via resumeAfterVeto (merge or veto). If a PR is still in flight
 *     after advancing, the cron does NOT open another PR that cycle — so a PR
 *     never stays a draft forever and a business never accumulates a second
 *     force-pushed PR on the same cycle.
 *   - A failing business is logged and skipped; the run exits 1 so a cron
 *     wrapper can tell the run was not fully green.
 *
 * Usage:
 *   tsx scripts/autopilot-cron.ts --all
 *   tsx scripts/autopilot-cron.ts --business=hempforge
 *   tsx scripts/autopilot-cron.ts --business hempforge
 *   tsx scripts/autopilot-cron.ts hempforge --dry-run
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  isAutoMergeEnabled,
  isKillSwitchActive,
  listBusinessSlugs,
  loadBusinessProfile,
  repoBinding,
  type BusinessProfileT,
} from '../src/autopilot/businessProfile';
import { resumeAfterVeto, runLoop } from '../src/autopilot/loopStateMachine';
import { slugify } from '../src/autopilot/scorecard';
import { loadOpenPrStates, parseOwnerRepo } from '../src/autopilot/vetoScheduler';
import { fetchGitHubToken } from '../src/autopilot/keywireClient';
import { createGitHubClient } from '../src/autopilot/gitHubClient';
import type { GitHubClient } from '../src/autopilot/loopTypes';

const DEFAULT_AUDIT_DIR = 'data/business-profiles';

/** GitHub client for a profile via the Keywire zero-trust token (PR-time only). */
export async function githubForProfile(profile: BusinessProfileT): Promise<GitHubClient | null> {
  const repo = repoBinding(profile);
  if (!repo) return null;
  const parsed = parseOwnerRepo(repo.githubUrl);
  if (!parsed) return null;
  const token = await fetchGitHubToken(parsed.owner);
  return createGitHubClient({ token });
}

/** Structural view of a loopStateMachine outcome. LoopState is a discriminated
 *  union; we only read the fields the cron prints. */
export interface LoopOutcomeLike {
  state: {
    status: string;
    prNumber?: number;
    reason?: string;
    [k: string]: unknown;
  };
  context: unknown;
}

export interface AuditArgv {
  /** Selected business slug, or null to run every profiled business. */
  business: string | null;
  /** True when --dry-run was passed: the audit runs read-only, no PR opens. */
  dryRun: boolean;
  /** True when --business was requested without a value and no slug followed. */
  missingBusinessSlug: boolean;
}

/** Parses process.argv-style arguments for the cron entry point. */
export function parseArgv(argv: string[]): AuditArgv {
  const args = argv.slice(2);
  const result: AuditArgv = {
    business: null,
    dryRun: false,
    missingBusinessSlug: false,
  };
  let businessFlagSeen = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--all') {
      businessFlagSeen = true;
      result.business = null;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--business') {
      businessFlagSeen = true;
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result.business = next;
        i += 1;
      } else {
        result.missingBusinessSlug = true;
      }
    } else if (arg.startsWith('--business=')) {
      businessFlagSeen = true;
      const value = arg.slice('--business='.length);
      if (value !== '') result.business = value;
      else result.missingBusinessSlug = true;
    } else if (arg.startsWith('-')) {
      // Unknown flag: ignored so future cron flags stay forward-compatible.
    } else if (!businessFlagSeen && result.business === null) {
      // Bare positional slug, e.g. `npm run audit:one -- hempforge`.
      result.business = arg;
    }
  }

  return result;
}

/** Renders the single outcome line the cron prints per business. */
export function formatOutcome(slug: string, outcome: LoopOutcomeLike): string {
  const state: LoopOutcomeLike['state'] =
    outcome && outcome.state ? outcome.state : ({} as LoopOutcomeLike['state']);
  let line = `[autopilot] ${slug}: ${String(state.status ?? 'unknown')}`;
  if (typeof state.prNumber === 'number') line += ` pr=${state.prNumber}`;
  if (typeof state.reason === 'string' && state.reason !== '')
    line += ` reason=${state.reason}`;
  return line;
}

/**
 * Runs the audit loop for the selected businesses. Never mutates
 * process.exitCode itself — the caller decides what an exit code means.
 * Returns the exit code the process should use (2 = kill switch abort,
 * 1 = at least one business errored, 0 = green).
 */
export async function runScheduledAudit(
  argv: string[] = process.argv,
): Promise<{ exitCode: number }> {
  const { business, dryRun, missingBusinessSlug } = parseArgv(argv);

  if (missingBusinessSlug) {
    console.error(
      '[autopilot] --business requires a slug: --business=<slug> or --business <slug>',
    );
    return { exitCode: 1 };
  }

  if (isKillSwitchActive()) {
    console.log('[autopilot] KILL_SWITCH active, aborting');
    return { exitCode: 2 };
  }

  const slugs = business !== null ? [business] : listBusinessSlugs();

  let exitCode = 0;
  for (const slug of slugs) {
    try {
      const profile = loadBusinessProfile(slug);
      const enabled = isAutoMergeEnabled(profile);
      if (!enabled && !dryRun) {
        console.log(`[autopilot] ${slug}: auto-merge disabled, skipping`);
        continue;
      }

      // H4/H5: advance any PR still in its veto window BEFORE opening a new one.
      // Only in a real (non-dry) run and only when auto-merge is on (a PR only
      // exists because the loop opened it under that mode; if the operator has
      // since disabled auto-merge, leave the draft PR alone).
      if (!dryRun && enabled) {
        const auditDir = DEFAULT_AUDIT_DIR;
        const prsDir = path.join(auditDir, slugify(profile.business.name), 'prs');
        const open = await loadOpenPrStates(prsDir);
        if (open.length > 0) {
          const github = await githubForProfile(profile);
          if (!github) {
            exitCode = 1;
            console.error(`[autopilot] ${slug}: cannot advance PR — no github url / keywire token`);
            continue;
          }
          let stillInFlight = false;
          for (const pr of open) {
            try {
              const res = (await resumeAfterVeto({
                profile,
                prState: pr,
                github,
                auditDir,
                now: new Date(),
              })) as LoopOutcomeLike;
              console.log(formatOutcome(slug, res));
              if (res.state.status === 'error') exitCode = 1;
              if (res.state.status === 'veto_wait') stillInFlight = true;
            } catch (err) {
              exitCode = 1;
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[autopilot] ${slug}: advance PR #${pr.prNumber} error: ${message}`);
            }
          }
          if (stillInFlight) {
            console.log(`[autopilot] ${slug}: PR still in veto window — not opening a new one this cycle`);
            continue;
          }
          // All in-flight PRs were merged/vetoed/closed — fall through and open
          // the next upgrade PR.
        }
      }

      const outcome = (await runLoop({ profile, dryRun })) as LoopOutcomeLike;
      console.log(formatOutcome(slug, outcome));
      // State-machine errors are returned, not thrown — surface them as exit 1
      // so cron wrappers can detect a failed pass.
      if (outcome && outcome.state && outcome.state.status === 'error') {
        exitCode = 1;
      }
    } catch (err) {
      exitCode = 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[autopilot] ${slug}: error: ${message}`);
    }
  }

  return { exitCode };
}

async function main(): Promise<void> {
  const { exitCode } = await runScheduledAudit(process.argv);
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[autopilot] fatal: ${message}`);
    process.exitCode = 1;
  });
}
