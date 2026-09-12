import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchGitHubRepositories, fetchRepoSource, domainLabel } from '../src/lib/githubResearchEngine.js';

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function repoMeta(overrides: Record<string, unknown> = {}) {
  return { default_branch: 'main', license: { spdx_id: 'MIT' }, ...overrides };
}

function fileEntry(overrides: Record<string, unknown> = {}) {
  return {
    name: 'index.ts',
    path: 'index.ts',
    type: 'file',
    sha: 'sha-1',
    size: 100,
    content: Buffer.from('export const x = 1;').toString('base64'),
    html_url: 'https://github.com/a/b/blob/main/index.ts',
    ...overrides,
  };
}

/** A repo that lists exactly one code file at `path` and serves it on fetch. */
function singleCodeFileRepo(
  path = 'index.ts',
  entryOverrides: Record<string, unknown> = {},
  metaOverrides: Record<string, unknown> = {},
) {
  const name = path.split('/').pop() ?? path;
  return vi.fn(async (url: string) => {
    if (url.includes(`/contents/${encodeURIComponent(path)}`)) {
      return okJson(fileEntry({ name, path, ...entryOverrides }));
    }
    if (url.includes('/contents/')) return okJson([fileEntry({ name, path })]);
    return okJson(repoMeta(metaOverrides));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('githubResearchEngine — repository search', () => {
  it('returns [] for a blank query without calling the API', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    expect(await searchGitHubRepositories('   ')).toEqual([]);
    expect(mock).not.toHaveBeenCalled();
  });

  it('maps real search results with defensive null handling', async () => {
    const items = [
      {
        full_name: 'lodash/lodash',
        owner: { login: 'lodash' },
        stargazers_count: 62000,
        description: 'desc',
        license: { spdx_id: 'MIT' },
        html_url: 'https://github.com/lodash/lodash',
        default_branch: 'main',
        language: 'JavaScript',
      },
      {
        full_name: 'bare/repo',
        owner: null,
        stargazers_count: null,
        description: null,
        license: null,
        html_url: 'https://github.com/bare/repo',
        default_branch: null,
        language: null,
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ items })));
    const results = await searchGitHubRepositories('utility library', 5);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 'lodash/lodash',
      fullName: 'lodash/lodash',
      author: 'lodash',
      stars: 62000,
      description: 'desc',
      license: 'MIT',
      htmlUrl: 'https://github.com/lodash/lodash',
      defaultBranch: 'main',
      language: 'JavaScript',
    });
    expect(results[1].author).toBe('');
    expect(results[1].stars).toBe(0);
    expect(results[1].description).toBe('');
    expect(results[1].license).toBeUndefined();
    expect(results[1].defaultBranch).toBeNull();
    expect(results[1].language).toBeUndefined();
  });

  it('returns [] when the response has no items array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ message: 'ok' })));
    expect(await searchGitHubRepositories('anything')).toEqual([]);
  });

  it('encodes the query and requests the right per_page', async () => {
    const mock = vi.fn(async () => okJson({ items: [] }));
    vi.stubGlobal('fetch', mock);
    await searchGitHubRepositories('c++ templates', 3);
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      'https://api.github.com/search/repositories?q=c%2B%2B%20templates&sort=stars&order=desc&per_page=3',
    );
  });
});

describe('githubResearchEngine — ghFetch error mapping', () => {
  it('maps a plain network failure to kind offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({
      kind: 'offline',
      message: expect.stringContaining('GitHub unreachable: ECONNREFUSED'),
    });
  });

  it('maps an AbortSignal timeout to the timed-out offline message', async () => {
    const err = new Error('the operation was aborted') as Error & { name: string };
    err.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({
      kind: 'offline',
      message: expect.stringContaining('GitHub API timed out'),
    });
  });

  it('labels a message-less failure as network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error()));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({
      kind: 'offline',
      message: expect.stringContaining('GitHub unreachable: network error'),
    });
  });

  it('maps 403 and 429 to rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('limit', { status: 403 })));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({ kind: 'rate_limited', status: 403 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('limit', { status: 429 })));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({ kind: 'rate_limited', status: 429 });
  });

  it('maps 404 to not_found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({ kind: 'not_found', status: 404 });
  });

  it('maps other non-2xx to kind http', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(searchGitHubRepositories('x')).rejects.toMatchObject({ kind: 'http', status: 500 });
  });

  it('attaches the Authorization header when GITHUB_TOKEN is configured', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'gh_token_xyz');
    vi.resetModules();
    const fresh = await import('../src/lib/githubResearchEngine.js');
    const mock = vi.fn(async () => okJson({ items: [] }));
    vi.stubGlobal('fetch', mock);
    await fresh.searchGitHubRepositories('auth');
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gh_token_xyz');
  });
});

