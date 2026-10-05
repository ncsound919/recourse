/**
 * The SSRF guard is the highest-severity thing this work added: it decides whether
 * the server will fetch an attacker-influenced URL. These tests are weighted
 * toward BYPASSES, because for this control the interesting cases are the ones
 * that get through, not the ones that are correctly blocked.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { guardOutboundUrl, referenceIsPrivateIPv4, guardedFetch } from '../src/lib/outboundGuard.js';
import { resetAdoptions, tryAdopt, type AdoptionSite } from '../src/lib/adoptionSites.js';

beforeEach(() => resetAdoptions());

describe('private range predicate (the anchor)', () => {
  it('matches the RFC1918 + loopback definition', () => {
    for (const ip of ['10.0.0.1', '10.255.255.255', '127.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      expect(referenceIsPrivateIPv4(ip), ip).toBe(true);
    }
  });

  it('does not over-match — the boundaries are the whole point of /12', () => {
    for (const ip of ['172.15.255.255', '172.32.0.0', '9.255.255.255', '11.0.0.0', '8.8.8.8', '1.1.1.1', '126.0.0.1', '128.0.0.1']) {
      expect(referenceIsPrivateIPv4(ip), ip).toBe(false);
    }
  });

  it('rejects malformed input rather than guessing', () => {
    for (const ip of ['', 'not-an-ip', '256.1.1.1', '1.2.3', '1.2.3.4.5', '10.0.0.-1', ' 10.0.0.1x']) {
      expect(referenceIsPrivateIPv4(ip), ip).toBe(false);
    }
  });

  it('keeps link-local and 0.0.0.0 OUT of the private predicate, deliberately', () => {
    // The adoption ANCHOR's contract is RFC1918+loopback only. Widening it would
    // silently change what an already-adopted tool is trusted to mean, so
    // link-local/unspecified are handled by a separate function instead.
    expect(referenceIsPrivateIPv4('169.254.169.254')).toBe(false);
    expect(referenceIsPrivateIPv4('0.0.0.0')).toBe(false);
  });
});

describe('guardOutboundUrl — blocks', () => {
  it('blocks the cloud metadata endpoint and other link-local by literal IP', () => {
    // Not private per the predicate, but 169.254.169.254 is the single most
    // valuable SSRF target, so it is named explicitly.
    for (const u of [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://169.254.169.254/',
      'http://0.0.0.0:3050/api/recourse/status',
      'http://169.254.1.1/',
    ]) {
      const v = guardOutboundUrl(u);
      expect(v.allowed, `${u} -> ${v.reason ?? 'ALLOWED'}`).toBe(false);
      expect(v.reason).toMatch(/link-local|unspecified|metadata/);
    }
  });

  it('blocks loopback literals', () => {
    for (const u of ['http://127.0.0.1:3050/api/recourse/status', 'http://127.0.0.1/admin', 'http://10.1.2.3/x', 'http://192.168.0.5/', 'http://172.16.5.5/']) {
      expect(guardOutboundUrl(u).allowed, u).toBe(false);
    }
  });

  it('blocks named loopback and internal aliases that never look like IPs', () => {
    for (const u of ['http://localhost:3050/x', 'http://LOCALHOST/x', 'http://foo.localhost/x', 'http://db.internal/', 'http://printer.local/']) {
      const v = guardOutboundUrl(u);
      expect(v.allowed, `${u} -> ${v.reason}`).toBe(false);
    }
  });

  it('blocks IPv6 loopback and IPv4-mapped private smuggling', () => {
    for (const u of ['http://[::1]:9200/_cluster/health', 'http://[::]/x', 'http://[::ffff:127.0.0.1]/x', 'http://[::ffff:10.0.0.1]/x']) {
      const v = guardOutboundUrl(u);
      expect(v.allowed, `${u} -> ${v.reason}`).toBe(false);
    }
  });

  it('blocks non-http(s) schemes that can read files or execute', () => {
    for (const u of ['file:///etc/passwd', 'ftp://internal/x', 'gopher://127.0.0.1:11211/_stats', 'data:text/html,<script>x</script>']) {
      const v = guardOutboundUrl(u);
      expect(v.allowed, u).toBe(false);
      expect(v.reason).toMatch(/protocol|parseable/);
    }
  });

  it('blocks unparseable input rather than allowing on failure', () => {
    for (const u of ['', 'not a url', '//example.com/x', 'http://']) {
      expect(guardOutboundUrl(u).allowed, u).toBe(false);
    }
  });
});

describe('guardOutboundUrl — allows ordinary traffic', () => {
  it('allows public hosts and public IPs', () => {
    for (const u of ['https://example.com/paper.pdf', 'http://8.8.8.8/', 'https://arxiv.org/abs/1234.5678']) {
      expect(guardOutboundUrl(u).allowed, u).toBe(true);
    }
  });

  it('every refusal carries a reason', () => {
    for (const u of [
      'http://127.0.0.1/',
      'file:///etc/passwd',
      'http://169.254.169.254/',
      'http://[::ffff:127.0.0.1]/',
      'garbage',
    ]) {
      const v = guardOutboundUrl(u);
      expect(v.allowed, u).toBe(false);
      expect(typeof v.reason).toBe('string');
      expect(v.reason!.length).toBeGreaterThan(0);
    }
  });
});

describe('adoption cannot weaken the guard', () => {
  const site = (impl: (ip: string) => boolean): AdoptionSite => ({
    tool: 'isPrivateIPv4',
    domain: 'cyber_defense',
    purpose: 'test',
    caller: 'test',
    reference: referenceIsPrivateIPv4,
    vectors: [
      { args: ['10.1.2.3'], expect: true },
      { args: ['8.8.8.8'], expect: false },
    ],
    load: async () => impl,
  });

  it('a correct tool is adopted and the guard still blocks', async () => {
    await tryAdopt(site(referenceIsPrivateIPv4));
    expect(guardOutboundUrl('http://127.0.0.1:3050/x').allowed).toBe(false);
  });

  it('a WRONG tool is rejected, and the reference still blocks', async () => {
    // Always-false: would permit every private target if trusted.
    const rec = await tryAdopt(site(() => false));
    expect(rec.adopted).toBe(false);
    expect(guardOutboundUrl('http://127.0.0.1:3050/x').allowed).toBe(false);
  });

  it('an ALWAYS-TRUE tool is rejected by the vectors, and the guard holds', async () => {
    const rec = await tryAdopt(site(() => true));
    expect(rec.adopted).toBe(false);
    expect(guardOutboundUrl('http://127.0.0.1:3050/x').allowed).toBe(false);
  });
});

describe('guardedFetch', () => {
  it('refuses to fetch a blocked target and never calls fetch', async () => {
    let called = false;
    await expect(
      guardedFetch('http://169.254.169.254/latest/', {}, (async () => {
        called = true;
        return new Response('');
      }) as unknown as typeof fetch),
    ).rejects.toThrow(/blocked by SSRF guard/);
    expect(called).toBe(false);
  });

  it('passes an allowed URL through to fetch', async () => {
    const res = await guardedFetch('https://example.com/x', {}, (async () => new Response('ok', { status: 200 })) as unknown as typeof fetch);
    expect(res.status).toBe(200);
  });
});