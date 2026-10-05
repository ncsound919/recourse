/**
 * The adoption gate is the only thing standing between a generated tool and a
 * production code path. These tests are weighted toward the failure modes that
 * matter: a wrong tool must never be adopted, and absence must always be safe.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  tryAdopt,
  adoptedTool,
  adoptionStatus,
  adoptionSnapshot,
  resetAdoptions,
  type AdoptionSite,
} from '../src/lib/adoptionSites.js';
import { wantTool, rankDemand, resetDemandLedger } from '../src/lib/demandLedger.js';
import { ADOPTION_SITES, declareAdoptionDemand, referenceBackoffForTest } from '../src/lib/adoptionRegistry.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-'));
  resetAdoptions();
});

/** A site whose candidate returns `impl` and whose reference is `ref`. */
function site(impl: (...a: any[]) => any, ref: (...a: any[]) => any, vectors: AdoptionSite['vectors']): AdoptionSite {
  return {
    tool: 'probeTool',
    domain: 'systemic',
    purpose: 'test',
    caller: 'test',
    reference: ref,
    vectors,
    load: async () => impl,
  };
}

const VECTORS = [
  { args: [250, 1], expect: 250 },
  { args: [250, 2], expect: 500 },
  { args: [0, 3], expect: 0 },
];

describe('adoption gate', () => {
  it('adopts a candidate that matches the reference on every vector', async () => {
    const ref = (b: number, a: number) => Math.max(0, b) * Math.pow(2, Math.max(0, a - 1));
    const rec = await tryAdopt(site(ref, ref, VECTORS), root);
    expect(rec.adopted).toBe(true);
    expect(rec.vectorsAgreed).toBe(rec.vectorsTotal);
    expect(adoptedTool('probeTool')).toBeTypeOf('function');
    expect(rec.reason).toMatch(/agreed with the hand-written reference/);
  });

  it('REFUSES a candidate that disagrees, and names the vector', async () => {
    const ref = (b: number, a: number) => Math.max(0, b) * Math.pow(2, Math.max(0, a - 1));
    // Off-by-one: the classic `2^attempt` vs `2^(attempt-1)` bug.
    const wrong = (b: number, a: number) => Math.max(0, b) * Math.pow(2, Math.max(0, a));
    const rec = await tryAdopt(site(wrong, ref, VECTORS), root);
    expect(rec.adopted).toBe(false);
    expect(rec.reason).toMatch(/disagreed with the reference on vector 0/);
    // Crucially: NOT available for use.
    expect(adoptedTool('probeTool')).toBeNull();
  });

  it('refuses a site with NO proof at all', async () => {
    const ref = (b: number, a: number) => b * a;
    const rec = await tryAdopt(site(ref, ref, []), root);
    expect(rec.adopted).toBe(false);
    expect(rec.reason).toMatch(/no equivalence vectors/);
    expect(adoptedTool('probeTool')).toBeNull();
  });

  it('refuses a candidate that throws, and does not propagate the throw', async () => {
    const ref = (b: number, a: number) => b * a;
    const boom = () => {
      throw new Error('kaboom');
    };
    const rec = await tryAdopt(site(boom, ref, VECTORS), root);
    expect(rec.adopted).toBe(false);
    expect(rec.reason).toMatch(/threw on vector 0: kaboom/);
    expect(adoptedTool('probeTool')).toBeNull();
  });

  it('treats an unloadable candidate as rejected, not as an error', async () => {
    const ref = (b: number, a: number) => b * a;
    const s = site(ref, ref, VECTORS);
    s.load = async () => null;
    const rec = await tryAdopt(s, root);
    expect(rec.adopted).toBe(false);
    expect(rec.reason).toMatch(/no importable self-hosted module/);
  });

  it('treats NaN as agreeing with NaN (otherwise numeric tools can never pass)', async () => {
    const ref = () => Number.NaN;
    const rec = await tryAdopt(site(ref, ref, [{ args: [], expect: Number.NaN }]), root);
    expect(rec.adopted).toBe(true);
  });

  it('records a reason for every rejection — never a bare false', async () => {
    const ref = (b: number, a: number) => b * a;
    const rec = await tryAdopt(site(() => 999, ref, VECTORS), root);
    expect(rec.adopted).toBe(false);
    expect(rec.reason.length).toBeGreaterThan(10);
  });

  it('adopting then re-adopting with a bad candidate disarms the tool', async () => {
    const ref = (b: number, a: number) => Math.max(0, b) * Math.pow(2, Math.max(0, a - 1));
    expect((await tryAdopt(site(ref, ref, VECTORS), root)).adopted).toBe(true);
    expect(adoptedTool('probeTool')).toBeTypeOf('function');
    // A later cycle produces a broken build; the tool must be pulled, not kept.
    expect((await tryAdopt(site(() => -1, ref, VECTORS), root)).adopted).toBe(false);
    expect(adoptedTool('probeTool')).toBeNull();
  });

  it('persists a durable record so a restart does not silently forget a rejection', async () => {
    const ref = (b: number, a: number) => b * a;
    await tryAdopt(site(() => 1, ref, VECTORS), root);
    // The record must land on disk under the test's own root, so a real restart
    // can read it. (adoptionSnapshot() reads cwd; assert the file directly.)
    const file = path.join(root, 'data', 'adoption-sites.json');
    expect(fs.existsSync(file)).toBe(true);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(doc.records.probeTool).toBeTruthy();
    expect(doc.records.probeTool.adopted).toBe(false);
    expect(doc.records.probeTool.reason.length).toBeGreaterThan(5);
    // And an ADOPTED tool is persisted too, so a restart can re-arm it.
    const ref2 = (b: number, a: number) => Math.max(0, b) * Math.pow(2, Math.max(0, a - 1));
    await tryAdopt(site(ref2, ref2, VECTORS), root);
    const doc2 = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(doc2.records.probeTool.adopted).toBe(true);
  });
});

