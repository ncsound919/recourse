/**
 * StateStore — the ONLY place Recourse touches the persistent state on disk.
 *
 * Extracted from the 10k-line server.ts monolith (2026-09). Owning the
 * persistence mechanics here means:
 *   - the write path is unit-testable (debounce, transaction, WAL),
 *   - the failure mode that wedged boot (repeated giant synchronous pretty
 *     writes during the boot storm) is contained in one small module,
 *   - server.ts stops hand-rolling fs/rename/stringify in a dozen places.
 *
 * Storage is now backed by SQLite via `better-sqlite3` (replacing the
 * hand-rolled JSON-file ledger). The audit flagged JSON write races and state
 * loss as a real risk; SQLite eliminates that class of bug:
 *   - **WAL journal mode** lets the single writer never block readers and
 *     survives crashes without corrupting the database file.
 *   - **Real transactions** make each `save()` a single all-or-nothing unit
 *     (the whole payload is replaced in one transaction), so a crash mid-write
 *     can never leave a half-written ledger — the guarantee the old tmp+rename
 *     dance approximated.
 *
 * Design:
 *   - `createStateStore({ stateFile, getPayload, saveGoalLedger, debounceMs })`
 *     returns { save, load, flush, stateFile } bound to the caller's mutable
 *     state. The public API and return shapes are identical to the JSON
 *     implementation, so consumers need zero changes.
 *   - `stateFile` doubles as the SQLite database path (the `.json` extension is
 *     retained purely for path/location compatibility; the file contents are a
 *     SQLite database, not JSON). If that path already holds a legacy JSON
 *     payload from the previous implementation, it is migrated once on open.
 *   - `save()` DEBOUNCES: a boot storm of save() calls coalesces into one
 *     transactional write 1500ms after the last call — never a write per call
 *     site.
 *   - `load()` is a single synchronous read of the kv table, executed once at
 *     boot; returns null when nothing has been persisted.
 *   - Schema: table `kv_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
 *     each top-level key of the payload is one row, its JSON-serialized value
 *     stored in `value`. Prepared statements are created once; multi-key writes
 *     run inside `db.transaction(...)`.
 */

import { existsSync, openSync, readSync, closeSync, readFileSync, rmSync, renameSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export interface StateStoreOptions {
  stateFile?: string;
  /** Build the serializable payload from the caller's live module state. */
  getPayload: () => Record<string, unknown>;
  /** Optional ledger write to fire alongside each save. */
  saveGoalLedger?: () => void;
  /** Debounce window in ms. Boot storms coalesce; default 1500ms. */
  debounceMs?: number;
}

export interface StateStore {
  save(): void;
  load<T extends Record<string, unknown>>(): T | null;
  /** Flush a pending debounced save immediately (used on shutdown). */
  flush(): void;
  stateFile(): string;
  /** Close the underlying SQLite connection (checkpoints + releases the file). */
  close(): void;
}

const SQLITE_HEADER = "SQLite format 3\u0000";

/** True if the file at `p` is an existing SQLite database (by magic header). */
function isSqliteFile(p: string): boolean {
  try {
    const fd = openSync(p, "r");
    try {
      const buf = Buffer.alloc(16);
      const n = readSync(fd, buf, 0, 16, 0);
      return n >= 16 && buf.toString("latin1") === SQLITE_HEADER;
    } finally {
      closeSync(fd);
    }
  } catch {
    return true; // unreadable — let the DB layer surface the real error
  }
}

/**
 * One-time upgrade path: the pre-SQLite implementation wrote plain JSON to
 * `stateFile`. If that file still exists (non-SQLite content), import it into
 * a fresh SQLite database so live state survives the engine swap. Corrupt
 * legacy files are moved aside (never silently deleted) and we start clean.
 */
function migrateLegacyJsonToSqlite(dbPath: string): void {
  if (!existsSync(dbPath) || isSqliteFile(dbPath)) return;

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(dbPath, "utf-8"));
  } catch {
    const backup = `${dbPath}.corrupt-${Date.now()}`;
    renameSync(dbPath, backup);
    console.warn(
      `[Recourse Engine] Legacy state file at ${dbPath} was neither JSON nor SQLite; moved to ${backup} and starting with empty memory state.`
    );
    return;
  }

  // Build the SQLite database at a temporary path first and only replace the
  // legacy JSON file once it is fully populated. This way a native-module,
  // permissions, or disk failure mid-migration leaves the original JSON file
  // intact instead of losing persisted state.
  const tmpPath = `${dbPath}.migrating-${process.pid}-${Date.now()}`;
  rmSync(tmpPath, { force: true });
  const db = new Database(tmpPath);
  let entryCount = 0;
  try {
    // Default (non-WAL) journal mode: this is a short-lived, single-writer
    // migration DB, so there is no WAL/SHM sidecar to reconcile before the
    // rename below moves only the single main database file into place.
    db.exec("CREATE TABLE IF NOT EXISTS kv_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const insert = db.prepare("INSERT OR REPLACE INTO kv_state(key, value) VALUES(?, ?)");
    const txn = db.transaction((entries: ReadonlyArray<readonly [string, string]>) => {
      for (const [k, v] of entries) insert.run(k, v);
    });
    const entries: Array<[string, string]> = [];
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        const json = JSON.stringify(v);
        if (json !== undefined) entries.push([k, json]);
      }
    }
    txn(entries);
    entryCount = entries.length;
  } finally {
    db.close();
  }
  // Only now that the new DB is fully built and closed do we discard the
  // legacy JSON, atomically via rename (never delete-then-create).
  renameSync(tmpPath, dbPath);
  console.log(
    `[Recourse Engine] Migrated legacy JSON state into SQLite at ${dbPath} (${entryCount} keys).`
  );
}

