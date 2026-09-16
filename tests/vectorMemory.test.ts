import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  openVectorMemory,
  lexicalEmbed,
  embedText,
  VEC_DIM,
  type MemoryKind,
} from '../src/lib/vectorMemory.js';

const okRes = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as any;

const tmpDirs: string[] = [];
function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vecmem-test-'));
  tmpDirs.push(d);
  return d;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv('EMBEDDING_MODEL', '');
  vi.stubEnv('EMBEDDING_BASE_URL', '');
  vi.stubEnv('API_MODEL_BASE_URL', '');
  vi.stubEnv('MODEL_BASE_URL', '');
  vi.stubEnv('RECOURSE_MEMORY_DIR', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('lexicalEmbed', () => {
  it('produces a fixed-dimension normalized vector', () => {
    const v = lexicalEmbed('merkle provenance integrity');
    expect(v).toHaveLength(VEC_DIM);
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-9);
  });

  it('is case-insensitive and punctuation-insensitive', () => {
    expect(lexicalEmbed('Merkle TREE!')).toEqual(lexicalEmbed('merkle tree'));
    expect(lexicalEmbed('foo-bar')).toEqual(lexicalEmbed('foo bar'));
  });

  it('returns an all-zero vector for empty / whitespace input', () => {
    const v = lexicalEmbed('   ');
    expect(v).toHaveLength(VEC_DIM);
    expect(v.every((x) => x === 0)).toBe(true);
  });

  it('is deterministic for the same text', () => {
    expect(lexicalEmbed('alphafold structure prediction')).toEqual(
      lexicalEmbed('alphafold structure prediction'),
    );
  });
});

describe('embedText (API embedder + lexical fallback)', () => {
  it('uses the API embedder when configured and reachable (data[0].embedding)', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local/');
    const vec = Array.from({ length: VEC_DIM }, (_, i) => (i === 0 ? 3 : 0));
    const fetchMock = vi.fn(async () => okRes({ data: [{ embedding: vec }] }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await embedText('hello world');
    expect(r.backend).toBe('api');
    expect(r.vec).toHaveLength(VEC_DIM);
    expect(Math.abs(r.vec[0] - 1)).toBeLessThan(1e-9);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toBe('http://embed.local/embeddings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).model).toBe('embed-1');
  });

  it('accepts the alternate embeddings[0] response shape', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubGlobal('fetch', vi.fn(async () => okRes({ embeddings: [[1, 2, 3]] })));
    const r = await embedText('x');
    expect(r.backend).toBe('api');
    expect(r.vec).toHaveLength(VEC_DIM);
  });

  it('sends an authorization header when an API key is configured', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubEnv('API_MODEL_API_KEY', 'secret-key');
    const fetchMock = vi.fn(async () => okRes({ data: [{ embedding: [1] }] }));
    vi.stubGlobal('fetch', fetchMock);
    await embedText('x');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(init.headers.authorization).toBe('Bearer secret-key');
  });

  it('falls back to lexical when no model/base is configured (no fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await embedText('hello');
    expect(r.backend).toBe('lexical');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to lexical on a non-2xx API response', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubGlobal('fetch', vi.fn(async () => okRes({ error: 'nope' }, 500)));
    const r = await embedText('hello');
    expect(r.backend).toBe('lexical');
  });

  it('falls back to lexical when the request throws', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const r = await embedText('hello');
    expect(r.backend).toBe('lexical');
  });

  it('falls back to lexical on an empty embedding vector', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubGlobal('fetch', vi.fn(async () => okRes({ data: [{ embedding: [] }] })));
    const r = await embedText('hello');
    expect(r.backend).toBe('lexical');
  });

  it('truncates over-long API vectors to VEC_DIM and normalizes', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    const long = Array.from({ length: VEC_DIM + 10 }, () => 2);
    vi.stubGlobal('fetch', vi.fn(async () => okRes({ data: [{ embedding: long }] })));
    const r = await embedText('hello');
    expect(r.backend).toBe('api');
    expect(r.vec).toHaveLength(VEC_DIM);
    const norm = Math.sqrt(r.vec.reduce((a, x) => a + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-9);
  });

  it('pads short API vectors to VEC_DIM', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubGlobal('fetch', vi.fn(async () => okRes({ data: [{ embedding: [1, 1, 1] }] })));
    const r = await embedText('hello');
    expect(r.vec).toHaveLength(VEC_DIM);
    expect(r.vec[VEC_DIM - 1]).toBe(0);
  });
});

