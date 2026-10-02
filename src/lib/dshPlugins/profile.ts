/**
 * profile.ts — adds a scaffolded bundle to a DeepSeek Harness profile.
 *
 * A generated bundle on disk does nothing until the profile loads it, and the
 * profile has two places that must both agree:
 *
 * ```jsonc
 * // ~/.dsh/profiles/web/package.json
 * {
 *   "dependencies": { "dsh-openhub": "link:/abs/path/dsh-openhub" },
 *   "dsh": { "profile": { "bundles": ["...", "dsh-openhub"] } }
 * }
 * ```
 *
 * Adding a dependency without a `bundles` entry produces a plugin that is
 * installed and never loaded — the failure mode that looks like a working boot.
 * Adding a `bundles` entry without a dependency produces a boot that fails to
 * resolve the package. So this writes both, in one operation, and reports both.
 *
 * ## Why this does not run `pnpm install`
 *
 * Installing is a network operation against a lockfile this code does not own,
 * and it rewrites `node_modules` for a live profile. The caller decides when;
 * the returned `nextSteps` say exactly what to run. Rewriting the profile is the
 * reviewable part, and that is what gets automated here.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type ProfileError =
  | 'not-a-profile'
  | 'malformed-package-json'
  | 'missing-dependency'
  | 'already-installed'
  | 'write-failed';

/** Where the profiles live unless `DSH_HOME` says otherwise. */
export function dshHome(): string {
  return path.resolve(process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh'));
}

export function profileDir(name: string, home = dshHome()): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(`invalid profile name: ${JSON.stringify(name)}`);
  }
  return path.join(home, 'profiles', name);
}

export interface ProfileState {
  readonly profile: string;
  readonly dir: string;
  readonly exists: boolean;
  readonly bundles: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
}

/** Read a profile's bundle list and dependencies. */
export function readProfile(name: string, home = dshHome()): ProfileState {
  const dir = profileDir(name, home);
  const pkgPath = path.join(dir, 'package.json');
  const base: ProfileState = {
    profile: name,
    dir,
    exists: false,
    bundles: [],
    dependencies: {},
  };
  if (!fs.existsSync(pkgPath)) return base;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return base;
  }
  const dsh = (parsed.dsh ?? {}) as Record<string, unknown>;
  const profile = (dsh.profile ?? {}) as Record<string, unknown>;
  const bundles = Array.isArray(profile.bundles) ? (profile.bundles as unknown[]).filter((b): b is string => typeof b === 'string') : [];
  const dependencies = (parsed.dependencies ?? {}) as Record<string, string>;
  return { profile: name, dir, exists: true, bundles, dependencies };
}

/** The profiles present under `$DSH_HOME/profiles`. */
export function listProfiles(home = dshHome()): string[] {
  const root = path.join(home, 'profiles');
  if (!fs.existsSync(root)) return [];
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export interface AddBundleResult {
  readonly ok: true;
  readonly profile: string;
  readonly added: { readonly dependency: string; readonly bundle: string };
  readonly nextSteps: readonly string[];
}

export type AddBundleOutcome =
  | AddBundleResult
  | { ok: false; reason: ProfileError; error: string };

/**
 * Add `packageName` to a profile, wired as a `link:` to `bundleDir`.
 *
 * Refuses to touch a profile whose `package.json` cannot be parsed rather than
 * rewriting it, because a profile file this code cannot understand is one whose
 * loss would be expensive.
 */
export function addBundleToProfile(options: {
  profile: string;
  packageName: string;
  bundleDir: string;
  home?: string;
  /** Rewrite an existing entry instead of refusing. */
  force?: boolean;
}): AddBundleOutcome {
  const home = options.home ?? dshHome();
  const dir = profileDir(options.profile, home);
  const pkgPath = path.join(dir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return { ok: false, reason: 'not-a-profile', error: `no package.json at ${pkgPath} — is "${options.profile}" a real profile?` };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      reason: 'malformed-package-json',
      error: `refusing to rewrite unparseable ${pkgPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const dependencies = { ...((parsed.dependencies ?? {}) as Record<string, string>) };
  const dsh = { ...((parsed.dsh ?? {}) as Record<string, unknown>) };
  const profileCfg = { ...((dsh.profile ?? {}) as Record<string, unknown>) };
  const bundles = Array.isArray(profileCfg.bundles)
    ? [...(profileCfg.bundles as unknown[])].filter((b): b is string => typeof b === 'string')
    : [];

  const alreadyDependency = options.packageName in dependencies;
  const alreadyBundle = bundles.includes(options.packageName);
  if ((alreadyDependency || alreadyBundle) && options.force !== true) {
    return {
      ok: false,
      reason: 'already-installed',
      error: `${options.packageName} is already ${alreadyBundle ? 'a bundle' : 'a dependency'} in profile "${options.profile}"; pass force to rewrite it`,
    };
  }

  // `link:` with forward slashes: pnpm resolves it, and a backslash path is
  // read as an escape on the pnpm side.
  const link = `link:${options.bundleDir.split(path.sep).join('/')}`;
  dependencies[options.packageName] = link;
  if (!alreadyBundle) bundles.push(options.packageName);

  const next: Record<string, unknown> = {
    ...parsed,
    dependencies,
    dsh: { ...dsh, profile: { ...profileCfg, bundles } },
  };

  try {
    // Keep a `.bak` beside it: this edits a file the harness reads at boot, and
    // the rollback is "copy it back".
    fs.copyFileSync(pkgPath, `${pkgPath}.bak`);
    fs.writeFileSync(pkgPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  } catch (error) {
    return {
      ok: false,
      reason: 'write-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const win = path.sep === '\\' ? 'C:\\' : '';
  void win;
  return {
    ok: true,
    profile: options.profile,
    added: { dependency: options.packageName, bundle: options.packageName },
    nextSteps: [
      `cd ${dir}`,
      'pnpm install   # resolve the link: dependency; needed after this edit',
      `cd ${options.bundleDir}`,
      'pnpm build     # lib/ is generated and gitignored; the profile links to it',
      'restart the harness so the profile re-reads package.json',
    ],
  };
}

/** Remove a bundle from a profile's list and dependencies. */
export function removeBundleFromProfile(options: {
  profile: string;
  packageName: string;
  home?: string;
}): { ok: true; profile: string; removed: boolean } | { ok: false; error: string } {
  const home = options.home ?? dshHome();
  const dir = profileDir(options.profile, home);
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { ok: false, error: `no profile at ${dir}` };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: `unparseable ${pkgPath}: ${error instanceof Error ? error.message : String(error)}` };
  }

  const dependencies = { ...((parsed.dependencies ?? {}) as Record<string, string>) };
  const dsh = { ...((parsed.dsh ?? {}) as Record<string, unknown>) };
  const profileCfg = { ...((dsh.profile ?? {}) as Record<string, unknown>) };
  const bundles = Array.isArray(profileCfg.bundles)
    ? [...(profileCfg.bundles as unknown[])].filter((b): b is string => typeof b === 'string')
    : [];

  const removed = options.packageName in dependencies || bundles.includes(options.packageName);
  delete dependencies[options.packageName];
  const kept = bundles.filter((b) => b !== options.packageName);

  try {
    fs.copyFileSync(pkgPath, `${pkgPath}.bak`);
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ ...parsed, dependencies, dsh: { ...dsh, profile: { ...profileCfg, bundles: kept } } }, null, 2) + '\n',
      'utf-8',
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, profile: options.profile, removed };
}