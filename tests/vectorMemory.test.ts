import { describe, it, expect } from 'vitest';
import { openVectorMemory, lexicalEmbed, VEC_DIM } from '../src/lib/vectorMemory';

describe('vector memory (offline in-memory store + lexical embedder)', () => {
  it('produces fixed-dimension normalized lexical vectors', () => {
    const v = lexicalEmbed('merkle provenance integrity');
    expect(v).toHaveLength(VEC_DIM);
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
  });

  it('recalls the nearest remembered doc by semantic-ish lexical similarity', async () => {
    const mem = await openVectorMemory({ dir: '' }); // '' forces in-memory
    await mem.remember('gene', 'merkle_gene', 'cryptographic merkle tree root over provenance leaves');
    await mem.remember('gene', 'fft_gene', 'fast fourier transform over real signals');
    await mem.remember('lesson', 'dedupe_lesson', 'never dedupe with a bloom filter; false positives drop real signals');

    const hits = await mem.recall('provenance merkle integrity root', 'gene', 1);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('merkle_gene');
  });

  it('filters recall by kind', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'a', 'merkle tree over leaves');
    await mem.remember('lesson', 'b', 'merkle tree lessons learned');
    const genes = await mem.recall('merkle tree', 'gene', 5);
    expect(genes.every((h) => h.kind === 'gene')).toBe(true);
  });

  it('upserts by (id, kind) instead of duplicating', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('gene', 'g1', 'version one description');
    await mem.remember('gene', 'g1', 'version two updated description');
    expect(await mem.count()).toBe(1);
  });

  it('reports an honest status (store type + embedder)', async () => {
    const mem = await openVectorMemory({ dir: '' });
    await mem.remember('snapshot', 's1', 'boot baseline snapshot');
    const st = await mem.status();
    expect(st.store).toBe('memory');
    expect(['ollama', 'lexical']).toContain(st.embedder);
    expect(st.docs).toBe(1);
  });
});
