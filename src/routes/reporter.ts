/**
 * reporter.ts — the Self Reporter API (extracted from the `server.ts` monolith).
 *
 * The reporter's state collection (registry/dream/learner snapshots) and the
 * article store stay in the host; this router depends only on injected
 * operations. `narrate` is deliberately explicit about its three outcomes
 * (not-found / model unavailable / ok) so the model offline path is never
 * dressed up as success.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';

export type NarrateResult =
  | { kind: 'not_found' }
  | { kind: 'unavailable'; payload: Record<string, unknown> }
  | { kind: 'ok'; article: unknown };

export interface ReporterRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Resolved lazily so the host may declare the cadence after the mount. */
  cadenceMs(): number;
  status(): Record<string, unknown>;
  voices(): unknown[];
  formats(): unknown[];
  protocolsCount(): number;
  soulLoaded(): boolean;
  preview(voiceId?: string, format?: string): Promise<unknown>;
  latest(): unknown;
  articles(limit: number): unknown;
  article(fingerprint: string): unknown | undefined;
  generate(opts: { force: boolean; voiceId?: string; format?: string }): Promise<unknown>;
  narrate(fingerprint: string): Promise<NarrateResult>;
}

export function createReporterRouter(deps: ReporterRouterDeps): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({
      success: true,
      ...deps.status(),
      cadenceMs: deps.cadenceMs(),
      voices: deps.voices(),
      formats: deps.formats(),
      soulLoaded: deps.soulLoaded(),
    });
  });

  router.get('/voices', (_req, res) => {
    res.json({ success: true, voices: deps.voices(), formats: deps.formats(), protocols: deps.protocolsCount(), soulLoaded: deps.soulLoaded() });
  });

  router.get('/preview', async (req, res) => {
    try {
      const voiceId = typeof req.query.voice === 'string' ? req.query.voice : undefined;
      const format = typeof req.query.format === 'string' ? req.query.format : undefined;
      const article = await deps.preview(voiceId, format);
      res.json({ success: true, preview: true, article });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'preview failed' });
    }
  });

  router.get('/latest', (_req, res) => {
    const article = deps.latest();
    res.json({ success: true, available: Boolean(article), article });
  });

  router.get('/articles', (req, res) => {
    const limit = Number(req.query.limit);
    res.json({ success: true, articles: deps.articles(Number.isFinite(limit) && limit > 0 ? limit : 20) });
  });

  router.get('/article/:fingerprint', (req, res) => {
    const article = deps.article(req.params.fingerprint);
    if (!article) return res.status(404).json({ success: false, error: 'article not found' });
    res.json({ success: true, article });
  });

  router.post('/generate', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const body = (req.body ?? {}) as { force?: unknown; voice?: unknown; format?: unknown };
      const result = await deps.generate({
        force: Boolean(body.force),
        voiceId: typeof body.voice === 'string' ? body.voice : undefined,
        format: typeof body.format === 'string' ? body.format : undefined,
      });
      res.json({ success: true, ...(result as Record<string, unknown>) });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'self-report generation failed' });
    }
  });

  router.post('/narrate', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const body = (req.body ?? {}) as { fingerprint?: unknown };
      const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';
      const result = await deps.narrate(fingerprint);
      if (result.kind === 'not_found') {
        return res.status(404).json({ success: false, available: false, error: 'no article to narrate' });
      }
      if (result.kind === 'unavailable') {
        return res.status(503).json({ success: false, available: false, ...result.payload });
      }
      res.json({ success: true, available: true, article: result.article });
    } catch (err: unknown) {
      res.status(500).json({ success: false, available: false, error: err instanceof Error ? err.message : 'narration failed' });
    }
  });

  return router;
}
