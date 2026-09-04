// api/recourse/math/[action].ts — Vercel serverless route backing the Five-Formula Recursive Learning Loop
// Endpoint contract:
//   GET  /api/recourse/math/state     -> { success: true, state: RecursiveLoopState }
//   POST /api/recourse/math/step      -> { success: true, result: RecursiveIterationResult, state: RecursiveLoopState }
//   POST /api/recourse/math/reset     -> { success: true, state: RecursiveLoopState }
//   POST /api/recourse/math/configure -> { success: true, state: RecursiveLoopState }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import {
  createInitialLoopState,
  executeRecursiveStep,
  DEFAULT_LOOP_CONFIG,
} from '../../../src/lib/recursiveMathEngine';
import type { RecursiveLoopState } from '../../../src/types';
import { requireMutationAuth, serverError } from '../_guard';

// Validate the configure payload before it can touch engine state. Unknown
// keys are rejected outright; numeric fields are range-checked so a malformed
// or junk body cannot corrupt the loop or coerce NaN into the engine.
const LOOP_CONFIG_SCHEMA = z
  .object({
    learningRateEta: z.number().min(0).max(1).optional(),
    momentumMu: z.number().min(0).max(1).optional(),
    energyBudgetCap: z.number().min(0).optional(),
    timeStepDeltaT: z.number().positive().optional(),
    planckConstantHbar: z.number().positive().optional(),
    spectralBinsN: z.number().int().min(2).max(65536).optional(),
    invariantTolerance: z.number().positive().optional(),
    bellmanGamma: z.number().min(0).max(1).optional(),
    bayesObservationNoise: z.number().positive().optional(),
    targetInvariantVector: z.array(z.number()).optional(),
  })
  .strict();

let globalMathState: RecursiveLoopState = createInitialLoopState();

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse | void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (!requireMutationAuth(req, res)) return;

  try {
    switch (action) {
      case 'state': {
        if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'GET only' });
        }
        return res.status(200).json({
          success: true,
          state: globalMathState,
        });
      }

      case 'step': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
        }
        const result = executeRecursiveStep(globalMathState);
        return res.status(200).json({
          success: true,
          result,
          state: globalMathState,
        });
      }

      case 'reset': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
        }
        globalMathState = createInitialLoopState(globalMathState.config || DEFAULT_LOOP_CONFIG);
        return res.status(200).json({
          success: true,
          state: globalMathState,
        });
      }

      case 'configure': {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
        }
        const { config } = req.body ?? {};
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          return res.status(400).json({ success: false, error: 'config object required' });
        }
        const parsed = LOOP_CONFIG_SCHEMA.safeParse(config);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: 'invalid config',
            issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          });
        }
        globalMathState.config = {
          ...globalMathState.config,
          ...parsed.data,
        };
        return res.status(200).json({
          success: true,
          state: globalMathState,
        });
      }

      default:
        return res.status(404).json({
          success: false,
          error: `unknown math action: ${action}`,
        });
    }
  } catch (err: any) {
    return serverError(res, err, `math:${action}`);
  }
}
