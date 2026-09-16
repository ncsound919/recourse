/**
 * crm.ts — a durable, consent-aware contact store for the growth channels.
 *
 * This is deliberately a CRM, not a blast list: every contact carries an
 * explicit marketing-consent record (who consented, from where, when), and the
 * outbound layer refuses to email anyone without it. Emails are normalized and
 * unique so a lead from a form and a customer from billing resolve to one row.
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../durableJson.js';

export type ContactStage = 'lead' | 'qualified' | 'customer' | 'churned';
export const CONTACT_STAGES: readonly ContactStage[] = ['lead', 'qualified', 'customer', 'churned'];

export interface ConsentRecord {
  marketing: boolean;
  source: string;
  at: number;
}

export interface CrmNote {
  at: number;
  text: string;
}

export interface Contact {
  id: string;
  email: string;
  name?: string;
  company?: string;
  stage: ContactStage;
  consent: ConsentRecord;
  tags: string[];
  score: number;
  createdAt: number;
  updatedAt: number;
  lastContactedAt?: number;
  notes: CrmNote[];
  metadata?: Record<string, unknown>;
}

export interface ContactInput {
  email: string;
  name?: string;
  company?: string;
  stage?: ContactStage;
  marketingConsent?: boolean;
  consentSource?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export function crmFile(): string {
  return process.env.RECOURSE_CRM_FILE || path.join(process.cwd(), 'data', 'growth', 'crm.json');
}

/** Lowercase + trim; returns null for an obviously invalid address. */
export function normalizeEmail(email: unknown): string | null {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return null;
  return e;
}

/** Deterministic 0..100 lead score from stage + engagement signals. */
export function computeLeadScore(contact: Pick<Contact, 'stage' | 'consent' | 'notes' | 'company' | 'lastContactedAt'>): number {
  const stagePoints: Record<ContactStage, number> = { lead: 10, qualified: 45, customer: 90, churned: 5 };
  let score = stagePoints[contact.stage];
  if (contact.consent.marketing) score += 10;
  if (contact.company) score += 5;
  if (contact.notes.length > 0) score += Math.min(15, contact.notes.length * 3);
  if (contact.lastContactedAt) score += 5;
  return Math.max(0, Math.min(100, score));
}

interface CrmDoc {
  version: 1;
  contacts: Contact[];
}

const DEFAULT_DOC: CrmDoc = { version: 1, contacts: [] };

function loadDoc(file: string): CrmDoc {
  const doc = readJsonFile<CrmDoc>(file, DEFAULT_DOC);
  if (!doc || !Array.isArray(doc.contacts)) return { version: 1, contacts: [] };
  return { version: 1, contacts: doc.contacts.filter((c) => c && typeof c.email === 'string') };
}

export interface CrmFilter {
  stage?: ContactStage;
  tag?: string;
  consent?: boolean;
  query?: string;
}

export interface CrmStore {
  file(): string;
  list(filter?: CrmFilter): Contact[];
  get(id: string): Contact | undefined;
  findByEmail(email: string): Contact | undefined;
  upsert(input: ContactInput, now?: number): { contact: Contact; created: boolean };
  setStage(id: string, stage: ContactStage, now?: number): Contact | undefined;
  setConsent(id: string, marketing: boolean, source: string, now?: number): Contact | undefined;
  recordNote(id: string, text: string, now?: number): Contact | undefined;
  recordContact(id: string, at?: number): Contact | undefined;
  metrics(): { total: number; byStage: Record<ContactStage, number>; consented: number; avgScore: number };
}

