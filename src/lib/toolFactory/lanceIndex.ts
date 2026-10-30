/**
 * Persistent tool index backed by LanceDB.
 *
 * Wraps the in-memory `toolDiscovery` index with an on-disk LanceDB table so
 * tool embeddings survive process restarts and can be shared across the
 * phone/web/server surfaces. Falls back gracefully (returns false/[]) when
 * LanceDB is unavailable or the table cannot be opened — callers keep using
 * the in-memory index. LanceDB is loaded lazily so this module is safe to
 * import even when the native binding is missing.
 */

import { embedText } from './toolDiscovery.js';

export interface LanceToolRow {
  name: string;
  description: string;
  tags: string;
  vector: number[];
}

const TABLE_NAME = 'tool_index';
const DIM = 64;

let db: any = null;
let table: any = null;
let dbPath: string | null = null;
let lanceModule: any = null;
let loadAttempted = false;

async function loadLance(): Promise<any> {
  if (loadAttempted) return lanceModule;
  loadAttempted = true;
  try {
    lanceModule = await import('@lancedb/lancedb');
    return lanceModule;
  } catch {
    lanceModule = null;
    return null;
  }
}

export async function openLanceIndex(path: string): Promise<boolean> {
  const mod = await loadLance();
  if (!mod) return false;
  try {
    db = await mod.connect(path);
    const tables = await db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      table = await db.openTable(TABLE_NAME);
    } else {
      table = null;
    }
    dbPath = path;
    return true;
  } catch {
    db = null;
    table = null;
    dbPath = null;
    return false;
  }
}

export async function ensureLanceTable(): Promise<boolean> {
  if (!db) return false;
  if (table) return true;
  try {
    const seed: LanceToolRow = { name: '__seed__', description: '', tags: '', vector: Array.from({ length: DIM }, () => 0) };
    table = await db.createTable(TABLE_NAME, [seed], { mode: 'overwrite' });
    await table.delete("name = '__seed__'");
    return true;
  } catch {
    return false;
  }
}

export async function upsertTool(row: { name: string; description: string; tags: string[] }): Promise<boolean> {
  if (!db) return false;
  if (!table) {
    const ok = await ensureLanceTable();
    if (!ok) return false;
  }
  try {
    try { await table.delete(`name = '${row.name.replace(/'/g, "''")}'`); } catch { /* ignore */ }
    const vector = embedText([row.name, row.description, ...row.tags].join(' '));
    await table.add([{ name: row.name, description: row.description, tags: row.tags.join(','), vector }]);
    return true;
  } catch {
    return false;
  }
}

export async function searchLance(query: string, limit = 5): Promise<LanceToolRow[]> {
  if (!table) return [];
  try {
    const qv = embedText(query);
    const rows = await table.search(qv).limit(limit).toArray();
    return rows.map((r: any) => ({
      name: r.name,
      description: r.description,
      tags: r.tags,
      vector: Array.from(r.vector ?? []),
    }));
  } catch {
    return [];
  }
}

export async function countLance(): Promise<number> {
  if (!table) return 0;
  try {
    return await table.countRows();
  } catch {
    return 0;
  }
}

export function lanceAvailable(): boolean {
  return table !== null;
}

export function lancePath(): string | null {
  return dbPath;
}
