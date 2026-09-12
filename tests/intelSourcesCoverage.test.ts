import { describe, it, expect, vi, afterEach } from 'vitest';
import { intelSourceStatuses, pullBbtchArchetypes, rankProposalsWithStrategy } from '../src/lib/intelSources';
import type { IntelProposal } from '../src/lib/intelInvention';

const ENV_KEYS = ['BBTECH_URL', 'BBTECH_API_KEY', 'DEV_BRAIN_URL', 'OMNIRESEARCH_URL'];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function proposal(id: string, over: Partial<IntelProposal> = {}): IntelProposal {
  return { id, source: 'bbtech', title: `T ${id}`, description: 'desc '.repeat(50), domain: 'math', tags: ['math'], rationale: 'r', score: 1, createdAt: 1, status: 'new', ...over } as IntelProposal;
}

describe('intelSourceStatuses — honest availability probes', () => {
  it('reports configured + online when every source answers /health', async () => {
    process.env.BBTECH_URL = 'http://bb.test/';
    process.env.DEV_BRAIN_URL = 'http://brain.test/';
    process.env.OMNIRESEARCH_URL = 'http://om.test/';
    const hits: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      hits.push(String(input));
      return new Response('ok', { status: 200 });
    }));

    const statuses = await intelSourceStatuses();
    expect(statuses).toHaveLength(3);

    const bb = statuses.find((s) => s.id === 'bbtech');
    expect(bb?.configured).toBe(true);
    expect(bb?.online).toBe(true);
    expect(bb?.baseUrl).toBe('http://bb.test'); // trailing slashes trimmed
    expect(hits).toContain('http://bb.test/health');

    const strategy = statuses.find((s) => s.id === 'strategy');
    expect(strategy?.online).toBe(true);
    expect(hits).toContain('http://brain.test/api/health');

    const om = statuses.find((s) => s.id === 'omniresearch');
    expect(om?.configured).toBe(true);
    expect(om?.online).toBe(true);
    expect(hits).toContain('http://om.test/api/health');
  });

  it('reports offline on HTTP errors / fetch failures and never probes an unconfigured source', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    process.env.DEV_BRAIN_URL = 'http://brain.test';
    // OMNIRESEARCH_URL deliberately unset.
    const hits: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      hits.push(String(input));
      if (String(input).includes('bb.test')) return new Response('nope', { status: 503 });
      throw new TypeError('connection refused'); // strategy probe dies on the wire
    }));

    const statuses = await intelSourceStatuses();

    const bb = statuses.find((s) => s.id === 'bbtech');
    expect(bb?.online).toBe(false); // HTTP 503 → r.ok false

    const strategy = statuses.find((s) => s.id === 'strategy');
    expect(strategy?.online).toBe(false); // thrown fetch → catch → false

    const om = statuses.find((s) => s.id === 'omniresearch');
    expect(om).toEqual({
      id: 'omniresearch',
      configured: false,
      online: false,
      baseUrl: '(unset)',
      note: expect.any(String),
    });
    expect(hits).not.toContain('(unset)/api/health');
    expect(hits).toHaveLength(2); // om never probed when not configured
  });
});

