/**
 * ecosystem.ts — operator surface for the Wave 3 ecosystem primitives: the
 * signed skill registry, plugin manifests, and the connector registry.
 *
 * Mounted at `/api/recourse/ecosystem`. Reads are open; writes (publish,
 * revoke, register) require the mutation secret.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { openSkillRegistry, type SkillRegistry } from '../lib/skillRegistry';
import { validatePluginManifest, verifyManifestSignature, type PluginManifest } from '../lib/pluginSdk';
import { connectors as defaultConnectors, ConnectorRegistry } from '../lib/connectors/registry';
import { deliverWebhook } from '../lib/connectors/webhooks';

export interface EcosystemRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Injectable for tests; defaults to the durable registry. */
  skillRegistry?: SkillRegistry;
  /** Injectable for tests; defaults to the process connector registry. */
  connectors?: ConnectorRegistry;
  /** Secret used to sign test webhook deliveries (default RECOURSE_WEBHOOK_SECRET). */
  webhookSecret?: string;
}

export function createEcosystemRouter(deps: EcosystemRouterDeps): Router {
  const router = Router();
  const skills = deps.skillRegistry ?? openSkillRegistry();
  const connectors = deps.connectors ?? defaultConnectors;
  const webhookSecret = deps.webhookSecret ?? process.env.RECOURSE_WEBHOOK_SECRET;

  // --- Skills -------------------------------------------------------------
  router.get('/skills', (_req, res) => {
    res.json({ success: true, count: skills.list().length, skills: skills.list() });
  });

  router.get('/skills/:id', (req, res) => {
    const entry = skills.get(req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'not found' });
    res.json({ success: true, skill: entry, verification: skills.verify(req.params.id) });
  });

  router.get('/skills/:id/verify', (req, res) => {
    res.json({ success: true, ...skills.verify(req.params.id) });
  });

  router.post('/skills/publish', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const result = skills.publish({
      id: String(req.body?.id ?? ''),
      name: String(req.body?.name ?? ''),
      version: String(req.body?.version ?? ''),
      description: String(req.body?.description ?? ''),
      domain: req.body?.domain,
      toolName: req.body?.toolName,
      source: req.body?.source,
      license: req.body?.license,
      author: req.body?.author,
    });
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, signed: result.signed, skill: result.entry });
  });

  router.post('/skills/:id/revoke', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const result = skills.revoke(req.params.id);
    if (!result.ok) return res.status(404).json({ success: false, error: result.error });
    res.json({ success: true });
  });

  // --- Plugin manifests ---------------------------------------------------
  router.post('/plugins/validate', (req, res) => {
    const raw = req.body?.manifest ?? req.body?.text;
    if (raw === undefined) return res.status(400).json({ success: false, error: 'manifest (object or JSON text) is required' });
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch (e: any) { return res.status(400).json({ success: false, error: `invalid JSON: ${e.message}` }); }
    }
    const validation = validatePluginManifest(parsed);
    if ('errors' in validation) return res.json({ success: true, valid: false, errors: validation.errors });
    res.json({ success: true, valid: true, manifest: validation.manifest, signature: verifyManifestSignature(validation.manifest as PluginManifest) });
  });

  // --- Connectors ---------------------------------------------------------
  router.get('/connectors', async (_req, res) => {
    const list = connectors.list();
    const health = await Promise.all(list.map((c) => connectors.health(c.id)));
    res.json({ success: true, count: list.length, connectors: list, health });
  });

  router.post('/connectors', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      connectors.register(req.body);
      res.json({ success: true, connectors: connectors.list() });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get('/connectors/:id/health', async (req, res) => {
    res.json({ success: true, health: await connectors.health(req.params.id) });
  });

  // --- Webhook test delivery (guarded) ------------------------------------
  router.post('/webhooks/test', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const url = req.body?.url;
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ success: false, error: 'a valid http(s) url is required' });
    }
    const result = await deliverWebhook(url, req.body?.payload ?? { test: true }, {
      secret: webhookSecret,
      retries: 1,
    });
    res.status(result.ok ? 200 : 502).json({ success: result.ok, result });
  });

  return router;
}
