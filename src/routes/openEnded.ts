/**
 * openEnded.ts — open-ended capability engine routes (QD archive view,
 * snapshot/run/archive/hygiene/patch, fleet-recursion ledger) extracted from
 * the `server.ts` monolith.
 *
 * Pure libs (patch attempt, model chat, sandbox verify, QD builders) are
 * imported directly; archive/busy/ledger state and host mutations are injected.
 */
import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import { buildQDArchive, buildIslands } from '../lib/qualityDiversity.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';
import { getFleetDriver, verifyAndApplyPatch } from '../lib/fleetDevelopment.js';
import { runPatchAttempt } from '../lib/openEnded/patchMode.js';
import { chatComplete } from '../lib/modelProvider.js';
import { executeTestSuite } from '../lib/executionSandbox.js';
import { summarizeFleetRecursion, type FleetRecursionLedger } from '../lib/openEnded/fleetRecursion.js';
import type { OpenEndedArchive } from '../lib/openEnded/archive.js';
import type { ToolEntry } from '../types.js';

export interface OpenEndedRouterDeps {
  openEndedSnapshot(): Record<string, unknown>;
  runOpenEndedEngineCycle(): Promise<unknown>;
  getOpenEndedArchive(): OpenEndedArchive;
  registry(): ToolEntry[];
  pruneBeliefs(opts: {
    minWeight?: number;
    minMeanReward?: number;
    maxAgeEpisodes?: number;
  }): Promise<unknown>;
  saveState(): void;
  devRepoRoot(): string;
  selfModGuard: unknown;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  fleetRecursion: FleetRecursionLedger;
}

export function createOpenEndedRouter(deps: OpenEndedRouterDeps): Router {
  const router = Router();

  // Quality-Diversity archive over the live registry (MAP-Elites view). Read-only.
  router.get('/qd', (_req, res) => {
    try {
      res.json({
        success: true,
        archive: buildQDArchive(deps.registry(), 8),
        islands: buildIslands(deps.registry(), 8).islands,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/open-ended', (_req, res) => {
    try {
      res.json({ success: true, engine: deps.openEndedSnapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/open-ended/run', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const count = Math.max(1, Math.min(5, Math.floor(Number(req.body?.count ?? 1) || 1)));
      const results: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const r = await deps.runOpenEndedEngineCycle();
        results.push(r);
        if ((r as any).skipped) break;
      }
      res.json({ success: true, results, engine: deps.openEndedSnapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/open-ended/archive', (_req, res) => {
    try {
      const archive = deps.getOpenEndedArchive();
      res.json({
        success: true,
        snapshot: archive.snapshot(),
        problems: archive.list().map((p) => ({
          id: p.id,
          domain: p.domain,
          title: p.title,
          statement: p.statement,
          functionName: p.functionName,
          solved: p.solved,
          attempts: p.attempts,
          cell: p.cell,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Gene-belief hygiene: merge behavioral duplicates (same capability under new
   *  hex suffixes) and optionally retire dead noise below an explicit floor. */
  router.post('/open-ended/hygiene', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const minWeight = Number(req.body?.minWeight);
      const minMeanReward = Number(req.body?.minMeanReward);
      const maxAgeEpisodes = Number(req.body?.maxAgeEpisodes);
      const report = await deps.pruneBeliefs({
        ...(Number.isFinite(minWeight) ? { minWeight } : {}),
        ...(Number.isFinite(minMeanReward) ? { minMeanReward } : {}),
        ...(Number.isFinite(maxAgeEpisodes) ? { maxAgeEpisodes } : {}),
      });
      deps.saveState();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Patch-mode editing: a model-proposed search/replace applied surgically to an
   *  existing file, then verified by the same sandbox + lint + self-mod gate as
   *  fleet patches. Preserves every byte the goal does not touch. */
  router.post('/open-ended/patch', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const { driverId, file, goal, suite, apply } = req.body ?? {};
      if (typeof driverId !== 'string' || !getFleetDriver(driverId)) {
        return res.status(400).json({ success: false, error: 'a registered driverId is required' });
      }
      if (typeof file !== 'string' || !file) {
        return res.status(400).json({ success: false, error: 'file is required' });
      }
      if (typeof goal !== 'string' || !goal) {
        return res.status(400).json({ success: false, error: 'goal is required' });
      }
      const root = deps.devRepoRoot();
      const abs = path.resolve(root, file);
      const rel = path.relative(root, abs);
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs)) {
        return res.status(400).json({ success: false, error: 'file must be an existing file under the repo root' });
      }
      const original = fs.readFileSync(abs, 'utf-8');
      const result = await runPatchAttempt({
        file,
        goal,
        original,
        draft: async (system, user) => {
          const r = await chatComplete(
            [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            { temperature: 0.1 },
          );
          if (!r.ok || r.content === null) throw new Error(r.error || 'model offline');
          return r.content;
        },
        verify:
          typeof suite === 'string' && suite.trim()
            ? (output) => {
                const run = executeTestSuite(output, suite);
                return {
                  ok: run.passed,
                  detail: run.testDetails.filter((d) => d.startsWith('[FAIL')).slice(0, 2).join('; ') || 'acceptance passed',
                };
              }
            : undefined,
        apply:
          apply === false
            ? undefined
            : async (patch) => {
                const written = await verifyAndApplyPatch(
                  { driverId, file, source: patch.output, suite: typeof suite === 'string' ? suite : undefined, note: goal },
                  { root, guard: deps.selfModGuard as any },
                );
                return {
                  applied: written.applied,
                  error: 'error' in written ? written.error : undefined,
                  revertToken: 'revertToken' in written ? written.revertToken : undefined,
                };
              },
      });
      deps.appendProvenance('open_ended_patch', { file, ok: result.ok, applied: result.applied, attempts: result.attempts });
      res.json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Dedup-aware fleet recursion ledger (Axiom/OpenHub loop outcomes). */
  router.get('/open-ended/fleet', (_req, res) => {
    try {
      const entries = deps.fleetRecursion.read();
      res.json({
        success: true,
        chain: deps.fleetRecursion.verifyChain(),
        summary: summarizeFleetRecursion(entries),
        entries: entries.slice(-50),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/open-ended/fleet', (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const { source, goal, status, iteration, summary, score } = req.body ?? {};
      if (typeof goal !== 'string' || !goal) {
        return res.status(400).json({ success: false, error: 'goal is required' });
      }
      const entry = deps.fleetRecursion.append({
        source: typeof source === 'string' ? source : 'fleet',
        goal,
        ...(typeof status === 'string' ? { status } : {}),
        ...(Number.isFinite(Number(iteration)) ? { iteration: Number(iteration) } : {}),
        ...(typeof summary === 'string' ? { summary } : {}),
        ...(Number.isFinite(Number(score)) ? { score: Number(score) } : {}),
      });
      res.json({ success: true, entry });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
