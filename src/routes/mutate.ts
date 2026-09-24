/**
 * mutate.ts — AI architectural mutator routes (gene status, evolve, human
 * approve, mutate-scoped policy) extracted from the `server.ts` monolith.
 *
 * The gene-registry store instance stays host-side (injected); the mutator
 * primitives are pure lib imports.
 */
import { Router } from 'express';
import { evolveGene, approveGene, getActiveModel, getActivePolicy, type createGeneRegistryStore } from '../dream/mutator.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';
import type { ToolEntry, SystemStatus, PromotionPolicy } from '../types.js';

type GeneRegistryStore = ReturnType<typeof createGeneRegistryStore>;

export interface MutateRouterDeps {
  geneRegistryStore: GeneRegistryStore;
  promoteTool(entry: ToolEntry, opts: { origin: string; gate?: boolean; push?: boolean }): boolean;
  statusRef(): SystemStatus;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  applyPromotionPolicy(raw: unknown): { ok: true; policy: PromotionPolicy; note?: string } | { ok: false; error: string };
  generation(): number;
}

export function createMutateRouter(deps: MutateRouterDeps): Router {
  const router = Router();

  router.get('/mutate/status', async (_req, res) => {
    try {
      const geneList = await deps.geneRegistryStore.list();
      res.json({
        success: true,
        activePolicy: getActivePolicy(),
        model: getActiveModel(),
        registry: geneList.map((g) => ({
          id: g.id,
          name: g.name,
          version: g.version,
          generation: g.generation,
          domain: g.domain,
          status: g.status,
          origin: g.origin,
          description: g.description,
          versionHash: g.versionHash,
          createdAt: g.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/mutate/evolve', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const { domain, instructions, targetToolName } = req.body ?? {};
      if (!domain) {
        return res.status(400).json({ success: false, error: 'domain required' });
      }
      if (!instructions || typeof instructions !== 'string' || instructions.trim().length < 4) {
        return res.status(400).json({ success: false, error: 'instructions required' });
      }
      const result = await evolveGene(deps.geneRegistryStore, {
        domain,
        instructions: instructions.trim().slice(0, 4000),
        targetToolName: typeof targetToolName === 'string' && targetToolName.trim() ? targetToolName.trim() : undefined,
      });

      let promoted = false;
      if (result.success && result.outcome === 'promoted') {
        const version = '1.0.0';
        const newTool: ToolEntry = {
          name: result.toolName,
          domain: domain,
          entrypoint: `src/tools/${result.toolName}.ts`,
          description: `AI Mutated (${result.engine}): ${instructions.slice(0, 60)}`,
          currentVersion: version,
          versions: [
            {
              version,
              hash: result.versionHash,
              created_at: Date.now(),
              passed_verifier: result.verifierResult.verified,
              score: result.verifierResult.verified ? 1.0 : 0,
              promoted: result.verifierResult.verified,
              verifier_notes: `${result.verifierResult.summary} Engine: ${result.engine}.`,
            },
          ],
          healthStatus: result.verifierResult.verified ? 'healthy' : 'degraded',
          anomalyCount: 0,
        };
        promoted = deps.promoteTool(newTool, { origin: 'mutate' });
        if (promoted) {
          deps.statusRef().totalUpgrades += 1;
          deps.appendProvenance('ai_mutation', {
            tool: result.toolName,
            domain,
            version,
            hash: result.versionHash,
            engine: result.engine,
            generation: result.generation,
          });
          deps.saveState();
        }
      }

      res.json({ ...result, promoted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/mutate/approve', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const { geneId } = req.body ?? {};
      if (!geneId || typeof geneId !== 'string') {
        return res.status(400).json({ success: false, error: 'geneId required' });
      }
      const result = await approveGene(deps.geneRegistryStore, geneId);
      let promoted = false;
      if (result.success && result.gene) {
        const g = result.gene;
        const version = `${g.version}.0.0`;
        const checksPassed = (g.verifierChecks || []).every((c) => c.passed);
        const newTool: ToolEntry = {
          name: g.name,
          domain: g.domain,
          entrypoint: `src/tools/${g.name}.ts`,
          description: g.description,
          currentVersion: version,
          versions: [
            {
              version,
              hash: g.versionHash,
              created_at: Date.now(),
              passed_verifier: checksPassed,
              score: checksPassed ? 1.0 : 0,
              promoted: true,
              verifier_notes:
                'Human approved AI Mutation Gene' +
                (checksPassed ? ' (gene invariant checks passed).' : ' (invariant checks NOT all passed).'),
              source_code: g.code,
            },
          ],
          healthStatus: checksPassed ? 'healthy' : 'degraded',
          anomalyCount: 0,
        };
        promoted = deps.promoteTool(newTool, { origin: 'mutate-approve' });
        if (promoted) {
          deps.statusRef().totalUpgrades += 1;
          deps.appendProvenance('tool_human_approved', {
            tool: g.name,
            geneId: g.id,
            domain: g.domain,
            version,
            hash: g.versionHash,
          });
          deps.saveState();
        }
      }
      res.status(result.success ? 200 : 422).json({ ...result, promoted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/mutate/policy', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      // Same canonical vocabulary as /policy (legacy auto_promote/manual_approval
      // still accepted and normalized).
      const applied = deps.applyPromotionPolicy(req.body?.policy);
      if ('error' in applied) {
        return res.status(400).json({
          success: false,
          error: applied.error,
          allowed: ['any_pass', 'non_regressing', 'strict_improve', 'human_approval'],
        });
      }
      deps.appendProvenance('system_tick', {
        action: 'policy_change',
        newPolicy: applied.policy,
        generation: deps.generation(),
      });
      deps.saveState();
      res.json({ success: true, activePolicy: applied.policy, ...(applied.note ? { note: applied.note } : {}) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
