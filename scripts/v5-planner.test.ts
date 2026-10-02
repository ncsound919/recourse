// v5/planner.test.ts — The LLM proposes; the kernel disposes.
//
// The property under test: **an LLM cannot make an unverified program get
// certified.** A well-behaved LLM agrees; a lying or broken one gets corrected
// or refused. The kernel's answer is never taken from the LLM.

import { runGoal, type PlanReport } from '../src/lib/v5/planner';
import type { LLMChat, ChatResult, ChatMessage } from '../src/lib/v5/intake';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    failed++;
  }
}

/** Build a stub LLM that returns canned JSON. */
function stub(reply: string | ((p: ChatMessage[]) => string)): LLMChat {
  return async (messages) => {
    const text = typeof reply === 'function' ? reply(messages) : reply;
    return { status: 'online', text, engine: 'stub' };
  };
}

const offline: LLMChat = async () => ({ status: 'offline', text: '' });

function summarize(name: string, r: PlanReport) {
  console.log(`\n  [${name}] ${r.summary.agreed} agreed / ${r.summary.corrected} corrected / ${r.summary.refused} refused` +
    ` | agreement ${(r.summary.agreementRate * 100).toFixed(0)}% | avg q ${r.summary.avgQuestions.toFixed(2)}`);
  for (const t of r.tasks) {
    console.log(`     ${t.taskId} ${t.verdict.padEnd(15)} llm=${t.llmProgram ?? '-'} -> kernel=${t.program ?? '-'}` +
      (t.error ? `  (${t.error.slice(0, 60)})` : ''));
  }
}

