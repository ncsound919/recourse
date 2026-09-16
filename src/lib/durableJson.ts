/**
 * durableJson — tiny, dependency-free durable JSON document helper shared by the
 * Wave-1 commercial layers (tenants, api keys, plans, outcome feedback).
 *
 * The repo has several hand-rolled "read JSON, write tmp, rename" copies (see
 * `fitnessLoop.saveLedger`). This centralizes the two invariants every one of
 * them needs:
 *   - a missing or corrupt file degrades to a caller-supplied default — never
 *     throws (a corrupt commercial ledger must not take down boot);
 *   - a write is atomic (`.tmp` + rename) and creates parent directories, so a
 *     crash mid-write can never leave a half-written JSON document behind.
 *
 * It is deliberately synchronous: these files are small, written rarely, and
 * read on the request path where an await would only add scheduling noise.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Parse a JSON file, returning `fallback` on missing/corrupt content. */
export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Atomically write a JSON document (`.tmp` + rename), creating parents. */
export function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}
