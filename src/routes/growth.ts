/**
 * growth.ts — the operator + public router for the growth channels.
 *
 * CRM management, outbound planning/sending (dry-run by default), the public
 * one-click unsubscribe, the SEO/ads planners and the public lead-capture form.
 * Operator writes sit behind the shared mutation secret; the lead form and
 * unsubscribe are public by design.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  DEFAULT_TEMPLATES,
  LEAD_FIELDS,
  buildAdPlan,
  buildSeoPlan,
  leadToContactInput,
  normalizeLead,
  planOutbound,
  sendOutbound,
  verifyUnsubscribeToken,
  type CrmStore,
  type EmailTemplate,
  type OutboundProvider,
  type Outbox,
  type SuppressionStore,
} from '../lib/growth/index.js';
import type { BusinessProfileT } from '../autopilot/businessProfile.js';

export interface GrowthRouterDeps {
  crm: CrmStore;
  suppression: SuppressionStore;
  outbox: Outbox;
  requireMutationAuth: (req: Request, res: Response) => boolean;
  provider?: OutboundProvider | null;
  getProfile?: () => BusinessProfileT | null;
}

function unsubscribeBaseUrl(req: Request): string {
  const base = (process.env.RECOURSE_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/api/recourse/growth/outbound/unsubscribe`;
}

function pickTemplate(id: unknown): EmailTemplate {
  return DEFAULT_TEMPLATES.find((t) => t.id === String(id)) ?? DEFAULT_TEMPLATES[0];
}

export function createGrowthRouter(deps: GrowthRouterDeps): Router {
  const router = Router();

  // --- CRM ----------------------------------------------------------------
  router.get('/crm/contacts', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const filter = {
      stage: typeof req.query.stage === 'string' ? (req.query.stage as any) : undefined,
      tag: typeof req.query.tag === 'string' ? req.query.tag : undefined,
      consent: req.query.consent === undefined ? undefined : req.query.consent === 'true',
      query: typeof req.query.q === 'string' ? req.query.q : undefined,
    };
    res.json({ success: true, contacts: deps.crm.list(filter) });
  });

  router.get('/crm/metrics', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({ success: true, metrics: deps.crm.metrics() });
  });

  router.post('/crm/contacts', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const result = deps.crm.upsert(req.body ?? {});
      res.status(result.created ? 201 : 200).json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/crm/contacts/:id/stage', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const contact = deps.crm.setStage(req.params.id, req.body?.stage);
    if (!contact) { res.status(404).json({ success: false, error: 'contact not found' }); return; }
    res.json({ success: true, contact });
  });

  router.post('/crm/contacts/:id/consent', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const marketing = req.body?.marketing === true;
    const contact = deps.crm.setConsent(req.params.id, marketing, String(req.body?.source ?? 'operator'));
    if (!contact) { res.status(404).json({ success: false, error: 'contact not found' }); return; }
    res.json({ success: true, contact });
  });

  router.post('/crm/contacts/:id/note', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const text = String(req.body?.text ?? '').trim();
    if (!text) { res.status(400).json({ success: false, error: 'text is required' }); return; }
    const contact = deps.crm.recordNote(req.params.id, text);
    if (!contact) { res.status(404).json({ success: false, error: 'contact not found' }); return; }
    res.json({ success: true, contact });
  });

  // --- Suppression --------------------------------------------------------
  router.get('/suppression', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({ success: true, entries: deps.suppression.list() });
  });

  router.post('/suppression', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const entry = deps.suppression.add(String(req.body?.email ?? ''), String(req.body?.reason ?? 'manual'));
    if (!entry) { res.status(400).json({ success: false, error: 'valid email is required' }); return; }
    res.status(201).json({ success: true, entry });
  });

  router.delete('/suppression/:email', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({ success: true, removed: deps.suppression.remove(req.params.email) });
  });

  // --- Outbound -----------------------------------------------------------
  const buildPlan = (req: Request) => {
    const body = req.body ?? {};
    const template = pickTemplate(body.templateId);
    const contacts = body.stage ? deps.crm.list({ stage: body.stage }) : deps.crm.list();
    return planOutbound({
      contacts,
      suppression: deps.suppression,
      template,
      from: String(body.from ?? 'growth@localhost'),
      senderName: body.senderName ? String(body.senderName) : undefined,
      offering: body.offering ? String(body.offering) : undefined,
      unsubscribeBaseUrl: String(body.unsubscribeBaseUrl || unsubscribeBaseUrl(req)),
      dailyLimit: body.dailyLimit === undefined ? undefined : Number(body.dailyLimit),
      sentToday: Number(body.sentToday) || 0,
    });
  };

  router.post('/outbound/plan', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const plan = buildPlan(req);
      res.json({
        success: true,
        from: plan.from,
        templateId: plan.templateId,
        eligible: plan.messages.length,
        skipped: plan.skipped,
        messages: plan.messages,
      });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/outbound/send', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const plan = buildPlan(req);
      const dryRun = req.body?.dryRun !== false || !deps.provider;
      const result = await sendOutbound(plan, { outbox: deps.outbox, provider: deps.provider, dryRun });
      res.json({ success: true, dryRun, eligible: plan.messages.length, skipped: plan.skipped, ...result });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get('/outbound/outbox', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    res.json({ success: true, outbox: deps.outbox.list(limit) });
  });

  // Public, token-authenticated one-click unsubscribe.
  router.post('/outbound/unsubscribe', (req, res) => {
    const token = String(req.body?.token ?? req.query.token ?? '');
    const email = verifyUnsubscribeToken(token);
    if (!email) { res.status(400).json({ success: false, error: 'invalid or expired unsubscribe token' }); return; }
    deps.suppression.add(email, 'unsubscribe');
    const contact = deps.crm.findByEmail(email);
    if (contact) deps.crm.setConsent(contact.id, false, 'unsubscribe');
    res.json({ success: true, email, unsubscribed: true });
  });

  router.get('/outbound/unsubscribe', (req, res) => {
    const token = String(req.query.token ?? '');
    const email = verifyUnsubscribeToken(token);
    if (!email) { res.status(400).json({ success: false, error: 'invalid or expired unsubscribe token' }); return; }
    deps.suppression.add(email, 'unsubscribe');
    const contact = deps.crm.findByEmail(email);
    if (contact) deps.crm.setConsent(contact.id, false, 'unsubscribe');
    res.json({ success: true, email, unsubscribed: true });
  });

  // --- SEO / ads ----------------------------------------------------------
  router.get('/seo/plan', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const profile = deps.getProfile?.();
    if (!profile) { res.status(503).json({ success: false, error: 'no business profile available' }); return; }
    res.json({ success: true, plan: buildSeoPlan(profile) });
  });

  router.post('/ads/plan', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const result = buildAdPlan(req.body ?? {});
    if (!result.ok) { res.status(400).json({ success: false, errors: result.errors }); return; }
    res.json({ success: true, plan: result.plan });
  });

  // --- Public lead capture ------------------------------------------------
  router.get('/leads/fields', (_req, res) => {
    res.json({ success: true, fields: LEAD_FIELDS });
  });

  router.post('/leads', (req, res) => {
    const normalized = normalizeLead(req.body ?? {});
    if (normalized.bot) {
      // Do not reveal the honeypot; behave like a silent success.
      res.json({ success: true, stored: false });
      return;
    }
    if (!normalized.ok || !normalized.lead) {
      res.status(400).json({ success: false, errors: normalized.errors });
      return;
    }
    try {
      const { contact, created } = deps.crm.upsert(leadToContactInput(normalized.lead));
      res.status(created ? 201 : 200).json({ success: true, stored: true, contactId: contact.id });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // --- Combined metrics ---------------------------------------------------
  router.get('/metrics', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({
      success: true,
      crm: deps.crm.metrics(),
      suppression: deps.suppression.list().length,
      outbox: deps.outbox.list(500).length,
    });
  });

  return router;
}
