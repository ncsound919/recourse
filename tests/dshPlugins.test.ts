import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import express from 'express';
import * as http from 'node:http';
import type { Request, Response } from 'express';

import { validateDshPluginSpec } from '../src/lib/dshPlugins/spec';
import { renderDshBundle } from '../src/lib/dshPlugins/template';
import {
  listScaffoldedBundles,
  removeScaffoldedBundle,
  resolveBundleDir,
  scaffoldDshPlugin,
} from '../src/lib/dshPlugins/scaffold';
import { addBundleToProfile, readProfile, removeBundleFromProfile } from '../src/lib/dshPlugins/profile';
import { createDshPluginsRouter } from '../src/routes/dshPlugins';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-dsh-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const baseSpec = {
  id: 'openhub',
  packageName: 'dsh-openhub',
  description: 'OpenHub audit tools as native harness tools.',
  tools: [
    { name: 'openhub_status', title: 'OpenHub status', description: 'Service health.', method: 'GET' as const, path: '/api/health' },
    { name: 'openhub_audit_run', title: 'Run an audit', description: 'Mutating.', method: 'POST' as const, path: '/api/audit', mutating: true, long: true },
  ],
};

const prevSecret = process.env.RECOURSE_PLUGIN_SECRET;
beforeAll(() => { process.env.RECOURSE_PLUGIN_SECRET = 'test-plugin-secret'; });
afterAll(() => { if (prevSecret === undefined) delete process.env.RECOURSE_PLUGIN_SECRET; else process.env.RECOURSE_PLUGIN_SECRET = prevSecret; });

