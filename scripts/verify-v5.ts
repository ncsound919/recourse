// Temp verification: run the v5 no-LLM benchmark through Recourse's copies.
import { runBenchmark, BENCHMARK_TASKS } from '../src/lib/v5/benchmark';
import { LIST_GRAMMAR, runProgram } from '../src/lib/v5/enumerate';
import { runOracleLoop } from '../src/lib/v5/oracleRun';
import { termToModule, examplesToTestSuite } from '../src/lib/v5/codegen';
import { executeTestSuite } from '../src/lib/executionSandbox';

async function main() {
  console.log('=== Recourse v5 module verification ===\n');

  // 1. Benchmark
  const results = await runBenchmark(BENCHMARK_TASKS, { maxDepth: 3, maxQuestions: 10, confirm: true });
  const solved = results.filter((r) => r.status === 'converged' && r.equivalence === 1).length;
  const silentWrong = results.filter((r) => r.status === 'converged' && r.equivalence < 1).length;
  console.log(`Benchmark: ${solved}/${results.length} exact, ${silentWrong} silent wrong`);

  // 2. Synthesize + generate code + sandbox test
  const name = 'synthSortDedupe';
  const examples = [
    { input: [3, 1, 2, 1], output: [1, 2, 3] },
    { input: [5, 4, 4, 3], output: [3, 4, 5] },
  ];
  const result = await runOracleLoop({
    taskId: name,
    examples,
    maxDepth: 3,
    maxQuestions: 10,
    askUser: async (q) => q.options[0],
  });
  console.log(`Synthesis: status=${result.status} program=${result.code}`);

  if (result.code) {
    const sourceCode = termToModule(result.code, name);
    const testSuiteCode = examplesToTestSuite(result.code, name, examples);
    const vr = executeTestSuite(sourceCode, testSuiteCode);
    console.log(`Sandbox: passed=${vr.passed} (${vr.testDetails?.length ?? 0} checks)`);
    console.log(`Details: ${JSON.stringify(vr.testDetails, null, 2)}`);
    console.log(`stdout: ${JSON.stringify((vr as any).stdout ?? [])}`);
    console.log(`stderr: ${JSON.stringify((vr as any).stderr ?? [])}`);
    console.log(`Test suite:\n${testSuiteCode}`);
  }

  process.exit(silentWrong === 0 && solved === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
