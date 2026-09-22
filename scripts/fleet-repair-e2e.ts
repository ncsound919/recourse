// Run: npx tsx scripts/fleet-repair-e2e.ts
//
// End-to-end proof of the fleet-repair seam, exercising the REAL
// verifyAndApplyPatch: fleet guard -> lint -> boot-green -> write -> journal ->
// revert. HTTP is the only layer not exercised here (Recourse's monolith cannot
// boot in a Linux CI VM when node_modules holds Windows-built natives).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyAndApplyPatch, revertAppliedPatch, listFleetPatches, registerFleetDriver } from '../src/lib/fleetDevelopment.js';
import { createFleetRepairGuard, signAuthorization, sha256Hex } from '../src/lib/fleetRepos.js';

const SECRET = 'e2e-fleet-secret';
const DRIVER = 'axiom-self-repair';
registerFleetDriver({
  id: DRIVER, name: 'Axiom self-repair', kind: 'repair', schema: 'specified',
  baseUrl: '', healthPath: '', configured: true,
} as never);

// A stand-in Axiom repo with the bug to repair.
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-e2e-'));
fs.mkdirSync(path.join(repo, 'src', 'server'), { recursive: true });
const REL = 'src/server/brokenAdder.ts';
const BUGGY = 'export function add(a: number, b: number): number {\n  return a - b;\n}\n';
const FIXED = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
fs.writeFileSync(path.join(repo, REL), BUGGY, 'utf-8');

// The boot-green gate that a real run would get from makeHarnessGate({cwd:root}).
// Stubbed to a deterministic pass here so the proof is about the SEAM, not about
// npm being installed in a temp dir; the real gate is wired in server.ts.
const bootGreen = async (ctx: { root: string }) => {
  assert.equal(path.resolve(ctx.root), path.resolve(repo), 'boot-green must run against the TARGET repo');
  return { ok: true };
};

const run = async () => {
  // --- 1. An unauthorized patch is refused before anything touches disk.
  const noAuth = await verifyAndApplyPatch(
    { driverId: DRIVER, file: REL, source: FIXED },
    { root: repo, bootGreen, guard: createFleetRepairGuard({ repo: 'axiom', source: FIXED, authorization: undefined, secret: SECRET }) },
  );
  assert.equal(noAuth.applied, false);
  assert.match((noAuth as { error: string }).error, /authorization missing/);
  assert.equal(fs.readFileSync(path.join(repo, REL), 'utf-8'), BUGGY, 'file must be untouched');
  console.log('  ok - unauthorized patch refused, file untouched');

  // --- 2. A forged signature is refused.
  const forged = { repo: 'axiom', file: REL, sha256: sha256Hex(FIXED), exp: Date.now() + 60000, issuer: 'attacker', sig: 'a'.repeat(64) };
  const bad = await verifyAndApplyPatch(
    { driverId: DRIVER, file: REL, source: FIXED },
    { root: repo, bootGreen, guard: createFleetRepairGuard({ repo: 'axiom', source: FIXED, authorization: forged, secret: SECRET }) },
  );
  assert.equal(bad.applied, false);
  assert.match((bad as { error: string }).error, /signature is invalid/);
  assert.equal(fs.readFileSync(path.join(repo, REL), 'utf-8'), BUGGY);
  console.log('  ok - forged signature refused, file untouched');

  // --- 3. An authorization for THIS file replayed with DIFFERENT bytes is refused.
  const auth = signAuthorization(
    { repo: 'axiom', file: REL, sha256: sha256Hex(FIXED), exp: Date.now() + 60000, issuer: 'axiom:e2e' },
    SECRET,
  );
  const EVIL = 'export function add(){ return require("child_process").execSync("id"); }\n';
  const replay = await verifyAndApplyPatch(
    { driverId: DRIVER, file: REL, source: EVIL },
    { root: repo, bootGreen, guard: createFleetRepairGuard({ repo: 'axiom', source: EVIL, authorization: auth, secret: SECRET }) },
  );
  assert.equal(replay.applied, false);
  assert.match((replay as { error: string }).error, /does not match the submitted source/);
  assert.equal(fs.readFileSync(path.join(repo, REL), 'utf-8'), BUGGY);
  console.log('  ok - replay with different bytes refused, file untouched');

  // --- 4. The authorized repair applies.
  const ok = await verifyAndApplyPatch(
    { driverId: DRIVER, file: REL, source: FIXED, note: 'fix inverted operator' },
    { root: repo, bootGreen, guard: createFleetRepairGuard({ repo: 'axiom', source: FIXED, authorization: auth, secret: SECRET }) },
  );
  assert.equal(ok.applied, true, 'authorized patch must apply: ' + JSON.stringify(ok));
  assert.equal(fs.readFileSync(path.join(repo, REL), 'utf-8'), FIXED, 'the bug must be repaired on disk');
  const token = (ok as { revertToken?: string }).revertToken;
  assert.ok(token, 'a revert token must be journalled');
  console.log('  ok - authorized repair applied, file fixed, revert token issued');

  // --- 5. The journal lives under the TARGET repo, not Recourse's.
  const journalDir = path.join(repo, '.recourse', 'fleet');
  assert.ok(fs.existsSync(journalDir), 'journal must live beside the repaired repo');
  const entries = listFleetPatches(repo);
  assert.equal(entries[0].token, token);
  assert.equal(entries[0].prevSource, BUGGY, 'the pre-patch bytes must be snapshotted');
  console.log('  ok - journal written under the target repo with the prior bytes');

  // --- 6. Rollback restores the original exactly.
  const rev = await revertAppliedPatch(token!, repo);
  assert.equal(rev.ok, true, 'revert must succeed: ' + JSON.stringify(rev));
  assert.equal(fs.readFileSync(path.join(repo, REL), 'utf-8'), BUGGY, 'revert must restore the original bytes');
  console.log('  ok - revert restored the original bytes');

  // --- 7. Reverting twice is honest, not a silent no-op success.
  const again = await revertAppliedPatch(token!, repo);
  assert.equal(again.ok, false);
  console.log('  ok - double revert reports honestly');

  fs.rmSync(repo, { recursive: true, force: true });
  console.log('\n7 end-to-end checks passed');
};
run().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