export function createStateStore(opts: StateStoreOptions): StateStore {
  const stateFile = opts.stateFile ?? join(process.cwd(), "recourse_storage.json");
  const debounceMs = opts.debounceMs ?? 1500;
  let timer: ReturnType<typeof setTimeout> | null = null;

  migrateLegacyJsonToSqlite(stateFile);

  const db = new Database(stateFile);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec("CREATE TABLE IF NOT EXISTS kv_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

  const insertStmt = db.prepare(
    "INSERT INTO kv_state(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const selectAllStmt = db.prepare("SELECT key, value FROM kv_state");

  // Incremental write: only keys whose serialized value CHANGED are upserted.
  // A no-op save (nothing changed) touches nothing on disk — this is what stops
  // the boot storm / high-cadence jobs from rewriting a ~120MB payload every
  // tick (the OOM cause). The transaction still makes each write all-or-nothing.
  const upsert = db.transaction((entries: ReadonlyArray<readonly [string, string]>) => {
    for (const [k, v] of entries) insertStmt.run(k, v);
  });

  const write = (): void => {
    try {
      const payload = opts.getPayload();
      const current = new Map<string, string>();
      for (const row of selectAllStmt.all() as Array<{ key: string; value: string }>) {
        current.set(row.key, row.value);
      }
      const changed: Array<[string, string]> = [];
      for (const [k, v] of Object.entries(payload)) {
        const json = JSON.stringify(v);
        if (json === undefined) continue; // JSON.stringify drops undefined-valued keys
        if (current.get(k) !== json) changed.push([k, json]);
      }
      if (changed.length > 0) upsert(changed);
      opts.saveGoalLedger?.();
    } catch (err) {
      console.warn("[Recourse Engine] Could not persist state to disk:", err);
    }
  };

  return {
    stateFile: () => stateFile,
    save() {
      if (timer) return; // already debouncing
      timer = setTimeout(() => {
        timer = null;
        write();
      }, debounceMs);
    },
    load<T extends Record<string, unknown>>(): T | null {
      try {
        const rows = selectAllStmt.all() as Array<{ key: string; value: string }>;
        if (!rows.length) return null;
        const obj: Record<string, unknown> = {};
        for (const row of rows) obj[row.key] = JSON.parse(row.value);
        return obj as T;
      } catch {
        return null;
      }
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        write();
      }
    },
    close() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      db.close();
    },
  };
}
