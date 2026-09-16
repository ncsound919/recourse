/**
 * leads.ts — normalization for the public lead-capture form.
 *
 * A public form is an untrusted boundary: this validates + trims + bounds every
 * field, requires explicit marketing consent, and rejects honeypot submissions.
 * The normalized lead maps directly onto a CRM `ContactInput`, so a captured
 * lead becomes one consent-recorded contact.
 */
import { normalizeEmail, type ContactInput } from './crm.js';

export interface LeadSubmission {
  email: string;
  name?: string;
  company?: string;
  message?: string;
  interest?: string;
  consent: boolean;
  source: string;
}

export interface LeadResult {
  ok: boolean;
  errors: string[];
  /** True when the honeypot tripped (treated as a bot, not stored). */
  bot?: boolean;
  lead?: LeadSubmission;
}

export const LEAD_FIELDS = ['email', 'name', 'company', 'message', 'interest', 'consent', 'source'] as const;
export const HONEYPOT_FIELD = 'website';
const MAX_MESSAGE = 2000;

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function normalizeLead(body: unknown, opts: { honeypotField?: string } = {}): LeadResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const honeypot = opts.honeypotField ?? HONEYPOT_FIELD;
  if (str(b[honeypot])) return { ok: false, errors: [], bot: true };

  const errors: string[] = [];
  const email = normalizeEmail(b.email);
  if (!email) errors.push('a valid email is required');
  const consent = b.consent === true || b.consent === 'true' || b.consent === 'on' || b.consent === 1;
  if (!consent) errors.push('marketing consent is required to be contacted');
  const message = str(b.message, MAX_MESSAGE);
  if (errors.length || !email) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    lead: {
      email,
      name: str(b.name) || undefined,
      company: str(b.company) || undefined,
      message: message || undefined,
      interest: str(b.interest) || undefined,
      consent,
      source: str(b.source) || 'lead-form',
    },
  };
}

export function leadToContactInput(lead: LeadSubmission): ContactInput {
  return {
    email: lead.email,
    name: lead.name,
    company: lead.company,
    stage: 'lead',
    marketingConsent: true,
    consentSource: lead.source,
    tags: lead.interest ? [lead.interest] : ['lead-form'],
    metadata: lead.message ? { message: lead.message, interest: lead.interest } : { interest: lead.interest },
  };
}