describe('demand ledger', () => {
  beforeEach(() => resetDemandLedger(root));

  it('returns an accurate in-process count for repeat wants', () => {
    // The return value is exact on every call; only the DISK write is debounced
    // (power-of-two) so a hot-path caller does not cause write amplification.
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) counts.push(wantTool({ tool: 't', caller: 'c', purpose: 'p', root }));
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    // Persisted count is the last power-of-two boundary reached, i.e. 4.
    const r = rankDemand({ root }).find((x) => x.tool === 't');
    expect(r).toBeTruthy();
    expect(r!.frequency).toBeGreaterThanOrEqual(4);
    expect(r!.callers).toBe(1);
  });

  it('ranks a callable want above a generic one of equal frequency', () => {
    wantTool({ tool: 'genericTool', caller: 'c1', purpose: 'p', specificity: 'generic', root });
    wantTool({ tool: 'callableTool', caller: 'c2', purpose: 'p', specificity: 'callable', root });
    const order = rankDemand({ root }).map((r) => r.tool);
    expect(order[0]).toBe('callableTool');
  });

  it('takes the MAX specificity across callers, not the mean', () => {
    wantTool({ tool: 't', caller: 'vague', purpose: 'p', specificity: 'generic', root });
    wantTool({ tool: 't', caller: 'precise', purpose: 'p', specificity: 'callable', root });
    const r = rankDemand({ root }).find((x) => x.tool === 't');
    expect(r?.specificity).toBe('callable');
    expect(r?.callers).toBe(2);
  });

  it('ignores malformed wants rather than creating empty keys', () => {
    wantTool({ tool: '', caller: 'c', purpose: 'p', root });
    wantTool({ tool: 't', caller: '', purpose: 'p', root });
    expect(rankDemand({ root })).toEqual([]);
  });

  it('records demand for tools that do not exist yet — want is not capability', () => {
    wantTool({ tool: 'neverBuilt', caller: 'c', purpose: 'p', root });
    expect(rankDemand({ root }).map((r) => r.tool)).toContain('neverBuilt');
    // Critically, wanting something must not make it adopted.
    expect(adoptedTool('neverBuilt')).toBeNull();
  });
});

describe('shipped adoption sites', () => {
  it('every site has a proof, a reference, and a concrete caller', () => {
    expect(ADOPTION_SITES.length).toBeGreaterThan(0);
    for (const s of ADOPTION_SITES) {
      expect(s.vectors.length, `${s.tool} has no vectors`).toBeGreaterThan(0);
      expect(s.reference).toBeTypeOf('function');
      expect(s.caller).toMatch(/\S+\.ts:\S+/); // a real file:line, not a vague label
      expect(s.purpose.length).toBeGreaterThan(10);
    }
  });

  it('every site reference agrees with its own vectors — the anchor must be self-consistent', () => {
    // A wrong reference would silently authorise a wrong tool. This is the test
    // that catches "the proof was checking against a bug".
    for (const s of ADOPTION_SITES) {
      s.vectors.forEach((v, i) => {
        expect(
          s.reference(...v.args),
          `${s.tool} reference disagrees with its own vector ${i}`,
        ).toEqual(v.expect);
      });
    }
  });

  it('the backoff reference is the definition, not an approximation', () => {
    const ref = referenceBackoffForTest;
    expect(ref(250, 1)).toBe(250);
    expect(ref(250, 4)).toBe(2000);
    expect(ref(250, 0)).toBe(250); // clamps, no fractional delay
    expect(ref(-100, 2)).toBe(0);
    // Exact finite double, not Infinity. 2^52 is the reference for what this
    // returns; an earlier version of this assertion said 2^53, which was simply
    // wrong arithmetic in the test.
    expect(ref(1, 53)).toBe(Math.pow(2, 52));
  });

  it('declaring demand does not adopt anything by itself', async () => {
    declareAdoptionDemand();
    for (const s of ADOPTION_SITES) {
      expect(adoptedTool(s.tool), `${s.tool} was adopted by merely declaring demand`).toBeNull();
    }
  });
});

describe('webhook call site uses the adopted tool when present', () => {
  it('falls back to the reference when nothing is adopted', async () => {
    resetAdoptions();
    const { deliverWebhook } = await import('../src/lib/connectors/webhooks.js');
    let slept: number[] = [];
    const res = await deliverWebhook('http://127.0.0.1:1/x', { a: 1 }, {
      retries: 2,
      backoffMs: 10,
      sleep: async (ms) => {
        slept.push(ms);
      },
      fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
    });
    expect(res.ok).toBe(false);
    expect(slept).toEqual([10, 20]); // 10*2^0, 10*2^1
  });
});