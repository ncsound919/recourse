/**
 * math.ts — recursive-math conductor routes extracted from `server.ts`:
 * GET /math/state, POST /math/step|reset|configure, GET /math/problems|
 * attempts|goals, ALL /math/solve.
 *
 * The loop engine, hard-problem catalog, and goal ledger are pure lib imports.
 * Host-owned `mathLoopState` (reassigned by reset) is injected as get/set;
 * the solver (a hoisted host function) and provenance/save side effects are
 * injected as well.
 */
import { Router } from 'express';
import {
  createInitialLoopState,
  executeRecursiveStep,
  DEFAULT_LOOP_CONFIG,
} from '../lib/recursiveMathEngine.js';
import { HARD_MATH_PROBLEMS } from '../lib/hardMathProblems.js';
import type { ProblemTier } from '../lib/hardMathProblems.js';
import { getMathAttempts, getGoalProgress } from '../lib/goalLedger.js';
import type { MathAttempt } from '../lib/goalLedger.js';

export type MathLoopState = ReturnType<typeof createInitialLoopState>;

export interface MathRouterDeps {
  mathLoopStateRef(): MathLoopState;
  setMathLoopState(state: MathLoopState): void;
  solveNextMathProblem(): Promise<MathAttempt | { skipped: boolean; reason: string }>;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
}

export function createMathRouter(deps: MathRouterDeps): Router {
  const router = Router();

  router.get('/math/state', (req, res) => {
    res.json({
      success: true,
      state: deps.mathLoopStateRef()
    });
  });

  router.post('/math/step', (req, res) => {
    try {
      const result = executeRecursiveStep(deps.mathLoopStateRef());
      if (result.readinessScore > 0.95 && result.loopStatus === 'optimal') {
        deps.appendProvenance('system_tick', {
          type: 'recursive_math_convergence',
          iteration: result.iteration,
          readiness: result.readinessScore,
          lorentzGamma: result.energyBudget.lorentzFactorGamma
        });
        deps.saveState();
      }
      res.json({
        success: true,
        result,
        state: deps.mathLoopStateRef()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/math/reset', (req, res) => {
    try {
      deps.setMathLoopState(createInitialLoopState(deps.mathLoopStateRef().config || DEFAULT_LOOP_CONFIG));
      res.json({
        success: true,
        state: deps.mathLoopStateRef()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/math/configure', (req, res) => {
    try {
      const { config } = req.body ?? {};
      if (config && typeof config === 'object') {
        const state = deps.mathLoopStateRef();
        state.config = {
          ...state.config,
          ...config
        };
      }
      res.json({
        success: true,
        state: deps.mathLoopStateRef()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // MATH GOAL — hard problem tracking.
  router.get('/math/problems', (req, res) => {
    const tier = req.query.tier as ProblemTier | undefined;
    const problems = tier
      ? HARD_MATH_PROBLEMS.filter(p => p.tier === tier)
      : HARD_MATH_PROBLEMS;
    res.json({
      success: true,
      count: problems.length,
      total: HARD_MATH_PROBLEMS.length,
      problems: problems.map(p => ({
        id: p.id,
        tier: p.tier,
        title: p.title,
        statement: p.statement,
        toolName: p.toolName,
        bound: p.bound,
        citation: p.citation,
        successCriterion: p.successCriterion,
      })),
    });
  });

  router.get('/math/attempts', (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const attempts = getMathAttempts(limit);
    res.json({ success: true, attempts, total: attempts.length });
  });

  router.get('/math/goals', (req, res) => {
    const progress = getGoalProgress();
    const unsolved = HARD_MATH_PROBLEMS
      .filter(p => p.tier === 'solvable' || p.tier === 'bounded')
      .map(p => {
        const attempts = getMathAttempts(500).filter(a => a.problemId === p.id);
        const solved = attempts.some(a => a.passed);
        return { id: p.id, tier: p.tier, title: p.title, solved, attempts: attempts.length };
      });
    res.json({ success: true, progress, unsolved });
  });

  // Math solver REST endpoint — calls solveNextMathProblem. The handler only
  // invokes the solver at request time; registering it here (module top level,
  // before startServer) keeps it ahead of vite.middlewares in the stack.
  router.all('/math/solve', async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    try {
      const result = await deps.solveNextMathProblem();
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
