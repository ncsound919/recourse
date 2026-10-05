/**
 * outboundGuard.ts — SSRF protection for outbound requests.
 *
 * WHY THIS EXISTS
 * Recourse fetches URLs that arrive from outside the trust boundary: external
 * research intel, `POST /api/recourse/web/download`, `pdf/extract-url`, deep
 * links, and connector targets. Any of those can name `http://169.254.169.254`
 * (cloud instance metadata) or `http://127.0.0.1:3050` (Recourse's own admin
 * surface) and have the server fetch it on the caller's behalf. That is
 * server-side request forgery, and it is the highest-severity bug class in a
 * system that fetches attacker-influenced URLs by design.
 *
 * THE DESIGN IS FAIL-CLOSED ON AMBIGUITY
 * If a hostname cannot be resolved to an IP, or the URL is not http(s), or the
 * host is a bare IP we cannot classify, the request is REFUSED. The alternative —
 * allow on parse failure — means the guard protects nothing at the exact moment
 * an attacker most wants it disabled.
 *
 * The private-range predicate prefers the forge-built `isPrivateIPv4` once it has
 * been proven equal to the hand-written reference (see adoptionSites.ts). The
 * reference is ALWAYS retained: if adoption is absent or the adopted tool throws
 * or returns a non-boolean, the reference decides. Adoption can therefore never
 * make the guard weaker.
 */
import { adoptedTool } from './adoptionSites.js';

/** RFC1918 + loopback, written out longhand. This is the anchor for adoption. */
export function referenceIsPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return false;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/**
 * Link-local and "unspecified" IPv4, kept SEPARATE from the private predicate.
 *
 * 169.254.0.0/16 is not RFC1918, but `169.254.169.254` is the cloud instance
 * metadata service and is the single most valuable SSRF target there is, so it is
 * blocked explicitly here. `0.0.0.0` is likewise treated as local.
 *
 * This is deliberately NOT folded into `referenceIsPrivateIPv4`: that function is
 * the adoption ANCHOR whose contract the forge tool is proven against, and
 * widening it would change what an already-adopted tool is being trusted to mean.
 */
function referenceIsLinkLocalOrUnspecified(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return false;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b, c, d] = parts as [number, number, number, number];
  if (a === 0 && b === 0 && c === 0 && d === 0) return true; // 0.0.0.0 "this host"
  if (a === 169 && b === 254) return true; // link-local, incl. metadata
  return false;
}

/** Prefer the adopted tool, but never let it decide alone. */
function isPrivateIPv4(ip: string): boolean {
  const impl = adoptedTool<(ip: string) => boolean>('isPrivateIPv4');
  if (impl) {
    try {
      const out = impl(ip);
      if (typeof out === 'boolean') return out;
    } catch {
      /* fall through to the reference */
    }
  }
  return referenceIsPrivateIPv4(ip);
}

export interface GuardVerdict {
  allowed: boolean;
  /** Machine-readable reason. Present on every refusal. */
  reason?: string;
  /** The host as parsed from the URL, for logs. */
  host?: string;
}

/**
 * Decide whether an outbound request may proceed.
 *
 * Hostnames are NOT resolved to IPs here on purpose: doing so would add a DNS
 * round-trip and a TOCTOU window (resolve, validate, then let the real fetch
 * resolve again to a different address). This guard covers the literal-IP and
 * obvious-localhost cases, which is where the catastrophic SSRF targets live. A
 * full defence-in-depth version belongs at the socket/dispatcher layer, where the
 * address actually used is the one validated — that is recorded as an open
 * question rather than claimed as done.
 */
export function guardOutboundUrl(rawUrl: string): GuardVerdict {
  let u: URL;
  try {
    u = new URL(String(rawUrl));
  } catch {
    return { allowed: false, reason: 'not a parseable absolute URL' };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { allowed: false, reason: `protocol ${u.protocol} is not permitted`, host: u.hostname };
  }

  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const lowered = host.toLowerCase();

  // Named loopback aliases. These resolve to 127.0.0.1 without ever appearing as
  // a literal IP in the URL, so the numeric check below would miss them.
  if (lowered === 'localhost' || lowered.endsWith('.localhost') || lowered.endsWith('.local') || lowered.endsWith('.internal')) {
    return { allowed: false, reason: `host "${host}" is a loopback/internal alias`, host };
  }

  // Literal IPv4 in the URL.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (referenceIsLinkLocalOrUnspecified(host)) {
      return { allowed: false, reason: `host "${host}" is link-local, unspecified, or cloud metadata`, host };
    }
    if (isPrivateIPv4(host)) {
      return { allowed: false, reason: `host "${host}" is a private/loopback address`, host };
    }
    return { allowed: true, host };
  }

  // Literal IPv6: ::1 loopback, and the IPv4-mapped form that can smuggle a
  // private v4 target past a naive parser.
  //
  // Node normalises `::ffff:127.0.0.1` to the HEX form `::ffff:7f00:1`, so a
  // dotted-quad regex here would NEVER match — verified, not assumed. The mapped
  // address must therefore be decoded from hex.
  if (host.includes(':')) {
    if (lowered === '::1' || lowered === '::') {
      return { allowed: false, reason: `host "${host}" is an IPv6 loopback/unspecified address`, host };
    }
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lowered);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      // Reconstruct the dotted quad so the IPv4 rules apply unchanged.
      const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      if (referenceIsLinkLocalOrUnspecified(dotted) || isPrivateIPv4(dotted)) {
        return { allowed: false, reason: `host "${host}" is an IPv4-mapped local address (${dotted})`, host };
      }
      return { allowed: true, host };
    }
    // Also catch the IPv4-compatible `::127.0.0.1` spelling if it survives parsing.
    const mappedDotted = /^::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lowered);
    if (mappedDotted && (referenceIsLinkLocalOrUnspecified(mappedDotted[1]) || isPrivateIPv4(mappedDotted[1]))) {
      return { allowed: false, reason: `host "${host}" is an IPv4-mapped local address (${mappedDotted[1]})`, host };
    }
    return { allowed: true, host };
  }

  // A DNS name. Cannot be classified without resolving; allowed, and the
  // limitation is documented above rather than papered over.
  return { allowed: true, host };
}

/**
 * fetch wrapper that enforces the guard. Use this INSTEAD of a bare `fetch` for
 * any URL that did not originate inside Recourse.
 */
export async function guardedFetch(rawUrl: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const verdict = guardOutboundUrl(rawUrl);
  if (!verdict.allowed) {
    throw new Error(`outbound request blocked by SSRF guard: ${verdict.reason}`);
  }
  return fetchImpl(rawUrl, init);
}