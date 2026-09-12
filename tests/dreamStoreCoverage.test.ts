import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  InMemoryDreamStore,
  FileDreamStore,
  getSharedMemoryStore,
  SupabaseDreamStore,
  createDreamStore,
} from '../src/dream/store';
import type { DreamState } from '../src/dream/types';

const STATE: DreamState = {
  isDreamingActive: true,
  currentPhase: 'rem_counterfactual_sim',
  dreamCyclesCompleted: 1,
  cognitiveCoherence: 0.6,
  totalCrystallizedGenes: 0,
  recentThoughts: [],
  registry: [],
  seed: 1,
  tick: 1,
  lastTickAt: null,
  prunedCount: 0,
};

describe('store.ts coverage', () => {
  const tmp = path.join(os.tmpdir(), `recourse_store_${Date.now()}`);
  beforeEach(() => { fs.mkdirSync(tmp, { recursive: true }); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  describe('InMemoryDreamStore', () => {
    it('returns null before save, then returns the saved state', async () => {
      const store = new InMemoryDreamStore();
      expect(await store.load()).toBeNull();
      await store.save(STATE);
      expect(await store.load()).toBe(STATE);
    });
  });

  describe('getSharedMemoryStore', () => {
    it('returns the same singleton instance', () => {
      const a = getSharedMemoryStore();
      const b = getSharedMemoryStore();
      expect(a).toBe(b);
      expect(a).toBeInstanceOf(InMemoryDreamStore);
    });
  });

  describe('FileDreamStore', () => {
    it('load returns null when the file is missing', async () => {
      const store = new FileDreamStore(path.join(tmp, 'missing.json'));
      expect(await store.load()).toBeNull();
    });

    it('round-trips a state through the file', async () => {
      const file = path.join(tmp, 'roundtrip.json');
      const store = new FileDreamStore(file);
      await store.save(STATE);
      const loaded = await store.load();
      expect(loaded).toEqual(STATE);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.existsSync(`${file}.tmp`)).toBe(false); // tmp renamed away
    });

    it('returns null when the file holds a non-object value', async () => {
      const file = path.join(tmp, 'nonobject.json');
      fs.writeFileSync(file, '42', 'utf-8');
      const store = new FileDreamStore(file);
      expect(await store.load()).toBeNull();
    });

    it('returns null on a parse error', async () => {
      const file = path.join(tmp, 'bad.json');
      fs.writeFileSync(file, '{not json', 'utf-8');
      const store = new FileDreamStore(file);
      expect(await store.load()).toBeNull();
    });

    it('logs and swallows a write failure', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Parent directory does not exist -> writeFileSync throws -> caught.
      const store = new FileDreamStore(path.join(tmp, 'no', 'dir', 'state.json'));
      await store.save(STATE);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('SupabaseDreamStore', () => {
    const origFetch = globalThis.fetch;

    function mockFetch(result: { ok: boolean; status: number; json: () => Promise<unknown> }) {
      globalThis.fetch = vi.fn(async () => result) as unknown as typeof fetch;
    }

    afterEach(() => {
      globalThis.fetch = origFetch;
    });

    it('load returns the row state when present', async () => {
      mockFetch({ ok: true, status: 200, json: async () => [{ state: STATE }] });
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key');
      expect(await store.load()).toEqual(STATE);
    });

    it('load returns null when there are no rows', async () => {
      mockFetch({ ok: true, status: 200, json: async () => [] });
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key');
      expect(await store.load()).toBeNull();
    });

    it('load throws when the response is not ok', async () => {
      mockFetch({ ok: false, status: 500, json: async () => [] });
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key');
      await expect(store.load()).rejects.toThrow(/load failed/);
    });

    it('save accepts a 201 (created) response', async () => {
      mockFetch({ ok: false, status: 201, json: async () => ({}) });
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key');
      await expect(store.save(STATE)).resolves.toBeUndefined();
    });

    it('save accepts an ok response', async () => {
      mockFetch({ ok: true, status: 200, json: async () => ({}) });
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key');
      await expect(store.save(STATE)).resolves.toBeUndefined();
    });

    it('save throws on a non-201 error', async () => {
      mockFetch({ ok: false, status: 500, json: async () => ({}) });
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key');
      await expect(store.save(STATE)).rejects.toThrow(/save failed/);
    });

    it('uses the configured table name', async () => {
      const fn = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => [] }));
      globalThis.fetch = fn as unknown as typeof fetch;
      const store = new SupabaseDreamStore('https://x.supabase.co', 'key', 'custom_table');
      await store.load();
      const url = fn.mock.calls[0][0];
      expect(url).toContain('/custom_table');
    });
  });

  describe('createDreamStore', () => {
    const keep = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, anon: process.env.SUPABASE_ANON_KEY };
    afterEach(() => {
      if (keep.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = keep.url;
      if (keep.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = keep.key;
      if (keep.anon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = keep.anon;
    });

    it('returns a Supabase store when url+service key are set', () => {
      process.env.SUPABASE_URL = 'https://x.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk';
      delete process.env.SUPABASE_ANON_KEY;
      expect(createDreamStore()).toBeInstanceOf(SupabaseDreamStore);
    });

    it('returns a Supabase store when url+anon key are set', () => {
      process.env.SUPABASE_URL = 'https://x.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_ANON_KEY = 'anon';
      expect(createDreamStore()).toBeInstanceOf(SupabaseDreamStore);
    });

    it('returns a File store when no credentials are set', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_ANON_KEY;
      expect(createDreamStore()).toBeInstanceOf(FileDreamStore);
    });
  });
});
