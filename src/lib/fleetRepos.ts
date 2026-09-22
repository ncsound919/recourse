/**
 * fleetRepos.ts — letting Recourse's verified-patch intake repair a SIBLING
 * repo (Axiom, OpenHub) instead of only itself.
 *
 * WHY THIS EXISTS
 * `verifyAndApplyPatch` was already repo-parameterized (`opts.root`) and already
 * accepted an injectable policy (`opts.guard`) — but the HTTP surface hard-coded
 * `devRepoRoot()` and `selfModGuard`, so the only repo Recourse could ever repair
 * was Recourse. The fleet has three nodes with one working verified-patch gate
 * between them; this module is the seam that shares it.
 *
 * THE TRUST BOUNDARY, STATED PLAINLY
 * Recourse does NOT own the safety policy for someone else's repo. Axiom's
 * protected files are enumerated in Axiom's own `constitution.ts`, and that list
 * must stay with the code it protects — a remote copy drifts, and a drifted
 * trust core is worse than none. So the owning node decides, and proves it:
 *
 *   1. Axiom evaluates `guardMutation(file)` locally, against its own manifest.
 *   2. If allowed, Axiom signs {repo, file, sha256(source), exp} with the shared
 *      fleet secret and sends that authorization with the patch.
 *   3. Recourse verifies the signature and that the sha256 matches the source it
 *      was actually handed, then applies through its normal sandbox/lint/boot
 *      gate and journals the revert token.
 *
 * The sha256 binding is the point: an authorization for `docs/README.md` cannot
 * be replayed to write a different file, and an authorization for one revision of
 * a file cannot be replayed to write another. Without it, "the owner approved
 * this path" would be a bearer token for that path forever.
 *
 * FAIL-CLOSED
 * No `FLEET_REPAIR_SECRET` ⇒ no fleet repair, ever. No allowlist entry ⇒ the
 * slug is unknown and the request is refused. A path that escapes the resolved
 * root is refused by `verifyAndApplyPatch` as it already was.
 */
import crypto from 'node:crypto';
import path from 'node:path';

export const FLEET_SECRET_ENV = 'FLEET_REPAIR_SECRET';
export const FLEET_REPOS_ENV = 'RECOURSE_FLEET_REPOS';

/** Authorization lifetime. Short: it is minted immediately before the POST. */
export const AUTHORIZATION_TTL_MS = 5 * 60 * 1000;

export interface FleetRepo {
  /** Stable slug used on the wire (never a path). */
  slug: string;
  /** Absolute root on this host. */
  root: string;
}

/**
 * Parse the allowlist from `RECOURSE_FLEET_REPOS`.
 *
 * Format: `slug=path` entries separated by `;` (and/or newlines). A semicolon is
 * used rather than the platform path delimiter because on Windows that is `;`
 * anyway and on POSIX a `:` would collide with `C:/...` paths in a config copied
 * between hosts.
 *
 *   RECOURSE_FLEET_REPOS="axiom=C:/Users/User/Downloads/Uplift/Deepseek Harness/Axiom Agent;openhub=C:/.../Axiom Agent/openhub"
 *
 * Malformed entries are skipped rather than throwing: a typo in one repo must not
 * take the whole intake offline. Slugs are lowercased and must be simple tokens,
 * so a slug can never be smuggled in as a path fragment.
 */
export function fleetRepos(env: NodeJS.ProcessEnv = process.env): FleetRepo[] {
  const raw = String(env[FLEET_REPOS_ENV] ?? '').trim();
  if (!raw) return [];
  const out: FleetRepo[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[;\n]+/)) {
    const entry = part.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const slug = entry.slice(0, eq).trim().toLowerCase();
    const target = entry.slice(eq + 1).trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) continue;
    if (!target) continue;
    if (slug === 'self' || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, root: path.resolve(target) });
  }
  return out;
}

/** Resolve a slug to its allowlisted root, or null. `self`/empty ⇒ null (the
 *  caller keeps its existing own-repo behavior). */
export function resolveFleetRepo(slug: unknown, env: NodeJS.ProcessEnv = process.env): FleetRepo | null {
  if (typeof slug !== 'string') return null;
  const want = slug.trim().toLowerCase();
  if (!want || want === 'self') return null;
  return fleetRepos(env).find((r) => r.slug === want) ?? null;
}

// ---------------------------------------------------------------------------
// Repair authorization (shared wire format)
// ---------------------------------------------------------------------------
// This format is duplicated in Axiom (`src/server/fleetRepair.ts`) because the
// two processes cannot import each other. It is a WIRE FORMAT, not logic: keep
// the canonical body byte-identical on both sides. Each repo pins the exact
// string in a test so a change on one side fails loudly instead of silently
// rejecting every patch.

