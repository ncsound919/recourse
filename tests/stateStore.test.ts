import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createStateStore } from '../src/lib/stateStore';

let dir: string;
let stateFile: string;
const openStores: Array<ReturnType<typeof createStateStore>> = [];

function makeStore(opts: Parameters<typeof createStateStore>[0]) {
  const store = createStateStore(opts);
  openStores.push(store);
  return store;
}

function openRaw(): InstanceType<typeof Database> {
  return new Database(stateFile, { readonly: true });
}

function rows(db: InstanceType<typeof Database>): Array<{ key: string; value: string }> {
  return db.prepare('SELECT key, value FROM kv_state').all() as Array<{ key: string; value: string }>;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'statestore-'));
  stateFile = join(dir, 'state.json');
});

afterEach(() => {
  for (const s of openStores) s.close();
  openStores.length = 0;
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('StateStore — persistence module (better-sqlite3 backed)', () => {
  it('debounces multiple save() calls into a single write', async () => {
    vi.useFakeTimers();
    let payload = { n: 1 };
const store = makeStore({  stateFile, debounceMs: 1000, getPayload: () => payload });
    store.save();
    store.save();
    store.save(); // storm — should coalesce
    // nothing persisted yet (a fresh store with no writes has no rows)
    expect(store.load()).toBeNull();
    await vi.advanceTimersByTimeAsync(1100);
    expect(store.load()).toEqual({ n: 1 });
    const raw = openRaw();
    expect(rows(raw)).toHaveLength(1);
    raw.close();
  });

  it('persists the whole payload atomically in a real SQLite transaction (WAL, no tmp file)', async () => {
    vi.useFakeTimers();
const store = makeStore({  stateFile, debounceMs: 500, getPayload: () => ({ registry: [{ name: 'x' }], a: 1, b: 'two', c: [3] }) });
    store.save();
    await vi.advanceTimersByTimeAsync(600);
    // atomic: no tmp file left behind
    expect(existsSync(`${stateFile}.tmp`)).toBe(false);
    // WAL journal mode is active
    const raw = openRaw();
    expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
    // payload stored as one row per top-level key
    const stored = rows(raw);
    expect(stored.map((r) => r.key).sort()).toEqual(['a', 'b', 'c', 'registry']);
    raw.close();
    // and round-trips through the store
    expect(store.load()).toEqual({ registry: [{ name: 'x' }], a: 1, b: 'two', c: [3] });
  });

  it('load() returns null when nothing has been persisted', () => {
const store = makeStore({  stateFile, getPayload: () => ({}) });
    expect(store.load()).toBeNull();
  });

  it('load() round-trips a previously saved payload', async () => {
    vi.useFakeTimers();
const store = makeStore({  stateFile, debounceMs: 500, getPayload: () => ({ a: 1, b: 'two', c: [3] }) });
    store.save();
    await vi.advanceTimersByTimeAsync(600);
    const loaded = store.load();
    expect(loaded).toEqual({ a: 1, b: 'two', c: [3] });
  });

  it('calls saveGoalLedger alongside the write', async () => {
    vi.useFakeTimers();
    const ledger = vi.fn();
const store = makeStore({  stateFile, debounceMs: 500, getPayload: () => ({}), saveGoalLedger: ledger });
    store.save();
    await vi.advanceTimersByTimeAsync(600);
    expect(ledger).toHaveBeenCalledTimes(1);
  });

  it('flush() writes immediately (used on shutdown)', () => {
    vi.useFakeTimers();
const store = makeStore({  stateFile, debounceMs: 100000, getPayload: () => ({ flush: true }) });
    store.save();
    expect(store.load()).toBeNull(); // debounce pending
    store.flush();
    expect(store.load()).toEqual({ flush: true });
  });

  it('does not throw on a payload that fails to serialize (honest warn, not crash)', async () => {
    vi.useFakeTimers();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
const store = makeStore({ 
      stateFile,
      debounceMs: 500,
      getPayload: () => circular,
      saveGoalLedger: vi.fn(),
    });
    expect(() => store.save()).not.toThrow();
    await vi.advanceTimersByTimeAsync(600);
    expect(store.load()).toBeNull(); // nothing written — failed honestly
  });

  it('migrates a pre-existing legacy JSON file into SQLite on open', async () => {
    writeFileSync(stateFile, JSON.stringify({ generation: 42, registry: [{ name: 'x' }] }), 'utf-8');
const store = makeStore({  stateFile, getPayload: () => ({}) });
    expect(store.load()).toEqual({ generation: 42, registry: [{ name: 'x' }] });
    // the file is now a SQLite database (magic header), not JSON
    const raw = openRaw();
    expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
    raw.close();
  });

  it('preserves the exact public store API surface', () => {
const store = makeStore({  stateFile, getPayload: () => ({}) });
    expect(typeof store.save).toBe('function');
    expect(typeof store.load).toBe('function');
    expect(typeof store.flush).toBe('function');
    expect(typeof store.stateFile).toBe('function');
    expect(store.stateFile()).toBe(stateFile);
  });
});