describe('dsh plugin spec validation', () => {
  it('rejects a package name the harness cannot resolve', () => {
    const v = validateDshPluginSpec({ ...baseSpec, packageName: '../escape' });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('packageName');
  });

  it('rejects a tool name outside the DeepSeek function-name contract', () => {
    const v = validateDshPluginSpec({
      ...baseSpec,
      tools: [{ ...baseSpec.tools[0], name: 'has spaces' }],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('tools[0].name');
  });

  it('rejects duplicate tool names', () => {
    const v = validateDshPluginSpec({
      ...baseSpec,
      tools: [baseSpec.tools[0], { ...baseSpec.tools[1], name: baseSpec.tools[0].name }],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toContain('duplicated');
  });

  it('rejects a route path with traversal', () => {
    const v = validateDshPluginSpec({
      ...baseSpec,
      tools: [{ ...baseSpec.tools[0], path: '/api/../../etc' }],
    });
    expect(v.ok).toBe(false);
  });

  it('rejects broad capability grants through the sandbox grant validator', () => {
    const v = validateDshPluginSpec({ ...baseSpec, capabilities: { fs: { paths: ['*'], mode: 'write' } } });
    expect(v.ok).toBe(false);
  });

  it('resolves defaults so a minimal spec still produces a usable bundle', () => {
    const v = validateDshPluginSpec(baseSpec);
    expect(v.ok).toBe(true);
    expect(v.spec?.version).toBe('1.0.0');
    expect(v.spec?.apiSecretEnvVar).toBe('RECOURSE_API_SECRET');
    expect(v.spec?.contributePrompt).toBe(true);
  });
});

describe('rendered bundle', () => {
  it('emits a buildable, type-only plugin with zero runtime dependencies', () => {
    const v = validateDshPluginSpec(baseSpec);
    const files = renderDshBundle(v.spec!);

    expect([...files.keys()].sort()).toEqual([
      '.gitignore', 'README.md', 'cordis.patch.yml', 'package.json', 'plugin.manifest.json',
      'src/api.ts', 'src/catalog.ts', 'src/config.ts', 'src/index.ts', 'src/params.ts',
      'src/prompt.ts', 'src/spec.ts', 'tsconfig.json',
    ]);

    const pkg = JSON.parse(files.get('package.json')!);
    // Zero runtime deps is the load-bearing invariant: a runtime import of a
    // host package fails to resolve on a linked profile.
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml');

    const index = files.get('src/index.ts')!;
    // apply must require nothing; a hard requirement fails the profile layer on
    // a host that lacks the service.
    expect(index).toContain('export const inject: string[] = [];');
    expect(index).toContain("ctx.inject(['tools']");
    expect(index).toContain("ctx.inject(['systemPrompt']");

    // Every @deepseek-ai import must be type-only.
    for (const [name, body] of files) {
      for (const line of body.split('\n')) {
        if (!line.includes("from '@deepseek-ai/")) continue;
        expect(line, `${name}: ${line}`).toMatch(/^import type /);
      }
    }
  });

  it('writes the secret variable NAME into config and never a value', () => {
    const v = validateDshPluginSpec({ ...baseSpec, apiSecretEnvVar: 'MY_HARNESS_SECRET' });
    const files = renderDshBundle(v.spec!);
    expect(files.get('cordis.patch.yml')).toContain("apiSecretEnvVar: 'MY_HARNESS_SECRET'");
    expect(files.get('src/config.ts')).toContain('MY_HARNESS_SECRET');
    for (const body of files.values()) {
      expect(body).not.toContain('test-plugin-secret');
    }
  });

  it('keeps a Windows path readable in the patch row (no double-quote escaping)', () => {
    const v = validateDshPluginSpec({ ...baseSpec, apiBaseUrl: 'http://127.0.0.1:3050' });
    const patch = renderDshBundle(v.spec!).get('cordis.patch.yml')!;
    expect(patch).toContain("apiBaseUrl: !!js process.env.RECOURSE_API_URL || 'http://127.0.0.1:3050'");
    expect(patch).not.toContain('\\"');
  });

  it('marks only declared mutating tools, and gives long tools the long budget', () => {
    const v = validateDshPluginSpec(baseSpec);
    const catalog = renderDshBundle(v.spec!).get('src/catalog.ts')!;
    expect(catalog).toContain('mutating: true,');
    expect(catalog).toContain('long: true,');
    // The GET must not inherit the mutating flag.
    const readEntry = catalog.slice(catalog.indexOf('openhub_status'), catalog.indexOf('openhub_audit_run'));
    expect(readEntry).not.toContain('mutating: true');
  });
});

describe('scaffolding', () => {
  it('writes the full tree and signs the manifest over the real entry source', () => {
    const root = freshDir();
    const result = scaffoldDshPlugin(baseSpec, { root });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fs.existsSync(path.join(result.dir, 'src', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'cordis.patch.yml'))).toBe(true);
    expect(result.signature.signed).toBe(true);
    expect(result.signature.valid).toBe(true);
    expect(result.manifest.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports an unsigned manifest honestly when no signing secret is configured', () => {
    const saved = process.env.RECOURSE_PLUGIN_SECRET;
    delete process.env.RECOURSE_PLUGIN_SECRET;
    try {
      const result = scaffoldDshPlugin(baseSpec, { root: freshDir() });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.signature.signed).toBe(false);
      expect(result.unsignedReason).toContain('RECOURSE_PLUGIN_SECRET');
    } finally {
      if (saved !== undefined) process.env.RECOURSE_PLUGIN_SECRET = saved;
    }
  });

  it('refuses to overwrite without an explicit opt-in', () => {
    const root = freshDir();
    expect(scaffoldDshPlugin(baseSpec, { root }).ok).toBe(true);
    const again = scaffoldDshPlugin(baseSpec, { root });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe('exists');
    expect(scaffoldDshPlugin(baseSpec, { root, overwrite: true }).ok).toBe(true);
  });

  it('refuses to overwrite a directory that is not a bundle', () => {
    const root = freshDir();
    const stranger = path.join(root, 'dsh-openhub');
    fs.mkdirSync(stranger, { recursive: true });
    fs.writeFileSync(path.join(stranger, 'notes.txt'), 'real work', 'utf-8');
    const result = scaffoldDshPlugin(baseSpec, { root, overwrite: true });
    expect(result.ok).toBe(false);
    // The pre-existing file must survive the refusal.
    expect(fs.readFileSync(path.join(stranger, 'notes.txt'), 'utf-8')).toBe('real work');
  });

  it('confines every bundle to the root, and refuses traversal outright', () => {
    const root = freshDir();
    expect(resolveBundleDir(root, '../../escape').ok).toBe(false);
    expect(resolveBundleDir(root, 'ok-name').ok).toBe(true);

    // A traversal name is rejected by the npm-charset check before it ever
    // reaches the resolver, and again by the resolver if it does.
    const escaped = scaffoldDshPlugin({ ...baseSpec, packageName: '../escaped' }, { root });
    expect(escaped.ok).toBe(false);
    if (escaped.ok) return;
    expect(['invalid-spec', 'invalid-name', 'root-escape']).toContain(escaped.reason);
    expect(fs.existsSync(path.join(path.dirname(root), 'escaped'))).toBe(false);
  });

  it('surfaces a bundle with a missing manifest rather than hiding it', () => {
    const root = freshDir();
    fs.mkdirSync(path.join(root, 'half-written'), { recursive: true });
    const bundles = listScaffoldedBundles(root);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].manifest).toBeNull();
    expect(bundles[0].signature.signed).toBe(false);
  });

  it('removes a scaffolded bundle but refuses to remove a stranger directory', () => {
    const root = freshDir();
    expect(scaffoldDshPlugin(baseSpec, { root }).ok).toBe(true);
    expect(removeScaffoldedBundle('dsh-openhub', root).ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'dsh-openhub'))).toBe(false);

    fs.mkdirSync(path.join(root, 'other'), { recursive: true });
    expect(removeScaffoldedBundle('other', root).ok).toBe(false);
    expect(fs.existsSync(path.join(root, 'other'))).toBe(true);
  });

  it('writes nothing on a dry run', () => {
    const root = freshDir();
    const result = scaffoldDshPlugin(baseSpec, { root, dryRun: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.length).toBeGreaterThan(0);
    expect(fs.existsSync(result.dir)).toBe(false);
  });
});

