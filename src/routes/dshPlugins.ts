/**
 * dshPlugins.ts — the operator surface for generating DeepSeek Harness bundles.
 *
 * Mounted at `/api/recourse/dsh-plugins`. Reads are open; every write (scaffold,
 * remove, profile install) is guarded, because each of them touches disk.
 *
 * The route set is intentionally split into "render" and "scaffold". `dryRun`
 * gives an operator the exact file list and the exact manifest — including its
 * signature state — before anything is written, which is the difference between
 * "here is what would happen" and "here is what happened".
 */
import * as path from 'node:path';

import { Router } from 'express';
import type { Request, Response } from 'express';

import { validateDshPluginSpec } from '../lib/dshPlugins/spec';
import {
  listScaffoldedBundles,
  removeScaffoldedBundle,
  scaffoldDshPlugin,
  scaffoldRoot,
} from '../lib/dshPlugins/scaffold';
import {
  addBundleToProfile,
  dshHome,
  listProfiles,
  readProfile,
  removeBundleFromProfile,
} from '../lib/dshPlugins/profile';

export interface DshPluginsRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Injectable for tests; defaults to the process environment's root. */
  scaffoldRoot?: string;
  /** Injectable for tests; defaults to $DSH_HOME. */
  dshHome?: string;
}

export function createDshPluginsRouter(deps: DshPluginsRouterDeps): Router {
  const router = Router();
  const root = () => deps.scaffoldRoot ?? scaffoldRoot();
  const home = () => deps.dshHome ?? dshHome();

  /** Where scaffolds live and which profiles the harness has. Read-only. */
  router.get('/', (_req, res) => {
    const bundles = listScaffoldedBundles(root());
    res.json({
      success: true,
      scaffoldRoot: root(),
      dshHome: home(),
      profiles: listProfiles(home()),
      bundles,
      // A bundle with a signature that does not verify is reported here rather
      // than only in the per-bundle listing, so drift is visible at a glance.
      signatureFailures: bundles.filter((b) => b.manifest?.signature && !b.signature.valid).map((b) => b.name),
    });
  });

  /** Validate a spec and return the file set + manifest without writing. */
  router.post('/render', (req, res) => {
    const validation = validateDshPluginSpec(req.body?.spec ?? req.body);
    if (!validation.ok || !validation.spec) {
      return res.status(400).json({ success: false, error: 'invalid spec', errors: validation.errors });
    }
    const result = scaffoldDshPlugin(req.body?.spec ?? req.body, { root: root(), dryRun: true });
    if (!result.ok) return res.status(400).json({ success: false, reason: result.reason, errors: result.errors });
    return res.json({
      success: true,
      dir: result.dir,
      files: result.files,
      manifest: result.manifest,
      signature: result.signature,
      ...(result.unsignedReason ? { unsignedReason: result.unsignedReason } : {}),
    });
  });

  /** Write a bundle to disk. Guarded: this creates files. */
  router.post('/scaffold', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const result = scaffoldDshPlugin(req.body?.spec ?? req.body, {
      root: root(),
      overwrite: req.body?.overwrite === true,
    });
    if (!result.ok) {
      // A refusal here is about the caller's request, not a server fault.
      const status = result.reason === 'write-failed' ? 500 : 409;
      return res.status(status).json({ success: false, reason: result.reason, errors: result.errors });
    }
    return res.json({
      success: true,
      dir: result.dir,
      files: result.files,
      manifest: result.manifest,
      signature: result.signature,
      ...(result.unsignedReason ? { unsignedReason: result.unsignedReason } : {}),
      nextSteps: [
        `cd ${result.dir}`,
        'pnpm install',
        'pnpm build      # REQUIRED: the profile links to lib/, which is generated',
        'then POST /api/recourse/dsh-plugins/profile/add to mount it',
      ],
    });
  });

  router.delete('/:name', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const result = removeScaffoldedBundle(req.params.name, root());
    if (!result.ok) return res.status(404).json({ success: false, error: result.error });
    return res.json({ success: true, removed: result.removed });
  });

  // --- Profile mounting ----------------------------------------------------

  router.get('/profiles/:name', (req, res) => {
    const state = readProfile(req.params.name, home());
    if (!state.exists) {
      return res.status(404).json({
        success: false,
        error: `no profile "${req.params.name}" under ${pathOf(home())}`,
        available: listProfiles(home()),
      });
    }
    return res.json({ success: true, profile: state });
  });

  /**
   * Wire a scaffolded bundle into a profile's package.json.
   *
   * This edits a file the harness reads at boot, so it keeps a `.bak` and does
   * not run `pnpm install` — the returned `nextSteps` say what still has to
   * happen, and none of it is implicit.
   */
  router.post('/profile/add', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const profile = String(req.body?.profile ?? '');
    const packageName = String(req.body?.packageName ?? '');
    if (!profile || !packageName) {
      return res.status(400).json({ success: false, error: 'profile and packageName are required' });
    }
    const bundles = listScaffoldedBundles(root());
    const bundle = bundles.find((b) => b.name === packageName);
    if (!bundle) {
      return res.status(404).json({
        success: false,
        error: `no scaffolded bundle named "${packageName}" under ${root()}`,
        available: bundles.map((b) => b.name),
      });
    }
    const result = addBundleToProfile({
      profile,
      packageName,
      bundleDir: bundle.dir,
      home: home(),
      force: req.body?.force === true,
    });
    if (!result.ok) return res.status(409).json({ success: false, reason: result.reason, error: result.error });
    return res.json({ success: true, ...result });
  });

  router.post('/profile/remove', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const profile = String(req.body?.profile ?? '');
    const packageName = String(req.body?.packageName ?? '');
    if (!profile || !packageName) {
      return res.status(400).json({ success: false, error: 'profile and packageName are required' });
    }
    const result = removeBundleFromProfile({ profile, packageName, home: home() });
    if (!result.ok) return res.status(404).json({ success: false, error: result.error });
    return res.json({ success: true, ...result });
  });

  return router;
}

/** Join a profile root with the `profiles` segment, for error messages. */
function pathOf(home: string): string {
  return path.join(home, 'profiles');
}