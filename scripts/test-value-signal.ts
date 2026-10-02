// Test the value signal against the real failure shape seen overnight:
// a tool that runs constantly and is never used must score ZERO, while a
// tool that runs once and is consumed must score 1.0.

import {
  newValueLedger, recordInvocation, recordConsumption, recordDiscard,
  recordLoopTick, scoreSubject, scoreAll, summarize,
} from '../src/lib/valueSignal';

let passed = 0, failed = 0;
function assert(c: boolean, name: string, d = '') {
  if (c) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}${d ? ' — ' + d : ''}`); failed++; }
}

function main() {
  console.log('=== Value signal: usefulness requires consumption ===\n');

  const L = newValueLedger();

  // --- The heartbeat problem, reproduced exactly ---
  for (let i = 0; i < 95; i++) {
    recordLoopTick(L, 'fibonacciN', true);
    recordLoopTick(L, 'gcdPair', true);
  }
  // The old code also emitted these as tool_invoked. Reproduce that:
  for (let i = 0; i < 95; i++) {
    recordInvocation(L, 'fibonacciN', { realArguments: false });
    recordInvocation(L, 'gcdPair', { realArguments: false });
  }
  console.log(`  reproduced 95 ticks + 95 empty-arg invocations per tool\n`);

  // --- A genuinely used tool ---
  const t = recordInvocation(L, 'genuineTool', { realArguments: true });
  recordConsumption(L, 'genuineTool', 'auditReport', t);

  const t2 = recordInvocation(L, 'partlyUsed', { realArguments: true });
  recordConsumption(L, 'partlyUsed', 'auditReport', t2);
  recordInvocation(L, 'partlyUsed', { realArguments: true });
  recordDiscard(L, 'partlyUsed', undefined);

  // --- Scoring ---
  const fib = scoreSubject(L, 'fibonacciN');
  const gcd = scoreSubject(L, 'gcdPair');
  const gen = scoreSubject(L, 'genuineTool');
  const par = scoreSubject(L, 'partlyUsed');

  console.log('  subject          invoked consumed discarded ticks usefulness');
  for (const s of [fib, gcd, gen, par]) {
    console.log(`  ${s.subject.padEnd(16)} ${String(s.invoked).padStart(7)} ${String(s.consumed).padStart(8)} ${String(s.discarded).padStart(9)} ${String(s.ticks).padStart(5)} ${s.usefulness.toFixed(2).padStart(10)}`);
  }
  console.log();

  assert(fib.invoked === 0, 'empty-arg heartbeat invocations do NOT count as invocations');
  assert(fib.usefulness === 0, 'a tool that only ticks scores 0 usefulness');
  assert(gcd.usefulness === 0, 'second ticker also scores 0');
  assert(gen.usefulness === 1, 'invoked once + consumed once = usefulness 1.0');
  assert(par.consumed === 1 && par.invoked === 2, 'partial use counted accurately');
  assert(par.usefulness === 0.5, '1 consumed of 2 invocations = 0.5 usefulness');
  assert(gen.consumers.includes('auditReport'), 'consumer is recorded');

  // --- Ranking inverts the activity ranking ---
  const all = scoreAll(L);
  console.log('\n  ranked by usefulness:');
  for (const s of all) console.log(`    ${s.usefulness.toFixed(2)}  ${s.subject}`);
  console.log();
  assert(all[0].subject === 'genuineTool', 'most useful tool ranks first, despite least activity');

  // --- Signal quality ---
  const sum = summarize(L);
  console.log(`\n  signal quality: ${sum.countingEvents}/${sum.totalEvents} = ${(sum.signalQuality * 100).toFixed(0)}%`);
  console.log(`  dead weight (invoked, never consumed): ${sum.deadWeight.map((s) => s.subject).join(', ') || '(none)'}`);
  console.log();

  // The whole point: most of the overnight signal was noise.
  assert(sum.signalQuality < 0.2, 'reproduced overnight signal is >80% noise');
  // Dead weight = invoked by a real caller, never consumed. partlyUsed WAS
  // consumed once, so it is not dead weight — it is merely under-used.
  assert(!sum.deadWeight.some((s) => s.subject === 'partlyUsed'),
    'partly-used tool is NOT dead weight (it was consumed once)');
  assert(!sum.deadWeight.some((s) => s.subject === 'fibonacciN'),
    'pure ticker is not even in dead-weight (never really invoked)');

  console.log('=== Test Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Result: ${failed === 0 ? 'ALL PASS' : 'SOME FAILED'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
