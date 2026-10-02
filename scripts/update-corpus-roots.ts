/**
 * One-shot: replace persisted corpus roots with the current DEFAULT_CORPUS_ROOTS.
 * Run with the server STOPPED (tsx scripts/update-corpus-roots.ts).
 */
import Database from 'better-sqlite3';
import { DEFAULT_CORPUS_ROOTS } from '../src/intake/corpus/index.js';

const stateFile = 'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/recourse/recourse_storage.json';
const db = new Database(stateFile);
db.pragma('journal_mode = WAL');
const before = db.prepare("SELECT value FROM kv_state WHERE key='corpusRoots'").get() as { value: string } | undefined;
const oldRoots = before ? (JSON.parse(before.value) as Array<{ project: string }>) : [];
db.prepare(
  "INSERT INTO kv_state(key, value) VALUES('corpusRoots', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
).run(JSON.stringify(DEFAULT_CORPUS_ROOTS));
const after = JSON.parse((db.prepare("SELECT value FROM kv_state WHERE key='corpusRoots'").get() as { value: string }).value) as Array<{ project: string; root: string }>;
db.close();
console.log(`old roots (${oldRoots.length}): ${oldRoots.map((r) => r.project).join(', ')}`);
console.log(`new roots (${after.length}):`);
for (const r of after) console.log(`  ${r.project} :: ${r.root}`);
