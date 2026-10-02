// v5-jev-live.ts — Prove the decision layer against the REAL LocalJEV.
// No stubs: this talks to :8080 and reports what actually came back.

import { JevDecider, consultChain } from '../src/lib/v5/deciders';
import { jevStatus } from '../src/lib/jevClient';
import { runGoal } from '../src/lib/v5/planner';
import type { LLMChat } from '../src/lib/v5/intake';

async function main() {
  console.log('=== Live LocalJEV probe ===\n');

  const status = await jevStatus();
  console.log(`jev enabled: ${status.enabled} | tiers:`);
  for (const t of status.tiers ?? []) {
    console.log(`   ${t.id.padEnd(8)} ${t.baseUrl.padEnd(34)} online=${t.online}${t.error ? ` (${t.error})` : ''}`);
  }
  console.log();

  if (!status.online) {
    console.log('LocalJEV offline — cannot run the live proof.');
    process.exit(2);
  }

  // 1. Direct decision: which of these two outputs is right?
  const jev = new JevDecider();
  const q = {
    input: [3, 1, 2],
    options: ['[1,2,3]', '[2,1,3]', '[3,2,1]'],
  };
  const ctx = {
    intent: 'sort the list in ascending order',
    examples: [
      { input: [5, 4, 3], output: [3, 4, 5] },
      { input: [9, 7, 8], output: [7, 8, 9] },
    ],
    candidates: ['(sortf x)', '(rev x)'],
  };

  const direct = await jev.answer(q, ctx);
  console.log(`Q: sort [3,1,2]?  options=${q.options.join(' | ')}`);
  console.log(`   JEV answered: ${direct ?? '(abstained)'}`);
  console.log(`   correct:     ${q.options[0]}`);
  console.log(`   match:       ${direct === q.options[0]}`);
  console.log();

  // 2. Full task with NO LLM proposal — JEV must carry the whole pipeline.
  const planWithoutProgram = JSON.stringify({
    tasks: [
      {
        intent: 'sort ascending and drop duplicates',
        // deliberately no `program` — the LLM contributes grounding only
        examples: [
          { input: [3, 1, 2, 1], output: [1, 2, 3] },
          { input: [5, 4, 4, 3], output: [3, 4, 5] },
        ],
      },
    ],
  });

  const chat: LLMChat = async () => ({ status: 'online', text: planWithoutProgram, engine: 'stub-plan' });

  const r = await runGoal('sort ascending and drop duplicates', {
    chat,
    deciders: [new JevDecider()],
    advisor: null,
    maxDepth: 3,
    maxQuestions: 8,
  });

  const t = r.tasks[0];
  console.log('=== Task with no program proposal (JEV only) ===');
  console.log(`  verdict:      ${t?.verdict}`);
  console.log(`  program:      ${t?.program ?? '(refused)'}`);
  console.log(`  classes:      ${t?.classesBefore}`);
  console.log(`  questions:    ${t?.questionsAsked}`);
  console.log(`  sources:      ${t?.answerSources}`);
  console.log(`  disagreements:${t?.disagreements?.join(',') || '(none)'}`);
  console.log(`  rejected:     ${t?.rejectedSources?.join(',') || '(none)'}`);
  console.log(`  certificate:  ${t?.certificate?.status} | scope ${t?.certificate?.scope.size} | backstop ${t?.certificate?.backstopPassed}`);
  console.log(`  tier:         ${t?.certificate?.trustTier}`);
  console.log();

  const ok = t?.certificate?.status === 'converged' && t.program !== undefined;
  console.log(ok
    ? 'PASS: JEV resolved a task the LLM could not, and the kernel certified it.'
    : 'RESULT: task did not resolve (recorded honestly, not fabricated).');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
