/**
 * pluginSdk.ts — the third-party plugin contract (Wave 3).
 *
 * Before this, a third-party capability could only be added by editing
 * `componentTemplates.ts` and rebuilding, with no declared permissions and no
 * authorship. A plugin manifest fixes that: a versioned, licensed, *signed*
 * descriptor that declares its capabilities up front. Capabilities are validated
 * by the same default-deny grant validator the capability sandbox uses, so a
 * plugin can never declare broad host access by accident.
 *
 * Signing uses HMAC-SHA256 over the canonical manifest bytes. Verification is
 * honest: with no `RECOURSE_PLUGIN_SECRET` configured, a signature cannot be
 * checked and the manifest is reported `signed:false` rather than trusted.
 */
import crypto from 'node:crypto';
import { validateGrants } from './wasmSandbox/grants';
import type { CapabilityGrants } from './wasmSandbox/types';

export interface PluginManifest {
  id: string;
  name: string;
  /** Semantic version, e.g. `1.2.0`. */
  version: string;
  author?: string;
  license?: string;
  description?: string;
  /** Entry module path relative to the plugin root. */
  entry?: string;
  /** Declared capabilities, default deny. Validated by the sandbox grant rules. */
  capabilities?: CapabilityGrants;
  /** sha256 (hex) of the entry source the signature covers. */
  sourceHash?: string;
  /** HMAC-SHA256 (hex) over the canonical manifest fields below. */
  signature?: string;
}

export type ManifestValidation = { ok: true; manifest: PluginManifest } | { ok: false; errors: string[] };

const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Stable canonical JSON of the fields the signature covers (no `signature`). */
export function canonicalManifest(m: PluginManifest): string {
  const ordered = {
    id: m.id,
    name: m.name,
    version: m.version,
    author: m.author ?? null,
    license: m.license ?? null,
    description: m.description ?? null,
    entry: m.entry ?? null,
    capabilities: m.capabilities ?? {},
    sourceHash: m.sourceHash ?? null,
  };
  return JSON.stringify(ordered, Object.keys(ordered).sort());
}

export function pluginSecret(): string | null {
  const s = process.env.RECOURSE_PLUGIN_SECRET;
  return s && s.trim() ? s.trim() : null;
}

/** Sign a manifest with the configured secret (no-op error when unset). */
export function signManifest(
  m: PluginManifest,
  secret: string | null = pluginSecret(),
): { ok: true; manifest: PluginManifest } | { ok: false; error: string } {
  if (!secret) return { ok: false, error: 'RECOURSE_PLUGIN_SECRET is not configured; cannot sign' };
  const signature = crypto.createHmac('sha256', secret).update(canonicalManifest(m)).digest('hex');
  return { ok: true, manifest: { ...m, signature } };
}

export interface SignatureCheck {
  signed: boolean;
  valid: boolean;
  reason?: string;
}

export function verifyManifestSignature(
  m: PluginManifest,
  secret: string | null = pluginSecret(),
): SignatureCheck {
  if (!m.signature) return { signed: false, valid: false, reason: 'manifest is unsigned' };
  if (!secret) return { signed: true, valid: false, reason: 'no signing secret configured; signature cannot be verified' };
  const expected = crypto.createHmac('sha256', secret).update(canonicalManifest(m)).digest('hex');
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(m.signature, 'utf-8');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { signed: true, valid, reason: valid ? undefined : 'signature does not match' };
}

/** Validate the manifest schema + capability grants (does not check signature). */
export function validatePluginManifest(raw: unknown): ManifestValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) errors.push('id must match /^[a-zA-Z_][a-zA-Z0-9_-]*$/');
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('name is required');
  if (typeof m.version !== 'string' || !VERSION_RE.test(m.version)) errors.push('version must be semver (e.g. 1.0.0)');
  if (m.entry !== undefined && (typeof m.entry !== 'string' || m.entry.includes('..'))) {
    errors.push('entry must be a relative path without traversal');
  }
  if (m.capabilities !== undefined) {
    const grants = validateGrants(m.capabilities);
    if ('errors' in grants) errors.push(...grants.errors.map((e) => `capabilities: ${e}`));
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: raw as PluginManifest };
}

export interface LoadResult {
  ok: boolean;
  manifest?: PluginManifest;
  signature: SignatureCheck;
  errors: string[];
}

/** Parse + validate + signature-check a manifest from text (JSON). */
export function loadPluginManifest(
  text: string,
  opts: { secret?: string | null; requireSignature?: boolean } = {},
): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, signature: { signed: false, valid: false, reason: 'invalid JSON' }, errors: [err instanceof Error ? err.message : String(err)] };
  }
  const validation = validatePluginManifest(parsed);
  if ('errors' in validation) {
    return { ok: false, signature: { signed: false, valid: false, reason: 'schema invalid' }, errors: validation.errors };
  }
  const signature = verifyManifestSignature(validation.manifest, opts.secret ?? pluginSecret());
  const errors: string[] = [];
  if (opts.requireSignature && !signature.valid) errors.push(signature.reason ?? 'signature required but invalid');
  return { ok: errors.length === 0, manifest: validation.manifest, signature, errors };
}

/** The capability boundary a plugin's generated tools will run inside. */
export function pluginGrants(m: PluginManifest): CapabilityGrants {
  return m.capabilities ?? {};
}
