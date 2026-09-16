import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  openCrmStore,
  computeLeadScore,
  openSuppressionStore,
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  DEFAULT_TEMPLATES,
  renderEmail,
  planOutbound,
  sendOutbound,
  openOutbox,
  deriveKeywords,
  buildSeoPlan,
  renderSitemap,
  renderPageMeta,
  validateAdPlan,
  allocateBudget,
  buildAdPlan,
  normalizeLead,
  leadToContactInput,
  type Contact,
} from '../src/lib/growth/index';
import type { BusinessProfileT } from '../src/autopilot/businessProfile';
import { createGrowthRouter } from '../src/routes/growth';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-growth-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  delete process.env.RECOURSE_API_SECRET;
  delete process.env.RECOURSE_UNSUBSCRIBE_SECRET;
});

function contact(email: string, consent = true): Contact {
  return {
    id: `ct_${email}`,
    email,
    stage: 'lead',
    consent: { marketing: consent, source: 'test', at: 1 },
    tags: [],
    score: 0,
    createdAt: 1,
    updatedAt: 1,
    notes: [],
  };
}

describe('crm', () => {
  it('dedupes by email, tracks consent/stage/notes and scores', () => {
    const crm = openCrmStore(path.join(freshDir(), 'crm.json'));
    const a = crm.upsert({ email: 'A@Example.com', name: 'A', marketingConsent: true, consentSource: 'form' });
    expect(a.created).toBe(true);
    expect(a.contact.email).toBe('a@example.com');
    const b = crm.upsert({ email: 'a@example.com', company: 'Acme' });
    expect(b.created).toBe(false);
    expect(crm.list()).toHaveLength(1);
    expect(crm.get(a.contact.id)!.company).toBe('Acme');

    crm.setStage(a.contact.id, 'qualified');
    crm.recordNote(a.contact.id, 'had a call');
    crm.recordContact(a.contact.id, 99);
    const updated = crm.get(a.contact.id)!;
    expect(updated.stage).toBe('qualified');
    expect(updated.lastContactedAt).toBe(99);
    expect(updated.score).toBe(computeLeadScore(updated));

    expect(() => crm.upsert({ email: 'not-an-email' })).toThrow(/invalid email/);
    const metrics = crm.metrics();
    expect(metrics.total).toBe(1);
    expect(metrics.consented).toBe(1);
  });

  it('updates consent to false and filters', () => {
    const crm = openCrmStore(path.join(freshDir(), 'crm.json'));
    const { contact: c } = crm.upsert({ email: 'x@y.com', marketingConsent: true });
    crm.setConsent(c.id, false, 'unsubscribe');
    expect(crm.list({ consent: false })).toHaveLength(1);
    expect(crm.list({ consent: true })).toHaveLength(0);
  });
});

