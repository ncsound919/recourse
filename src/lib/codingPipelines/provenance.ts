/**
 * Harness provenance — the git revision of a bare checkout.
 *
 * The whole point of downloading fresh, unmodified harnesses is that a
 * benchmark number is only meaningful when you know exactly which commit
 * produced it. `gitRevision` stamps that commit onto a pipeline's status and
 * onto every ledger record.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export function isGitCheckout(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

export function gitRevision(dir: string, short = true): string | undefined {
  if (!isGitCheckout(dir)) return undefined;
  try {
    const args = ['-C', dir, 'rev-parse'];
    if (short) args.push('--short');
    args.push('HEAD');
    const res = spawnSync('git', args, { encoding: 'utf-8' });
    if (res.status === 0 && typeof res.stdout === 'string' && res.stdout.trim()) {
      return res.stdout.trim();
    }
  } catch {
    // git missing or repo unreadable — provenance is simply unavailable.
  }
  return undefined;
}

export function gitBranch(dir: string): string | undefined {
  if (!isGitCheckout(dir)) return undefined;
  try {
    const res = spawnSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' });
    if (res.status === 0 && typeof res.stdout === 'string' && res.stdout.trim()) {
      return res.stdout.trim();
    }
  } catch {
    // fall through
  }
  return undefined;
}

/** `"dev@350c726"` style label for a bare harness checkout. */
export function harnessProvenance(dir: string): string | undefined {
  const rev = gitRevision(dir);
  if (!rev) return undefined;
  const branch = gitBranch(dir);
  return branch ? `${branch}@${rev}` : rev;
}
