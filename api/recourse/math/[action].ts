// api/recourse/math/[action].ts — Vercel serverless route backing the Five-Formula Recursive Learning Loop
// Endpoint contract:
//   GET  /api/recourse/math/state     -> { success: true, state: RecursiveLoopState }
//   POST /api/recourse/math/step      -> { success: true, result: RecursiveIterationResult, state: RecursiveLoopState }
//   POST /api/recourse/math/reset     -> { success: true, state: RecursiveLoopState }
//   POST /api/recourse/math/configure -> { success: true, state: RecursiveLoopState }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  createInitialLoopState,
  executeRecursiveStep,
  DEFAULT_LOOP_CONFIG,
} from '../../../src/lib/recursiveMathEngine';
import type { RecursiveLoopState } from '../../../src/types';
import { AsyncMutex } from '../../../src/lib/asyncMutex';
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

// State is serialized per warm instance and persisted best-effort to a durable
// file so a cold start does not silently reset the loop. Point
// RECOURSE_MATH_STATE_FILE at shared storage (e.g. a mounted volume) to share
// state across serverless instances; the default is instance-local.
const MATH_STATE_FILE = process.env.RECOURSE_MATH_STATE_FILE || path.join(os.tmpdir(), 'recourse-math-state.json');
const mutex = new AsyncMutex();

function loadMathState(): RecursiveLoopState {
  try {
    const raw = fs.readFileSync(MATH_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.config) return parsed as RecursiveLoopState;
  } catch {
    /* first run or unreadable — fall through */
  }
  return createInitialLoopState();
}

function saveMathState(state: RecursiveLoopState): void {
  try {
    const tmp = `${MATH_STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf-8');
    fs.renameSync(tmp, MATH_STATE_FILE);
  } catch {
    /* read-only fs: keep the in-memory copy for this warm instance */
  }
}

let globalMathState: RecursiveLoopState = loadMathState();

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse | void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (!requireMutationAuth(req, res)) return;

  try {
    return await mutex.runExclusive(async () => {
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
        saveMathState(globalMathState);
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
        saveMathState(globalMathState);
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
        saveMathState(globalMathState);
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
    });
  } catch (err: any) {
    return serverError(res, err, `math:${action}`);
  }
}
