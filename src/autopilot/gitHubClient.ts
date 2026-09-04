/**
 * gitHubClient.ts — thin GitHub REST API v3 wrapper used by the autopilot loop
 * to open, comment on, merge, and veto PRs.
 *
 * Endpoint shape is `{base}/repos/{owner}/{repo}/...` with a Bearer token and
 * the `application/vnd.github+json` accept header. All I/O goes through one
 * injectable `fetchImpl` (tests swap in a capturing mock), and every request
 * carries an AbortController timeout so a hanging socket cannot wedge the loop.
 */

import type { CreatePROpts, GitHubClient, PRComment, UpgradeFileT } from './loopTypes';

export interface GitHubRestClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

const DEFAULT_BASE_URL = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 15_000;

function encPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

function shortSummary(files: UpgradeFileT[]): string {
  if (files.length === 0) return 'no changes';
  const parts = files.slice(0, 5).map((f) => `${f.action} ${f.path}`);
  if (files.length > 5) parts.push(`+${files.length - 5} more`);
  return parts.join(', ');
}

export function createGitHubClient(opts: GitHubRestClientOptions): GitHubClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const token = opts.token;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function requestJson(
    method: string,
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<any> {
    let url = `${baseUrl}${path}`;
    if (options.query) {
      const qs = new URLSearchParams(options.query).toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new GitHubError(`GitHub request timed out after ${timeoutMs}ms`)),
      );
    });

    try {
      const res = await Promise.race([
        fetchImpl(url, {
          method,
          headers,
          signal: controller.signal,
          ...(body !== undefined ? { body } : {}),
        }),
        abortPromise,
      ]);
      clearTimeout(timer);

      const text = await res.text();
      if (!res.ok) {
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 200);
        throw new GitHubError(
          `GitHub API ${method} ${path} failed with ${res.status}${snippet ? `: ${snippet}` : ''}`,
          res.status,
        );
      }
      if (!text) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof GitHubError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new GitHubError(`GitHub request failed: ${msg}`);
    }
  }

  async function getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
    const data = await requestJson(
      'GET',
      `/repos/${encPath(owner)}/${encPath(repo)}/git/ref/heads/${encPath(branch)}`,
    );
    return (data?.object as { sha: string })?.sha;
  }

  return {
    async createBranch(owner, repo, fromBranch, toBranch): Promise<string> {
      const sha = await getBranchSha(owner, repo, fromBranch);
      await requestJson('POST', `/repos/${encPath(owner)}/${encPath(repo)}/git/refs`, {
        body: { ref: `refs/heads/${toBranch}`, sha },
      });
      return toBranch;
    },

    async createCommit(owner, repo, branch, files): Promise<string> {
      const baseSha = await getBranchSha(owner, repo, branch);
      const repoPath = `/repos/${encPath(owner)}/${encPath(repo)}`;

      const treeEntries: unknown[] = [];
      for (const file of files) {
        if (file.action === 'delete') {
          treeEntries.push({ path: file.path, sha: null });
          continue;
        }
        const blob = await requestJson('POST', `${repoPath}/git/blobs`, {
          body: { content: file.content, encoding: 'utf-8' },
        });
        treeEntries.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: (blob as { sha: string }).sha,
        });
      }

      const tree = await requestJson('POST', `${repoPath}/git/trees`, {
        body: { base_tree: baseSha, tree: treeEntries },
      });
      const commit = await requestJson('POST', `${repoPath}/git/commits`, {
        body: {
          message: `Recourse autopilot: ${shortSummary(files)}`,
          tree: (tree as { sha: string }).sha,
          parents: [baseSha],
        },
      });
      await requestJson('POST', `${repoPath}/git/refs/heads/${encPath(branch)}`, {
        body: { sha: (commit as { sha: string }).sha, force: true },
      });

      return (commit as { sha: string }).sha;
    },

    async createDraftPR(opts: CreatePROpts): Promise<number> {
      const { owner, repo } = opts;
      const data = await requestJson('POST', `/repos/${encPath(owner)}/${encPath(repo)}/pulls`, {
        body: {
          title: opts.title,
          body: opts.body,
          head: opts.head,
          base: opts.base,
          draft: opts.draft,
        },
      });
      return (data as { number: number }).number;
    },

    async addLabel(owner, repo, prNumber, label): Promise<void> {
      await requestJson('POST', `/repos/${encPath(owner)}/${encPath(repo)}/issues/${prNumber}/labels`, {
        body: { labels: [label] },
      });
    },

    async getComments(owner, repo, prNumber): Promise<PRComment[]> {
      const data = await requestJson(
        'GET',
        `/repos/${encPath(owner)}/${encPath(repo)}/issues/${prNumber}/comments`,
      );
      return ((data as any[]) ?? []).map((c) => ({
        id: c.id as number,
        body: c.body as string,
        user: (c.user as { login: string })?.login ?? '',
        createdAt: c.created_at as string,
      }));
    },

    async mergePR(owner, repo, prNumber): Promise<void> {
      await requestJson('PUT', `/repos/${encPath(owner)}/${encPath(repo)}/pulls/${prNumber}/merge`);
    },

    async closePR(owner, repo, prNumber): Promise<void> {
      await requestJson('PATCH', `/repos/${encPath(owner)}/${encPath(repo)}/pulls/${prNumber}`, {
        body: { state: 'closed' },
      });
    },
  };
}
