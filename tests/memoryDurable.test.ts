import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteMemoryDrivers } from '../src/lib/memory/sqliteDrivers';
import { EpisodicStore } from '../src/lib/memory/episodicStore';
import { SemanticStore } from '../src/lib/memory/semanticStore';
import type { Episode } from '../src/lib/memory/types';

type NewEpisode = Omit<Episode, 'id' | 'timestamp'>;

function episode(overrides: Partial<NewEpisode> = {}): NewEpisode {
  return {
    problemFingerprint: 'layout/metric-load',
    outcome: 'loss',
    score: 0,
    geneIds: ['gene-a'],
    summary: 'test episode',
    ...overrides,
  };
}

const dirs: string[] = [];
function freshDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-mem-'));
  dirs.push(dir);
  return path.join(dir, 'memory.sqlite');
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('durable SQLite memory drivers', () => {
  it('persists episodes across a close/reopen and resumes ids without collision', () => {
    const dbPath = freshDb();

    const first = createSqliteMemoryDrivers(dbPath);
    const storeA = new EpisodicStore({ driver: first.episodeDriver, startSequence: first.episodeDriver.list().length });
    storeA.record(episode());
    storeA.record(episode({ problemFingerprint: 'intake/rss-parse' }));
    expect(storeA.all().map((e) => e.id)).toEqual(['ep-1', 'ep-2']);
    first.close();

    // Reopen — same rows, and the sequence resumes at 2 so the next id is ep-3.
    const second = createSqliteMemoryDrivers(dbPath);
    const storeB = new EpisodicStore({ driver: second.episodeDriver, startSequence: second.episodeDriver.list().length });
    expect(storeB.all().map((e) => e.id)).toEqual(['ep-1', 'ep-2']);
    storeB.record(episode({ problemFingerprint: 'p3' }));
    expect(storeB.all().map((e) => e.id)).toEqual(['ep-1', 'ep-2', 'ep-3']);
    second.close();
  });

  it('round-trips every episode field, including optional ones', () => {
    const dbPath = freshDb();
    const drivers = createSqliteMemoryDrivers(dbPath);
    const store = new EpisodicStore({ driver: drivers.episodeDriver });
    store.record({
      problemFingerprint: 'fp',
      toolName: 'tool-x',
      outcome: 'win',
      score: 0.75,
      geneIds: ['g1', 'g2'],
      summary: 'hello',
      provenanceId: 'prov-9',
    });
    const [e] = store.all();
    expect(e).toMatchObject({
      problemFingerprint: 'fp',
      toolName: 'tool-x',
      outcome: 'win',
      score: 0.75,
      geneIds: ['g1', 'g2'],
      summary: 'hello',
      provenanceId: 'prov-9',
    });
    drivers.close();
  });

  it('semantic consolidation is idempotent across a reopen', () => {
    const dbPath = freshDb();
    const first = createSqliteMemoryDrivers(dbPath);
    const episodicA = new EpisodicStore({ driver: first.episodeDriver });
    episodicA.record(episode({ outcome: 'loss' }));
    episodicA.record(episode({ outcome: 'loss' }));
    const semanticA = new SemanticStore(first.semanticDriver, first.semanticDriver.list().length);
    const createdA = semanticA.consolidate(episodicA.all(), { minClusterSize: 2 });
    expect(createdA).toHaveLength(1);
    expect(createdA[0].problemFingerprint).toBe('layout/metric-load');
    first.close();

    const second = createSqliteMemoryDrivers(dbPath);
    const semanticB = new SemanticStore(second.semanticDriver, second.semanticDriver.list().length);
    expect(semanticB.facts()).toHaveLength(1);
    // Re-consolidating the same cluster emits nothing new.
    const createdB = semanticB.consolidate(
      [{ id: 'x', timestamp: 1, problemFingerprint: 'layout/metric-load', outcome: 'loss', score: 0, geneIds: [], summary: '' }],
      { minClusterSize: 1 },
    );
    expect(createdB).toHaveLength(0);
    expect(semanticB.facts()).toHaveLength(1);
    second.close();
  });
});
