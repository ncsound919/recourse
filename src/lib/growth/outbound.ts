/**
 * outbound.ts — compliant outbound email: consent-gated targeting, a durable
 * suppression list, signed one-click unsubscribe, per-day rate limiting, and a
 * dry-run-by-default send path.
 *
 * Compliance is structural, not optional: a message is only planned when the
 * contact has marketing consent, is not suppressed, and a valid unsubscribe URL
 * can be generated. There is no "send anyway" flag. Without a configured
 * provider, `sendOutbound` persists queued messages to the outbox and reports
 * zero sent — it never claims an email left the building.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../durableJson.js';
import type { Contact } from './crm.js';
import { normalizeEmail } from './crm.js';

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

export interface SuppressionEntry {
  email: string;
  reason: string;
  at: number;
}

export function suppressionFile(): string {
  return process.env.RECOURSE_SUPPRESSION_FILE || path.join(process.cwd(), 'data', 'growth', 'suppression.json');
}

interface SuppressionDoc {
  version: 1;
  entries: SuppressionEntry[];
}

export interface SuppressionStore {
  file(): string;
  list(): SuppressionEntry[];
  add(email: string, reason?: string, at?: number): SuppressionEntry | null;
  isSuppressed(email: string): boolean;
  remove(email: string): boolean;
}

export function openSuppressionStore(file = suppressionFile()): SuppressionStore {
  const load = (): SuppressionDoc => {
    const doc = readJsonFile<SuppressionDoc>(file, { version: 1, entries: [] });
    if (!doc || !Array.isArray(doc.entries)) return { version: 1, entries: [] };
    return { version: 1, entries: doc.entries };
  };
  return {
    file: () => file,
    list: () => load().entries.slice().sort((a, b) => b.at - a.at),
    add(email, reason = 'manual', at = Date.now()) {
      const e = normalizeEmail(email);
      if (!e) return null;
      const doc = load();
      if (doc.entries.some((x) => x.email === e)) return doc.entries.find((x) => x.email === e)!;
      const entry: SuppressionEntry = { email: e, reason, at };
      doc.entries.push(entry);
      writeJsonFile(file, doc);
      return entry;
    },
    isSuppressed: (email) => {
      const e = normalizeEmail(email);
      return e ? load().entries.some((x) => x.email === e) : false;
    },
    remove(email) {
      const e = normalizeEmail(email);
      if (!e) return false;
      const doc = load();
      const before = doc.entries.length;
      doc.entries = doc.entries.filter((x) => x.email !== e);
      if (doc.entries.length === before) return false;
      writeJsonFile(file, doc);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Unsubscribe tokens
// ---------------------------------------------------------------------------

export function unsubscribeSecret(): string {
  return (process.env.RECOURSE_UNSUBSCRIBE_SECRET || process.env.RECOURSE_API_SECRET || '').trim();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function hmac(email: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(email, 'utf-8').digest()).slice(0, 32);
}

/** `<email>.<sig>` — opaque, verifiable, contains no secret. */
export function buildUnsubscribeToken(email: string, secret = unsubscribeSecret()): string {
  const e = normalizeEmail(email);
  if (!e) throw new Error(`invalid email: ${email}`);
  if (!secret) throw new Error('unsubscribe secret not configured');
  return `${b64url(Buffer.from(e, 'utf-8'))}.${hmac(e, secret)}`;
}

/** Returns the email for a valid token, else null. */
export function verifyUnsubscribeToken(token: string, secret = unsubscribeSecret()): string | null {
  if (!secret) return null;
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return null;
  }
  const expected = hmac(email, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return normalizeEmail(email);
}

// ---------------------------------------------------------------------------
// Templates + rendering
// ---------------------------------------------------------------------------

