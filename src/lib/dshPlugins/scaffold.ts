/**
 * scaffold.ts — writes a rendered DSH bundle to disk.
 *
 * The policy layer `template.ts` deliberately does not have: where the bundle is
 * allowed to land, whether an existing directory may be replaced, and what the
 * signed manifest covers.
 *
 * ## The path rule
 *
 * Scaffolding writes to disk. That makes it a mutation with real blast radius,
 * so it is confined twice over:
 *
 * 1. **A root allowlist.** `resolveScaffoldRoot` refuses any target outside
 *    `DSH_BUNDLE_ROOT` (default `<cwd>/.dsh-bundles`). The caller cannot widen
 *    this by passing an absolute path; the root is operator configuration.
 * 2. **No traversal, ever.** The bundle name is sanitized to `[a-z0-9._-]` and
 *    re-checked after joining, so `../../.ssh` cannot escape even if the name
 *    somehow arrived with separators in it.
 *
 * On top of that the whole operation is a guarded route requiring
 * `RECOURSE_API_SECRET`, and it fails closed (503) when that is unset.
 *
 * ## Signing
 *
 * The generated `plugin.manifest.json` carries an HMAC-SHA256 signature over its
 * canonical form, so a scaffolded bundle is attributable to the Recourse
 * instance that produced it. When no `RECOURSE_PLUGIN_SECRET` is configured the
 * manifest is written **unsigned** and the result says so — the alternative
 * would be a manifest carrying a signature nobody can verify, which is worse
 * than an honest "unsigned".
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { sha256Hex, signManifest, verifyManifestSignature, type PluginManifest } from '../pluginSdk';
import { renderDshBundle } from './template';
import { validateDshPluginSpec, type DshPluginSpec, type NormalizedDshPluginSpec } from './spec';

/** Directory name used under the root, and the guard against traversal. */
const BUNDLE_DIR_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/** Default root when `DSH_BUNDLE_ROOT` is unset. */
export function defaultScaffoldRoot(): string {
  return path.join(process.cwd(), '.dsh-bundles');
}

export function scaffoldRoot(): string {
  const configured = process.env.DSH_BUNDLE_ROOT?.trim();
  return configured ? path.resolve(configured) : defaultScaffoldRoot();
}

export type ScaffoldError =
  | 'invalid-spec'
  | 'invalid-name'
  | 'root-escape'
  | 'exists'
  | 'write-failed';

export interface ScaffoldOk {
  readonly ok: true;
  /** Absolute directory the bundle was written to. */
  readonly dir: string;
  readonly files: readonly string[];
  readonly manifest: PluginManifest;
  readonly signature: ReturnType<typeof verifyManifestSignature>;
  readonly unsignedReason?: string;
}

export interface ScaffoldFailure {
  readonly ok: false;
  readonly reason: ScaffoldError;
  readonly errors: string[];
}

export type ScaffoldResult = ScaffoldOk | ScaffoldFailure;

/**
 * Resolve a bundle directory inside the root, or explain the refusal.
 *
 * Two independent checks, because either alone leaves a hole: the name pattern
 * rejects separators and `..`, and the containment check catches anything that
 * still resolves outside after joining.
 */
export function resolveBundleDir(root: string, name: string): { ok: true; dir: string } | { ok: false; reason: ScaffoldError; errors: string[] } {
  if (!BUNDLE_DIR_RE.test(name)) {
    return {
      ok: false,
      reason: 'invalid-name',
      errors: [
        `bundle name must match ${BUNDLE_DIR_RE} (lowercase, no separators, no traversal); got ${JSON.stringify(name)}`,
      ],
    };
  }
  const resolvedRoot = path.resolve(root);
  const dir = path.resolve(resolvedRoot, name);
  const rel = path.relative(resolvedRoot, dir);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'root-escape', errors: [`resolved bundle path escapes ${resolvedRoot}: ${dir}`] };
  }
  return { ok: true, dir };
}

export interface ScaffoldOptions {
  /** Root the bundle is written under. Defaults to {@link scaffoldRoot}. */
  readonly root?: string;
  /** Replace an existing directory. Off by default: overwriting is destructive. */
  readonly overwrite?: boolean;
  /** Validate only; report the file set without touching the filesystem. */
  readonly dryRun?: boolean;
}

/**
 * Scaffold one bundle.
 *
 * The signature covers the rendered entry source, so `sourceHash` in the manifest
 * is the hash of the code that actually landed on disk rather than of whatever
 * the caller claimed it was.
 */
