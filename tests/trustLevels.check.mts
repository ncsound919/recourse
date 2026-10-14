/**
 * Trust-level check. Runs with tsx (recourse's own runner).
 *   npx tsx tests/trustLevels.check.mts
 *
 * The load-bearing assertions are 2 and 3: a claim can never RAISE a tier, and
 * a deterministic check without evidence does not count as corroboration.
 */
import assert from 'node:assert/strict';
import { deriveTrustLevel, promotionGate, canJustifyPromotion } from '../src/lib/trustLevels.js';

const S = 'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/recourse';
const SECRET = await (await import('node:fs/promises')).readFile(
  `${process.env.USERPROFILE}/.config/opencode/.secrets/recourse-api-secret.txt`, 'utf8',
).then((s) => s.trim());

console.log('=== 1. an agent source is T1 and cannot justify a promotion ===');
const agent = deriveTrustLevel({ source: 'opencode-session' });
console.log('  ', agent.name, '|', agent.reason);
assert.equal(agent.level, 1);
assert.equal(canJustifyPromotion(agent.level), false);

console.log('\n=== 2. an agent CLAIMING T3 is clamped to T1 (a claim cannot raise) ===');
const liar = deriveTrustLevel({ source: 'axiom-prospector', declaredTrust: 3 });
console.log('  ', liar.name, '|', liar.reason);
assert.equal(liar.level, 1, 'an agent raised its own trust tier');
assert.equal(liar.downgraded, true);
assert.equal(promotionGate(liar).allowed, false);

console.log('\n=== 3. a deterministic check WITHOUT evidence does NOT count ===');
const noEvidence = deriveTrustLevel({ source: 'truthchain', deterministicCheck: true });
console.log('  ', noEvidence.name, '|', noEvidence.reason);
assert.equal(noEvidence.level, 1, 'an evidence-free "check" reached T2');

console.log('\n=== 4. a deterministic check WITH evidence is T2 ===');
const checked = deriveTrustLevel({ source: 'truthchain', deterministicCheck: true, checkEvidence: 'sha256:abc123' });
console.log('  ', checked.name, '|', checked.reason);
assert.equal(checked.level, 2);
assert.equal(promotionGate(checked).allowed, true);

console.log('\n=== 5. independent corroboration is T2 ===');
const corrob = deriveTrustLevel({ source: 'sieve', corroboratingSource: 'openhub-audit' });
console.log('  ', corrob.name, '|', corrob.reason);
assert.equal(corrob.level, 2);

console.log('\n=== 6. an operator attestation is T3 ===');
const human = deriveTrustLevel({ source: 'fleet', attestedBy: 'operator:coo' });
console.log('  ', human.name, '|', human.reason);
assert.equal(human.level, 3);
assert.equal(promotionGate(human).allowed, true);

console.log('\n=== 7. an agent cannot MINT a human attestation ===');
const fakeHuman = deriveTrustLevel({ source: 'axiom-prospector', attestedBy: 'axiom-prospector' });
console.log('  ', fakeHuman.name, '|', fakeHuman.reason);
assert.equal(fakeHuman.level, 1, 'a non-operator actor produced a T3 attestation');

console.log('\n=== 8. an unknown source is T0 (untrusted by default) ===');
const ext = deriveTrustLevel({ source: 'some-random-scraper' });
assert.equal(ext.level, 0);
const none = deriveTrustLevel({});
assert.equal(none.level, 0, 'a sourceless fact was not untrusted');
console.log('  ', ext.name, '/', none.name);

console.log('\n=== 9. a caller may LOWER a tier ===');
const lowered = deriveTrustLevel({ source: 'truthchain', deterministicCheck: true, checkEvidence: 'h', declaredTrust: 1 });
assert.equal(lowered.level, 1);
console.log('  ', lowered.name, '|', lowered.reason);

console.log('\n=== 10. LIVE: the intake records the derived tier in meta.trust ===');
const live = await fetch('http://127.0.0.1:3050/api/recourse/fleet/memory', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
  body: JSON.stringify({
    source: 'axiom-prospector',
    kind: 'lesson',
    id: 'trust-check:t1',
    text: 'trust-level acceptance probe: an agent outcome',
    declaredTrust: 3,
  }),
  signal: AbortSignal.timeout(120000),
}).then((r) => r.json());
console.log('  live response:', JSON.stringify(live).slice(0, 200));
assert.equal(live.success, true, 'intake rejected the probe');

console.log('\nALL TRUST-LEVEL ASSERTS PASSED');
