/**
 * develop.ts — the autonomous-development (audit / repair-team / stuck-issue /
 * brain / genome-council / patch) surface extracted from the `server.ts`
 * monolith.
 *
 * The patch gate + fleet-dev primitives are pure libs imported directly. All
 * host-owned state and engines (stuck issues, dev autopilot flag, dev snapshot,
 * brain/council) stay in the monolith and are injected.
 */
import { Router } from 'express';
import {
  verifyAndApplyPatch,
  getFleetDriver,
  applyDriverProposal,
  revertAppliedPatch,
  listFleetPatches,
  fleetBackupDir,
} from '../lib/fleetDevelopment.js';
import type { DevBrainAction, DevBrainStrategy, DevBrainCandidate } from '../lib/fleetDevelopment.js';
import { resolveFleetRepo, createFleetRepairGuard, fleetSecret } from '../lib/fleetRepos.js';
import { makeHarnessGate } from '../lib/selfModification.js';
import { requireMutationAuth } from '../lib/mutationAuth.js';

export interface DevelopRouterDeps {
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  recordDev(action: string, ok: boolean, detail: string, extra?: Record<string, unknown>): void;
  // stuck-issue loop
  isAutopilotOn(): boolean;
  applyEnabled(): boolean;
  backoffMs(): number;
  band(): number;
  stuckSnapshot(): unknown;
  stuckLedger(): unknown[];
  clearStuck(id: string): { removed: number; remaining: number };
  runStuckRepairPass(force: boolean): Promise<Record<string, unknown>>;
  // dev loop
  devSnapshot(): Promise<Record<string, unknown>>;
  runRepairReport(force: boolean): Promise<{ ok: boolean; [k: string]: unknown }>;
  runDeepAnalyze(): Promise<{ ok: boolean; [k: string]: unknown }>;
  devRepoRoot(): string;
  selfModGuard: unknown;
  bootGreenForPatch(file: string): unknown;
  makeHarnessBootGreenGate(): unknown;
  harnessCiGate: boolean;
  runBrainGateway(input: unknown): Promise<unknown>;
  runCouncilDecide(input: unknown): Promise<unknown>;
  runCouncilState(): Promise<unknown>;
  runCouncilLessons(limit?: number): Promise<unknown>;
  runCouncilPostMortem(input: unknown): Promise<unknown>;
  toggleAutopilot(): boolean;
}

