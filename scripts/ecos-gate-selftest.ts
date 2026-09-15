/**
 * Self-test for the ECOS development seam against the real gate.
 *
 *   npx tsx scripts/ecos-gate-selftest.ts
 *
 * Exercises: propose valid IDS -> applied + token; revert -> restored;
 * propose broken IDS -> rejected with real reasons, ECOS untouched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyEcosIdsPatch, revertEcosPatch, ecosRepoRoot, ecosGateAvailable } from '../src/lib/ecosDevelopment.js';

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!ecosGateAvailable()) fail(`ECOS gate not found under ${ecosRepoRoot()} (set ECOS_REPO)`);

const rel = 'initiatives/registry/P08_BULB.json';
const abs = join(ecosRepoRoot(), rel);
const base = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, any>;

// 1. valid proposal
const valid = JSON.parse(JSON.stringify(base));
valid.version = (base.version ?? 1) + 1;
valid.provenance = { ...valid.provenance, driver: 'recourse-selftest', verifiedBy: ['selftest'] };
const applied = applyEcosIdsPatch({ driverId: 'recourse-selftest', file: rel, source: JSON.stringify(valid, null, 2) });
if (!applied.applied || !applied.token) fail(`valid proposal was not applied: ${applied.reason}\n${applied.raw}`);
console.log(`ok: valid proposal applied (token ${applied.token})`);

// 2. revert
const reverted = revertEcosPatch(applied.token);
if (!reverted.applied) fail(`revert failed: ${reverted.reason}\n${reverted.raw}`);
const after = JSON.parse(readFileSync(abs, 'utf8'));
if (after.version !== base.version) fail(`revert did not restore version (${after.version} != ${base.version})`);
console.log('ok: revert restored the original spec');

// 3. invalid proposal is rejected and leaves ECOS untouched
const broken = JSON.parse(JSON.stringify(base));
broken.stage = 'magic';
const rejected = applyEcosIdsPatch({ driverId: 'recourse-selftest', file: rel, source: JSON.stringify(broken, null, 2) });
if (rejected.applied) fail('broken proposal was wrongly applied');
if (!/stage "magic" invalid/.test(rejected.raw)) fail(`rejection did not surface the verifier reason:\n${rejected.raw}`);
const still = JSON.parse(readFileSync(abs, 'utf8'));
if (still.stage !== base.stage) fail('rejected proposal modified ECOS');
console.log('ok: broken proposal rejected, ECOS untouched');

console.log('\nPASS: ECOS development seam verified end-to-end');
