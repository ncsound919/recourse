// api/recourse/mutate/[action].ts — Vercel serverless route backing
// AiMutatorModal. Place at exactly this path so [action] matches
// status | evolve | approve | policy.
//
// Endpoint contract:
//   GET  /api/recourse/mutate/status   -> { success, activePolicy, model, registry }
//   POST /api/recourse/mutate/evolve   -> MutationResult (outcome/generation/versionHash/...)
//   POST /api/recourse/mutate/approve  -> { success, gene }   (activate pending gene)
//   POST /api/recourse/mutate/policy   -> { success, activePolicy }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { PromotionPolicy, RegistryGene } from '../../../src/dream/mutator-types';
import {
  approveGene,
  createGeneRegistryStore,
  evolveGene,
  getActiveModel,
  getActivePolicy,
  setActivePolicy,
} from '../../../src/dream/mutator';
import type { ToolDomain } from '../../../src/dream/types';
import { requireMutationAuth, serverError } from '../_guard';

const VALID_DOMAINS: ToolDomain[] = [
  'coding', 'math', 'biotech', 'systemic',
  'neuro_symbolic', 'cyber_defense', 'quantum_sim',
];

function publicGene(g: RegistryGene) {
  return {
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
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const store = createGeneRegistryStore();

  if (!requireMutationAuth(req, res)) return;

  try {
    switch (action) {
      case 'status': {
        if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });
        const registry = await store.list();
        return res.status(200).json({
          success: true,
          activePolicy: getActivePolicy(),
          model: getActiveModel(),
          registry: registry.map(publicGene),
        });
      }

      case 'evolve': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const { domain, instructions, targetToolName } = req.body ?? {};
        if (!domain || !VALID_DOMAINS.includes(domain)) {
          return res.status(400).json({ success: false, error: `domain must be one of ${VALID_DOMAINS.join(', ')}` });
        }
        if (!instructions || typeof instructions !== 'string' || instructions.trim().length < 4) {
          return res.status(400).json({ success: false, error: 'instructions required' });
        }
        const result = await evolveGene(store, {
          domain,
          instructions: instructions.trim().slice(0, 4000),
          targetToolName: typeof targetToolName === 'string' && targetToolName.trim() ? targetToolName.trim() : undefined,
        });
        return res.status(200).json(result);
      }

      case 'approve': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const { geneId } = req.body ?? {};
        if (!geneId || typeof geneId !== 'string') {
          return res.status(400).json({ success: false, error: 'geneId required' });
        }
        const result = await approveGene(store, geneId);
        return res.status(result.success ? 200 : 422).json(result);
      }

      case 'policy': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const { policy } = req.body ?? {};
        if (policy !== 'auto_promote' && policy !== 'manual_approval') {
          return res.status(400).json({ success: false, error: "policy must be 'auto_promote' or 'manual_approval'" });
        }
        setActivePolicy(policy as PromotionPolicy);
        return res.status(200).json({ success: true, activePolicy: policy });
      }

      default:
        return res.status(404).json({ success: false, error: `unknown mutate action: ${action}` });
    }
  } catch (err) {
    return serverError(res, err, `mutate:${action}`);
  }
}
