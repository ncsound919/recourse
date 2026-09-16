/**
 * apikeys.ts — hashed, scoped, rotatable API keys. This replaces the single
 * shared mutation secret for the billable `/v1` surface: each key belongs to a
 * tenant, carries a scope set, and can be rotated or revoked without disturbing
 * the rest of the fleet.
 *
 * Security: only a SHA-256 hash of the secret half is ever persisted; the raw
 * key is returned exactly once at creation/rotation and is unrecoverable after.
 * Verification is constant-time over the hash. The public `id` half is a
 * lookup handle and is not secret.
 *
 * Raw key format: `rck_<id>_<secret>` where id is 12 hex chars and secret is
 * 32 hex chars (128 bits of entropy).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../durableJson.js';

export const API_KEY_PREFIX = 'rck';
export const API_SCOPES = ['read', 'write', 'admin', 'billing'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name: string;
  /** SHA-256 hex of the raw key. Never exposed. */
  hash: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
  expiresAt?: number;
  /** The key id this one replaced, when minted via rotate(). */
  rotatedFrom?: string;
}

/** Safe projection for list/GET responses — no hash. */
export interface ApiKeyPublic {
  id: string;
  tenantId: string;
  name: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
  expiresAt?: number;
  rotatedFrom?: string;
}

export type VerifyFailure = 'malformed' | 'unknown' | 'revoked' | 'expired';

export interface VerifyResult {
  ok: boolean;
  record?: ApiKeyRecord;
  reason?: VerifyFailure;
}

export interface ApiKeyStore {
  file(): string;
  create(input: { tenantId: string; name?: string; scopes?: string[]; expiresAt?: number }): { record: ApiKeyPublic; raw: string };
  verify(raw: string, at?: number): VerifyResult;
  rotate(id: string): { record: ApiKeyPublic; raw: string } | null;
  revoke(id: string): ApiKeyPublic | null;
  list(tenantId?: string): ApiKeyPublic[];
  get(id: string): ApiKeyPublic | undefined;
  touch(id: string, at?: number): void;
}

export function apiKeysFile(): string {
  return process.env.RECOURSE_APIKEYS_FILE || path.join(process.cwd(), 'data', 'auth', 'apikeys.json');
}

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
}

export function generateApiKey(): { raw: string; id: string; hash: string } {
  const id = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(16).toString('hex');
  const raw = `${API_KEY_PREFIX}_${id}_${secret}`;
  return { raw, id, hash: hashApiKey(raw) };
}

/** Parse the id half of a raw key without touching the store. */
export function apiKeyIdOf(raw: string): string | null {
  const m = /^rck_([0-9a-f]{12})_[0-9a-f]{32}$/.exec(String(raw ?? '').trim());
  return m ? m[1] : null;
}

function toPublic(r: ApiKeyRecord): ApiKeyPublic {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    scopes: [...r.scopes],
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
    expiresAt: r.expiresAt,
    rotatedFrom: r.rotatedFrom,
  };
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  const valid = new Set<string>(API_SCOPES);
  const picked = (scopes ?? ['read']).filter((s) => valid.has(s));
  return picked.length ? Array.from(new Set(picked)) : ['read'];
}

interface ApiKeyDoc {
  version: 1;
  keys: ApiKeyRecord[];
}

const DEFAULT_DOC: ApiKeyDoc = { version: 1, keys: [] };

function loadDoc(file: string): ApiKeyDoc {
  const doc = readJsonFile<ApiKeyDoc>(file, DEFAULT_DOC);
  if (!doc || !Array.isArray(doc.keys)) return { version: 1, keys: [] };
  return { version: 1, keys: doc.keys.filter((k) => k && typeof k.id === 'string' && typeof k.hash === 'string') };
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function openApiKeyStore(file = apiKeysFile()): ApiKeyStore {
  const save = (doc: ApiKeyDoc): void => writeJsonFile(file, doc);

  const mint = (input: { tenantId: string; name?: string; scopes?: string[]; expiresAt?: number; rotatedFrom?: string }): { record: ApiKeyPublic; raw: string } => {
    const { raw, id, hash } = generateApiKey();
    const record: ApiKeyRecord = {
      id,
      tenantId: input.tenantId,
      name: String(input.name ?? '').trim() || 'key',
      hash,
      scopes: normalizeScopes(input.scopes),
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      rotatedFrom: input.rotatedFrom,
    };
    const doc = loadDoc(file);
    doc.keys.push(record);
    save(doc);
    return { record: toPublic(record), raw };
  };

  return {
    file: () => file,
    create: (input) => mint(input),
    verify(raw, at = Date.now()) {
      const id = apiKeyIdOf(raw);
      if (!id) return { ok: false, reason: 'malformed' };
      const rec = loadDoc(file).keys.find((k) => k.id === id);
      if (!rec) return { ok: false, reason: 'unknown' };
      if (!safeEqualHex(rec.hash, hashApiKey(String(raw).trim()))) return { ok: false, reason: 'unknown' };
      if (rec.revokedAt !== undefined) return { ok: false, reason: 'revoked' };
      if (rec.expiresAt !== undefined && at >= rec.expiresAt) return { ok: false, reason: 'expired' };
      return { ok: true, record: rec };
    },
    rotate(id) {
      const doc = loadDoc(file);
      const old = doc.keys.find((k) => k.id === id);
      if (!old || old.revokedAt !== undefined) return null;
      old.revokedAt = Date.now();
      const { raw, id: newId, hash } = generateApiKey();
      const record: ApiKeyRecord = {
        id: newId,
        tenantId: old.tenantId,
        name: old.name,
        hash,
        scopes: [...old.scopes],
        createdAt: Date.now(),
        expiresAt: old.expiresAt,
        rotatedFrom: old.id,
      };
      doc.keys.push(record);
      save(doc);
      return { record: toPublic(record), raw };
    },
    revoke(id) {
      const doc = loadDoc(file);
      const rec = doc.keys.find((k) => k.id === id);
      if (!rec) return null;
      if (rec.revokedAt === undefined) rec.revokedAt = Date.now();
      save(doc);
      return toPublic(rec);
    },
    list(tenantId) {
      return loadDoc(file).keys
        .filter((k) => tenantId === undefined || k.tenantId === tenantId)
        .map(toPublic)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    get(id) {
      const rec = loadDoc(file).keys.find((k) => k.id === id);
      return rec ? toPublic(rec) : undefined;
    },
    touch(id, at = Date.now()) {
      const doc = loadDoc(file);
      const rec = doc.keys.find((k) => k.id === id);
      if (!rec) return;
      rec.lastUsedAt = at;
      save(doc);
    },
  };
}

/** Scope check used by the v1 middleware and route handlers. `admin` implies all. */
export function hasScope(key: Pick<ApiKeyRecord, 'scopes'>, scope: string): boolean {
  return key.scopes.includes('admin') || key.scopes.includes(scope);
}
