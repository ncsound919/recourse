// api/recourse/math/[action].ts — Vercel serverless route backing the Five-Formula Recursive Learning Loop
// Endpoint contract:
//   GET  /api/recourse/math/state     -> { success: true, state: RecursiveLoopState }
//   POST /api/recourse/math/step      -> { success: true, result: RecursiveIterationResult, state: RecursiveLoopState }
//   POST /api/recourse/math/reset     -> { success: true, state: RecursiveLoopState }
//   POST /api/recourse/math/configure -> { success: true, state: RecursiveLoopState }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createInitialLoopState,
  executeRecursiveStep,
  DEFAULT_LOOP_CONFIG,
} from '../../../src/lib/recursiveMathEngine';
import type { RecursiveLoopState } from '../../../src/types';

let globalMathState: RecursiveLoopState = createInitialLoopState();

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse | void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

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
        if (config && typeof config === 'object') {
          globalMathState.config = {
            ...globalMathState.config,
            ...config,
          };
        }
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
    console.error(`[math:${action}]`, err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Recursive math engine error',
    });
  }
}
