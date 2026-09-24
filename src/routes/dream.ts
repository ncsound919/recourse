/**
 * dream.ts — always-on Dreaming Engine routes (status, toggle, tick,
 * crystallize, cron catch-up) extracted from the `server.ts` monolith.
 *
 * The engine instance, dream-state mirror, registry promotion, and the
 * crystal-to-registry mirror helper stay host-side and are injected.
 */
import { createHash } from 'crypto';
import { Router } from 'express';
import type { DreamingEngine } from '../dream/engine.js';
import type { DreamState, SystemStatus, ToolEntry } from '../types.js';

export interface DreamRouterDeps {
  dreamEngine: DreamingEngine;
  setDreamState(state: DreamState): void;
  saveState(): void;
  mirrorCrystallizedDreamGenes(): Promise<number>;
  promoteTool(entry: ToolEntry, opts: { origin: string; gate?: boolean; push?: boolean }): boolean;
  statusRef(): SystemStatus;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
}

export function createDreamRouter(deps: DreamRouterDeps): Router {
  const router = Router();

  router.get('/dream/status', async (_req, res) => {
    try {
      const liveDreamState = await deps.dreamEngine.status();
      deps.setDreamState(liveDreamState);
      res.json({ success: true, dreamState: liveDreamState });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/dream/toggle', async (_req, res) => {
    try {
      await deps.dreamEngine.toggle();
      const dreamState = await deps.dreamEngine.status();
      deps.setDreamState(dreamState);
      res.json({ success: true, isDreamingActive: dreamState.isDreamingActive });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/dream/tick', async (_req, res) => {
    try {
      const tickResult = await deps.dreamEngine.tick();
      deps.setDreamState(tickResult.dreamState);
      deps.saveState();
      const mirrored = await deps.mirrorCrystallizedDreamGenes();
      res.json({
        success: true,
        dreamState: tickResult.dreamState,
        newThought: tickResult.newThought,
        phaseReport: tickResult.phaseReport,
        mirroredGenes: mirrored,
        readyToCrystallize: tickResult.newThought?.crystallizationReadiness && tickResult.newThought.crystallizationReadiness >= 0.85 ? tickResult.newThought : undefined,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/dream/crystallize', async (req, res) => {
    try {
      const { thoughtId } = req.body;
      const liveState = await deps.dreamEngine.status();
      const thought = liveState.recentThoughts.find((t) => t.id === thoughtId) || liveState.recentThoughts[0];
      if (!thought) {
        return res.status(404).json({ success: false, error: 'Thought not found for crystallization' });
      }

      const r = await deps.dreamEngine.crystallize(thought.id);
      if (!r.success || !r.crystallizedTool) {
        return res.status(422).json({ success: false, error: r.error || 'Verification failed in sandbox' });
      }

      deps.setDreamState(r.dreamState);
      const cTool = r.crystallizedTool;
      const version = '1.0.0';
      const versionHash = createHash('sha256').update(cTool.code).digest('hex').substring(0, 16);

      const newToolEntry: ToolEntry = {
        name: cTool.name,
        domain: cTool.domain,
        entrypoint: `src/tools/${cTool.name}.ts`,
        description: `Lucidly Crystallized: ${cTool.description}`,
        currentVersion: version,
        versions: [
          {
            version,
            hash: versionHash,
            created_at: Date.now(),
            passed_verifier: cTool.verified,
            score: cTool.verified ? 1.0 : 0,
            promoted: cTool.verified,
            verifier_notes: cTool.verified ? `Dream gene passed engine sandbox verification (${cTool.kind}).` : 'Dream gene failed engine verification.',
            source_code: cTool.code,
          },
        ],
        healthStatus: cTool.verified ? 'healthy' : 'degraded',
        anomalyCount: 0,
      };

      const promotedDream = deps.promoteTool(newToolEntry, { origin: 'dream-crystallize' });
      if (promotedDream) {
        deps.statusRef().totalUpgrades += 1;

        deps.appendProvenance('dream_crystallized', {
          thoughtId: thought.id,
          phase: thought.phase,
          domain: thought.domain,
          toolName: cTool.name,
          kind: cTool.kind,
          version,
          hash: versionHash,
        });

        deps.saveState();
      }

      res.json({
        success: true,
        promoted: promotedDream,
        crystallizedTool: newToolEntry,
        dreamState: r.dreamState,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/dream/cron', async (req, res) => {
    try {
      if (process.env.DREAM_CRON_SECRET && req.headers['x-dream-secret'] !== process.env.DREAM_CRON_SECRET) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
      }
      const r = await deps.dreamEngine.runCatchUpTicks(60);
      deps.setDreamState(r.dreamState);
      deps.saveState();
      const mirrored = await deps.mirrorCrystallizedDreamGenes();
      res.json({ success: true, ...r, mirroredGenes: mirrored });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
