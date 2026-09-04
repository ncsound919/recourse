// src/dream/store.ts — persistence for the Dreaming Engine.
//
// The entire DreamState is one JSON document, so the engine stays
// stateless-serverless friendly. Two stores are provided:
//
//   1. InMemoryDreamStore — zero-config, survives dev hot-reload and warm
//      serverless instances via a globalThis singleton. State is lost on
//      cold starts, so use it for local dev / demos only.
//   2. SupabaseDreamStore — durable single-row upsert. Create the table:
//
//        create table if not exists dream_engine (
//          id text primary key,
//          state jsonb not null,
//          updated_at timestamptz not null default now()
//        );
//
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
// and the durable store is selected automatically.

import fs from 'node:fs';
import path from 'node:path';
import type { DreamState } from './types';

export interface DreamStore {
  load(): Promise<DreamState | null>;
  save(state: DreamState): Promise<void>;
}

export class InMemoryDreamStore implements DreamStore {
  private state: DreamState | null = null;
  async load(): Promise<DreamState | null> {
    return this.state;
  }
  async save(state: DreamState): Promise<void> {
    this.state = state;
  }
}

/** Durable file-backed dream store (default). One JSON document, survives
 *  restarts, no external infrastructure required. */
export class FileDreamStore implements DreamStore {
  constructor(private file: string = process.env.DREAM_STATE_FILE || path.join(process.cwd(), 'recourse_dream.json')) {}

  async load(): Promise<DreamState | null> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      return parsed && typeof parsed === 'object' ? (parsed as DreamState) : null;
    } catch {
      return null;
    }
  }

  async save(state: DreamState): Promise<void> {
    try {
      const tmpFile = `${this.file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.file);
    } catch (err) {
      console.warn('[dream:file_store] write failed:', err);
    }
  }
}

/** Shared singleton — persists across HMR in dev and across warm invocations. */
export function getSharedMemoryStore(): InMemoryDreamStore {
  const g = globalThis as unknown as { __dreamStore?: InMemoryDreamStore };
  g.__dreamStore ??= new InMemoryDreamStore();
  return g.__dreamStore;
}

export class SupabaseDreamStore implements DreamStore {
  constructor(
    private url: string,
    private key: string,
    private table = 'dream_engine',
  ) {}

  async load(): Promise<DreamState | null> {
    const res = await fetch(`${this.url}/rest/v1/${this.table}?id=eq.singleton&select=state`, {
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
      },
    });
    if (!res.ok) throw new Error(`dream store load failed: ${res.status}`);
    const rows = (await res.json()) as { state: DreamState }[];
    return rows.length ? rows[0].state : null;
  }

  async save(state: DreamState): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/${this.table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: 'singleton', state, updated_at: new Date().toISOString() }),
    });
    if (!res.ok && res.status !== 201) throw new Error(`dream store save failed: ${res.status}`);
  }
}

export function createDreamStore(): DreamStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) return new SupabaseDreamStore(url, key);
  return new FileDreamStore();
}
