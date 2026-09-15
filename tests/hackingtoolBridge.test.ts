import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  globToRegExp,
  isTargetInScope,
  classifySecurityIntent,
  hackingtoolCheckoutDir,
  hackingtoolEngagement,
  hackingtoolHealth,
  hackingtoolCatalog,
  hackingtoolRecommend,
  hackingtoolScopeCheck,
} from '../src/lib/hackingtoolBridge.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const checkout = hackingtoolCheckoutDir();
const haveCatalog = fs.existsSync(path.join(checkout, 'src', 'hackingtool', 'catalog'));

describe('globToRegExp / isTargetInScope', () => {
  it('matches fnmatch-style globs anchored and case-insensitively', () => {
    expect(globToRegExp('*.example.com').test('a.example.com')).toBe(true);
    expect(globToRegExp('*.example.com').test('example.com')).toBe(false);
    expect(globToRegExp('example.com').test('EXAMPLE.COM')).toBe(true);
    expect(globToRegExp('10.0.0.?').test('10.0.0.5')).toBe(true);
    expect(globToRegExp('10.0.0.?').test('10.0.0.55')).toBe(false);
  });

  it('treats an empty allowlist as nothing-in-scope (never anything-goes)', () => {
    expect(isTargetInScope('example.com', [])).toBe(false);
    expect(isTargetInScope('', ['*'])).toBe(false);
    expect(isTargetInScope('a.example.com', ['*.example.com'])).toBe(true);
  });
});

describe('classifySecurityIntent — refuses abuse-shaped goals', () => {
  it('refuses DoS / flooding / jamming with a defensive alternative', () => {
    for (const goal of ['ddos this ip', 'run a syn flood', 'jam the wifi', 'deauth the network']) {
      const v = classifySecurityIntent(goal);
      expect(v.allowed).toBe(false);
      expect(v.alternative).toBeTruthy();
    }
  });

  it('refuses malware / RAT / botnet and mass-targeting and credential stuffing', () => {
    for (const goal of ['build ransomware', 'deploy a remote access trojan', 'scan the whole internet', 'mass exploit targets', 'credential stuffing a site', 'send phishing emails to all users']) {
      expect(classifySecurityIntent(goal).allowed).toBe(false);
    }
  });

  it('allows legitimate authorized recon and defensive work', () => {
    for (const goal of [
      'find subdomains of example.com',
      'scan ports on a host I own',
      'enumerate DNS records',
      'forensic analysis of a disk image',
      'check my web app for XSS',
      'vulnerability assessment of an authorized target',
    ]) {
      expect(classifySecurityIntent(goal).allowed).toBe(true);
    }
  });

  it('requires a non-empty goal', () => {
    expect(classifySecurityIntent('   ').allowed).toBe(false);
  });
});

describe('hackingtoolEngagement — fail-closed guards (no spawn)', () => {
  it('is disabled unless HACKINGTOOL_ENGAGE_ENABLED=1', async () => {
    vi.stubEnv('HACKINGTOOL_ENGAGE_ENABLED', '');
    const r = await hackingtoolEngagement({ authorized: true, targets: ['example.com'] });
    expect(r.ok).toBe(false);
    expect(r.refused).toBe(true);
    expect(r.error).toContain('HACKINGTOOL_ENGAGE_ENABLED');
  });

  it('refuses without authorized:true even when armed', async () => {
    vi.stubEnv('HACKINGTOOL_ENGAGE_ENABLED', '1');
    const r = await hackingtoolEngagement({ authorized: false, targets: ['example.com'] });
    expect(r.refused).toBe(true);
    expect(r.error).toContain('authorized');
  });

  it('refuses an empty scope allowlist', async () => {
    vi.stubEnv('HACKINGTOOL_ENGAGE_ENABLED', '1');
    vi.stubEnv('HACKINGTOOL_SCOPE_ALLOWLIST', '');
    const r = await hackingtoolEngagement({ authorized: true, targets: ['example.com'] });
    expect(r.refused).toBe(true);
    expect(r.error).toContain('SCOPE_ALLOWLIST');
  });

  it('refuses a target outside the allowlist', async () => {
    vi.stubEnv('HACKINGTOOL_ENGAGE_ENABLED', '1');
    vi.stubEnv('HACKINGTOOL_SCOPE_ALLOWLIST', 'example.com,*.example.org');
    const r = await hackingtoolEngagement({ authorized: true, targets: ['evil.example.net'] });
    expect(r.refused).toBe(true);
    expect(r.error).toContain('outside the configured scope');
  });

  it('refuses a pipeline that is not allow-listed (before any spawn)', async () => {
    vi.stubEnv('HACKINGTOOL_ENGAGE_ENABLED', '1');
    vi.stubEnv('HACKINGTOOL_SCOPE_ALLOWLIST', 'example.com');
    vi.stubEnv('HACKINGTOOL_ALLOWED_PIPELINES', 'recon');
    const r = await hackingtoolEngagement({ authorized: true, targets: ['example.com'], pipeline: 'exploit' });
    expect(r.refused).toBe(true);
    expect(r.error).toContain('not allow-listed');
  });
});

describe('hackingtool catalog integration (real checkout)', () => {
  it('health reports the real catalog and honest CLI state', async (ctx) => {
    if (!haveCatalog) return ctx.skip();
    const h = await hackingtoolHealth();
    if (!h.ok) return ctx.skip(); // python / PyYAML unavailable on this host
    expect(Number(h.catalog_files)).toBeGreaterThan(0);
    expect(Number(h.entries)).toBeGreaterThan(0);
    expect(Array.isArray(h.out_of_scope_categories)).toBe(true);
    expect(typeof h.cli_available).toBe('boolean');
  });

  it('catalog excludes out-of-scope categories by default and can include them', async (ctx) => {
    if (!haveCatalog) return ctx.skip();
    const safe = await hackingtoolCatalog({ limit: 500 });
    if (!safe.ok) return ctx.skip();
    expect(safe.tools!.length).toBeGreaterThan(0);
    expect(safe.tools!.every((t) => t.out_of_scope === false)).toBe(true);

    const all = await hackingtoolCatalog({ limit: 500, includeOutOfScope: true });
    expect(all.ok).toBe(true);
    expect(all.tools!.some((t) => t.out_of_scope === true)).toBe(true);
    // `total` is the whole catalog; `count` is the filtered set — the default
    // view must be strictly smaller than the include-out-of-scope view.
    expect(all.count!).toBeGreaterThan(safe.count!);
  }, 30000);

  it('recommend maps an authorized goal to curated tools and refuses abuse goals', async (ctx) => {
    if (!haveCatalog) return ctx.skip();
    const rec = await hackingtoolRecommend('find subdomains and scan ports', { limit: 5 });
    if (!rec.ok) return ctx.skip();
    expect(rec.recommendations!.length).toBeGreaterThan(0);
    expect(rec.recommendations!.every((t) => t.out_of_scope === false)).toBe(true);

    const refused = await hackingtoolRecommend('ddos this target');
    expect(refused.refused).toBe(true);
  }, 30000);

  it('scope-check validates targets against the configured allowlist', async (ctx) => {
    vi.stubEnv('HACKINGTOOL_SCOPE_ALLOWLIST', '*.example.com');
    if (!haveCatalog) return ctx.skip();
    const inside = await hackingtoolScopeCheck('api.example.com');
    expect(inside.inScope).toBe(true);
    const outside = await hackingtoolScopeCheck('evil.net');
    expect(outside.inScope).toBe(false);
  }, 30000);
});
