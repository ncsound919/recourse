/**
 * security.ts — the authorized-testing security surface (extracted from the
 * `server.ts` monolith, following the `create*Router()` pattern).
 *
 * These routes proxy the Z4nzu/hackingtool bridge (read-only catalog awareness +
 * goal→tool recommendations). The single executing path (a headless engagement)
 * is fail-closed: it requires the mutation secret, the engagement kill switch,
 * an explicit `authorized:true`, and a target inside the scope allowlist.
 *
 * The bridge is injectable so the router is testable without a hackingtool
 * checkout or a Python interpreter.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  hackingtoolHealth,
  hackingtoolCatalog,
  hackingtoolCategories,
  hackingtoolRecommend,
  hackingtoolScopeCheck,
  hackingtoolEngagement,
  hackingtoolEngageEnabled,
} from '../lib/hackingtoolBridge.js';

export interface SecurityBridge {
  health: typeof hackingtoolHealth;
  catalog: typeof hackingtoolCatalog;
  categories: typeof hackingtoolCategories;
  recommend: typeof hackingtoolRecommend;
  scopeCheck: typeof hackingtoolScopeCheck;
  engagement: typeof hackingtoolEngagement;
  engageEnabled: typeof hackingtoolEngageEnabled;
}

export interface SecurityRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  bridge?: SecurityBridge;
}

export function createSecurityRouter(deps: SecurityRouterDeps): Router {
  const router = Router();
  const b: SecurityBridge = deps.bridge ?? {
    health: hackingtoolHealth,
    catalog: hackingtoolCatalog,
    categories: hackingtoolCategories,
    recommend: hackingtoolRecommend,
    scopeCheck: hackingtoolScopeCheck,
    engagement: hackingtoolEngagement,
    engageEnabled: hackingtoolEngageEnabled,
  };

  router.get('/hackingtool/health', async (_req, res) => {
    try { res.json(await b.health()); }
    catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get('/hackingtool/catalog', async (req, res) => {
    try {
      const q = req.query;
      res.json(await b.catalog({
        category: typeof q.category === 'string' ? q.category : undefined,
        search: typeof q.search === 'string' ? q.search : undefined,
        includeOutOfScope: q.includeOutOfScope === 'true',
        limit: Number(q.limit) || undefined,
      }));
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get('/hackingtool/categories', async (req, res) => {
    try { res.json(await b.categories({ includeOutOfScope: req.query.includeOutOfScope === 'true' })); }
    catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get('/hackingtool/recommend', async (req, res) => {
    try {
      const goal = typeof req.query.goal === 'string' ? req.query.goal : '';
      if (!goal.trim()) return res.status(400).json({ ok: false, error: 'goal is required' });
      const limit = Number(req.query.limit) || undefined;
      res.json(await b.recommend(goal.trim(), { limit }));
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get('/hackingtool/scope-check', async (req, res) => {
    try {
      const target = typeof req.query.target === 'string' ? req.query.target : '';
      if (!target.trim()) return res.status(400).json({ ok: false, error: 'target is required' });
      res.json(await b.scopeCheck(target.trim()));
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // The only executing path. Fail-closed (see module header).
  router.post('/hackingtool/engagement', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const body = req.body ?? {};
      const targets = Array.isArray(body.targets) ? body.targets.map((t: unknown) => String(t)) : [];
      const result = await b.engagement({
        authorized: body.authorized === true,
        name: typeof body.name === 'string' ? body.name : undefined,
        targets,
        pipeline: typeof body.pipeline === 'string' ? body.pipeline : undefined,
        timeoutMs: Number(body.timeoutMs) || undefined,
      });
      const status = result.ok ? 200 : result.refused ? 403 : 503;
      res.status(status).json({ ...result, engageEnabled: b.engageEnabled() });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  });

  return router;
}