describe('githubResearchEngine — repository name normalization', () => {
  it('rejects repository names without an owner/repo shape', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchRepoSource('nope')).rejects.toMatchObject({ kind: 'http' });
    await expect(fetchRepoSource('a/b/c')).rejects.toMatchObject({ kind: 'http' });
    await expect(fetchRepoSource('')).rejects.toMatchObject({ kind: 'http' });
  });

  it('strips the scheme, a trailing .git, and trailing slashes', async () => {
    const mock = singleCodeFileRepo();
    vi.stubGlobal('fetch', mock);
    const a = await fetchRepoSource('https://github.com/owner/repo');
    expect(a.repo).toBe('owner/repo');
    const b = await fetchRepoSource('owner/repo/');
    expect(b.repo).toBe('owner/repo');
    const c = await fetchRepoSource('owner/repo.git');
    expect(c.repo).toBe('owner/repo');
  });

  it('strips a trailing .git even when a trailing slash follows it', async () => {
    const mock = singleCodeFileRepo();
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('https://github.com/owner/repo.git/');
    expect(file.repo).toBe('owner/repo');
  });
});

describe('githubResearchEngine — fetchRepoSource selection', () => {
  it('throws no_code_file when the repo tree has no code files', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) return okJson([]);
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    await expect(fetchRepoSource('empty/repo')).rejects.toMatchObject({ kind: 'no_code_file' });
  });

  it('throws no_code_file when the contents endpoint is not an array', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) return okJson({ type: 'file' });
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    await expect(fetchRepoSource('odd/repo')).rejects.toMatchObject({ kind: 'no_code_file' });
  });

  it('scores paths: src + lib + index bonuses select the best entrypoint', async () => {
    const trees: Record<string, unknown> = {
      '/contents/src%2Findex.ts?ref=main': fileEntry({ name: 'index.ts', path: 'src/index.ts' }),
      '/contents/?ref=main': [
        { type: 'dir', name: 'src', path: 'src' },
        { type: 'file', name: 'README.md', path: 'README.md' },
        { type: 'file', name: 'util.js', path: 'util.js' },
      ],
      '/contents/src?ref=main': [
        { type: 'file', name: 'index.ts', path: 'src/index.ts' },
        { type: 'file', name: 'helper.ts', path: 'src/helper.ts' },
        { type: 'file', name: 'styles.css', path: 'src/styles.css' },
      ],
    };
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        for (const key of Object.keys(trees)) {
          if (url.split('api.github.com/repos/owner/repo')[1]?.startsWith(key)) return okJson(trees[key]);
        }
        return okJson([]);
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/repo');
    // src/index.ts: src(+3) + index(+2) + .ts(+1) = 6 > util.js(1) > README(0).
    expect(file.path).toBe('src/index.ts');
    expect(file.language).toBe('ts');
  });

  it('recurses into directories up to depth 3 and stops deeper', async () => {
    let calls = 0;
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        calls++;
        const paths = ['src', 'src/deep', 'src/deep/deeper'];
        if (calls > 3) return okJson([]);
        return okJson([{ type: 'dir', name: 'd', path: paths[calls - 1] }]);
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    await expect(fetchRepoSource('deep/deep')).rejects.toMatchObject({ kind: 'no_code_file' });
    // root, src, src/deep are listed; src/deep/deeper is fetched but its own
    // depth (3) is not below the limit, so its sub-directories are not traversed.
    expect(calls).toBe(4);
  });

  it('prefers lib/ files over bare-root files', async () => {
    const treeMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/lib%2Futil.ts')) {
        return okJson(fileEntry({ name: 'util.ts', path: 'lib/util.ts' }));
      }
      if (url.includes('/contents/')) {
        return okJson([
          { type: 'file', name: 'util.ts', path: 'util.ts' },
          { type: 'file', name: 'lib', path: 'lib' },
          { type: 'file', name: 'util.ts', path: 'lib/util.ts' },
        ]);
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', treeMock);
    const file = await fetchRepoSource('owner/repo');
    // lib/util.ts scores 3 (lib+2, ts+1) over root util.ts (1).
    expect(file.path).toBe('lib/util.ts');
  });

  it('mixes files and directories in one listing', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/src%2Fmain.js')) return okJson(fileEntry({ name: 'main.js', path: 'src/main.js' }));
      if (url.includes('/contents/src')) {
        return okJson([{ type: 'file', name: 'main.js', path: 'src/main.js' }]);
      }
      if (url.includes('/contents/')) {
        return okJson([
          { type: 'dir', name: 'src', path: 'src' },
          { type: 'file', name: 'main.js', path: 'main.js' },
          { type: 'file', name: 'notes.txt', path: 'notes.txt' },
        ]);
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/repo');
    // src/main.js scores 4 (src+3, js+1) over root main.js (1).
    expect(file.path).toBe('src/main.js');
  });
});