describe('outbound compliance', () => {
  it('signs and verifies unsubscribe tokens', () => {
    const token = buildUnsubscribeToken('a@b.com', 'secret');
    expect(verifyUnsubscribeToken(token, 'secret')).toBe('a@b.com');
    expect(verifyUnsubscribeToken(token + 'x', 'secret')).toBeNull();
    expect(verifyUnsubscribeToken(token, 'other')).toBeNull();
    expect(() => buildUnsubscribeToken('a@b.com', '')).toThrow(/secret/);
  });

  it('renders templates and plans only consenting, unsuppressed contacts', () => {
    const suppression = openSuppressionStore(path.join(freshDir(), 'supp.json'));
    suppression.add('suppressed@x.com', 'bounce');
    const contacts = [contact('ok@x.com'), contact('noconsent@x.com', false), contact('suppressed@x.com'), contact('ok@x.com')];
    const plan = planOutbound({
      contacts,
      suppression,
      template: DEFAULT_TEMPLATES[0],
      from: 'growth@x.com',
      senderName: 'A',
      offering: 'a thing',
      unsubscribeBaseUrl: 'https://x.com/unsub',
      secret: 'secret',
      dailyLimit: 10,
    });
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].to).toBe('ok@x.com');
    expect(plan.messages[0].body).toContain('https://x.com/unsub?token=');
    expect(plan.skipped.find((s) => s.email === 'noconsent@x.com')!.reason).toMatch(/consent/);
    expect(plan.skipped.find((s) => s.email === 'suppressed@x.com')!.reason).toMatch(/suppressed/);
    expect(plan.skipped.filter((s) => s.email === 'ok@x.com')).toHaveLength(1); // duplicate
  });

  it('enforces the daily limit and a configured secret', () => {
    const suppression = openSuppressionStore(path.join(freshDir(), 'supp.json'));
    const limitPlan = planOutbound({
      contacts: [contact('a@x.com'), contact('b@x.com')],
      suppression,
      template: DEFAULT_TEMPLATES[1],
      from: 'g@x.com',
      unsubscribeBaseUrl: 'https://x.com/u',
      secret: 'secret',
      dailyLimit: 1,
      sentToday: 1,
    });
    expect(limitPlan.messages).toHaveLength(0);
    expect(limitPlan.skipped[0].reason).toMatch(/daily limit/);

    const noSecret = planOutbound({
      contacts: [contact('a@x.com')],
      suppression,
      template: DEFAULT_TEMPLATES[1],
      from: 'g@x.com',
      unsubscribeBaseUrl: 'https://x.com/u',
      secret: '',
    });
    expect(noSecret.messages).toHaveLength(0);
    expect(noSecret.skipped[0].reason).toMatch(/unsubscribe secret/);
  });

  it('renders template variables and dry-runs into the outbox', async () => {
    expect(renderEmail({ id: 't', subject: 'Hi {{name}}', body: '{{missing}}' }, { name: 'Sam' })).toEqual({ subject: 'Hi Sam', body: '' });
    const outbox = openOutbox(path.join(freshDir(), 'outbox.jsonl'));
    const plan = planOutbound({
      contacts: [contact('a@x.com')],
      suppression: openSuppressionStore(path.join(freshDir(), 's.json')),
      template: DEFAULT_TEMPLATES[0],
      from: 'g@x.com',
      unsubscribeBaseUrl: 'https://x.com/u',
      secret: 'secret',
    });
    const dry = await sendOutbound(plan, { outbox, dryRun: true });
    expect(dry.queued).toBe(1);
    expect(dry.sent).toBe(0);
    expect(outbox.list()[0].status).toBe('queued');

    const provider = { send: vi.fn(async () => ({ ok: true, id: 'p1' })) };
    const live = await sendOutbound(plan, { outbox, dryRun: false, provider });
    expect(live.sent).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);

    const failing = { send: vi.fn(async () => ({ ok: false, error: 'nope' })) };
    const fail = await sendOutbound(plan, { outbox, dryRun: false, provider: failing });
    expect(fail.failed).toBe(1);
  });
});

describe('seo planning', () => {
  const profile: BusinessProfileT = {
    business: { name: 'Acme Analytics', tagline: 'Insight for teams', industry: 'analytics', website: '', stage: 'idea' },
    customer: { icp: 'data teams', segments: [{ name: 'Data Teams', pain: 'slow reporting' }], buyingTrigger: 't', topObjections: [] },
    offering: { summary: 'fast dashboards for data teams', pricing: '$', model: 'free', differentiators: ['real-time', 'cheap'] },
    gaps: ['Add a landing page', 'Publish case studies'],
  } as BusinessProfileT;

  it('derives keywords and builds a plan with honest notes', () => {
    const keywords = deriveKeywords(profile);
    expect(keywords).toContain('teams');
    const plan = buildSeoPlan(profile);
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(plan.briefs).toHaveLength(2);
    expect(plan.honestyNotes.join(' ')).toMatch(/No search-volume/);
    expect(renderSitemap(plan.pages, 'https://acme.test')).toContain('<loc>https://acme.test/');
    expect(renderPageMeta(plan.pages[0])).toContain('<title>');
  });
});

