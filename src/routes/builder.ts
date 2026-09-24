/**
 * builder.ts — Builder Brain routes extracted from `server.ts`:
 * GET /builder, POST /builder/select|propose|step.
 *
 * The routes inspect/drive the host's generator meta-loop, so nearly all state
 * is host-owned: profile list, journal, active id, variant-trial and
 * last-meta-run counters, plus `builderSnapshot`/`builderMetaStep`. They are
 * injected as refs/setters. `chooseBuilderProfile` is a pure lib import.
 */
import { Router } from 'express';
import { chooseBuilderProfile } from '../lib/builderBrain.js';
import type { BuilderProfile, BuilderOutcome } from '../lib/builderBrain.js';

export interface BuilderRouterDeps {
  snapshot(): unknown;
  profilesRef(): BuilderProfile[];
  journalRef(): BuilderOutcome[];
  activeIdRef(): string;
  setActiveId(id: string): void;
  setVariantTrials(n: number): void;
  setLastMetaRun(n: number): void;
  metaStep(forceMutate?: boolean): void;
  saveState(): void;
}

export function createBuilderRouter(deps: BuilderRouterDeps): Router {
  const router = Router();

  router.get('/builder', (req, res) => {
    res.json({ success: true, builder: deps.snapshot() });
  });

  /** Manually pin the active generator strategy to a profile id. */
  router.post('/builder/select', (req, res) => {
    const { profileId } = req.body ?? {};
    if (typeof profileId !== 'string' || !deps.profilesRef().some((p) => p.id === profileId)) {
      return res.status(400).json({ success: false, error: 'unknown profileId' });
    }
    deps.setActiveId(profileId);
    deps.setVariantTrials(0);
    deps.setLastMetaRun(deps.journalRef().length);
    deps.saveState();
    res.json({ success: true, builder: deps.snapshot() });
  });

  /** Force the meta-loop to propose a NEW generator strategy variant (validation window). */
  router.post('/builder/propose', (req, res) => {
    deps.metaStep(true);
    res.json({ success: true, builder: deps.snapshot() });
  });

  /** Manually run the selection step (greedy best from the real journal). */
  router.post('/builder/step', (req, res) => {
    deps.setVariantTrials(0);
    const best = chooseBuilderProfile(deps.profilesRef(), deps.journalRef());
    deps.setActiveId(best.id);
    deps.setLastMetaRun(deps.journalRef().length);
    deps.saveState();
    res.json({ success: true, builder: deps.snapshot() });
  });

  return router;
}