async function main() {
  console.log('=== Planner: LLM proposes, kernel disposes ===\n');

  // ---------------------------------------------------------------- case 1
  // A well-behaved LLM: correct programs, consistent examples.
  console.log('Case 1: honest LLM');
  const honestPlan = JSON.stringify({
    tasks: [
      {
        intent: 'sort ascending',
        program: '(sortf x)',
        examples: [
          { input: [3, 1, 2], output: [1, 2, 3] },
          { input: [9, 7, 8], output: [7, 8, 9] },
        ],
      },
      {
        intent: 'remove duplicates',
        program: '(dedupef x)',
        examples: [
          { input: [1, 1, 2], output: [1, 2] },
          { input: [4, 4, 4], output: [4] },
        ],
      },
    ],
  });
  const r1 = await runGoal('dedupe and sort a list', {
    chat: stub((msgs) => (msgs.some((m) => m.content.includes('best explains')) ? '{"program":"(sortf x)"}' : honestPlan)),
    maxDepth: 3,
    maxQuestions: 10,
  });
  summarize('honest', r1);
  assert(r1.summary.total === 2, 'honest: two tasks disposed');
  assert(r1.summary.agreed === 2, 'honest: kernel kept both proposals');
  assert(r1.summary.corrected === 0, 'honest: no corrections needed');
  assert(r1.tasks.every((t) => t.certificate?.status === 'converged'), 'honest: every task certified converged');
  assert(
    r1.tasks.every((t) => t.program === t.llmProgram),
    'honest: the certified program is the one the LLM proposed'
  );
  assert(
    r1.tasks.every((t) => t.verdict === 'agreed-proved' || t.verdict === 'accepted-on-proposal'),
    'honest: verdict records the tier honestly'
  );

  // ---------------------------------------------------------------- case 2
  // A LYING LLM: proposes programs that do not match its own examples.
  console.log('\nCase 2: lying LLM (programs contradict its own examples)');
  const lyingPlan = JSON.stringify({
    tasks: [
      {
        intent: 'sort ascending',
        program: '(rev x)', // wrong: reversing is not sorting
        examples: [
          { input: [3, 1, 2], output: [1, 2, 3] },
          { input: [9, 7, 8], output: [7, 8, 9] },
        ],
      },
    ],
  });
  const r2 = await runGoal('sort a list', { chat: stub(lyingPlan), maxDepth: 3, maxQuestions: 10 });
  summarize('lying', r2);
  assert(r2.tasks.length === 1, 'lying: task processed');
  assert(
    r2.tasks[0].verdict !== 'agreed-proved' && r2.tasks[0].verdict !== 'accepted-on-proposal',
    'lying: kernel did NOT keep the false proposal'
  );
  assert(r2.tasks[0].program !== '(rev x)', 'lying: the false program is not the answer');
  assert(
    r2.tasks[0].certificate === undefined || r2.tasks[0].certificate.status !== 'converged',
    'lying: no converged certificate was issued for the lie'
  );

  // ---------------------------------------------------------------- case 3
  // A MALICIOUS LLM: proposes something outside the grammar entirely and
  // claims it is verified.
  console.log('\nCase 3: malicious LLM (out-of-grammar "proof")');
  const maliciousPlan = JSON.stringify({
    tasks: [
      {
        intent: 'sort ascending',
        program: '(exec "rm -rf /")',
        examples: [
          { input: [3, 1, 2], output: [1, 2, 3] },
          { input: [9, 7, 8], output: [7, 8, 9] },
        ],
      },
    ],
  });
  const r3 = await runGoal('sort a list', { chat: stub(maliciousPlan), maxDepth: 3, maxQuestions: 10 });
  summarize('malicious', r3);
  assert(r3.tasks[0].llmProgram !== '(exec "rm -rf /")', 'malicious: out-of-grammar term never stored');
  assert(
    r3.tasks[0].verdict === 'corrected' || r3.tasks[0].verdict === 'refused' || r3.tasks[0].verdict === 'accepted-on-proposal',
    `malicious: verdict is a real disposition (got ${r3.tasks[0].verdict})`
  );
  assert(
    r3.tasks[0].program === undefined || r3.tasks[0].program === '(sortf x)',
    'malicious: kernel never emitted the injected term'
  );

  // ---------------------------------------------------------------- case 4
  // A SELF-CONTRADICTORY LLM: two different outputs for the same input.
  console.log('\nCase 4: self-contradictory examples');
  const contradictoryPlan = JSON.stringify({
    tasks: [
      {
        intent: 'sort ascending',
        program: '(sortf x)',
        examples: [
          { input: [3, 1, 2], output: [1, 2, 3] },
          { input: [3, 1, 2], output: [3, 2, 1] }, // same input, different output
        ],
      },
    ],
  });
  const r4 = await runGoal('sort a list', { chat: stub(contradictoryPlan), maxDepth: 3, maxQuestions: 10 });
  summarize('contradictory', r4);
  assert(r4.tasks[0].program === undefined, 'contradictory: kernel refused rather than guessing');
  assert(
    (r4.tasks[0].error ?? '').includes('contradict'),
    'contradictory: refusal names the contradiction'
  );
  // ---------------------------------------------------------------- case 5
  // Ambiguous examples: two programs fit, nobody is present to answer.
  console.log('\nCase 5: ambiguous examples, no human wired');
  const ambiguousPlan = JSON.stringify({
    tasks: [
      {
        intent: 'some transform',
        examples: [
          // rev and rev∘nil both fit a single-element list
          { input: [5], output: [5] },
          { input: [], output: [] },
        ],
      },
    ],
  });
  const r5 = await runGoal('transform', { chat: stub(ambiguousPlan), maxDepth: 3, maxQuestions: 3 });
  summarize('ambiguous', r5);
  assert(r5.tasks[0].program === undefined || r5.tasks[0].certificate?.status === 'converged',
    'ambiguous: either refused or honestly converged — never silently wrong');
  if (r5.tasks[0].program) {
    // If it converged, the certificate must be honest about the scope.
    assert(
      (r5.tasks[0].certificate?.backstopPassed ?? true),
      'ambiguous: any convergence passed the long-list backstop'
    );
  }

  // ---------------------------------------------------------------- case 6
  // Offline LLM: honest empty report, no fabricated work.
  console.log('\nCase 6: LLM offline');
  const r6 = await runGoal('dedupe and sort a list', { chat: offline, maxDepth: 3, maxQuestions: 10 });
  summarize('offline', r6);
  assert(r6.fromLLM === false, 'offline: report says no LLM');
  assert(r6.tasks.length === 0, 'offline: zero tasks — nothing was faked');
  assert((r6.notes ?? '').length > 0, 'offline: a reason is recorded');

  // ---------------------------------------------------------------- case 7
  // Garbage output: the model returns prose, not JSON.
  console.log('\nCase 7: LLM returns prose');
  const r7 = await runGoal('sort a list', {
    chat: stub('Sure! To sort a list you can use JavaScript\'s .sort() method. Hope that helps!'),
    maxDepth: 3, maxQuestions: 10,
  });
  summarize('prose', r7);
  assert(r7.tasks.length === 0, 'prose: no tasks fabricated from prose');
  assert((r7.notes ?? '').length > 0, 'prose: the failure is recorded');

  // ---------------------------------------------------------------- summary
  console.log('\n=== Test Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Result: ${failed === 0 ? 'ALL PASS' : 'SOME FAILED'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
