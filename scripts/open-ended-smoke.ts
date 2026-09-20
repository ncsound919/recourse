/**
 * Open-Ended Capability Engine — live smoke test.
 *
 * Runs ONE real cycle against the configured model (local-first, API fallback)
 * with the real sandbox and the Axiom fallback enabled. Prints honest metrics:
 * how many problems were minted/rejected, whether the picked problem was solved,
 * which gates ran, and whether the property harness was available in this
 * runtime (the thing the tsx/CJS require fix is about).
 *
 *   npx tsx scripts/open-ended-smoke.ts
 *
 * Exit code is 0 whenever the cycle completed (solved or not); a non-zero code
 * means the cycle itself threw. This is a smoke probe, not a benchmark.
 */

import 'dotenv/config';

import { chatComplete, chatCompleteProfile } from '../src/lib/modelProvider.js';
import { executeTestSuite } from '../src/lib/executionSandbox.js';
import { axiomReachable, integrateAxiomTool } from '../src/lib/axiomBridge.js';
import { OpenEndedArchive } from '../src/lib/openEnded/archive.js';
import { runOpenEndedCycle } from '../src/lib/openEnded/engine.js';
import { propertyGate } from '../src/lib/openEnded/gates.js';
import type { ToolDomain } from '../src/types.js';

const verify = (source: string, suite: string) => {
  const r = executeTestSuite(source, suite);
  return { passed: r.passed, testDetails: r.testDetails };
};

function propertyVectorsForProblem(problem: { functionName: string; vectors?: unknown[] }): unknown[] | null {
  if (Array.isArray(problem.vectors) && problem.vectors.length) return problem.vectors;
  const n = problem.functionName.toLowerCase();
  if (/arr|list|array|chunk|merge|flatten|sort|dedupe|search|sieve|top|uniq/.test(n)) return [[[]], [[1, 2, 3]], [[5]]];
  if (/cache|class|constructor/.test(n)) return null;
  return [[0], [1], [2], [7]];
}

async function main() {
  const archive = new OpenEndedArchive(process.env.RECOURSE_OPEN_ENDED_FILE || null, 4);
  const useApi = process.argv.includes('--api');
  const chat = (messages: Parameters<typeof chatComplete>[0], opts: Parameters<typeof chatComplete>[1] = {}) =>
    useApi ? chatCompleteProfile('api', messages, opts) : chatComplete(messages, opts);
  const online = await chat([{ role: 'user', content: 'ping' }], { temperature: 0 }).then((r) => r.ok).catch(() => false);
  const axiom = await axiomReachable();
  console.log(`[smoke] mode=${useApi ? 'api' : 'local-first'} model online=${online} axiom reachable=${axiom} propertyHarness=${propertyGate('function f(x){return x;}', [1, 2, 3]).available}`);

  const result = await runOpenEndedCycle({
    archive,
    beliefs: [],
    knownDomains: ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'],
    minUnsolved: 1,
    maxMintRounds: Math.max(1, Number(process.env.OPEN_ENDED_MINT_ROUNDS) || 3),
    mintBatch: Math.max(1, Number(process.env.OPEN_ENDED_MINT_BATCH) || 2),
    mint: {
      context: 'verified, self-contained micro-capabilities across coding, math, cyber, quantum, neuro-symbolic and systemic domains',
      count: 2,
      draft: async (system, user) => {
        const res = await chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.4 },
        );
        if (!res.ok || res.content === null) throw new Error(res.error || 'model offline');
        return res.content;
      },
      verify,
    },
    solver: async (problem, inspirationHint) => {
      const system =
        'You write plain JavaScript micro-functions. Return ONLY source. No Markdown fences, no prose, ' +
        `no imports, no TypeScript. Define and export exactly one function named ${problem.functionName}. ` +
        'Match the contract exactly and handle edge cases (empty inputs, bounds) explicitly.';
      const res = await chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `${problem.statement}\n\n${inspirationHint}\n\nReturn only the source.` },
        ],
        { temperature: 0.2 },
      );
      if (res.ok && res.content) {
        const source = res.content.replace(/```(?:js|javascript)?/gi, '').replace(/```/g, '').trim();
        if (source.length > 10) return { ok: true, source, detail: 'model' };
      }
      if (await axiomReachable()) {
        const ax = await integrateAxiomTool(
          problem.functionName,
          problem.domain as ToolDomain,
          problem.statement,
          problem.acceptanceTest,
          { selfHost: false },
        );
        if (ax.ok && ax.sourceCode) return { ok: true, source: ax.sourceCode, detail: 'axiom' };
        return { ok: false, detail: ax.error || 'Axiom produced no verified source' };
      }
      return { ok: false, detail: res.error || 'model offline and Axiom unreachable' };
    },
    verify,
    propertyVectorsFor: propertyVectorsForProblem,
    maxSolveAttempts: 2,
    noveltyPool: [],
  });

  console.log(JSON.stringify({ minted: result.minted, mintRejected: result.mintRejected, mintRejections: result.mintRejections, picked: result.picked, solved: result.solved, reason: result.reason, acceptance: result.acceptance, property: result.property, steps: result.steps, archive: result.archive }, null, 2));
}

main().catch((err) => {
  console.error('[smoke] cycle threw:', err);
  process.exit(1);
});
