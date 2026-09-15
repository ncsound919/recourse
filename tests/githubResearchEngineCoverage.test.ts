import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  searchGitHubRepositories,
  fetchRepoSource,
  domainLabel,
} from '../src/lib/githubResearchEngine.js';

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function repoMeta(overrides: Record<string, unknown> = {}) {
  return {
    default_branch: 'main',
    license: { spdx_id: 'MIT' },
    ...overrides,
  };
}

function fileEntry(overrides: Record<string, unknown> = {}) {
  return {
    name: 'index.ts',
    path: 'index.ts',
    type: 'file',
    sha: 'abc123',
    size: 12,
    content: Buffer.from('export function x(){ return 1; }').toString('base64'),
    html_url: 'https://github.com/a/b/blob/main/index.ts',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('githubResearchEngine — search', () => {
  it('returns [] for a blank query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchGitHubRepositories('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps real search results', async () => {
    const items = [
      {
        full_name: 'lodash/lodash',
        owner: { login: 'lodash' },
        stargazers_count: 62000,
        description: 'A modern utility library',
        license: { spdx_id: 'MIT' },
        html_url: 'https://github.com/lodash/lodash',
        default_branch: 'main',
        language: 'JavaScript',
      },
      {
        full_name: 'no-license/repo',
        owner: null,
        stargazers_count: null,
        description: '',
        html_url: 'https://github.com/no-license/repo',
        default_branch: 'master',
        language: null,
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ items })));
    const results = await searchGitHubRepositories('utility library');
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 'lodash/lodash',
      fullName: 'lodash/lodash',
      author: 'lodash',
      stars: 62000,
      description: 'A modern utility library',
      license: 'MIT',
      htmlUrl: 'https://github.com/lodash/lodash',
      defaultBranch: 'main',
      language: 'JavaScript',
    });
    expect(results[1].author).toBe('');
    expect(results[1].stars).toBe(0);
    expect(results[1].license).toBeUndefined();
  });

  it('tolerates a response with no items array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ message: 'ok' })));
    expect(await searchGitHubRepositories('anything')).toEqual([]);
  });

  it('sets the Authorization header when GITHUB_TOKEN is configured', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'gh_test_token');
    vi.resetModules();
    const fresh = await import('../src/lib/githubResearchEngine.js');
    const fetchMock = vi.fn(async () => okJson({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await fresh.searchGitHubRepositories('token-check');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('api.github.com/search/repositories');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gh_test_token');
  });
});

describe('githubResearchEngine — ghFetch error mapping', () => {
  it('maps a network failure to kind offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(searchGitHubRepositories('network-down')).rejects.toMatchObject({
      kind: 'offline',
      message: expect.stringContaining('GitHub unreachable: ECONNREFUSED'),
    });
  });

  it('maps a signal timeout to the timed-out offline message', async () => {
    const err = new Error('the operation was aborted') as Error & { name: string };
    err.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    await expect(searchGitHubRepositories('timeout')).rejects.toMatchObject({
      kind: 'offline',
      message: expect.stringContaining('GitHub API timed out'),
    });
  });

  it('falls back to a generic network-error label when there is no message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error()));
    await expect(searchGitHubRepositories('no-message')).rejects.toMatchObject({
      kind: 'offline',
      message: expect.stringContaining('GitHub unreachable: network error'),
    });
  });

  it('maps 403/429 to kind rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 403 })));
    await expect(searchGitHubRepositories('rate-limit')).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 403,
      message: expect.stringContaining('rate limit reached'),
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('too many', { status: 429 })));
    await expect(searchGitHubRepositories('rate-limit')).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
    });
  });

  it('maps 404 to kind not_found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(searchGitHubRepositories('gone')).rejects.toMatchObject({
      kind: 'not_found',
      status: 404,
    });
  });

  it('maps other non-2xx to kind http', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(searchGitHubRepositories('server-error')).rejects.toMatchObject({
      kind: 'http',
      status: 500,
    });
  });
});

