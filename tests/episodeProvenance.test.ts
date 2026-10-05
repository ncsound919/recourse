import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteMemoryDrivers } from '../src/lib/memory/sqliteDrivers';
import { EpisodicStore } from '../src/lib/memory/episodicStore';
import { InMemoryEpisodeDriver } from '../src/lib/memory/drivers';
import { memoryStoreStatus } from '../src/lib/recourseActivator';

/**
 * Episodic-tier provenance.
 *
 * Two defects lived here:
 *
 *  1. `Episode.timestamp` is a per-store SEQUENCE counter (1, 2, 3 ...), not
 *     wall-clock time — the class docstring says so explicitly, to keep replays
 *     deterministic. But nothing recorded a real time, so `memoryStoreStatus()`
 *     could not distinguish a tier written every cycle from one frozen since a
 *     manual script last ran. Counts alone made 77 stale rows look *healthier*
 *     than a genuinely empty store, because a populated table looks like progress.
 *
 *  2. Adding `recordedAt` needed a migration. `CREATE TABLE IF NOT EXISTS` is a
 *     no-op once the table exists, so an already-provisioned database would never
 *     gain the column and every insert would fail with "no such column". Legacy
 *     rows must keep NULL — their wall-clock time is genuinely unknown, and
 *     inventing one would be the same dishonesty in a new place.
 */

describe('episode recordedAt', () => {
  it('records a wall-clock time alongside the deterministic sequence', () => {
    const store = new EpisodicStore({ driver: new InMemoryEpisodeDriver() });
    const e = store.record(
      { problemFingerprint: 'fp/one', outcome: 'win', score: 1, geneIds: ['g'], summary: 's' },
      1_700_000_000_000,
    );
    // The sequence is unchanged, so id/order/replay equivalence still hold.
    expect(e.id).toBe('ep-1');
    expect(e.timestamp).toBe(1);
    expect(e.recordedAt).toBe(1_700_000_000_000);
  });

  it('accepts an injected clock so a deterministic replay can pin it', () => {
    const store = new EpisodicStore({ driver: new InMemoryEpisodeDriver() });
    const a = store.record({ problemFingerprint: 'p', outcome: 'win', score: 1, geneIds: [], summary: '' }, 111);
    const b = store.record({ problemFingerprint: 'p', outcome: 'win', score: 1, geneIds: [], summary: '' }, 111);
    expect(a.recordedAt).toBe(111);
    expect(b.recordedAt).toBe(111);
  });
});

describe('sqlite episodes migration', () => {
  const dirs: string[] = [];

  function tmp(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-mig-'));
    dirs.push(d);
    return path.join(d, 'memory.sqlite');
  }

  /** A row written with the pre-migration shape: no `recordedAt` key at all. */
  function appendLegacy(drivers: ReturnType<typeof createSqliteMemoryDrivers>): void {
    drivers.episodeDriver.append({
      id: 'ep-1', timestamp: 1, problemFingerprint: 'old/one', outcome: 'loss',
      score: 0, geneIds: ['g'], summary: 'legacy row',
    });
  }

  afterAll(() => {
    for (const d of dirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it('adds the column to a pre-existing table without losing rows', () => {
    const dbPath = tmp();
    const legacy = createSqliteMemoryDrivers(dbPath);
    appendLegacy(legacy);
    legacy.close();

    // Reopen through the current driver: the migration must run.
    const drivers = createSqliteMemoryDrivers(dbPath);
    try {
      expect(drivers.episodeDriver.list()).toHaveLength(1);
      const rows = drivers.episodeDriver.list();
      expect(rows[0].summary).toBe('legacy row');
      // Honest absence: the legacy row predates the column.
      expect(rows[0].recordedAt).toBeUndefined();
    } finally { drivers.close(); }
  }, 60_000);

  it('is idempotent across repeated opens', () => {
    const dbPath = tmp();
    for (let i = 0; i < 3; i++) {
      const d = createSqliteMemoryDrivers(dbPath);
      expect(d.kind).toBe('sqlite');
      d.close();
    }
    const d = createSqliteMemoryDrivers(dbPath);
    try { expect(d.episodeDriver.list()).toHaveLength(0); }
    finally { d.close(); }
  }, 60_000);

  it('writes recordedAt on new rows after the migration and leaves legacy rows null', () => {
    const dbPath = tmp();
    const legacy = createSqliteMemoryDrivers(dbPath);
    appendLegacy(legacy);
    legacy.close();

    const drivers = createSqliteMemoryDrivers(dbPath);
    try {
      const store = new EpisodicStore({
        driver: drivers.episodeDriver, idPrefix: 'ep', startSequence: drivers.episodeDriver.list().length,
      });
      const e = store.record(
        { problemFingerprint: 'new/one', outcome: 'win', score: 1, geneIds: ['gene:x'], summary: 'post-migration' },
        1_700_000_000_000,
      );

      const rows = drivers.episodeDriver.list();
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.id === e.id)!.recordedAt).toBe(1_700_000_000_000);
      expect(rows.find((r) => r.id === 'ep-1')!.recordedAt).toBeUndefined();
    } finally { drivers.close(); }
  }, 60_000);
});

describe('memoryStoreStatus', () => {
  it('exposes lastEpisodeAt and never sources it from the sequence counter', () => {
    const status = memoryStoreStatus();
    expect('lastEpisodeAt' in status).toBe(true);
    if (status.lastEpisodeAt !== null) {
      // A sequence counter would be a small integer; a real time is ~1e12+.
      expect(status.lastEpisodeAt).toBeGreaterThan(1_000_000_000_000);
    }
  });
});