export interface EmailTemplate {
  id: string;
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'intro',
    subject: 'Quick question about {{company}}',
    body: [
      'Hi {{name}},',
      '',
      'I build {{offering}} — I noticed {{company}} and thought it might be relevant.',
      '',
      'Would a short call be useful? If not, no worries at all.',
      '',
      '— {{sender}}',
      '',
      'Unsubscribe: {{unsubscribe_url}}',
    ].join('\n'),
  },
  {
    id: 'followup',
    subject: 'Following up — {{company}}',
    body: [
      'Hi {{name}},',
      '',
      'Just following up on my previous note. Happy to send details if useful.',
      '',
      '— {{sender}}',
      '',
      'Unsubscribe: {{unsubscribe_url}}',
    ].join('\n'),
  },
];

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function renderEmail(template: EmailTemplate, vars: Record<string, string>): { subject: string; body: string } {
  return { subject: fill(template.subject, vars), body: fill(template.body, vars) };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface OutboundMessage {
  to: string;
  toName?: string;
  from: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
  templateId: string;
}

export interface SkippedContact {
  email: string;
  reason: string;
}

export interface OutboundPlan {
  from: string;
  templateId: string;
  messages: OutboundMessage[];
  skipped: SkippedContact[];
}

export interface PlanOutboundOptions {
  contacts: Contact[];
  suppression: SuppressionStore;
  template: EmailTemplate;
  from: string;
  senderName?: string;
  offering?: string;
  unsubscribeBaseUrl: string;
  dailyLimit?: number;
  sentToday?: number;
  secret?: string;
}

/** Build a compliant send plan; every exclusion carries a reason. */
export function planOutbound(opts: PlanOutboundOptions): OutboundPlan {
  const secret = opts.secret ?? unsubscribeSecret();
  const dailyLimit = opts.dailyLimit ?? Number(process.env.RECOURSE_OUTBOUND_DAILY_LIMIT || 200);
  let remaining = Math.max(0, dailyLimit - (opts.sentToday ?? 0));
  const messages: OutboundMessage[] = [];
  const skipped: SkippedContact[] = [];
  const seen = new Set<string>();

  for (const contact of opts.contacts) {
    const email = normalizeEmail(contact.email);
    if (!email) { skipped.push({ email: String(contact.email), reason: 'invalid email' }); continue; }
    if (seen.has(email)) { skipped.push({ email, reason: 'duplicate in batch' }); continue; }
    seen.add(email);
    if (!contact.consent.marketing) { skipped.push({ email, reason: 'no marketing consent' }); continue; }
    if (opts.suppression.isSuppressed(email)) { skipped.push({ email, reason: 'suppressed' }); continue; }
    if (!secret) { skipped.push({ email, reason: 'unsubscribe secret not configured' }); continue; }
    if (remaining <= 0) { skipped.push({ email, reason: `daily limit ${dailyLimit} reached` }); continue; }

    const unsubscribeUrl = `${opts.unsubscribeBaseUrl.replace(/\/$/, '')}?token=${encodeURIComponent(buildUnsubscribeToken(email, secret))}`;
    const { subject, body } = renderEmail(opts.template, {
      name: contact.name || 'there',
      company: contact.company || 'your team',
      offering: opts.offering || '',
      sender: opts.senderName || opts.from,
      unsubscribe_url: unsubscribeUrl,
    });
    messages.push({
      to: email,
      toName: contact.name,
      from: opts.from,
      subject,
      body,
      unsubscribeUrl,
      templateId: opts.template.id,
    });
    remaining -= 1;
  }

  return { from: opts.from, templateId: opts.template.id, messages, skipped };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type FetchLike = typeof fetch;

export interface OutboundProvider {
  send(message: OutboundMessage): Promise<{ ok: boolean; id?: string; error?: string }>;
}

/** A provider that POSTs each message to a configured HTTP endpoint. */
export function createWebhookProvider(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; fetchImpl?: FetchLike } = {},
): OutboundProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async send(message) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...opts.headers },
          body: JSON.stringify(message),
          signal: controller.signal,
        });
        const text = await res.text().catch(() => '');
        if (!res.ok) return { ok: false, error: `provider HTTP ${res.status}: ${text.slice(0, 200)}` };
        let id: string | undefined;
        try { id = JSON.parse(text)?.id; } catch { id = undefined; }
        return { ok: true, id };
      } catch (e: any) {
        return { ok: false, error: e?.name === 'AbortError' ? 'provider timed out' : e?.message || 'provider failed' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface OutboxRecord {
  id: string;
  to: string;
  subject: string;
  templateId: string;
  status: 'queued' | 'sent' | 'failed';
  at: number;
  providerId?: string;
  error?: string;
}

export function outboxFile(): string {
  return process.env.RECOURSE_OUTBOX_FILE || path.join(process.cwd(), 'data', 'growth', 'outbox.jsonl');
}

export interface Outbox {
  file(): string;
  record(entry: OutboxRecord): void;
  list(limit?: number): OutboxRecord[];
}

export function openOutbox(file = outboxFile()): Outbox {
  const read = (): OutboxRecord[] => {
    try {
      if (!fs.existsSync(file)) return [];
      const raw = fs.readFileSync(file, 'utf-8').trim();
      if (!raw) return [];
      const out: OutboxRecord[] = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line) as OutboxRecord;
          if (r && typeof r.to === 'string') out.push(r);
        } catch { /* skip malformed */ }
      }
      return out;
    } catch {
      return [];
    }
  };
  return {
    file: () => file,
    record(entry) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
    },
    list: (limit = 100) => read().slice(-Math.max(1, limit)).reverse(),
  };
}

export interface SendResult {
  sent: number;
  failed: number;
  queued: number;
  results: OutboxRecord[];
}

/**
 * Send a planned batch. Dry-run (or a missing provider) queues everything and
 * reports zero sent — honest by construction.
 */
export async function sendOutbound(
  plan: OutboundPlan,
  opts: { outbox: Outbox; provider?: OutboundProvider | null; dryRun?: boolean; now?: () => number },
): Promise<SendResult> {
  const now = opts.now ?? (() => Date.now());
  const outbox = opts.outbox;
  const dryRun = opts.dryRun !== false || !opts.provider;
  const results: OutboxRecord[] = [];
  let sent = 0;
  let failed = 0;
  let queued = 0;

  for (const message of plan.messages) {
    const id = `ob_${crypto.randomBytes(8).toString('hex')}`;
    if (dryRun) {
      const record: OutboxRecord = { id, to: message.to, subject: message.subject, templateId: message.templateId, status: 'queued', at: now() };
      outbox.record(record);
      results.push(record);
      queued += 1;
      continue;
    }
    const outcome = await opts.provider!.send(message);
    const record: OutboxRecord = {
      id,
      to: message.to,
      subject: message.subject,
      templateId: message.templateId,
      status: outcome.ok ? 'sent' : 'failed',
      at: now(),
      providerId: outcome.id,
      error: outcome.error,
    };
    outbox.record(record);
    results.push(record);
    if (outcome.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed, queued, results };
}
