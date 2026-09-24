/**
 * biotech.ts — oncology/biotech claim routes extracted from `server.ts`:
 * GET /biotech/drugs, GET /biotech/verify-claim, GET /biotech/claims.
 *
 * The knowledge graph and claim validator are pure lib imports; the goal
 * ledger recorders are pure. Host-owned side effects (saveGoalLedger) and
 * mutable state (status.generation) are injected as closures/getters.
 */
import { Router } from 'express';
import {
  CANONICAL_ONCOLOGY_KG,
  validateBiotechClaimAgainstKG,
} from '../lib/biotechKnowledgeGraph.js';
import {
  recordBiotechClaim,
  getBiotechClaims,
} from '../lib/goalLedger.js';

export interface BiotechRouterDeps {
  saveGoalLedger(): void;
  currentGeneration(): number;
}

export function createBiotechRouter(deps: BiotechRouterDeps): Router {
  const router = Router();

  router.get('/biotech/drugs', (req, res) => {
    const entities = Object.values(CANONICAL_ONCOLOGY_KG);
    res.json({
      success: true,
      count: entities.length,
      drugs: entities.map(e => ({
        id: e.id,
        targetProtein: e.targetProtein,
        drugClass: e.drugClass,
        mechanism: e.mechanism,
        leg: e.leg,
        evidenceTier: e.evidenceTier,
        clinicalIndication: e.clinicalIndication,
        literatureCitation: e.literatureCitation,
        biomarkers: e.biomarkers,
      })),
    });
  });

  router.get('/biotech/verify-claim', (req, res) => {
    const { asset_name, mechanism, leg, evidence_tier, source } = req.query as Record<string, string>;
    if (!asset_name) {
      res.status(400).json({ success: false, error: 'asset_name is required' });
      return;
    }
    const result = validateBiotechClaimAgainstKG({
      asset_name: String(asset_name),
      mechanism: mechanism || undefined,
      leg: leg || undefined,
      evidence_tier: evidence_tier ? Number(evidence_tier) : undefined,
      source: source || undefined,
    });
    const recorded = recordBiotechClaim({
      assetName: String(asset_name),
      leg: leg || 'unknown',
      evidenceTier: evidence_tier ? Number(evidence_tier) : 0,
      passed: result.passed,
      score: result.score,
      source: source || undefined,
      mechanism: mechanism || undefined,
      summary: result.summary,
      matchedEntity: result.entity ? {
        id: result.entity.id,
        targetProtein: result.entity.targetProtein,
        drugClass: result.entity.drugClass,
        clinicalIndication: result.entity.clinicalIndication,
      } : undefined,
      generation: deps.currentGeneration(),
    });
    deps.saveGoalLedger();
    res.json({ success: true, verification: result, claim: recorded });
  });

  router.get('/biotech/claims', (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const claims = getBiotechClaims(limit);
    res.json({ success: true, claims, total: claims.length });
  });

  return router;
}
