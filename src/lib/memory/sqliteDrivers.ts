/**
 * Durable tiered-memory drivers backed by SQLite (better-sqlite3).
 *
 * The in-memory drivers (drivers.ts) lose the episodic + semantic tiers on
 * every restart, which contradicts the "lifelong learning / replays
 * bit-for-bit" premise. These drivers persist both tiers to a single SQLite
 * database in WAL mode, so episodes survive restarts and ids stay unique across
 * process lifetimes (EpisodicStore is seeded from the existing row count).
 *
 * All writes are synchronous and transactional — no partial rows, no races.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Episode, EpisodeStoreDriver, SemanticFact, SemanticStoreDriver } from './types';

export interface SqliteMemoryDrivers {
  kind: 'sqlite';
  dbPath: string;
  episodeDriver: EpisodeStoreDriver;
  semanticDriver: SemanticStoreDriver;
  close(): void;
}

export function defaultMemoryDbPath(): string {
  if (process.env.MEMORY_DB) return path.resolve(process.env.MEMORY_DB);
  return path.join(process.cwd(), 'data', 'memory.sqlite');
}

/** Open (creating if needed) the durable memory database at `dbPath`. */
export function createSqliteMemoryDrivers(dbPath: string = defaultMemoryDbPath()): SqliteMemoryDrivers {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      problemFingerprint TEXT NOT NULL,
      toolName TEXT,
      outcome TEXT NOT NULL,
      score REAL NOT NULL,
      geneIds TEXT NOT NULL,
      summary TEXT NOT NULL,
      provenanceId TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_episodes_fingerprint ON episodes(problemFingerprint);
    CREATE INDEX IF NOT EXISTS idx_episodes_tool ON episodes(toolName);
    CREATE TABLE IF NOT EXISTS semantic_facts (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL,
      problemFingerprint TEXT,
      statement TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidenceEpisodeIds TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_facts_fingerprint ON semantic_facts(problemFingerprint);
  `);

  const insertEpisode = db.prepare(
    `INSERT INTO episodes(id, timestamp, problemFingerprint, toolName, outcome, score, geneIds, summary, provenanceId)
     VALUES (@id, @timestamp, @problemFingerprint, @toolName, @outcome, @score, @geneIds, @summary, @provenanceId)`,
  );
  const selectEpisodes = db.prepare(`SELECT * FROM episodes ORDER BY seq ASC`);
  const appendEpisode = db.transaction((e: Episode) => {
    insertEpisode.run({
      id: e.id,
      timestamp: e.timestamp,
      problemFingerprint: e.problemFingerprint,
      toolName: e.toolName ?? null,
      outcome: e.outcome,
      score: e.score,
      geneIds: JSON.stringify(e.geneIds ?? []),
      summary: e.summary ?? '',
      provenanceId: e.provenanceId ?? null,
    });
  });

  const insertFact = db.prepare(
    `INSERT INTO semantic_facts(id, problemFingerprint, statement, confidence, evidenceEpisodeIds, createdAt)
     VALUES (@id, @problemFingerprint, @statement, @confidence, @evidenceEpisodeIds, @createdAt)`,
  );
  const selectFacts = db.prepare(`SELECT * FROM semantic_facts ORDER BY seq ASC`);
  const appendFact = db.transaction((f: SemanticFact) => {
    insertFact.run({
      id: f.id,
      problemFingerprint: f.problemFingerprint ?? null,
      statement: f.statement,
      confidence: f.confidence,
      evidenceEpisodeIds: JSON.stringify(f.evidenceEpisodeIds ?? []),
      createdAt: f.createdAt,
    });
  });

  const parseArray = (raw: unknown): string[] => {
    if (typeof raw !== 'string') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  };

  return {
    kind: 'sqlite',
    dbPath,
    episodeDriver: {
      append(episode: Episode): void {
        appendEpisode(episode);
      },
      list(): Episode[] {
        return (selectEpisodes.all() as any[]).map((row) => ({
          id: String(row.id),
          timestamp: Number(row.timestamp),
          problemFingerprint: String(row.problemFingerprint),
          toolName: row.toolName == null ? undefined : String(row.toolName),
          outcome: row.outcome as Episode['outcome'],
          score: Number(row.score),
          geneIds: parseArray(row.geneIds),
          summary: String(row.summary ?? ''),
          provenanceId: row.provenanceId == null ? undefined : String(row.provenanceId),
        }));
      },
    },
    semanticDriver: {
      append(fact: SemanticFact): void {
        appendFact(fact);
      },
      list(): SemanticFact[] {
        return (selectFacts.all() as any[]).map((row) => ({
          id: String(row.id),
          problemFingerprint: row.problemFingerprint == null ? undefined : String(row.problemFingerprint),
          statement: String(row.statement),
          confidence: Number(row.confidence),
          evidenceEpisodeIds: parseArray(row.evidenceEpisodeIds),
          createdAt: Number(row.createdAt),
        }));
      },
    },
    close(): void {
      try {
        db.close();
      } catch {
        /* best effort */
      }
    },
  };
}