export function openCrmStore(file = crmFile()): CrmStore {
  const save = (doc: CrmDoc): void => writeJsonFile(file, doc);
  const all = (): Contact[] => loadDoc(file).contacts;

  const update = (id: string, mutate: (c: Contact) => void, now = Date.now()): Contact | undefined => {
    const doc = loadDoc(file);
    const c = doc.contacts.find((x) => x.id === id);
    if (!c) return undefined;
    mutate(c);
    c.updatedAt = now;
    c.score = computeLeadScore(c);
    save(doc);
    return { ...c };
  };

  return {
    file: () => file,
    list(filter = {}) {
      const q = filter.query?.trim().toLowerCase();
      return all()
        .filter((c) => (filter.stage ? c.stage === filter.stage : true))
        .filter((c) => (filter.tag ? c.tags.includes(filter.tag) : true))
        .filter((c) => (filter.consent === undefined ? true : c.consent.marketing === filter.consent))
        .filter((c) => {
          if (!q) return true;
          return [c.email, c.name ?? '', c.company ?? '', c.tags.join(' ')].join(' ').toLowerCase().includes(q);
        })
        .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
    },
    get: (id) => all().find((c) => c.id === id),
    findByEmail: (email) => {
      const e = normalizeEmail(email);
      return e ? all().find((c) => c.email === e) : undefined;
    },
    upsert(input, now = Date.now()) {
      const email = normalizeEmail(input.email);
      if (!email) throw new Error(`invalid email: ${input.email}`);
      const stage: ContactStage = input.stage && CONTACT_STAGES.includes(input.stage) ? input.stage : 'lead';
      const doc = loadDoc(file);
      const existing = doc.contacts.find((c) => c.email === email);
      if (existing) {
        if (input.name) existing.name = input.name;
        if (input.company) existing.company = input.company;
        if (input.stage && CONTACT_STAGES.includes(input.stage)) existing.stage = stage;
        if (input.tags) existing.tags = Array.from(new Set([...existing.tags, ...input.tags]));
        if (input.metadata) existing.metadata = { ...existing.metadata, ...input.metadata };
        if (input.marketingConsent !== undefined && input.marketingConsent !== existing.consent.marketing) {
          existing.consent = { marketing: input.marketingConsent, source: input.consentSource ?? 'update', at: now };
        } else if (input.marketingConsent === true) {
          existing.consent = { marketing: true, source: input.consentSource ?? existing.consent.source, at: existing.consent.at };
        }
        existing.updatedAt = now;
        existing.score = computeLeadScore(existing);
        save(doc);
        return { contact: { ...existing }, created: false };
      }
      const contact: Contact = {
        id: `ct_${Buffer.from(`${email}:${now}`).toString('hex').slice(0, 16)}`,
        email,
        name: input.name,
        company: input.company,
        stage,
        consent: { marketing: input.marketingConsent === true, source: input.consentSource ?? 'import', at: now },
        tags: input.tags ? [...new Set(input.tags)] : [],
        score: 0,
        createdAt: now,
        updatedAt: now,
        notes: [],
        metadata: input.metadata,
      };
      contact.score = computeLeadScore(contact);
      doc.contacts.push(contact);
      save(doc);
      return { contact, created: true };
    },
    setStage: (id, stage, now) => update(id, (c) => { c.stage = stage; }, now),
    setConsent: (id, marketing, source, now = Date.now()) =>
      update(id, (c) => { c.consent = { marketing, source, at: now }; }, now),
    recordNote: (id, text, now = Date.now()) =>
      update(id, (c) => { c.notes.push({ at: now, text: String(text).slice(0, 2000) }); }, now),
    recordContact: (id, at = Date.now()) => update(id, (c) => { c.lastContactedAt = at; }, at),
    metrics() {
      const contacts = all();
      const byStage = { lead: 0, qualified: 0, customer: 0, churned: 0 } as Record<ContactStage, number>;
      let consented = 0;
      let scoreSum = 0;
      for (const c of contacts) {
        byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
        if (c.consent.marketing) consented += 1;
        scoreSum += c.score;
      }
      return {
        total: contacts.length,
        byStage,
        consented,
        avgScore: contacts.length ? Math.round((scoreSum / contacts.length) * 10) / 10 : 0,
      };
    },
  };
}
