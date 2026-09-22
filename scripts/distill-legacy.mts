// Distill the old-run stores into one compact `legacyDigest`, then delete the
// bulky raw stores it replaces. Dry-run by default; --apply writes + prunes.
// Run: npx tsx scripts/distill-legacy.mts [--apply]
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB = 'recourse_storage.json';
const apply = process.argv.includes('--apply');

const db = new Database(DB, { readonly: !apply, fileMustExist: true });
const get = (k: string): unknown => {
  const r = db.prepare('SELECT value FROM kv_state WHERE key = ?').get(k) as { value: string } | undefined;
  return r ? JSON.parse(r.value) : null;
};
const size = (k: string): number => {
  const r = db.prepare('SELECT length(value) n FROM kv_state WHERE key = ?').get(k) as { n: number } | undefined;
  return r ? r.n : 0;
};

// ---- distill ----
const bh = (get('benchmarkHistory') as Array<{ at: number; solved: number; total: number }>) || [];
const ss = (get('systemSnapshots') as Array<{ label: string; ts: number; gen: number; tools?: unknown[]; benchmarkSolved: number | null; selfhostedHealthy: number; selfhostedTotal: number }>) || [];
const gl = (get('generationLedger') as Array<Record<string, unknown>>) || [];
const an = (get('anomalies') as Array<Record<string, unknown>>) || [];
const isg = (get('intakeSignals') as Array<Record<string, unknown>>) || [];
const da = (get('dynamicAgenda') as Array<Record<string, unknown>>) || [];
const sc = (get('skillCatalog') as Array<Record<string, unknown>>) || [];
const ca = (get('corpusArtifacts') as Array<Record<string, unknown>>) || [];
const fl = (get('forgeLedger') as Array<Record<string, unknown>>) || [];
const ip = (get('intelProposals') as unknown[]) || [];

const tally = (arr: Array<Record<string, unknown>>, key: string): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const x of arr) { const k = String(x[key] ?? '?'); m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};

const digest = {
  schema: 'recourse.legacyDigest.v1',
  generatedAt: new Date().toISOString(),
  note: 'Distilled from pre-2026-09-22 run stores; raw bulky stores were pruned after this digest was written.',
  capability: {
    benchmarkRuns: bh.length,
    window: bh.length ? `${new Date(bh[0].at).toISOString().slice(0, 10)}..${new Date(bh[bh.length - 1].at).toISOString().slice(0, 10)}` : null,
    solvedDistinct: [...new Set(bh.map((r) => r.solved))],
    total: bh[0]?.total ?? null,
    finding: 'Flat: every recorded run solved the same count — the yardstick measures presence, not improvement.',
  },
  registryTrend: ss.map((s) => ({ ts: s.ts, gen: s.gen, tools: s.tools?.length ?? null, healthy: s.selfhostedHealthy, total: s.selfhostedTotal, benchSolved: s.benchmarkSolved })),
  learnerTrend: gl.map((g) => ({ gen: g.gen, ts: g.ts, episode: g.learnerEpisode, avgReward: g.learnerAvgReward, calibration: g.learnerCalibration })),
  repairPatterns: {
    count: an.length,
    byDomain: tally(an, 'domain'),
    byErrorType: tally(an, 'errorType'),
    samples: an.slice(-5).map((a) => String(a.description ?? '').slice(0, 140)),
  },
  research: {
    signals: isg.length,
    consumed: isg.filter((s) => s.consumed === true).length,
    topTopics: Object.fromEntries(Object.entries(isg.flatMap((s) => (s.topics as string[]) || []).reduce((m: Record<string, number>, t) => { m[t] = (m[t] || 0) + 1; return m; }, {})).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 20)),
  },
  agenda: {
    items: da.length,
    byDomain: tally(da, 'domain'),
    sampleTitles: da.slice(0, 8).map((a) => String(a.title ?? '').slice(0, 110)),
  },
  skills: { count: sc.length, topTopics: tally(sc.flatMap((s) => (s.topics as string[]) || []).map((t) => ({ t })), 't') },
  corpus: { artifacts: ca.length, byProject: tally(ca, 'project') },
  forge: { records: fl.length, byDomain: tally(fl, 'domain'), byStatus: tally(fl, 'status') },
  pruned: { intelProposals: ip.length, forgeLedger: fl.length, systemSnapshots: ss.length, dynamicAgenda: da.length },
};

console.log('--- legacyDigest preview ---');
console.log(JSON.stringify(digest, null, 2).slice(0, 4000));
console.log('\n--- prune plan ---');
for (const k of ['intelProposals', 'forgeLedger', 'systemSnapshots', 'dynamicAgenda']) {
  console.log(`  DELETE ${k.padEnd(18)} ${(size(k) / 1048576).toFixed(2)}MB`);
}
console.log(`  WRITE  legacyDigest       ~${(Buffer.byteLength(JSON.stringify(digest)) / 1024).toFixed(0)}KB`);

if (!apply) { console.log('\nDRY RUN — re-run with --apply.'); process.exit(0); }

const backupDir = path.join('backups', `distill-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, path.basename(f)));
console.log(`\nbackup -> ${backupDir}`);

db.pragma('wal_checkpoint(TRUNCATE)');
db.prepare('INSERT INTO kv_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('legacyDigest', JSON.stringify(digest));
for (const k of ['intelProposals', 'forgeLedger', 'systemSnapshots', 'dynamicAgenda']) db.prepare('DELETE FROM kv_state WHERE key=?').run(k);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log('applied: legacyDigest written; 4 raw stores deleted');
