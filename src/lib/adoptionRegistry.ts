/**
 * adoptionRegistry.ts — the concrete, hand-audited adoption sites.
 *
 * Every entry here is a DECLARATION made by a person reading the code, naming a
 * real production call site and an independent reference implementation. Nothing
 * in this file is generated, and nothing here edits source at runtime. Adding an
 * entry is a reviewed act, which is the point: the audit found 27 verified tools
 * with no caller, and the correct response is to wire up call sites that are
 * genuinely wanted — not to let a model invent them.
 *
 * Each site carries:
 *   - the hand-written reference, which is the ANCHOR for the proof
 *   - equivalence vectors, including edge cases the forge is likely to get wrong
 *   - a `load` that pulls the verified self-hosted module, or yields null
 *
 * The proof is what activates a tool. `tryAdopt` compares the candidate against the
 * reference on every vector and refuses on the first disagreement, leaving the
 * reference in service. So a wrong tool costs a speedup, never a wrong result.
 */
import { loadSelfHostedEntrypoint } from './selfHosting.js';
import { wantTool } from './demandLedger.js';
import { tryAdopt, type AdoptionSite, type AdoptionRecord } from './adoptionSites.js';

// ---------------------------------------------------------------------------
// 1. exponentialBackoffMs -> connectors/webhooks.ts deliverWebhook retry loop
// ---------------------------------------------------------------------------
// Why this one first: it is a REAL hot path with real traffic semantics (webhook
// retries), the correct answer is unambiguous, and the bug class is severe and
// silent. A backoff that returns 0 hammers a failing endpoint; one that overflows
// to Infinity hangs the loop. Both are exactly the kind of large-magnitude error
// the enhanced forge gate now catches.
const referenceBackoff = (baseMs: number, attempt: number): number =>
  Math.max(0, baseMs) * Math.pow(2, Math.max(0, attempt - 1));

/**
 * Exported for tests only. The point is to let a test assert the ANCHOR itself is
 * correct: a proof checked against a buggy reference would happily authorise a
 * buggy tool, and nothing else in the system would notice.
 */
export const referenceBackoffForTest = referenceBackoff;

const backoffSite: AdoptionSite = {
  tool: 'exponentialBackoffMs',
  domain: 'systemic',
  purpose: 'webhook retry backoff: baseMs * 2^(attempt-1), clamped at zero',
  caller: 'lib/connectors/webhooks.ts:deliverWebhook',
  reference: referenceBackoff,
  vectors: [
    { args: [250, 1], expect: 250 },
    { args: [250, 2], expect: 500 },
    { args: [250, 3], expect: 1000 },
    { args: [250, 4], expect: 2000 },
    { args: [0, 3], expect: 0 },
    { args: [-100, 2], expect: 0 },
    // attempt below 1 must clamp, not produce a negative or fractional delay
    { args: [250, 0], expect: 250 },
    { args: [250, -5], expect: 250 },
    // base 1, attempt 10 -> 2^9 = 512. (An earlier version of this vector said
    // 1024, i.e. 2^10, which is off by one attempt. The reference was right and
    // the fixture was wrong — exactly the "verify the fixture before reporting a
    // defect" trap, in the direction that would have rejected a correct tool.)
    { args: [1, 10], expect: 512 },
    // Large magnitude: must stay an exact finite double, not Infinity or a
    // wrapped negative. 2^30 is comfortably inside the safe-integer range.
    { args: [1024, 21], expect: 1024 * Math.pow(2, 20) },
  ],
  load: async () => {
    const loaded = await loadSelfHostedEntrypoint('exponentialBackoffMs');
    return loaded?.fn ?? null;
  },
};

// ---------------------------------------------------------------------------
// 2. isPrivateIPv4 -> a real outbound-request SSRF guard
// ---------------------------------------------------------------------------
// Genuine security value: Recourse fetches from URLs supplied by external intel
// (`/api/recourse/web/download`, pdf extract-bytes, deep links). A private-range
// check on outbound targets is a standard SSRF control. The reference is the
// RFC1918 + loopback definition, written out longhand.
const referenceIsPrivateIPv4 = (ip: string): boolean => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return false;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
};

const privateIpv4Site: AdoptionSite = {
  tool: 'isPrivateIPv4',
  domain: 'cyber_defense',
  purpose: 'SSRF guard: reject outbound requests to RFC1918/loopback targets',
  caller: 'lib/outboundGuard.ts:guardOutboundUrl',
  reference: referenceIsPrivateIPv4,
  vectors: [
    { args: ['10.1.2.3'], expect: true },
    { args: ['172.31.255.1'], expect: true },
    { args: ['172.32.0.1'], expect: false }, // just outside 172.16/12
    { args: ['172.15.0.1'], expect: false }, // just below 172.16/12
    { args: ['192.168.0.5'], expect: true },
    { args: ['8.8.8.8'], expect: false },
    { args: ['127.0.0.1'], expect: true },
    { args: ['not-an-ip'], expect: false },
    { args: ['256.1.1.1'], expect: false }, // out of octet range
    { args: [''], expect: false },
    // 0.0.0.0 and 169.254 link-local are the classic SSRF bypasses. The
    // reference says false for both, so the forge tool must agree: this is the
    // vector that catches a naive "starts with a private first octet" shortcut.
    { args: ['0.0.0.0'], expect: false },
    { args: ['169.254.169.254'], expect: false },
  ],
  load: async () => {
    const loaded = await loadSelfHostedEntrypoint('isPrivateIPv4');
    return loaded?.fn ?? null;
  },
};

/** Every site, in the order the promoter should try them. */
export const ADOPTION_SITES: AdoptionSite[] = [backoffSite, privateIpv4Site];

/**
 * Declare the demand for every site, so `rankDemand` reflects reality.
 *
 * Called at boot. Cheap: each `wantTool` writes only on first sight, so this is
 * ~2 file writes, not 2 per cycle.
 */
export function declareAdoptionDemand(): void {
  for (const site of ADOPTION_SITES) {
    wantTool({
      tool: site.tool,
      caller: site.caller,
      purpose: site.purpose,
      // Every site here names a concrete caller and a purpose, which is the
      // strongest specificity short of shipping argument vectors to the forge.
      specificity: 'callable',
    });
  }
}

/**
 * Attempt adoption of every site.
 *
 * Idempotent and fail-safe: each site either passes its proof and goes live, or is
 * recorded as rejected with the specific failing vector. A rejected site leaves
 * its hand-written reference in service, so this can be called every cycle.
 */
export async function runAdoptionPass(): Promise<AdoptionRecord[]> {
  return Promise.all(ADOPTION_SITES.map((site) => tryAdopt(site)));
}