export function scaffoldDshPlugin(spec: DshPluginSpec, opts: ScaffoldOptions = {}): ScaffoldResult {
  const validation = validateDshPluginSpec(spec);
  if (!validation.ok || !validation.spec) {
    return { ok: false, reason: 'invalid-spec', errors: validation.errors };
  }
  const normalized: NormalizedDshPluginSpec = validation.spec;
  const root = opts.root ? path.resolve(opts.root) : scaffoldRoot();

  // The on-disk directory name is the package name, which is already constrained
  // to the npm charset; the resolver re-checks containment regardless.
  const resolved = resolveBundleDir(root, normalized.packageName);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, errors: resolved.errors };
  }
  const dir = resolved.dir;

  if (fs.existsSync(dir)) {
    if (opts.overwrite !== true) {
      return {
        ok: false,
        reason: 'exists',
        errors: [`${dir} already exists; pass overwrite to replace it`],
      };
    }
    // Only ever remove something that is recognisably a bundle, so an
    // `overwrite` pointed at the wrong directory cannot delete a real project.
    const marker = path.join(dir, 'plugin.manifest.json');
    const pkg = path.join(dir, 'package.json');
    if (!fs.existsSync(marker) && !fs.existsSync(pkg)) {
      return {
        ok: false,
        reason: 'write-failed',
        errors: [`refusing to overwrite ${dir}: it exists but carries no package.json or plugin.manifest.json`],
      };
    }
  }

  const files = renderDshBundle(normalized);
  const entrySource = files.get('src/index.ts') ?? '';
  const manifestBase = JSON.parse(files.get('plugin.manifest.json') ?? '{}') as PluginManifest;
  const manifestWithHash: PluginManifest = { ...manifestBase, sourceHash: sha256Hex(entrySource) };

  const signed = signManifest(manifestWithHash);
  const manifest: PluginManifest = signed.ok ? signed.manifest : manifestWithHash;
  const unsignedReason = signed.ok ? undefined : signed.error;
  files.set('plugin.manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  if (opts.dryRun === true) {
    return {
      ok: true,
      dir,
      files: [...files.keys()],
      manifest,
      signature: verifyManifestSignature(manifest),
      ...(unsignedReason ? { unsignedReason } : {}),
    };
  }

  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  try {
    for (const [rel, contents] of files) {
      const target = path.join(dir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents, 'utf-8');
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'write-failed',
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  return {
    ok: true,
    dir,
    files: [...files.keys()],
    manifest,
    signature: verifyManifestSignature(manifest),
    ...(unsignedReason ? { unsignedReason } : {}),
  };
}

export interface ScaffoldedBundle {
  readonly name: string;
  readonly dir: string;
  readonly manifest: PluginManifest | null;
  readonly signature: { signed: boolean; valid: boolean; reason?: string };
  readonly hasSources: boolean;
}

/**
 * List the bundles under the root.
 *
 * A directory without a readable manifest is reported with `manifest: null`
 * rather than skipped: a half-written bundle is exactly the thing an operator
 * needs to see, and hiding it would make the missing entry look like a bug in
 * this listing.
 */
export function listScaffoldedBundles(root = scaffoldRoot()): ScaffoldedBundle[] {
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(resolvedRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: ScaffoldedBundle[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(resolvedRoot, entry.name);
    const manifestPath = path.join(dir, 'plugin.manifest.json');
    let manifest: PluginManifest | null = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest;
      } catch {
        manifest = null;
      }
    }
    out.push({
      name: entry.name,
      dir,
      manifest,
      signature: manifest ? verifyManifestSignature(manifest) : { signed: false, valid: false, reason: 'no manifest' },
      hasSources: fs.existsSync(path.join(dir, 'src', 'index.ts')),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Remove a scaffolded bundle.
 *
 * Same containment check as scaffolding, and the same "recognisably a bundle"
 * precondition, so removal cannot be aimed at an arbitrary directory.
 */
export function removeScaffoldedBundle(
  name: string,
  root = scaffoldRoot(),
): { ok: true; removed: string } | { ok: false; error: string } {
  const resolved = resolveBundleDir(root, name);
  if (!resolved.ok) return { ok: false, error: resolved.errors.join('; ') };
  if (!fs.existsSync(resolved.dir)) return { ok: false, error: `no such bundle: ${name}` };
  const marker = path.join(resolved.dir, 'plugin.manifest.json');
  const pkg = path.join(resolved.dir, 'package.json');
  if (!fs.existsSync(marker) && !fs.existsSync(pkg)) {
    return { ok: false, error: `refusing to remove ${resolved.dir}: it carries no package.json or plugin.manifest.json` };
  }
  fs.rmSync(resolved.dir, { recursive: true, force: true });
  return { ok: true, removed: resolved.dir };
}