describe('pullBbtchArchetypes — real archetype fetch', () => {
  it('parses an array payload into IntelIdea records with honest field fallbacks', async () => {
    process.env.BBTECH_URL = 'http://bb.test/';
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      const body = [
        { name: 'Pattern Alpha', description: 'd1', tags: ['x', 'y'], score: 7 },
        { archetype: 'Beta', summary: 'sum b', confidence: 3 },
        { label: 'Gamma', rationale: 'rat g' },
        { title: 'Delta', description: { structured: true } },
        null,
        42,
        { label: 'Eps', tags: 'not-an-array' },
        {},
      ];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('pipeline-key-dev'); // default key when env unset
    expect(headers['Content-Type']).toBe('application/json');

    const titles = r.ideas.map((i) => i.title);
    expect(titles).toEqual(['Pattern Alpha', 'Beta', 'Gamma', 'Delta', 'Eps']);

    expect(r.ideas[0].tags).toEqual(['x', 'y']);
    expect(r.ideas[0].score).toBe(7);
    expect(r.ideas[1].score).toBe(3); // score falls back to confidence
    expect(r.ideas[2].score).toBeUndefined(); // neither score nor confidence
    expect(r.ideas[3].description).toBe('[object Object]'); // non-string description is stringified
    expect(r.ideas[4].tags).toEqual([]); // non-array tags are dropped, not invented
  });

  it('honours a custom BBTECH_API_KEY from the environment on the archetypes fetch', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    process.env.BBTECH_API_KEY = 'env-key-xyz';
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify([]), { status: 200 });
    }));
    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(true);
    expect((capturedInit?.headers as Record<string, string>)['X-API-Key']).toBe('env-key-xyz');
  });

  it('reads archetypes/items wrapper keys and tolerates non-arrays', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ archetypes: [{ name: 'Wrapped', description: 'w' }] }), { status: 200 })));
    expect((await pullBbtchArchetypes()).ideas.map((i) => i.title)).toEqual(['Wrapped']);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [{ name: 'ItemWrap', description: 'i' }] }), { status: 200 })));
    expect((await pullBbtchArchetypes()).ideas.map((i) => i.title)).toEqual(['ItemWrap']);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ unrelated: true }), { status: 200 })));
    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(true);
    expect(r.ideas).toEqual([]);
  });

  it('caps the ingested batch and slices long titles/descriptions', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `name-${i}`, description: 'x'.repeat(5000) }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(many), { status: 200 })));
    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(true);
    expect(r.ideas).toHaveLength(50); // raw.slice(0, 50)
    expect(r.ideas[0].title.length).toBeLessThanOrEqual(140);
    expect(r.ideas[0].description.length).toBeLessThanOrEqual(2000);
  });

  it('returns an honest HTTP error (not fabricated ideas) on non-2xx', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(false);
    expect(r.ideas).toEqual([]);
    expect(r.error).toBe('bbtech archetypes HTTP 403');
  });

  it('returns ok:false with the thrown message when the fetch dies', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:8005');
    }));
    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(false);
    expect(r.ideas).toEqual([]);
    expect(r.error).toContain('ECONNREFUSED');
  });

  it('stringifies non-Error throw values', async () => {
    process.env.BBTECH_URL = 'http://bb.test';
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw 'raw string failure';
    }));
    const r = await pullBbtchArchetypes();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('raw string failure');
  });
});

describe('rankProposalsWithStrategy — ranking via dev-brain', () => {
  it('short-circuits honestly for fewer than two proposals (no network)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const none = await rankProposalsWithStrategy([]);
    expect(none).toEqual({ ok: false, orderedIds: [], error: 'no proposals to rank' });

    const single = await rankProposalsWithStrategy([proposal('p1')]);
    expect(single).toEqual({ ok: true, orderedIds: ['p1'], error: undefined });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts candidates and returns the dev-brain weighted ordering', async () => {
    process.env.DEV_BRAIN_URL = 'http://brain.test/';
    let capturedUrl = '';
    let capturedBody: any;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          options: [
            { id: 'p2', weightPercentage: 90 },
            { id: 'p1', weightPercentage: 50 },
            { id: 'p3', weightPercentage: 70 },
          ],
          recommendedOptionId: 'p2',
        }),
        { status: 200 },
      );
    }));

    const r = await rankProposalsWithStrategy([proposal('p1'), proposal('p2', { domain: 'biotech' }), proposal('p3')], 'Pick the best.');
    expect(r.ok).toBe(true);
    expect(r.orderedIds).toEqual(['p2', 'p3', 'p1']); // sorted by weightPercentage desc
    expect(capturedUrl).toBe('http://brain.test/api/strategy/decide'); // trailing slash trimmed
    expect(capturedBody.problem).toBe('Pick the best.');
    expect(capturedBody.candidates).toHaveLength(3);
    expect(capturedBody.candidates[1]).toMatchObject({ name: 'p2', tags: ['recourse-proposal', 'biotech'] });
  });

  it('surfaces dev-brain HTTP failures honestly', async () => {
    process.env.DEV_BRAIN_URL = 'http://brain.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const r = await rankProposalsWithStrategy([proposal('a'), proposal('b')]);
    expect(r.ok).toBe(false);
    expect(r.orderedIds).toEqual([]);
    expect(r.error).toContain('HTTP 500');
  });

  it('surfaces a malformed dev-brain response (no matrix options)', async () => {
    process.env.DEV_BRAIN_URL = 'http://brain.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ surprise: true }), { status: 200 })));
    const r = await rankProposalsWithStrategy([proposal('a'), proposal('b')]);
    expect(r.ok).toBe(false);
    expect(r.orderedIds).toEqual([]);
    expect(r.error).toBe('Dev-Brain returned no matrix options');
  });
});
