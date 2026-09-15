import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  chemlabHealth,
  moleculeProperties,
  moleculeSimilarity,
  moleculeDruglikeness,
  moleculeRisk,
  simulateKinetics,
  parseReaction,
} from '../src/lib/chemlabBridge.js';

const BASE = 'http://chemlab.test';

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function abortError(): Error & { name: string } {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chemlabBridge — getJson paths', () => {
  it('health returns the parsed payload on a 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ status: 'ok', version: '1.0' })));
    const r = await chemlabHealth(BASE, 500);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ status: 'ok', version: '1.0' });
    expect(typeof r.latencyMs).toBe('number');
  });

  it('health reports ok:false with the HTTP status on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const r = await chemlabHealth(BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab HTTP 503');
  });

  it('health reports a timed-out error when fetch aborts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError()));
    const r = await chemlabHealth(BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab timed out after 500ms');
  });

  it('health surfaces the underlying error message for a plain failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await chemlabHealth(BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });

  it('health reports chemlab unreachable for a non-Error rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('boom'));
    const r = await chemlabHealth(BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab unreachable');
  });

  it('fires the abort timer when the upstream never answers (getJson)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(abortError()));
      })),
    );
    const r = await chemlabHealth(BASE, 50);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab timed out after 50ms');
  });
});

describe('chemlabBridge — postJson paths', () => {
  it('moleculeRisk posts the body verbatim and returns parsed data', async () => {
    const mock = vi.fn(async () => okJson({ risk: 'low' }));
    vi.stubGlobal('fetch', mock);
    const r = await moleculeRisk({ smiles: 'CC', embed: [1, 2] }, BASE, 500);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ risk: 'low' });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/molecule/risk`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ smiles: 'CC', embed: [1, 2] });
  });

  it('moleculeRisk reports ok:false on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })));
    const r = await moleculeRisk({}, BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab HTTP 400');
  });

  it('simulateKinetics reports a timeout honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError()));
    const r = await simulateKinetics({ temperature: 370 }, BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab timed out after 500ms');
  });

  it('simulateKinetics surfaces a rejection message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    const r = await simulateKinetics({}, BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('socket hang up');
  });

  it('postJson reports chemlab unreachable for a non-Error rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(42));
    const r = await parseReaction('A + B -> C', BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab unreachable');
  });

  it('fires the abort timer when the upstream never answers (postJson)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(abortError()));
      })),
    );
    const r = await moleculeRisk({ smiles: 'CC' }, BASE, 50);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab timed out after 50ms');
  });
});

describe('chemlabBridge — smiles guards and query building', () => {
  it('rejects a missing smiles string for moleculeProperties', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await moleculeProperties('   ', BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.latencyMs).toBe(0);
    expect(r.error).toBe('chemlab requires a smiles string');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('encodes the smiles query for moleculeProperties', async () => {
    const mock = vi.fn(async () => okJson({ properties: {} }));
    vi.stubGlobal('fetch', mock);
    const r = await moleculeProperties('C(=O)O', BASE, 500);
    expect(r.ok).toBe(true);
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BASE}/api/molecule/properties?smiles=C(%3DO)O`);
  });

  it('moleculeProperties reports an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const r = await moleculeProperties('CC', BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab HTTP 500');
  });

  it('rejects missing first smiles in moleculeSimilarity', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await moleculeSimilarity('', 'CC', BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab requires a smiles string');
  });

  it('rejects missing second smiles in moleculeSimilarity', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await moleculeSimilarity('CC', '   ', BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab requires a smiles string');
  });

  it('builds the two-smiles similarity query', async () => {
    const mock = vi.fn(async () => okJson({ score: 0.9 }));
    vi.stubGlobal('fetch', mock);
    const r = await moleculeSimilarity('C1CC1', 'C2CC2', BASE, 500);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ score: 0.9 });
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BASE}/api/molecule/similarity?smiles1=C1CC1&smiles2=C2CC2`);
  });

  it('rejects a missing smiles for moleculeDruglikeness', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await moleculeDruglikeness(undefined as unknown as string, BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chemlab requires a smiles string');
  });

  it('queries druglikeness with the encoded smiles', async () => {
    const mock = vi.fn(async () => okJson({ druglikeness: 0.6 }));
    vi.stubGlobal('fetch', mock);
    const r = await moleculeDruglikeness('CC(=O)O', BASE, 500);
    expect(r.ok).toBe(true);
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BASE}/api/molecule/druglikeness?smiles=CC(%3DO)O`);
  });
});

describe('chemlabBridge — reaction guard', () => {
  it('rejects an empty reaction string', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await parseReaction('   ', BASE, 500);
    expect(r.ok).toBe(false);
    expect(r.latencyMs).toBe(0);
    expect(r.error).toBe('chemlab requires a reaction string');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('posts the reaction to /api/reaction/parse', async () => {
    const mock = vi.fn(async () => okJson({ parsed: true }));
    vi.stubGlobal('fetch', mock);
    const r = await parseReaction('A + B -> C', BASE, 500);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ parsed: true });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/reaction/parse`);
    expect(JSON.parse(init.body as string)).toEqual({ reaction: 'A + B -> C' });
  });
});