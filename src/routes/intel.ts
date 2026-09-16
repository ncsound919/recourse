/**
 * intel.ts — the external-intel API (extracted from the `server.ts` monolith).
 *
 * The intel state (proposals, the dynamic forge agenda) and the source-pull /
 * rank logic stay in the host; this router depends only on injected operations.
 * Adoption is the one gated path: an invented idea becomes buildable ONLY when
 * the caller supplies a real, testable reference suite — the host enforces that
 * and this router just maps the outcome to a status code.
 */
import { Router } from 'express';

export type AdoptOutcome =
  | { ok: true; spec: unknown }
  | { ok: false; status: number; error: string };

export interface IntelRouterDeps {
  view(): Promise<unknown>;
  pull(): Promise<{ added: number; detail: string }>;
  rank(): Promise<{ ranked: number; strategyUsed: boolean }>;
  /** Snapshot of proposals for the adopt response (sync). */
  snapshot(): unknown;
  adopt(input: Record<string, unknown>): AdoptOutcome;
}

export function createIntelRouter(deps: IntelRouterDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try { res.json({ success: true, intel: await deps.view() }); }
    catch (err: any) { res.status(500).json({ success: false, error: err?.message ?? String(err) }); }
  });

  router.post('/pull', async (_req, res) => {
    try {
      const r = await deps.pull();
      res.json({ success: true, ...r, intel: await deps.view() });
    } catch (err: any) { res.status(500).json({ success: false, error: err?.message ?? String(err) }); }
  });

  router.post('/rank', async (_req, res) => {
    try {
      const r = await deps.rank();
      res.json({ success: true, ...r, intel: await deps.view() });
    } catch (err: any) { res.status(500).json({ success: false, error: err?.message ?? String(err) }); }
  });

  router.post('/adopt', (req, res) => {
    try {
      const outcome = deps.adopt((req.body ?? {}) as Record<string, unknown>);
      if ('error' in outcome) return res.status(outcome.status).json({ success: false, error: outcome.error });
      res.json({ success: true, spec: outcome.spec, intel: deps.snapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  return router;
}