describe('ads planning', () => {
  it('validates and allocates a budget exactly', () => {
    expect(validateAdPlan({}).ok).toBe(false);
    const plan = buildAdPlan({
      objective: 'demos',
      dailyBudgetCents: 1001,
      days: 10,
      channels: ['search', 'social', 'display'],
      audience: 'data teams',
      landingUrl: 'https://acme.test',
    });
    expect(plan.ok).toBe(true);
    const sum = plan.plan!.allocations.reduce((n, a) => n + a.dailyBudgetCents, 0);
    expect(sum).toBe(1001);
    expect(plan.plan!.totalBudgetCents).toBe(10010);
    expect(plan.plan!.live).toBe(false);
    expect(plan.plan!.honestyNotes.join(' ')).toMatch(/no ad network/i);
    expect(allocateBudget(100, ['search', 'social', 'display'])).toEqual([
      { channel: 'search', dailyBudgetCents: 34 },
      { channel: 'social', dailyBudgetCents: 33 },
      { channel: 'display', dailyBudgetCents: 33 },
    ]);
  });
});

describe('lead capture', () => {
  it('normalizes a valid lead and maps it to a contact', () => {
    const r = normalizeLead({ email: 'Lead@X.com', name: 'L', consent: true, message: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.lead!.email).toBe('lead@x.com');
    const input = leadToContactInput(r.lead!);
    expect(input.marketingConsent).toBe(true);
    expect(input.stage).toBe('lead');
  });

  it('requires consent and trips the honeypot', () => {
    expect(normalizeLead({ email: 'a@b.com' }).errors[0]).toMatch(/consent/);
    const bot = normalizeLead({ email: 'a@b.com', consent: true, website: 'http://spam' });
    expect(bot.bot).toBe(true);
    expect(bot.ok).toBe(false);
  });
});

describe('growth router', () => {
  async function setup() {
    process.env.RECOURSE_API_SECRET = 's';
    process.env.RECOURSE_UNSUBSCRIBE_SECRET = 'unsub-secret';
    const dir = freshDir();
    const crm = openCrmStore(path.join(dir, 'crm.json'));
    const suppression = openSuppressionStore(path.join(dir, 'supp.json'));
    const outbox = openOutbox(path.join(dir, 'outbox.jsonl'));
    const guard = (req: Request, res: Response) => {
      if (req.headers['x-secret'] === 's') return true;
      res.status(401).json({ success: false, error: 'unauthorized' });
      return false;
    };
    const router = createGrowthRouter({ crm, suppression, outbox, requireMutationAuth: guard });
    const app = express();
    app.use(express.json());
    app.use('/api/recourse/growth', router);
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    return { base, crm, suppression };
  }

  it('captures a public lead and unsubscribes by token', async () => {
    const { base, crm, suppression } = await setup();
    const lead = await fetch(`${base}/api/recourse/growth/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lead@x.com', consent: true, interest: 'demo' }),
    });
    expect(lead.status).toBe(201);
    expect(crm.findByEmail('lead@x.com')).toBeTruthy();

    const token = buildUnsubscribeToken('lead@x.com', 'unsub-secret');
    const unsub = await fetch(`${base}/api/recourse/growth/outbound/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(unsub.status).toBe(200);
    expect(suppression.isSuppressed('lead@x.com')).toBe(true);
    expect(crm.findByEmail('lead@x.com')!.consent.marketing).toBe(false);

    const bad = await fetch(`${base}/api/recourse/growth/outbound/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'bad' }),
    });
    expect(bad.status).toBe(400);
  });

  it('rejects a consent-less lead and guards operator reads', async () => {
    const { base } = await setup();
    const bad = await fetch(`${base}/api/recourse/growth/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.com' }),
    });
    expect(bad.status).toBe(400);

    expect((await fetch(`${base}/api/recourse/growth/crm/contacts`)).status).toBe(401);
    const ok = await fetch(`${base}/api/recourse/growth/crm/contacts`, { headers: { 'x-secret': 's' } });
    expect(ok.status).toBe(200);
  });
});
