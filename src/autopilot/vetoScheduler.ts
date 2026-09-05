/**
 * vetoScheduler.ts - lifecycle management for a draft PR the autopilot opened.
 *
 * A proposal PR gets a veto window (repo.autoMergeVetoHours, default 24h).
 * While the window is open anyone can comment "veto" on the PR; that closes
 * the PR and marks vetoReceived. When the window elapses without a veto the
 * scheduler auto-merges.
 *
 * Signature note: savePRState / loadPRState take an explicit absolute file
 * path (not auditDir + prNumber). PRStateT carries no business slug, so the
 * module cannot derive a directory from the state alone - callers own the
 * path (e.g. <auditDir>/<slug>/prs/pr-<prNumber>.json).
 */

import fs from 'node:fs';
import path from 'node:path';
import { PRState, type GitHubClient, type PRStateT } from './loopTypes';

/** Adds vetoHours to an ISO timestamp and returns the new ISO timestamp. */
export function computeVetoDeadline(openedAt: string, vetoHours: number): string {
  return new Date(new Date(openedAt).getTime() + vetoHours * 60 * 60 * 1000).toISOString();
}

/**
 * Extracts { owner, repo } from a github.com URL. Accepts an optional trailing
 * slash and an optional .git suffix on the repo segment. Returns null for
 * non-github hosts, malformed URLs, and URLs that do not have exactly two path
 * segments (owner/repo).
 */
export function parseOwnerRepo(githubUrl: string): { owner: string; repo: string } | null {
  const trimmed = String(githubUrl ?? '').trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Protocol-less github.com shorthand, e.g. github.com/owner/repo.
    if (/^github\.com\//i.test(trimmed)) {
      try {
        url = new URL(`https://${trimmed}`);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && !host.endsWith('.github.com')) return null;

  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2) return null;
  const [owner, repoSegment] = segments;
  if (!owner) return null;
  const repo = repoSegment.endsWith('.git') ? repoSegment.slice(0, -4) : repoSegment;
  if (!repo) return null;
  return { owner, repo };
}

/** A "veto" is the standalone word, case-insensitive (the runbook tells
 *  operators to comment the word "veto"). Word-boundary matching excludes
 *  lookalikes like "vetoed" / "vetoes", and the check is per-comment: a
 *  comment containing "veto" is treated as an instruction to close.
 */
const VETO_RE = /\bveto\b/i;

function isVeto(body: string): boolean {
  return VETO_RE.test(body);
}

/** M3: only an AUTHORIZED commenter's veto counts. Defaults to the repo owner
 *  (state.owner) so an anonymous commenter on a public repo cannot close the
 *  autopilot's PRs. */
function isAuthorizedVeto(c: { user?: string; body?: unknown }, allowed: string[]): boolean {
  return Boolean(c.user) && allowed.includes(String(c.user)) && isVeto(String(c.body ?? ''));
}

/**
 * Advances one PR-state check. Transitions are pure:
 *   1. terminal states (vetoed / merged / closed) are returned unchanged;
 *   2. a comment by an AUTHORIZED user (default: the repo owner) containing the
 *      standalone word "veto" closes the PR;
 *   3. once now >= vetoDeadline the PR is merged — but only after a FINAL
 *      comment re-fetch, so a veto posted between the deadline check and the
 *      merge still closes the PR (narrows the check-then-merge race; a fully
 *      atomic guarantee is impossible over REST);
 *   4. still inside the window -> returned unchanged.
 */
export async function checkAndMerge(
  state: PRStateT,
  github: GitHubClient,
  opts: { now?: Date; vetoHours?: number; authorizedVetoUsers?: string[] } = {},
): Promise<PRStateT> {
  if (state.vetoReceived || state.merged || state.closed) return state;

  const allowed = opts.authorizedVetoUsers ?? [state.owner];
  const fetchComments = () => github.getComments(state.owner, state.repo, state.prNumber);
  const vetoedBy = (comments: { user?: string; body?: unknown }[]): boolean =>
    comments.some((c) => isAuthorizedVeto(c, allowed));

  const comments = await fetchComments();
  if (vetoedBy(comments)) {
    await github.closePR(state.owner, state.repo, state.prNumber);
    return { ...state, vetoReceived: true, closed: true };
  }

  let deadlineMs = new Date(state.vetoDeadline).getTime();
  if (!Number.isFinite(deadlineMs) && opts.vetoHours !== undefined) {
    // Defensive fallback for hand-rolled state without a usable deadline.
    deadlineMs = new Date(state.openedAt).getTime() + opts.vetoHours * 60 * 60 * 1000;
  }
  if (Number.isFinite(deadlineMs) && (opts.now ?? new Date()).getTime() >= deadlineMs) {
    // Final re-fetch before merging (M3 race window).
    const finalComments = await fetchComments();
    if (vetoedBy(finalComments)) {
      await github.closePR(state.owner, state.repo, state.prNumber);
      return { ...state, vetoReceived: true, closed: true };
    }
    try {
      await github.mergePR(state.owner, state.repo, state.prNumber);
      return { ...state, merged: true };
    } catch (err) {
      return { ...state, mergeError: String(err) };
    }
  }
  return state;
}

// ============================================================================
// H4/H5 helpers — scan a business's prs/ dir so a scheduler can advance open
// PRs and avoid opening a second PR while one is still in its veto window.
// ============================================================================

export function isTerminal(state: PRStateT): boolean {
  return state.vetoReceived || state.merged || state.closed;
}

export function isInFlight(state: PRStateT): boolean {
  return !isTerminal(state);
}

/** Reads every `pr-*.json` under prsDir and returns only IN-FLIGHT PR states.
 *  Missing directories and unparseable files are skipped (never throws). */
export async function loadOpenPrStates(prsDir: string): Promise<PRStateT[]> {
  if (!fs.existsSync(prsDir)) return [];
  const files = fs
    .readdirSync(prsDir)
    .filter((f) => /^pr-\d+\.json$/.test(f))
    .sort();
  const open: PRStateT[] = [];
  for (const file of files) {
    const state = await loadPRState(path.join(prsDir, file));
    if (state && isInFlight(state)) open.push(state);
  }
  return open;
}

/** Persists PR state to an explicit file path (creates parent directories). */
export async function savePRState(state: PRStateT, prFilePath: string): Promise<string> {
  fs.mkdirSync(path.dirname(prFilePath), { recursive: true });
  fs.writeFileSync(prFilePath, JSON.stringify(state, null, 2), 'utf8');
  return prFilePath;
}

/** Reads and validates PR state from an explicit file path; null when absent/corrupt. */
export async function loadPRState(prFilePath: string): Promise<PRStateT | null> {
  if (!fs.existsSync(prFilePath)) return null;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(prFilePath, 'utf8'));
    const parsed = PRState.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
