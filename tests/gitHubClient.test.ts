import { describe, it, expect, vi } from 'vitest';
import {
  GitHubError,
  createGitHubClient,
  type GitHubRestClientOptions,
} from '../src/autopilot/gitHubClient';
import type { CreatePROpts, UpgradeFileT } from '../src/autopilot/loopTypes';

const BASE = 'https://api.github.com';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

function sequence(...responses: Response[]): (call: Call, index: number) => Response {
  return (_call, index) => responses[Math.min(index, responses.length - 1)];
}

function makeClient(
  responder: (call: Call, index: number) => Response,
  overrides: Partial<GitHubRestClientOptions> = {},
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      method: (init?.method ?? 'GET').toUpperCase(),
      url,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body !== undefined ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return responder(call, calls.length - 1);
  });
  const client = createGitHubClient({
    token: 'tok123',
    baseUrl: BASE,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  });
  return { client, calls };
}

const refMain = () => jsonRes({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'sha-main' } });

describe('gitHubClient', () => {
  it('createBranch reads the source ref sha, creates the target ref, returns the branch', async () => {
    const { client, calls } = makeClient(
      sequence(refMain(), jsonRes({ ref: 'refs/heads/feat/autopilot' })),
    );

    const result = await client.createBranch('acme', 'site', 'main', 'feat/autopilot');

    expect(result).toBe('feat/autopilot');
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/git/ref/heads/main`);
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe(`${BASE}/repos/acme/site/git/refs`);
    expect(calls[1].body).toEqual({ ref: 'refs/heads/feat/autopilot', sha: 'sha-main' });
    expect(calls[0].headers.Authorization).toBe('Bearer tok123');
  });

  it('createCommit with a create file blobs→trees→commits→refs and force-updates the branch', async () => {
    const files: UpgradeFileT[] = [
      { path: 'src/hello.ts', action: 'create', content: 'export const x = 1;\n' },
    ];
    const { client, calls } = makeClient(
      sequence(
        refMain(),
        jsonRes({ sha: 'blob-sha-1' }),
        jsonRes({ sha: 'tree-sha-1' }),
        jsonRes({ sha: 'commit-sha-1' }),
        jsonRes({}),
      ),
    );

    const commitSha = await client.createCommit('acme', 'site', 'main', files);

    expect(commitSha).toBe('commit-sha-1');
    expect(calls).toHaveLength(5);

    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/git/ref/heads/main`);

    const postMethods = calls.slice(1).map((c) => c.method);
    expect(postMethods).toEqual(['POST', 'POST', 'POST', 'POST']);

    expect(calls[1].url).toBe(`${BASE}/repos/acme/site/git/blobs`);
    expect(calls[1].body).toEqual({ content: 'export const x = 1;\n', encoding: 'utf-8' });
    expect(calls[1].headers['Content-Type']).toBe('application/json');
    expect(calls[1].headers.Accept).toBe('application/vnd.github+json');

    expect(calls[2].url).toBe(`${BASE}/repos/acme/site/git/trees`);
    expect(calls[2].body).toEqual({
      base_tree: 'sha-main',
      tree: [{ path: 'src/hello.ts', mode: '100644', type: 'blob', sha: 'blob-sha-1' }],
    });

    expect(calls[3].url).toBe(`${BASE}/repos/acme/site/git/commits`);
    expect(calls[3].body).toEqual({
      message: 'Recourse autopilot: create src/hello.ts',
      tree: 'tree-sha-1',
      parents: ['sha-main'],
    });

    expect(calls[4].method).toBe('POST');
    expect(calls[4].url).toBe(`${BASE}/repos/acme/site/git/refs/heads/main`);
    expect(calls[4].body).toEqual({ sha: 'commit-sha-1', force: true });
  });

  it('createCommit with a delete file sends { path, sha: null } in the tree (no blob)', async () => {
    const files: UpgradeFileT[] = [{ path: 'legacy/old.txt', action: 'delete', content: '' }];
    const { client, calls } = makeClient(
      sequence(refMain(), jsonRes({ sha: 'tree-sha-del' }), jsonRes({ sha: 'commit-sha-del' }), jsonRes({})),
    );

    const commitSha = await client.createCommit('acme', 'site', 'main', files);

    expect(commitSha).toBe('commit-sha-del');
    expect(calls).toHaveLength(4);
    expect(calls.some((c) => c.url.endsWith('/git/blobs'))).toBe(false);
    expect(calls[1].url).toBe(`${BASE}/repos/acme/site/git/trees`);
    expect(calls[1].body).toEqual({
      base_tree: 'sha-main',
      tree: [{ path: 'legacy/old.txt', sha: null }],
    });
  });

  it('createDraftPR POSTs /pulls with the draft flag and returns the parsed number', async () => {
    const opts: CreatePROpts = {
      owner: 'acme',
      repo: 'site',
      title: 'Autopilot upgrade',
      body: 'Generated fix',
      head: 'feat/autopilot',
      base: 'main',
      draft: true,
    };
    const { client, calls } = makeClient(sequence(jsonRes({ number: 42 })));

    const number = await client.createDraftPR(opts);

    expect(number).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/pulls`);
    expect(calls[0].body).toEqual({
      title: 'Autopilot upgrade',
      body: 'Generated fix',
      head: 'feat/autopilot',
      base: 'main',
      draft: true,
    });
  });

  it('addLabel POSTs /issues/{n}/labels with the label array', async () => {
    const { client, calls } = makeClient(sequence(jsonRes({})));

    await client.addLabel('acme', 'site', 42, 'autopilot');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/issues/42/labels`);
    expect(calls[0].body).toEqual({ labels: ['autopilot'] });
  });

  it('getComments maps GitHub fields to PRComment', async () => {
    const payload = [
      { id: 11, body: 'looks good', user: { login: 'alice' }, created_at: '2026-01-02T03:04:05Z' },
      { id: 12, body: 'veto this', user: { login: 'bob' }, created_at: '2026-01-02T04:00:00Z' },
    ];
    const { client, calls } = makeClient(sequence(jsonRes(payload)));

    const comments = await client.getComments('acme', 'site', 9);

    expect(comments).toEqual([
      { id: 11, body: 'looks good', user: 'alice', createdAt: '2026-01-02T03:04:05Z' },
      { id: 12, body: 'veto this', user: 'bob', createdAt: '2026-01-02T04:00:00Z' },
    ]);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/issues/9/comments`);
  });

  it('mergePR PUTs /pulls/{n}/merge', async () => {
    const { client, calls } = makeClient(sequence(jsonRes({ merged: true })));

    await client.mergePR('acme', 'site', 9);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/pulls/9/merge`);
  });

  it('closePR PATCHes the PR to state closed', async () => {
    const { client, calls } = makeClient(sequence(jsonRes({})));

    await client.closePR('acme', 'site', 9);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toBe(`${BASE}/repos/acme/site/pulls/9`);
    expect(calls[0].body).toEqual({ state: 'closed' });
  });

  it('throws GitHubError carrying the status on a non-2xx (merge 409)', async () => {
    const { client } = makeClient(sequence(jsonRes({ message: 'Merge conflict' }, 409)));

    const err = await client.mergePR('acme', 'site', 9).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GitHubError);
    const ghErr = err as GitHubError;
    expect(ghErr.status).toBe(409);
    expect(ghErr.message).toContain('409');
  });

  it('rejects via the AbortController when a request hangs past timeoutMs', async () => {
    const slowClient = createGitHubClient({
      token: 'tok',
      baseUrl: BASE,
      fetchImpl: (() => new Promise<Response>(() => {})) as unknown as typeof fetch,
      timeoutMs: 25,
    });

    await expect(slowClient.getComments('acme', 'site', 1)).rejects.toThrow(GitHubError);
    await expect(slowClient.getComments('acme', 'site', 1)).rejects.toThrow(/timed out/);
  });
});