describe('githubResearchEngine — explicit path fetch', () => {
  it('fetches the exact path without listing the tree', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/lib%2Futil.js')) {
        return okJson(fileEntry({ name: 'util.js', path: 'lib/util.js', html_url: undefined }));
      }
      return okJson(repoMeta({ default_branch: undefined }));
    });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/pkg', 'lib/util.js');
    expect(file.path).toBe('lib/util.js');
    expect(file.defaultBranch).toBe('main');
    // html_url is absent upstream, so the engine falls back to a real blob URL.
    expect(file.htmlUrl).toBe('https://github.com/owner/pkg/blob/HEAD/lib/util.js');
    const contentsUrl = mock.mock.calls.find(([u]) => u.includes('/contents/')) as [string];
    expect(contentsUrl[0]).toContain('?ref=HEAD');
  });

  it('uses the repo default branch as the ref when no path is given', async () => {
    const mock = singleCodeFileRepo('x.ts', {}, { default_branch: 'dev' });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/repo');
    expect(file.defaultBranch).toBe('dev');
    expect(file.path).toBe('x.ts');
  });

  it('throws when the file content is unavailable', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) return okJson(fileEntry({ content: undefined }));
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    await expect(fetchRepoSource('owner/repo', 'big.bin')).rejects.toMatchObject({
      kind: 'http',
      message: expect.stringContaining('File content unavailable'),
    });
  });

  it('decodes base64 content and labels .js files as js', async () => {
    const code = 'export function add(a, b) { return a + b; }';
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        return okJson(fileEntry({ name: 'add.js', path: 'add.js', content: Buffer.from(code).toString('base64') }));
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/pkg', 'add.js');
    expect(file.content).toBe(code);
    expect(file.language).toBe('js');
    expect(file.size).toBe(100);
  });

  it('falls back to content length when size is absent', async () => {
    const code = 'export const z = 1;';
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        return okJson(fileEntry({ name: 'z.ts', path: 'z.ts', size: undefined, html_url: undefined }));
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/pkg', 'z.ts');
    expect(file.size).toBe(code.length);
    expect(file.sha).toBe('sha-1');
    expect(file.htmlUrl).toBe('https://github.com/owner/pkg/blob/HEAD/z.ts');
  });

  it('skips license metadata when the repo has none', async () => {
    const mock = singleCodeFileRepo(undefined, {}, { license: undefined });
    vi.stubGlobal('fetch', mock);
    const file = await fetchRepoSource('owner/repo');
    expect(file.license).toBeUndefined();
  });
});

describe('githubResearchEngine — domainLabel', () => {
  it('defaults to coding unless a domain is requested', () => {
    const file = {
      repo: 'a/b',
      path: 'x.ts',
      sha: 's',
      size: 1,
      defaultBranch: 'main',
      content: '',
      htmlUrl: 'u',
      language: 'ts' as const,
    };
    expect(domainLabel(file)).toBe('coding');
    expect(domainLabel(file, 'math')).toBe('math');
    expect(domainLabel(file, 'biotech')).toBe('biotech');
  });
});