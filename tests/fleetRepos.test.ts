import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  fleetRepos, resolveFleetRepo, normalizeFile, sha256Hex, authorizationBody,
  signAuthorization, verifyAuthorization, createFleetRepairGuard, fleetSecret,
} from '../src/lib/fleetRepos';

const SECRET = 'fleet-test-secret';
const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ RECOURSE_FLEET_REPOS: 'axiom=/srv/axiom;openhub=/srv/axiom/openhub', ...extra }) as NodeJS.ProcessEnv;

describe('fleet repo allowlist', () => {
  it('parses slug=path entries', () => {
    expect(fleetRepos(env())).toEqual([
      { slug: 'axiom', root: path.resolve('/srv/axiom') },
      { slug: 'openhub', root: path.resolve('/srv/axiom/openhub') },
    ]);
  });

  it('is empty when unconfigured — fleet repair is opt-in', () => {
    expect(fleetRepos({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(resolveFleetRepo('axiom', {} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('skips malformed entries instead of failing the whole allowlist', () => {
    const repos = fleetRepos(env({ RECOURSE_FLEET_REPOS: 'bad-entry;axiom=/srv/axiom;=/nope;Bad Slug=/x' }));
    expect(repos.map((r) => r.slug)).toEqual(['axiom']);
  });

  it('refuses a duplicate slug and the reserved slug "self"', () => {
    const repos = fleetRepos(env({ RECOURSE_FLEET_REPOS: 'axiom=/a;axiom=/b;self=/c' }));
    expect(repos.map((r) => r.root)).toEqual([path.resolve('/a')]);
  });

  it('resolves only allowlisted slugs, case-insensitively', () => {
    expect(resolveFleetRepo('AXIOM', env())?.root).toBe(path.resolve('/srv/axiom'));
    expect(resolveFleetRepo('not-a-repo', env())).toBeNull();
    expect(resolveFleetRepo('self', env())).toBeNull();
    expect(resolveFleetRepo('', env())).toBeNull();
    expect(resolveFleetRepo(undefined, env())).toBeNull();
  });

  it('never accepts a path in place of a slug', () => {
    expect(resolveFleetRepo('/srv/axiom', env())).toBeNull();
    expect(resolveFleetRepo('../../etc', env())).toBeNull();
  });
});

describe('authorization wire format', () => {
  // PINNED. This exact string is also produced by Axiom's
  // src/server/fleetRepair.ts. If this test changes, that one must change in the
  // same commit — otherwise every fleet patch is silently refused.
  it('is a pinned, newline-delimited v1 body', () => {
    expect(authorizationBody({ repo: 'axiom', file: 'src/a.ts', sha256: 'abc', exp: 123, issuer: 'axiom:local' }))
      .toBe('v1\naxiom\nsrc/a.ts\nabc\n123\naxiom:local');
  });

  it('normalizes the file the same way on both sides', () => {
    expect(normalizeFile('src\\server\\a.ts')).toBe('src/server/a.ts');
    expect(normalizeFile('./src/a.ts')).toBe('src/a.ts');
  });

  it('hashes source as plain hex sha256', () => {
    expect(sha256Hex('hello')).toBe(crypto.createHash('sha256').update('hello').digest('hex'));
  });
});

describe('authorization verification', () => {
  const source = 'export const x = 1;\n';
  const fresh = (over: Record<string, unknown> = {}) => signAuthorization({
    repo: 'axiom', file: 'src/a.ts', sha256: sha256Hex(source),
    exp: Date.now() + 60_000, issuer: 'axiom:local', ...over,
  } as never, SECRET);

  it('accepts a correctly signed, content-bound authorization', () => {
    const v = verifyAuthorization(fresh(), { repo: 'axiom', file: 'src/a.ts', source }, SECRET);
    expect(v.ok).toBe(true);
  });

  it('refuses a forged or tampered signature', () => {
    const a = { ...fresh(), sig: 'f'.repeat(64) };
    expect(verifyAuthorization(a, { repo: 'axiom', file: 'src/a.ts', source }, SECRET).ok).toBe(false);
    const b = { ...fresh(), issuer: 'attacker' };
    expect(verifyAuthorization(b, { repo: 'axiom', file: 'src/a.ts', source }, SECRET).reason).toMatch(/signature/);
  });

  it('refuses replay onto different content for the same approved path', () => {
    const a = fresh();
    const v = verifyAuthorization(a, { repo: 'axiom', file: 'src/a.ts', source: 'DIFFERENT' }, SECRET);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/does not match the submitted source/);
  });

  it('refuses replay onto a different file or repo', () => {
    const a = fresh();
    expect(verifyAuthorization(a, { repo: 'axiom', file: 'src/b.ts', source }, SECRET).reason).toMatch(/different file/);
    expect(verifyAuthorization(a, { repo: 'openhub', file: 'src/a.ts', source }, SECRET).reason).toMatch(/different repo/);
  });

  it('refuses an expired or expiry-less authorization', () => {
    expect(verifyAuthorization(fresh({ exp: Date.now() - 1 }), { repo: 'axiom', file: 'src/a.ts', source }, SECRET).reason).toMatch(/expired/);
    const noExp = { ...fresh() } as Record<string, unknown>;
    delete noExp.exp;
    expect(verifyAuthorization(noExp, { repo: 'axiom', file: 'src/a.ts', source }, SECRET).reason).toMatch(/no expiry/);
  });

  it('refuses a signature made with a different secret', () => {
    const a = signAuthorization({ repo: 'axiom', file: 'src/a.ts', sha256: sha256Hex(source), exp: Date.now() + 60_000, issuer: 'x' }, 'other-secret');
    expect(verifyAuthorization(a, { repo: 'axiom', file: 'src/a.ts', source }, SECRET).ok).toBe(false);
  });

  it('is fail-closed with no secret configured', () => {
    expect(verifyAuthorization(fresh(), { repo: 'axiom', file: 'src/a.ts', source }, '').ok).toBe(false);
    expect(fleetSecret({} as NodeJS.ProcessEnv)).toBe('');
  });

  it('refuses a missing or non-object authorization', () => {
    for (const bad of [undefined, null, 'string', 42, []]) {
      expect(verifyAuthorization(bad, { repo: 'axiom', file: 'src/a.ts', source }, SECRET).ok).toBe(false);
    }
  });
});

describe('createFleetRepairGuard', () => {
  const source = 'const ok = true;\n';
  it('allows exactly the authorized file and refuses any other', () => {
    const auth = signAuthorization({
      repo: 'axiom', file: 'src/allowed.ts', sha256: sha256Hex(source),
      exp: Date.now() + 60_000, issuer: 'axiom:local',
    }, SECRET);
    const guard = createFleetRepairGuard({ repo: 'axiom', source, authorization: auth, secret: SECRET });
    expect(guard('src/allowed.ts').allowed).toBe(true);
    // verifyAndApplyPatch calls the guard with the patch's file; a mismatch
    // between the authorized path and the written path must not pass.
    expect(guard('src/server/auth.ts').allowed).toBe(false);
  });

  it('refuses everything when no authorization is supplied', () => {
    const guard = createFleetRepairGuard({ repo: 'axiom', source, authorization: undefined, secret: SECRET });
    const v = guard('src/allowed.ts');
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/authorization missing/);
  });
});
