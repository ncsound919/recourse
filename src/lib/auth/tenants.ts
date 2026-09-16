/**
 * tenants.ts — the durable identity record behind every billable surface.
 *
 * A tenant is the unit of isolation for usage, quotas, API keys and billing.
 * The previous single-shared-secret model had no such concept; this is the
 * smallest object that lets the metering/billing wave attribute consumption
 * and enforce a per-plan quota. Persisted as one atomic JSON document (small,
 * read on the request path, written rarely).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../durableJson.js';

export type TenantStatus = 'active' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  planId: string;
  status: TenantStatus;
  createdAt: number;
  updatedAt: number;
  /** Stripe customer id, set when the tenant first checks out. */
  stripeCustomerId?: string;
  /** Higher-level grouping for future org support. */
  orgId?: string;
  metadata?: Record<string, unknown>;
}

export interface TenantStore {
  file(): string;
  list(): Tenant[];
  get(id: string): Tenant | undefined;
  create(input: { name: string; planId?: string; orgId?: string; metadata?: Record<string, unknown> }): Tenant;
  /** Insert or replace a full tenant record. */
  put(tenant: Tenant): Tenant;
  setPlan(id: string, planId: string): Tenant | undefined;
  setStatus(id: string, status: TenantStatus): Tenant | undefined;
  setStripeCustomer(id: string, stripeCustomerId: string): Tenant | undefined;
}

export function tenantsFile(): string {
  return process.env.RECOURSE_TENANTS_FILE || path.join(process.cwd(), 'data', 'auth', 'tenants.json');
}

interface TenantDoc {
  version: 1;
  tenants: Tenant[];
}

const DEFAULT_DOC: TenantDoc = { version: 1, tenants: [] };

function loadDoc(file: string): TenantDoc {
  const doc = readJsonFile<TenantDoc>(file, DEFAULT_DOC);
  if (!doc || !Array.isArray(doc.tenants)) return { ...DEFAULT_DOC, tenants: [] };
  return { version: 1, tenants: doc.tenants.filter((t) => t && typeof t.id === 'string') };
}

export function openTenantStore(file = tenantsFile()): TenantStore {
  const save = (doc: TenantDoc): void => writeJsonFile(file, doc);

  const all = (): Tenant[] => loadDoc(file).tenants;

  const update = (id: string, mutate: (t: Tenant) => void): Tenant | undefined => {
    const doc = loadDoc(file);
    const t = doc.tenants.find((x) => x.id === id);
    if (!t) return undefined;
    mutate(t);
    t.updatedAt = Date.now();
    save(doc);
    return { ...t };
  };

  return {
    file: () => file,
    list: () => all().slice().sort((a, b) => a.createdAt - b.createdAt),
    get: (id) => all().find((t) => t.id === id),
    create({ name, planId, orgId, metadata }) {
      const now = Date.now();
      const tenant: Tenant = {
        id: `t_${crypto.randomBytes(8).toString('hex')}`,
        name: String(name ?? '').trim() || 'unnamed',
        planId: planId || 'free',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        orgId,
        metadata,
      };
      const doc = loadDoc(file);
      doc.tenants.push(tenant);
      save(doc);
      return tenant;
    },
    put(tenant) {
      const doc = loadDoc(file);
      const idx = doc.tenants.findIndex((t) => t.id === tenant.id);
      const next = { ...tenant, updatedAt: Date.now() };
      if (idx >= 0) doc.tenants[idx] = next;
      else doc.tenants.push(next);
      save(doc);
      return next;
    },
    setPlan: (id, planId) => update(id, (t) => { t.planId = planId; }),
    setStatus: (id, status) => update(id, (t) => { t.status = status; }),
    setStripeCustomer: (id, stripeCustomerId) => update(id, (t) => { t.stripeCustomerId = stripeCustomerId; }),
  };
}