export function createDevelopRouter(deps: DevelopRouterDeps): Router {
  const router = Router();

  router.get('/develop/stuck', (_req, res) => {
    res.json({
      success: true,
      enabled: deps.isAutopilotOn(),
      applyEnabled: deps.applyEnabled(),
      backoffMs: deps.backoffMs(),
      band: deps.band(),
      snapshot: deps.stuckSnapshot(),
      ledger: deps.stuckLedger().slice(-50),
    });
  });

  router.post('/develop/stuck/run', async (req, res) => {
    try {
      const force = req.body?.force === true;
      res.json({ success: true, ...(await deps.runStuckRepairPass(force)) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Operator escape hatch: clear a stuck issue (mark recovered, stop escalation). */
  router.post('/develop/stuck/clear', (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    const { removed, remaining } = deps.clearStuck(id);
    res.json({ success: true, removed, remaining });
  });

  router.get('/develop', async (_req, res) => {
    try {
      res.json({ success: true, ...(await deps.devSnapshot()) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Outbound: report Recourse's weaknesses to the repair team (auto-fix dispatch). */
  router.post('/develop/report', async (req, res) => {
    try {
      const force = req.body?.force === true;
      const result = await deps.runRepairReport(force);
      res.json({ success: result.ok, ...result, dev: await deps.devSnapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Outbound: ask the Deep to analyze Recourse and propose concrete repairs. */
  router.post('/develop/deep', async (_req, res) => {
    try {
      const result = await deps.runDeepAnalyze();
      res.json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Inbound: run a fleet driver's full-text proposal through the verified
   *  patch-intake gate. Each candidate is applied ONLY after it passes
   *  Recourse's own sandbox verifier + lint. */
  router.post('/develop/intake', async (req, res) => {
    try {
      const { driverId, output, query: _query } = req.body ?? {};
      if (typeof driverId !== 'string' || !getFleetDriver(driverId)) {
        return res.status(400).json({ success: false, error: 'a registered driverId is required' });
      }
      if (typeof output !== 'string') {
        return res.status(400).json({ success: false, error: 'output must be the driver response text' });
      }
      const result = await applyDriverProposal({
        driverId,
        output,
        root: deps.devRepoRoot(),
        bootGreen: deps.harnessCiGate ? deps.makeHarnessBootGreenGate() as any : undefined,
        guard: deps.selfModGuard as any,
      });
      const detail = result.applied
        ? `intake applied ${result.appliedCount} verified patch(es), rejected ${result.rejectedCount}, skipped ${result.skippedCount}`
        : `intake applied none (rejected ${result.rejectedCount}, skipped ${result.skippedCount})`;
      deps.recordDev('intake', result.applied, detail, { driver: driverId });
      if (result.applied) {
        for (const r of result.results) {
          if (r.applied) {
            deps.appendProvenance('capability_adopted', {
              driverId,
              file: r.file,
              hash: r.hash,
              revertToken: r.revertToken,
              note: 'verified patch intake',
            });
          }
        }
      }
      res.json({ success: result.applied, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Brain gateway: ask Dev-Brain or the deterministic brain to decide / rank /
   *  triage Recourse's next action or analyze deeply. */
  router.post('/develop/brain', async (req, res) => {
    try {
      const { brain, action, problem, candidates, strategy } = req.body ?? {};
      const result = await deps.runBrainGateway({
        brain: typeof brain === 'string' ? brain : undefined,
        action: (['decide', 'triage', 'fusion', 'deep'] as string[]).includes(action) ? action as DevBrainAction | 'deep' : undefined,
        problem: typeof problem === 'string' ? problem : undefined,
        candidates: Array.isArray(candidates) ? candidates as DevBrainCandidate[] : undefined,
        strategy: strategy as DevBrainStrategy | undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Genome council: consult the deterministic brain's council over a problem. */
  router.post('/develop/council', async (req, res) => {
    try {
      const { problem, selectedGenomes, activeSectors } = req.body ?? {};
      const result = await deps.runCouncilDecide({
        problem: typeof problem === 'string' ? problem : undefined,
        selectedGenomes: Array.isArray(selectedGenomes) ? selectedGenomes as string[] : undefined,
        activeSectors: Array.isArray(activeSectors) ? activeSectors as string[] : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Genome council: read the brain's learned believability ledger. */
  router.get('/develop/council/state', async (_req, res) => {
    try {
      res.json(await deps.runCouncilState());
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Genome council: read lessons the brain has learned from recorded outcomes. */
  router.get('/develop/council/lessons', async (req, res) => {
    try {
      const limit = Number(req.query.limit);
      res.json(await deps.runCouncilLessons(Number.isFinite(limit) ? limit : undefined));
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Genome council: record a real Recourse outcome so the brain compounds. */
  router.post('/develop/council/post-mortem', async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const result = await deps.runCouncilPostMortem({
        decisionTitle: typeof b.decisionTitle === 'string' ? b.decisionTitle : undefined,
        sector: typeof b.sector === 'string' ? b.sector : undefined,
        chosenOption: typeof b.chosenOption === 'string' ? b.chosenOption : undefined,
        predictedProbability: typeof b.predictedProbability === 'number' ? b.predictedProbability : undefined,
        actualOutcome: typeof b.actualOutcome === 'string' ? b.actualOutcome : undefined,
        leaderIds: Array.isArray(b.leaderIds) ? (b.leaderIds as string[]) : undefined,
        rootCauses: Array.isArray(b.rootCauses) ? (b.rootCauses as string[]) : undefined,
        keyLessons: Array.isArray(b.keyLessons) ? (b.keyLessons as string[]) : undefined,
        retrospectiveSummary: typeof b.retrospectiveSummary === 'string' ? b.retrospectiveSummary : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Inbound: apply a repair-team patch, but only after it passes Recourse's own
   *  sandbox verifier + lint gate. This is the safe autonomous-development gate. */
  router.post('/develop/patch', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const { driverId, file, source = '', suite, domain, note, repo, authorization } = req.body ?? {};
      if (typeof driverId !== 'string' || typeof file !== 'string') {
        return res.status(400).json({ success: false, error: 'driverId and file are required' });
      }
      if (typeof source !== 'string') {
        return res.status(400).json({ success: false, error: 'source must be a string' });
      }

      const target = resolveFleetRepo(repo);
      if (repo && repo !== 'self' && !target) {
        return res.status(400).json({ success: false, error: `unknown fleet repo "${String(repo)}"` });
      }

      const root = target ? target.root : deps.devRepoRoot();
      const guard = target
        ? createFleetRepairGuard({ repo: target.slug, source, authorization, secret: fleetSecret() })
        : deps.selfModGuard as any;
      const bootGreen = target
        ? makeHarnessGate({ cwd: target.root })
        : deps.bootGreenForPatch(file) as any;

      const result = await verifyAndApplyPatch(
        { driverId, file, source, suite: typeof suite === 'string' ? suite : undefined, domain, note },
        { root, bootGreen, guard },
      );
      const detail = result.applied
        ? `applied ${result.file} (${result.verified})${'revertToken' in result && result.revertToken ? ` [rollback ${result.revertToken}]` : ''}`
        : `rejected ${result.file}: ${'error' in result ? result.error : ''}`;
      const hash = 'hash' in result && result.applied ? result.hash : undefined;
      deps.recordDev('patch', result.applied, detail, { driver: driverId, file: result.file, hash });
      if (result.applied) {
        deps.appendProvenance('capability_adopted', {
          driverId,
          file: result.file,
          hash: 'hash' in result ? result.hash : undefined,
          revertToken: 'revertToken' in result ? result.revertToken : undefined,
          note: note ?? null,
        });
      }
      res.json({ success: result.applied, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/develop/autopilot/toggle', (_req, res) => {
    const on = deps.toggleAutopilot();
    res.json({ success: true, autopilot: on });
  });

  /** Harness-evolution ledger (Phase 5 item 16): applied patches + rollback
   *  tokens. Read-only; mirrors the persisted journal under the repo. */
  router.get('/develop/patches', (req, res) => {
    try {
      const ledgerTarget = resolveFleetRepo(req.query?.repo);
      const root = ledgerTarget ? ledgerTarget.root : deps.devRepoRoot();
      const patches = listFleetPatches(root);
      res.json({
        success: true,
        root,
        backupDir: fleetBackupDir(root),
        applied: patches.filter((p) => !p.reverted).length,
        reverted: patches.filter((p) => p.reverted).length,
        harnessCiGate: deps.harnessCiGate,
        patches: patches.slice(0, 200),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** One-click rollback: restore the pre-patch source for an applied fleet patch.
   *  Destructive, fail-closed. Reverts are provenance-tracked. */
  router.post('/develop/revert', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const { token } = req.body ?? {};
      if (typeof token !== 'string' || !token) {
        return res.status(400).json({ success: false, error: 'token is required' });
      }
      const revertTarget = resolveFleetRepo((req.body ?? {}).repo);
      const revertRoot = revertTarget ? revertTarget.root : deps.devRepoRoot();
      const result = await revertAppliedPatch(token, revertRoot);
      if (!result.ok) {
        return res.status(404).json({ success: false, error: result.error || 'revert failed' });
      }
      const entry = listFleetPatches(revertRoot).find((p) => p.token === token);
      deps.appendProvenance('capability_reverted', {
        token,
        file: result.file,
        driverId: entry?.driverId,
        appliedHash: entry?.appliedHash,
      });
      deps.recordDev('revert', true, `rolled back ${result.file} (${token})`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  return router;
}