describe('VectorMemory (in-memory store)', () => {
  it('recalls the nearest doc by lexical similarity and honours topK', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'merkle_gene', 'cryptographic merkle tree root over provenance leaves');
    await mem.remember('gene', 'fft_gene', 'fast fourier transform over real signals');
    await mem.remember('lesson', 'dedupe_lesson', 'never dedupe with a bloom filter; false positives drop real signals');

    const hits = await mem.recall('provenance merkle integrity root', 'gene', 1);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('merkle_gene');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('filters recall by kind and can search all kinds', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'a', 'merkle tree over leaves');
    await mem.remember('lesson', 'b', 'merkle tree lessons learned');
    expect((await mem.recall('merkle tree', 'gene', 5)).every((h) => h.kind === 'gene')).toBe(true);
    expect((await mem.recall('merkle tree', null, 5)).length).toBe(2);
  });

  it('upserts by (id, kind): same kind replaces, different kind coexists', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'g1', 'version one description');
    await mem.remember('gene', 'g1', 'version two updated description');
    expect(await mem.count()).toBe(1);
    expect((await mem.recall('version two', 'gene', 1))[0].text).toContain('version two');

    await mem.remember('lesson', 'g1', 'a lesson with the same id but another kind');
    expect(await mem.count()).toBe(2);
  });

  it('ignores empty text without embedding and keeps the embedder honest', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'empty', '');
    expect(await mem.count()).toBe(0);
    const st = await mem.status();
    expect(st.embedder).toBe('unknown');
    expect(st.store).toBe('memory');
    expect(st.dir).toBeUndefined();
  });

  it('keeps separate ids that share a kind', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('signal', 's1', 'some signal text');
    await mem.remember('signal', 's2', 'another signal text');
    const hits = await mem.recall('signal text', 'signal', 5);
    expect(hits.map((h) => h.id).sort()).toEqual(['s1', 's2']);
    expect(await mem.count()).toBe(2);
  });

  it('reports the actual embedder after a remember (lexical when unconfigured)', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('snapshot', 's1', 'boot baseline snapshot');
    const st = await mem.status();
    expect(st.store).toBe('memory');
    expect(st.embedder).toBe('lexical');
    expect(st.docs).toBe(1);
  });

  it('reports the API embedder when the API path is used', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'embed-1');
    vi.stubEnv('EMBEDDING_BASE_URL', 'http://embed.local');
    vi.stubGlobal('fetch', vi.fn(async () => okRes({ data: [{ embedding: [1, 0, 0] }] })));
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'api_doc', 'api embedded doc');
    expect((await mem.status()).embedder).toBe('api');
  });

  it('close() resolves for the in-memory store (no native handle)', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await expect(mem.close()).resolves.toBeUndefined();
  });

  it('treats an empty recall query as a zero vector without throwing', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'a', 'anything');
    const hits = await mem.recall('', 'gene', 5);
    expect(hits).toHaveLength(1);
  });
});

describe('VectorMemory (LanceDB when the native module loads)', () => {
  it('opens a temp dir, round-trips a doc, removes it, and closes', async () => {
    const dir = mkTmp();
    const mem = await openVectorMemory({ dir });
    const st = await mem.status();
    expect(['lancedb', 'memory']).toContain(st.store);

    await mem.remember('gene', 'lance_gene', 'lancedb backed merkle provenance memory', { tag: 'x' });
    expect(await mem.count()).toBe(1);

    const hits = await mem.recall('merkle provenance memory', 'gene', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('lance_gene');

    if (st.store === 'lancedb') {
      expect(st.dir).toBe(dir);
      // meta was persisted as a JSON string and rehydrated on recall.
      expect(hits[0].meta).toEqual({ tag: 'x' });
    } else {
      expect(st.dir).toBeUndefined();
    }

    await mem.close();
  });
});

// Guard the MemoryKind type stays wired to the public API (compile-time + runtime).
describe('MemoryKind surface', () => {
  it('accepts every documented kind', async () => {
    const kinds: MemoryKind[] = ['gene', 'lesson', 'hypothesis', 'signal', 'snapshot'];
    const mem = await openVectorMemory({ dir: '' });
    for (const k of kinds) await mem.remember(k, `id_${k}`, `text for ${k}`);
    expect(await mem.count()).toBe(kinds.length);
  });
});
