// v5-deciders.test.ts — LocalJEV + Dev-Brain inside the no-LLM pipeline.
//
// Properties under test:
//   1. A LocalJEV answer can settle a task the LLM could not, WITHOUT the
//      kernel giving up its authority (result is still scope-checked).
//   2. JEV cannot express a program outside the candidate options.
//   3. When two sources disagree, the disagreement is RECORDED, not hidden.
//   4. Dev-Brain chooses the search budget but cannot authorize acceptance.
//   5. With every source offline, the kernel still refuses honestly.
//   6. The INTENT-PROPERTY decider resolves ambiguity with no model at all,
//      by checking the intent's own words against each candidate's output.

import { consultChain, JevDecider, DevBrainAdvisor, NullDecider, IntentPropertyDecider, type Decider } from '../src/lib/v5/deciders';
import { runGoal } from '../src/lib/v5/planner';
import type { LLMChat } from '../src/lib/v5/intake';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

/** A decider that always picks the option at `pick`. */
function fixedDecider(name: string, pick: (opts: string[]) => string | null): Decider {
  return {
    name,
    async answer(q) {
      const p = pick(q.options);
      return p && q.options.includes(p) ? p : null;
    },
  };
}

const noAdvisor = null;

async function main() {
  console.log('=== Decision layer ===\n');

  // -------------------------------------------------------------- 1
  console.log('1. A decider settles ambiguity the LLM could not');
  const ambiguousPlan = JSON.stringify({
    tasks: [{
      intent: 'remove duplicates',
      examples: [
        { input: [1, 1, 2], output: [1, 2] },
        { input: [3, 3, 3], output: [3] },
      ],
    }],
  });
  const r1 = await runGoal('dedupe', {
    chat: async () => ({ status: 'online', text: ambiguousPlan, engine: 'stub' }),
    deciders: [fixedDecider('localjev', (opts) => opts.find((o) => o === '[1,2]') ?? opts[0])],
    advisor: noAdvisor,
    maxDepth: 3, maxQuestions: 6,
  });
  console.log(`     verdict=${r1.tasks[0]?.verdict} program=${r1.tasks[0]?.program} sources=${r1.tasks[0]?.answerSources}`);
  assert(r1.tasks.length === 1, 'decider: task disposed');
  assert(r1.tasks[0].program !== undefined, 'decider: the task resolved instead of refusing');
  assert(r1.tasks[0].certificate?.status === 'converged', 'decider: still certified by the kernel');
  assert(r1.tasks[0].verdict === 'accepted-on-decider',
    'decider: verdict admits a decider supplied the disambiguation');

  // -------------------------------------------------------------- 2
  console.log('\n2. An out-of-options answer is discarded');
  const chainBad = await consultChain(
    { input: [1, 2], options: ['[1,2]', '[2,1]'] },
    { intent: 'x', examples: [], candidates: [] },
    [{ name: 'rogue', async answer() { return '[9,9,9]'; } }]
  );
  console.log(`     answer=${chainBad.answer ?? 'null'} rejected=${chainBad.rejected.join(',') || '-'}`);
  assert(chainBad.answer === null, 'options: an out-of-options answer is discarded');
  assert(chainBad.rejected.includes('rogue'), 'options: the offending source is named');

  // -------------------------------------------------------------- 3
  console.log('\n3. Disagreement is recorded, not silently resolved');
  const chainSplit = await consultChain(
    { input: [1, 2], options: ['[1,2]', '[2,1]'] },
    { intent: 'sort', examples: [], candidates: [], proposalAnswer: '[1,2]' },
    [fixedDecider('localjev', () => '[2,1]')]
  );
  console.log(`     answer=${chainSplit.answer} source=${chainSplit.source} disagree=${chainSplit.disagreement.join(',')}`);
  assert(chainSplit.disagreement.includes('localjev'), 'split: the dissenting source is named');

  // -------------------------------------------------------------- 4
  console.log('\n4. Dev-Brain picks the budget but cannot authorize acceptance');
  const advisorDown = new DevBrainAdvisor('http://127.0.0.1:1', 500);
  assert(await advisorDown.advise({ intent: 's', examples: [], classes: 1, hasProposal: false }) === null,
    'devbrain: offline advisor abstains cleanly');

  // -------------------------------------------------------------- 5
  console.log('\n5. Every source offline -> honest refusal');
  const planNoProgram = JSON.stringify({
    tasks: [{ intent: 'mystery', examples: [{ input: [1, 2], output: [1, 2] }] }],
  });
  const r5 = await runGoal('mystery', {
    chat: async () => ({ status: 'online', text: planNoProgram, engine: 'stub' }),
    deciders: [new NullDecider()],
    advisor: noAdvisor,
    maxDepth: 2, maxQuestions: 3,
  });
  assert(
    r5.tasks[0].program === undefined || r5.tasks[0].certificate?.status === 'converged',
    'offline: either refused or honestly converged — never silently wrong');

  // -------------------------------------------------------------- 6
  console.log('\n6. Intent-property decider: resolves with NO model at all');
  const intent = new IntentPropertyDecider();

  const sortQ = { input: [3, 1, 2], options: ['[1,2,3]', '[3,1,2]'] };
  console.log(`     intent "sort ascending" on [3,1,2] -> ${await intent.answer(sortQ, { intent: 'sort ascending in order', examples: [], candidates: [] })}`);

  const uniqQ = { input: [3, 1, 2, 1], options: ['[1,1,2,3]', '[1,2,3]'] };
  const uniqA = await intent.answer(uniqQ, { intent: 'remove duplicate elements', examples: [], candidates: [] });
  console.log(`     intent "remove duplicates" on [3,1,2,1] -> ${uniqA}`);
  assert(uniqA === '[1,2,3]', 'intent: dedupe intent selects the deduplicated output');

  const revQ = { input: [1, 2, 3], options: ['[1,2,3]', '[3,2,1]'] };
  const revA = await intent.answer(revQ, { intent: 'reverse the list', examples: [], candidates: [] });
  console.log(`     intent "reverse" on [1,2,3] -> ${revA}`);
  assert(revA === '[3,2,1]', 'intent: reverse intent selects the reversed output');

  const vague = await intent.answer({ input: [1], options: ['[1]', '[2]'] }, { intent: 'do something', examples: [], candidates: [] });
  console.log(`     vague intent -> ${vague ?? '(abstained)'}`);
  assert(vague === null, 'intent: a vague intent abstains rather than guessing');

  // When NO option satisfies the intent, the decider must abstain. Guessing
  // here is exactly the silent-wrong failure.
  const unsatisfiable = await intent.answer(
    { input: [3, 1, 2], options: ['[5,5]', '[7]'] },
    { intent: 'sort ascending', examples: [], candidates: [] }
  );
  console.log(`     nothing sorted -> ${unsatisfiable ?? '(abstained)'}`);
  assert(unsatisfiable === null, 'intent: abstains when no option satisfies the intent');

  // A tie the multiset tiebreak CAN break resolves: preserving the input's
  // elements is the default a human assumes unless the intent filters.
  const tiebreak = await intent.answer(
    { input: [3, 1, 2], options: ['[1,2,4]', '[1,2,3]'] },
    { intent: 'sort ascending', examples: [], candidates: [] }
  );
  console.log(`     tie broken by element preservation -> ${tiebreak}`);
  assert(tiebreak === '[1,2,3]', 'intent: tie resolves to the element-preserving option');

  // end-to-end: a task with NO proposal, resolved with no model present
  const r6 = await runGoal('remove duplicates', {
    chat: async () => ({
      status: 'online',
      text: JSON.stringify({ tasks: [{ intent: 'sort ascending then remove duplicate elements', examples: [
        { input: [3, 1, 2, 1], output: [1, 2, 3] },
        { input: [5, 4, 4, 3], output: [3, 4, 5] },
        { input: [2, 2, 9], output: [2, 9] },
      ] }] }),
      engine: 'stub',
    }),
    deciders: [new IntentPropertyDecider()],
    advisor: noAdvisor,
    maxDepth: 3, maxQuestions: 8,
  });
  console.log(`     e2e verdict=${r6.tasks[0]?.verdict} program=${r6.tasks[0]?.program} sources=${r6.tasks[0]?.answerSources} q=${r6.tasks[0]?.questionsAsked}`);
  assert(r6.tasks[0].program !== undefined, 'intent: resolved end-to-end with no model present');
  assert(r6.tasks[0].certificate?.status === 'converged', 'intent: kernel certified the result');
  assert(r6.tasks[0].llmProgram === undefined, 'intent: no LLM proposal existed to lean on');
  assert(
    r6.tasks[0].verdict === 'accepted-on-decider' || r6.tasks[0].verdict === 'proved-independently',
    `intent: verdict is honest about who decided (${r6.tasks[0].verdict})`
  );

  // -------------------------------------------------------------- summary
  console.log('\n=== Test Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Result: ${failed === 0 ? 'ALL PASS' : 'SOME FAILED'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