export interface RepairAuthorization {
  /** Repo slug the patch targets. */
  repo: string;
  /** Repo-relative file path, forward slashes. */
  file: string;
  /** Hex sha256 of the exact source being authorized. */
  sha256: string;
  /** Epoch ms after which this authorization is dead. */
  exp: number;
  /** Who decided — informational, never trusted for authorization. */
  issuer: string;
  /** Hex HMAC-SHA256 over the canonical body. */
  sig: string;
}

/** Normalize a repo-relative path so the same file always hashes the same way. */
export function normalizeFile(file: string): string {
  return String(file ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export function sha256Hex(source: string): string {
  return crypto.createHash('sha256').update(String(source ?? ''), 'utf8').digest('hex');
}

/** The exact bytes that are signed. Newline-delimited so no field can absorb
 *  another: none of the fields may contain a newline, and all are normalized or
 *  numeric. */
export function authorizationBody(a: Omit<RepairAuthorization, 'sig'>): string {
  return ['v1', a.repo, normalizeFile(a.file), a.sha256, String(a.exp), a.issuer].join('\n');
}

export function signAuthorization(
  fields: Omit<RepairAuthorization, 'sig'>,
  secret: string,
): RepairAuthorization {
  const sig = crypto.createHmac('sha256', secret).update(authorizationBody(fields), 'utf8').digest('hex');
  return { ...fields, file: normalizeFile(fields.file), sig };
}

function timingSafeHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

export interface AuthorizationVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Verify an authorization against the patch actually received. Every failure
 * names its own reason so an operator debugging a refusal learns which check
 * failed; the HTTP layer keeps the response terse.
 */
export function verifyAuthorization(
  auth: unknown,
  expected: { repo: string; file: string; source: string },
  secret: string,
  nowMs: number = Date.now(),
): AuthorizationVerdict {
  if (!secret) return { ok: false, reason: `fleet repair disabled: ${FLEET_SECRET_ENV} is unset` };
  if (!auth || typeof auth !== 'object') return { ok: false, reason: 'authorization missing' };
  const a = auth as Partial<RepairAuthorization>;
  if (typeof a.sig !== 'string' || !a.sig) return { ok: false, reason: 'authorization has no signature' };
  if (typeof a.repo !== 'string' || typeof a.file !== 'string' || typeof a.sha256 !== 'string') {
    return { ok: false, reason: 'authorization is malformed' };
  }
  if (typeof a.exp !== 'number' || !Number.isFinite(a.exp)) return { ok: false, reason: 'authorization has no expiry' };
  if (a.exp < nowMs) return { ok: false, reason: 'authorization expired' };
  if (a.repo !== expected.repo) return { ok: false, reason: 'authorization is for a different repo' };
  if (normalizeFile(a.file) !== normalizeFile(expected.file)) {
    return { ok: false, reason: 'authorization is for a different file' };
  }
  // Content binding: this is what stops an authorization being replayed to write
  // different bytes to the same approved path.
  if (a.sha256 !== sha256Hex(expected.source)) {
    return { ok: false, reason: 'authorization does not match the submitted source' };
  }
  const body = authorizationBody({
    repo: a.repo,
    file: a.file,
    sha256: a.sha256,
    exp: a.exp,
    issuer: typeof a.issuer === 'string' ? a.issuer : '',
  });
  const expectedSig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  if (!timingSafeHex(a.sig.toLowerCase(), expectedSig)) return { ok: false, reason: 'authorization signature is invalid' };
  return { ok: true, reason: `authorized by ${typeof a.issuer === 'string' && a.issuer ? a.issuer : 'unknown'}` };
}

/** The shared secret, or "" when unset (fail-closed at every call site). */
export function fleetSecret(env: NodeJS.ProcessEnv = process.env): string {
  return String(env[FLEET_SECRET_ENV] ?? '').trim();
}

/**
 * Build the `guard` for a foreign repo: the owning node has already applied its
 * own trust core, so Recourse's job is to check the proof, not to re-decide.
 * Returns the same shape `verifyAndApplyPatch` expects.
 */
export function createFleetRepairGuard(opts: {
  repo: string;
  source: string;
  authorization: unknown;
  secret: string;
  now?: () => number;
}): (file: string) => { allowed: boolean; reason?: string } {
  return (file) => {
    const verdict = verifyAuthorization(
      opts.authorization,
      { repo: opts.repo, file, source: opts.source },
      opts.secret,
      opts.now?.() ?? Date.now(),
    );
    return { allowed: verdict.ok, reason: verdict.reason };
  };
}
