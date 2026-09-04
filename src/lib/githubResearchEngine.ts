/**
 * REAL GitHub research engine.
 *
 * Replaces the old synthetic "catalog" of invented repos. All data here comes
 * from the live GitHub REST API. Two capabilities:
 *   1. searchGitHubRepositories() - real repository search results.
 *   2. fetchRepoSource() - fetch a real file from a repository (default branch),
 *      chosen automatically when no path is given (prefers src/, then root,
 *      first .ts/.js/.mjs file found).
 *
 * Offline / rate-limited / 404 are reported as explicit errors - never as
 * made-up blueprints.
 */

import type { ToolDomain } from '../types';

export interface GitHubRepoResult {
  id: string;                 // full name e.g. "lodash/lodash"
  fullName: string;
  author: string;             // owner login
  stars: number;
  description: string;
  license?: string;
  htmlUrl: string;
  defaultBranch?: string;
  language?: string;
}

export interface GitHubFileCandidate {
  repo: string;
  path: string;
  sha: string;
  size: number;
  defaultBranch: string;
  license?: string;
  content: string;
  htmlUrl: string;
  language: 'js' | 'ts';
}

export interface GitHubFetchError extends Error {
  kind: 'offline' | 'not_found' | 'rate_limited' | 'no_code_file' | 'http';
  status?: number;
}

function ghError(message: string, kind: GitHubFetchError['kind'], status?: number): GitHubFetchError {
  const e = new Error(message) as GitHubFetchError;
  e.kind = kind;
  e.status = status;
  return e;
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'recourse-selfdeveloping-os',
  };
  const key = token || process.env.GITHUB_TOKEN;
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

async function ghFetch(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15000) });
  } catch (err: any) {
    throw ghError(err?.name === 'TimeoutError' ? 'GitHub API timed out' : `GitHub unreachable: ${err?.message || 'network error'}`, 'offline');
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) throw ghError('GitHub API rate limit reached (unauthenticated: 10 search/min, 60 core/hr). Set GITHUB_TOKEN for more.', 'rate_limited', res.status);
    if (res.status === 404) throw ghError('Not found on GitHub', 'not_found', 404);
    throw ghError(`GitHub API error HTTP ${res.status}`, 'http', res.status);
  }
  return res.json();
}

/** Real GitHub repository search. */
export async function searchGitHubRepositories(
  query: string,
  perPage = 12,
): Promise<GitHubRepoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await ghFetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`,
  );
  return (data.items || []).map((r: any) => ({
    id: r.full_name,
    fullName: r.full_name,
    author: r.owner?.login || '',
    stars: r.stargazers_count ?? 0,
    description: r.description || '',
    license: r.license?.spdx_id || undefined,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    language: r.language || undefined,
  }));
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
function scorePath(p: string): number {
  const lower = p.toLowerCase();
  let s = 0;
  if (/^src\//.test(lower)) s += 3;
  if (/^lib\//.test(lower)) s += 2;
  if (/index\.(ts|js)$/.test(lower)) s += 2;
  if (/\.(ts|js)$/.test(lower)) s += 1;
  return s;
}

async function listCodeFiles(repo: string, ref: string, prefix = ''): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(prefix)}?ref=${encodeURIComponent(ref)}`;
  const data = await ghFetch(url);
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const entry of data) {
    const name = entry.name || '';
    if (entry.type === 'dir') {
      // Depth-limit traversal to avoid huge trees.
      const depth = prefix.split('/').filter(Boolean).length;
      if (depth < 3) {
        const sub = await listCodeFiles(repo, ref, entry.path);
        out.push(...sub);
      }
    } else if (CODE_EXT.test(name)) {
      out.push(entry.path);
    }
  }
  return out;
}

/** Fetch a real file. If no path given, pick the most likely code entrypoint. */
export async function fetchRepoSource(repo: string, path?: string): Promise<GitHubFileCandidate> {
  const cleanRepo = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanRepo)) {
    throw ghError('Invalid repository name. Use owner/repo or a full GitHub URL.', 'http');
  }

  const meta = await ghFetch(`https://api.github.com/repos/${cleanRepo}`);
  const ref = path ? undefined : (meta.default_branch || 'main');

  let targetPath = path;
  if (!targetPath) {
    const files = await listCodeFiles(cleanRepo, ref!);
    if (files.length === 0) throw ghError('No .js/.ts source file found to import.', 'no_code_file');
    targetPath = files.sort((a, b) => scorePath(b) - scorePath(a))[0];
  }

  const contents = await ghFetch(`https://api.github.com/repos/${cleanRepo}/contents/${encodeURIComponent(targetPath)}?ref=${encodeURIComponent(ref || 'HEAD')}`);
  if (!contents?.content) throw ghError('File content unavailable (too large or binary).', 'http');

  const content = Buffer.from(contents.content, 'base64').toString('utf-8');
  const isTs = /\.(ts|tsx)$/i.test(targetPath);

  return {
    repo: cleanRepo,
    path: targetPath,
    sha: contents.sha || '',
    size: contents.size || content.length,
    defaultBranch: ref || meta.default_branch || 'main',
    license: meta.license?.spdx_id,
    content,
    htmlUrl: contents.html_url || `https://github.com/${cleanRepo}/blob/${ref || 'HEAD'}/${targetPath}`,
    language: isTs ? 'ts' : 'js',
  };
}

/** Very light heuristic: we never claim to know a repo's "domain"; imports
 *  default to coding unless the caller says otherwise. */
export function domainLabel(_file: GitHubFileCandidate, requested?: ToolDomain): ToolDomain {
  return requested || 'coding';
}
