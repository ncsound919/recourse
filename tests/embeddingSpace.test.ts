import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { embedText, openVectorMemory, VEC_DIM } from '../src/lib/vectorMemory';

/**
 * Embedding-space correctness.
 *
 * Cosine between an API embedding and a lexical-hash vector is meaningless. A
 * store written lexically and later searched with API embeddings returns
 * confident nonsense, and — measured — recall fell from 6/8 to 1/8 when real
 * embeddings were switched on against a mixed corpus, because only 3.2% of rows
 * shared the active space and the ANN candidate window was drawn from all of them.
 *
 * These tests pin the three things that made that recoverable:
 *  - documents are embedded with the DOCUMENT prefix, queries with the QUERY one;
 *  - every stored row records the backend that produced its vector;
 *  - recall never compares across spaces, and status says when a store is mixed.
 */

interface Fake { url: string; close: () => Promise<void>; lastInput: () => string }

/** OpenAI-shaped /embeddings that rejects over-long input like llama.cpp does. */
async function serveEmbeddings(opts: { maxChars?: number } = {}): Promise<Fake> {
  let last = '';
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { input } = JSON.parse(body) as { input: string };
        last = input;
        if (opts.maxChars && input.length > opts.maxChars) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'input is too large to process' } }));
          return;
        }
        // Deterministic, length-sensitive pseudo-embedding so ordering is stable.
        const vec = Array.from({ length: VEC_DIM }, (_, i) => ((input.charCodeAt(i % input.length) || 0) % 17) / 17);
        const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ embedding: vec.map((x) => x / n) }] }));
      } catch (e: any) {
        res.writeHead(400); res.end(String(e?.message));
      }
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => srv.close(() => r())), lastInput: () => last };
}

const KEYS = ['EMBEDDING_MODEL', 'EMBEDDING_BASE_URL', 'EMBED_QUERY_PREFIX', 'EMBED_DOC_PREFIX', 'EMBEDDING_TIMEOUT_MS'] as const;
let saved: Record<string, string | undefined> = {};
let fake: Fake | null = null;

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  fake = null;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.EMBED_QUERY_PREFIX;
  delete process.env.EMBED_DOC_PREFIX;
  delete process.env.EMBEDDING_TIMEOUT_MS;
});
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe('task prefixes', () => {
  it('prefixes documents and queries differently', async () => {
    fake = await serveEmbeddings();
    process.env.EMBEDDING_MODEL = 'nomic-embed';
    process.env.EMBEDDING_BASE_URL = fake.url;
    process.env.EMBED_DOC_PREFIX = 'search_document:';
    process.env.EMBED_QUERY_PREFIX = 'search_query:';

    await embedText('hello world', 'doc');
    const docInput = fake.lastInput();
    await embedText('hello world', 'query');
    const queryInput = fake.lastInput();

    expect(docInput.startsWith('search_document:')).toBe(true);
    expect(queryInput.startsWith('search_query:')).toBe(true);
    expect(docInput).not.toBe(queryInput);
  }, 60_000);

  it('sends the text unprefixed when no prefixes are configured', async () => {
    fake = await serveEmbeddings();
    process.env.EMBEDDING_MODEL = 'nomic-embed';
    process.env.EMBEDDING_BASE_URL = fake.url;
    await embedText('plain text', 'doc');
    expect(fake.lastInput()).toBe('plain text');
  }, 60_000);
});

describe('over-long input is truncated, not silently downgraded', () => {
  it('caps the embedder input so a long document is still embedded semantically', async () => {
    // The server rejects anything over the cap + epsilon, as llama.cpp's 512-token
    // physical batch did. A 4000-char document must therefore be truncated to the
    // cap rather than rejected and silently downgraded to lexical.
    const CAP = 2400;
    fake = await serveEmbeddings({ maxChars: CAP + 100 });
    process.env.EMBEDDING_MODEL = 'nomic-embed';
    process.env.EMBEDDING_BASE_URL = fake.url;
    const long = 'a'.repeat(4000);
    const r = await embedText(long, 'doc');
    expect(r.backend).toBe('api');
    expect(r.vec).toHaveLength(VEC_DIM);
    expect(fake.lastInput().length).toBe(CAP);
  }, 60_000);

  it('falls back to lexical when the provider genuinely cannot serve the text', async () => {
    // No truncation can help if the provider is down: the honest outcome is a
    // lexical vector, not a fabricated API one.
    fake = await serveEmbeddings({ maxChars: 10 });
    process.env.EMBEDDING_MODEL = 'nomic-embed';
    process.env.EMBEDDING_BASE_URL = fake.url;
    const r = await embedText('a'.repeat(4000), 'doc');
    expect(r.backend).toBe('lexical');
    expect(r.vec).toHaveLength(VEC_DIM);
  }, 60_000);
});

describe('embedding-space isolation', () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'embspace-'));
    dirs.push(d);
    return path.join(d, 'store');
  };
  afterEach(() => {
    for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
    dirs.length = 0;
  });

  it('tags stored rows with the backend and never recalls across spaces', async () => {
    // Write a lexical row, then switch to API embeddings and write an api row.
    const dir = tmp();
    const lexical = await openVectorMemory({ dir });
    await lexical.remember('lesson', 'written-lexically', 'a lesson stored before embeddings were configured');
    await lexical.close();

    fake = await serveEmbeddings();
    process.env.EMBEDDING_MODEL = 'nomic-embed';
    process.env.EMBEDDING_BASE_URL = fake.url;

    const api = await openVectorMemory({ dir });
    try {
      await api.remember('lesson', 'written-with-api', 'a lesson stored after embeddings were configured');
      const st = await api.status();
      expect(st.embedder).toBe('api');
      // Both spaces present -> the store is honestly mixed.
      expect(st.mixedEmbedders).toBe(true);

      const hits = await api.recall('a lesson stored after embeddings', 'lesson', 5);
      expect(hits.map((h) => h.id)).toContain('written-with-api');
      // The lexical row must NOT be returned: its vector is not comparable.
      expect(hits.map((h) => h.id)).not.toContain('written-lexically');
    } finally { await api.close(); }
  }, 120_000);
});