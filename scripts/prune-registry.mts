// One-off registry prune. Keeps: hand-authored src/tools, the 15 benchmark
// solvers, and any non-forge tool. Deletes the forge-generated mass (scraped
// titles + hash-suffixed toy tools). Dry-run by default; pass --apply to write.
// Run: npx tsx scripts/_prune-registry.mts [--apply]
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Verified by scripts/_prune-solvers.mts: the tools that pass each benchmark problem.
const SOLVERS = new Set([
  'fizzbuzz_solver', 'quadratic_vieta_root_sum', 'sat_horn_clause_solver',
  'merkle_taint_sanitizer', 'qubit_bell_state_mitigator', 'multi_agent_route_planner',
  'cache_optimizer_l2', 'binarySearch', 'isBalanced', 'mergeSorted', 'isPrime',
  'multiply', 'dijkstra', 'LRUCache', 'applyX',
]);

const DB = 'recourse_storage.json';
const apply = process.argv.includes('--apply');

type Tool = { name: string; domain: string; entrypoint?: string; currentVersion?: string; healthStatus?: string; versions?: unknown[] };

const db = new Database(DB, { readonly: !apply, fileMustExist: true });
const tools = JSON.parse(
  (db.prepare('SELECT value FROM kv_state WHERE key = ?').get('registry') as { value: string }).value,
) as Tool[];

const isCurated = (t: Tool) => String(t.entrypoint || '').startsWith('src/tools');
const isForge = (t: Tool) => String(t.currentVersion || '').startsWith('1.0.0-forge');
const keep = (t: Tool) => isCurated(t) || SOLVERS.has(t.name) || !isForge(t);
const kept = tools.filter(keep);
const deleted = tools.filter((t) => !keep(t));
const mb = (a: unknown[]) => (Buffer.byteLength(JSON.stringify(a)) / 1024 / 1024).toFixed(1);

console.log(`registry: ${tools.length} tools (${mb(tools)}MB)`);
console.log(`KEEP:     ${kept.length} tools (${mb(kept)}MB)  [curated=${kept.filter(isCurated).length} solvers=${kept.filter((t) => SOLVERS.has(t.name)).length} nonForge=${kept.filter((t) => !isForge(t) && !isCurated(t)).length}]`);
console.log(`DELETE:   ${deleted.length} tools (${mb(deleted)}MB)`);

if (!apply) {
  console.log('\nDRY RUN — no changes written. Re-run with --apply to prune.');
  process.exit(0);
}

// Backup all SQLite sidecars before the write (the DB is live under WAL).
const backupDir = path.join('backups', `prune-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) {
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, path.basename(f)));
}
console.log(`\nbackup -> ${backupDir}`);

db.pragma('wal_checkpoint(TRUNCATE)');
db.prepare('UPDATE kv_state SET value = ? WHERE key = ?').run(JSON.stringify(kept), 'registry');
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log(`pruned: registry now ${kept.length} tools`);