describe('profile mounting', () => {
  function makeProfile(home: string, name: string): string {
    const dir = path.join(home, 'profiles', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: `dsh-profile-${name}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }, null, 2),
      'utf-8',
    );
    return dir;
  }

  it('writes both halves of the wiring, or neither', () => {
    const home = freshDir();
    makeProfile(home, 'web');
    const result = addBundleToProfile({ profile: 'web', packageName: 'dsh-openhub', bundleDir: 'C:/b/dsh-openhub', home });
    expect(result.ok).toBe(true);
    const state = readProfile('web', home);
    // A dependency without a bundles entry installs a plugin that never loads.
    expect(state.dependencies['dsh-openhub']).toBe('link:C:/b/dsh-openhub');
    expect(state.bundles).toContain('dsh-openhub');
  });

  it('preserves existing profile content and keeps a .bak', () => {
    const home = freshDir();
    const dir = makeProfile(home, 'web');
    addBundleToProfile({ profile: 'web', packageName: 'dsh-openhub', bundleDir: 'C:/b/dsh-openhub', home });
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('dsh-profile-web');
    expect(pkg.dsh.profile.bundles).toContain('@deepseek-ai/dsh-base');
    expect(fs.existsSync(path.join(dir, 'package.json.bak'))).toBe(true);
  });

  it('refuses a profile whose package.json it cannot parse', () => {
    const home = freshDir();
    const dir = makeProfile(home, 'web');
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json', 'utf-8');
    const result = addBundleToProfile({ profile: 'web', packageName: 'dsh-openhub', bundleDir: 'C:/b', home });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed-package-json');
  });

  it('404s rather than creating a profile that does not exist', () => {
    const home = freshDir();
    const result = addBundleToProfile({ profile: 'nope', packageName: 'dsh-x', bundleDir: 'C:/b', home });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-a-profile');
  });

  it('removes both halves and reports whether anything was there', () => {
    const home = freshDir();
    makeProfile(home, 'web');
    addBundleToProfile({ profile: 'web', packageName: 'dsh-openhub', bundleDir: 'C:/b', home });
    expect(removeBundleFromProfile({ profile: 'web', packageName: 'dsh-openhub', home }).ok).toBe(true);
    const state = readProfile('web', home);
    expect(state.dependencies['dsh-openhub']).toBeUndefined();
    expect(state.bundles).not.toContain('dsh-openhub');
  });
});

describe('dsh-plugins routes', () => {
  const servers: http.Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  });

  async function setup(root: string) {
    const guard = (req: Request, res: Response) => {
      if (req.headers['x-secret'] === 's') return true;
      res.status(401).json({ success: false, error: 'unauthorized' });
      return false;
    };
    const app = express();
    app.use(express.json());
    app.use(
      '/api/recourse/dsh-plugins',
      createDshPluginsRouter({ requireMutationAuth: guard, scaffoldRoot: root, dshHome: path.join(root, 'dsh-home') }),
    );
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const post = (p: string, body: unknown, authed = true) =>
      fetch(`${base}${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authed ? { 'x-secret': 's' } : {}) },
        body: JSON.stringify(body),
      });
    return { base, post };
  }

  it('renders without authentication and refuses to write without it', async () => {
    const root = freshDir();
    const { post } = await setup(root);

    // Render writes nothing, so it must work without the secret...
    const render = await post('/api/recourse/dsh-plugins/render', { spec: baseSpec }, false);
    expect(render.status).toBe(200);
    const rendered = (await render.json()) as any;
    expect(rendered.files.length).toBeGreaterThan(0);
    expect(fs.existsSync(rendered.dir)).toBe(false);

    // ...but scaffolding creates files, so it must not.
    const denied = await post('/api/recourse/dsh-plugins/scaffold', { spec: baseSpec }, false);
    expect(denied.status).toBe(401);
    expect(fs.readdirSync(root)).toHaveLength(0);
  });

  it('scaffolds through the route and then lists the bundle', async () => {
    const root = freshDir();
    const { base, post } = await setup(root);

    expect((await fetch(`${base}/api/recourse/dsh-plugins`)).status).toBe(200);
    const created = await post('/api/recourse/dsh-plugins/scaffold', { spec: baseSpec });
    expect(created.status).toBe(200);
    const body = (await created.json()) as any;
    expect(body.signature.valid).toBe(true);
    expect(body.nextSteps.join(' ')).toContain('pnpm build');

    const listing = (await (await fetch(`${base}/api/recourse/dsh-plugins`)).json()) as any;
    expect(listing.success).toBe(true);
    expect(listing.bundles.map((b: { name: string }) => b.name)).toContain('dsh-openhub');
    expect(listing.signatureFailures).toEqual([]);
  });

  it('reports an invalid spec as 400 with the specific reasons', async () => {
    const { post } = await setup(freshDir());
    const res = await post('/api/recourse/dsh-plugins/render', { spec: { ...baseSpec, id: 'Bad Id' } }, false);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors.join(' ')).toContain('id must match');
  });

  it('refuses to mount a bundle that was never scaffolded', async () => {
    const { post } = await setup(freshDir());
    const res = await post('/api/recourse/dsh-plugins/profile/add', { profile: 'web', packageName: 'dsh-ghost' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).available).toEqual([]);
  });
});