describe('githubResearchEngine — fetchRepoSource', () => {
  it('rejects a malformed repository name', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchRepoSource('not-a-valid-name')).rejects.toMatchObject({
      kind: 'http',
      message: expect.stringContaining('Invalid repository name'),
    });
    await expect(fetchRepoSource('a/b/c')).rejects.toMatchObject({ kind: 'http' });
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchRepoSource('')).rejects.toMatchObject({ kind: 'http' });
  });

  it('normalizes a full github.com URL and a trailing .git', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/index.ts')) return okJson(fileEntry());
      if (url.includes('/contents/')) return okJson([fileEntry()]);
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = await fetchRepoSource('https://github.com/lodash/lodash.git/');
    expect(file.repo).toBe('lodash/lodash');
    expect(file.defaultBranch).toBe('main');
    expect(file.language).toBe('ts');
  });

  it('throws no_code_file when the repo has no code files', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) return okJson([]);
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRepoSource('empty/empty')).rejects.toMatchObject({
      kind: 'no_code_file',
    });
  });

  it('throws no_code_file when the contents endpoint returns a non-array', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) return okJson(fileEntry({ path: 'src/main.ts', name: 'main.ts' }));
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRepoSource('only-file/repo')).rejects.toMatchObject({
      kind: 'no_code_file',
    });
  });

  it('traverses directories with depth limit and picks the highest-scoring path', async () => {
    const trees: Record<string, unknown> = {
      '/contents/?ref=main': [
        { type: 'dir', name: 'src', path: 'src' },
        { type: 'file', name: 'index.js', path: 'index.js' },
      ],
      '/contents/src?ref=main': [
        { type: 'dir', name: 'nested', path: 'src/nested' },
        { type: 'file', name: 'main.ts', path: 'src/main.ts' },
        { type: 'file', name: 'util.js', path: 'src/util.js' },
      ],
      '/contents/src%2Fnested?ref=main': [{ type: 'dir', name: 'deep', path: 'src/nested/deep' }],
      '/contents/src%2Fmain.ts?ref=main': fileEntry({ name: 'main.ts', path: 'src/main.ts' }),
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        const suffix = url.split('api.github.com/repos/empty/repo')[1] ?? '';
        for (const key of Object.keys(trees)) {
          if (suffix.startsWith(key)) return okJson(trees[key]);
        }
        return okJson([]);
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);

    // 'src/main.ts' scores highest (src +3, ts +1).
    const file = await fetchRepoSource('empty/repo');
    expect(file.path).toBe('src/main.ts');
    expect(file.language).toBe('ts');
    expect(file.repo).toBe('empty/repo');
  });

  it('skips deep directory traversal beyond depth 3', async () => {
    let contentsCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        contentsCalls++;
        const path = ['src/a', 'src/a/b', 'src/a/b/c'][contentsCalls - 1];
        if (!path) return okJson([]);
        return okJson([{ type: 'dir', name: 'd', path }]);
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRepoSource('deep/deep')).rejects.toMatchObject({ kind: 'no_code_file' });
    // root + src/a + src/a/b = 3 listings; src/a/b/c would be depth 3 and skipped.
    expect(contentsCalls).toBe(3);
  });

  it('fetches an explicit path without listing the tree', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/lib%2Futil.js')) {
        return okJson(fileEntry({ name: 'util.js', path: 'lib/util.js', size: undefined, html_url: undefined }));
      }
      return okJson(repoMeta({ default_branch: undefined }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = await fetchRepoSource('owner/pkg', 'lib/util.js');
    expect(file.path).toBe('lib/util.js');
    expect(file.defaultBranch).toBe('main'); // meta.default_branch fallback
    expect(file.sha).toBe('abc123');
    expect(file.htmlUrl).toBe(`https://github.com/owner/pkg/blob/HEAD/lib/util.js`);
  });

  it('throws when file content is unavailable', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) return okJson(fileEntry({ content: undefined }));
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRepoSource('owner/pkg', 'big.bin')).rejects.toMatchObject({
      kind: 'http',
      message: expect.stringContaining('File content unavailable'),
    });
  });

  it('labels a .js file as js and decodes real base64 content', async () => {
    const code = 'export function f(a, b) { return a + b; }';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        return okJson(fileEntry({ name: 'add.js', path: 'add.js', content: Buffer.from(code).toString('base64') }));
      }
      return okJson(repoMeta());
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = await fetchRepoSource('owner/pkg', 'add.js');
    expect(file.language).toBe('js');
    expect(file.content).toBe(code);
  });
});

describe('githubResearchEngine — domainLabel', () => {
  it('defaults to coding unless the caller requests a domain', () => {
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
    expect(domainLabel(file, 'coding')).toBe('coding');
  });
});