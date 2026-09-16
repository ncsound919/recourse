import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openTenantStore } from '../src/lib/auth/tenants';
import {
  openApiKeyStore,
  generateApiKey,
  hashApiKey,
  apiKeyIdOf,
  hasScope,
  API_KEY_PREFIX,
} from '../src/lib/auth/apikeys';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-auth-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('tenant store', () => {
  it('creates, lists, updates plan and status', () => {
    const store = openTenantStore(path.join(freshDir(), 'tenants.json'));
    const t = store.create({ name: 'Acme' });
    expect(t.id).toMatch(/^t_[0-9a-f]{16}$/);
    expect(t.planId).toBe('free');
    expect(t.status).toBe('active');
    expect(store.get(t.id)!.name).toBe('Acme');
    expect(store.list()).toHaveLength(1);

    store.setPlan(t.id, 'pro');
    expect(store.get(t.id)!.planId).toBe('pro');
    store.setStatus(t.id, 'suspended');
    expect(store.get(t.id)!.status).toBe('suspended');
    store.setStripeCustomer(t.id, 'cus_123');
    expect(store.get(t.id)!.stripeCustomerId).toBe('cus_123');
  });

  it('degrades to empty on a corrupt file', () => {
    const dir = freshDir();
    const file = path.join(dir, 'tenants.json');
    fs.writeFileSync(file, '{ bad json', 'utf-8');
    expect(openTenantStore(file).list()).toEqual([]);
  });
});

describe('api key store', () => {
  it('generates well-formed keys and parses their id', () => {
    const { raw, id } = generateApiKey();
    expect(raw.startsWith(`${API_KEY_PREFIX}_`)).toBe(true);
    expect(raw.split('_')).toHaveLength(3);
    expect(apiKeyIdOf(raw)).toBe(id);
    expect(apiKeyIdOf('not-a-key')).toBeNull();
    expect(hashApiKey(raw)).toHaveLength(64);
  });

  it('creates, verifies and never stores the raw secret', () => {
    const file = path.join(freshDir(), 'apikeys.json');
    const store = openApiKeyStore(file);
    const { record, raw } = store.create({ tenantId: 't1', name: 'ci', scopes: ['read', 'write'] });
    expect(record.scopes).toEqual(['read', 'write']);
    expect(JSON.stringify(store.list())).not.toContain(raw);
    expect(fs.readFileSync(file, 'utf-8')).not.toContain(raw);

    const ok = store.verify(raw);
    expect(ok.ok).toBe(true);
    expect(ok.record!.tenantId).toBe('t1');
    expect(store.verify('rck_000000000000_' + 'a'.repeat(32)).ok).toBe(false);
    expect(store.verify('garbage').reason).toBe('malformed');
  });

  it('rotates a key (old revoked, new works)', () => {
    const store = openApiKeyStore(path.join(freshDir(), 'apikeys.json'));
    const { record, raw } = store.create({ tenantId: 't1', scopes: ['read'] });
    const rotated = store.rotate(record.id)!;
    expect(rotated.raw).not.toBe(raw);
    expect(rotated.record.rotatedFrom).toBe(record.id);
    expect(store.verify(raw).reason).toBe('revoked');
    expect(store.verify(rotated.raw).ok).toBe(true);
  });

  it('revokes and expires keys', () => {
    const store = openApiKeyStore(path.join(freshDir(), 'apikeys.json'));
    const { record, raw } = store.create({ tenantId: 't1' });
    store.revoke(record.id);
    expect(store.verify(raw).reason).toBe('revoked');

    const exp = store.create({ tenantId: 't1', expiresAt: 1000 });
    expect(store.verify(exp.raw, 999).ok).toBe(true);
    expect(store.verify(exp.raw, 1001).reason).toBe('expired');
  });

  it('defaults scopes to read and drops unknown scopes', () => {
    const store = openApiKeyStore(path.join(freshDir(), 'apikeys.json'));
    expect(store.create({ tenantId: 't1' }).record.scopes).toEqual(['read']);
    expect(store.create({ tenantId: 't1', scopes: ['read', 'nonsense'] }).record.scopes).toEqual(['read']);
  });

  it('honors admin-implies-all for scope checks', () => {
    expect(hasScope({ scopes: ['admin'] }, 'billing')).toBe(true);
    expect(hasScope({ scopes: ['read'] }, 'billing')).toBe(false);
    expect(hasScope({ scopes: ['billing'] }, 'billing')).toBe(true);
  });

  it('tracks lastUsedAt', () => {
    const store = openApiKeyStore(path.join(freshDir(), 'apikeys.json'));
    const { record } = store.create({ tenantId: 't1' });
    store.touch(record.id, 42);
    expect(store.get(record.id)!.lastUsedAt).toBe(42);
  });
});
