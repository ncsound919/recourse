/**
 * Re-verify stored "passed" claims with the CURRENT (hardened) verifiers.
 *
 * Before 2026-09-24 the isolate verifier could be forged by candidate code
 * (it shared scope with the pass/fail counters and JSON.stringify), so any
 * promoted version verified before then may be a false pass. This re-runs
 * every promoted registry version that has a stored suite, plus every
 * self-hosted manifest entry, and reports verdicts that changed.
 *
 * Read-only: it never writes the state DB or the manifest.
 *
 *   npx tsx scripts/reverify-registry.ts [stateFile] [selfhostRoot] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { executeTestSuite } from '../src/lib/executionSandbox';
import { isIsolateAvailable } from '../src/lib/isolatedSandbox';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const stateFile = path.resolve(args[0] ?? 'recourse_storage.json');
const selfhostRoot = path.resolve(args[1] ?? '.selfhosted');

interface Row { scope: 'registry' | 'selfhosted'; name: string; version: string; current: boolean; storedPass: boolean; livePass: boolean; detail: string }

if (!isIsolateAvailable()) {
  console.error('isolated-vm is not loadable here; verdicts would come from the refused in-process path. Aborting.');
  process.exit(2);
}

const rows: Row[] = [];

const db = new Database(stateFile, { readonly: true, fileMustExist: true });
const raw = db.prepare('SELECT value FROM kv_state WHERE key = ?').get('registry') as { value: string } | undefined;
db.close();
const registry: Array<{ name: string; currentVersion: string; versions: Array<Record<string, any>> }> = raw ? JSON.parse(raw.value) : [];
for (const tool of registry) {
  for (const v of tool.versions ?? []) {
    if (!v.promoted || !v.test_suite_code || !v.source_code) continue;
    const run = executeTestSuite(v.source_code, v.test_suite_code);
    rows.push({
      scope: 'registry', name: tool.name, version: v.version, current: v.version === tool.currentVersion,
      storedPass: Boolean(v.passed_verifier), livePass: run.passed,
      detail: run.testDetails.find((d) => !d.startsWith('[PASS]')) ?? '',
    });
  }
}

const manifestFile = path.join(selfhostRoot, 'manifest.json');
if (fs.existsSync(manifestFile)) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as { entries: Array<Record<string, any>> };
  for (const e of manifest.entries ?? []) {
    const run = executeTestSuite(e.sourceCode ?? '', e.testSuiteCode || 'assert true;');
    rows.push({
      scope: 'selfhosted', name: e.name, version: e.hash?.slice(0, 12) ?? '', current: true,
      storedPass: e.lastVerified?.passed !== false, livePass: run.passed,
      detail: run.testDetails.find((d) => !d.startsWith('[PASS]')) ?? '',
    });
  }
}

const falsePasses = rows.filter((r) => r.storedPass && !r.livePass);
const recovered = rows.filter((r) => !r.storedPass && r.livePass);
if (asJson) {
  console.log(JSON.stringify({ checked: rows.length, falsePasses, recovered }, null, 2));
} else {
  console.log(`checked ${rows.length} (registry ${rows.filter((r) => r.scope === 'registry').length}, self-hosted ${rows.filter((r) => r.scope === 'selfhosted').length})`);
  console.log(`stored PASS -> live FAIL: ${falsePasses.length}`);
  for (const r of falsePasses) console.log(`  ${r.scope} ${r.name}@${r.version}${r.current ? ' (current)' : ''}: ${r.detail.slice(0, 160)}`);
  console.log(`stored FAIL -> live PASS: ${recovered.length}`);
}
process.exitCode = falsePasses.some((r) => r.current) ? 1 : 0;
