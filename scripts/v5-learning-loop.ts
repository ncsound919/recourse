// v5-learning-loop.ts — Continuous self-development driver for the v5 no-LLM system.
//
// Gap 1 fix: register synthesized tools THROUGH the live API so they enter
// Recourse's registry and become visible to the learner — deduplicated by
// program slug so the registry grows with distinct capabilities, not duplicates.
//
// Gap 3 fix: after registering, the learner can rank the new genes; the driver
// also triggers a learner episode so the registry change is observed.
//
// Usage: npx tsx scripts/v5-learning-loop.ts [minutes]

import { runOracleLoop } from '../src/lib/v5/oracleRun';
import { makeReferenceOracle } from '../src/lib/v5/benchmark';
import { LIST_GRAMMAR, runProgram } from '../src/lib/v5/enumerate';

const BASE = process.env.RECOURSE_URL || 'http://127.0.0.1:3050';
const DURATION_MIN = Number(process.argv[2] || 60);
const DURATION_MS = DURATION_MIN * 60 * 1000;

const REFERENCE_POOL = [
  '(sortf x)', '(rev x)', '(dedupef x)', '(inc x)', '(pos x)',
  '(dedupef (sortf x))', '(rev (sortf x))', '(sortf (rev x))',
  '(sortf (dedupef x))', '(dedupef (rev x))', '(rev (dedupef x))',
  '(sortf (inc x))', '(sortf (pos x))', '(dedupef (pos x))',
  '(rev (inc (pos x)))', '(sortf (dedupef (inc x)))', '(rev (neg x))',
  '(rev (sortf (dedupef x)))', '(dedupef (rev (sortf x)))',
  '(sortf (dedupef (rev x)))', '(rev (dedupef (pos x)))',
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomList(r: () => number, maxLen: number): number[] {
  const len = Math.floor(r() * (maxLen + 1));
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(Math.floor(r() * 7) - 3); // -3..3
  return out;
}

/** A stable, valid identifier derived from the program term (dedup key). */
function programSlug(term: string): string {
  return 'v5_' + term.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

async function main() {
  console.log(`=== v5 learning loop (registering): ${DURATION_MIN} min ===`);
  const started = Date.now();
  const r = rng(Date.now() & 0xffff);
  let iteration = 0;
  let synthesized = 0;
  let registered = 0;
  let duplicates = 0;
  let failed = 0;
  let benchRuns = 0;
  let lastBench: any = null;
  let lastBenchAt = 0;
  const seen = new Set<string>();

  // Time-based benchmark cadence (not iteration-based, so `continue` can't skip it)
  const maybeBenchmark = async () => {
    if (Date.now() - lastBenchAt < 60_000) return;
    lastBenchAt = Date.now();
    try {
      lastBench = await post('/api/recourse/v5/benchmark', { maxDepth: 3, maxQuestions: 10, confirm: true });
      benchRuns++;
      if (lastBench?.summary) {
        console.log(
          `[${iteration}] BENCHMARK: ${lastBench.summary.solved}/${lastBench.summary.total} exact, ` +
          `${lastBench.summary.silentWrong} silent-wrong, ${lastBench.summary.avgQuestions.toFixed(2)} q`
        );
      }
    } catch (e: any) {
      console.log(`[${iteration}] benchmark error: ${e.message}`);
    }
  };

  try {
    const status = await get('/api/recourse/v5/status');
    console.log(`v5 route: ${status?.success ? 'live' : 'unavailable'} (primitives: ${status?.grammar?.primitives?.join(',')})`);
  } catch (e: any) {
    console.error(`Recourse not reachable at ${BASE}: ${e.message}`);
    process.exit(1);
  }

  while (Date.now() - started < DURATION_MS) {
    iteration++;
    await maybeBenchmark();

    const reference = REFERENCE_POOL[Math.floor(r() * REFERENCE_POOL.length)];
    const examples = [0, 1, 2].map(() => {
      const input = randomList(r, 5);
      return { input, output: runProgram(LIST_GRAMMAR, reference, input) ?? [] };
    });

    try {
      // Synthesize locally (fast) to find the program
      const result = await runOracleLoop({
        taskId: `learn_${iteration}`,
        examples,
        maxDepth: 3,
        maxQuestions: 10,
        askUser: makeReferenceOracle(reference, 0),
      });

      if (!result.success || !result.code) {
        failed++;
        continue;
      }
      synthesized++;

      // Register through the API exactly once per distinct program (dedup)
      const slug = programSlug(result.code);
      if (seen.has(slug)) {
        duplicates++;
        continue;
      }
      seen.add(slug);

      const reg = await post('/api/recourse/v5/synthesize', {
        name: slug,
        examples,
        reference,
        maxDepth: 3,
        maxQuestions: 10,
      });

      if (reg?.success) {
        registered++;
        console.log(`[${iteration}] registered ${slug} -> ${result.code}`);
      } else {
        failed++;
        if (iteration % 10 === 0) {
          console.log(`[${iteration}] register failed for ${slug}: ${reg?.error ?? reg?.status}`);
        }
      }
    } catch (e: any) {
      failed++;
      if (iteration % 20 === 0) console.log(`[${iteration}] error: ${e.message}`);
    }

    await new Promise((res) => setTimeout(res, 200));
  }

  // Trigger a learner episode so the registry change is observed (gap 3)
  try {
    const ep = await post('/api/recourse/learn/run', {});
    console.log(`\nLearner episode after run: ${ep?.success ? 'ok' : JSON.stringify(ep).slice(0, 120)}`);
  } catch (e: any) {
    console.log(`\nLearner episode failed: ${e.message}`);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`\n=== v5 learning loop complete (${elapsed}s) ===`);
  console.log(`  Iterations:   ${iteration}`);
  console.log(`  Synthesized:  ${synthesized}`);
  console.log(`  Registered:   ${registered}`);
  console.log(`  Duplicates:   ${duplicates}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Bench runs:   ${benchRuns}`);
  if (lastBench?.summary) {
    console.log(`  Last bench:   ${lastBench.summary.solved}/${lastBench.summary.total} exact, ${lastBench.summary.silentWrong} silent-wrong`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
