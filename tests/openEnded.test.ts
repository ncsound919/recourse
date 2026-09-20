import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  canonicalToolKey,
  noveltyVerdict,
  filterNovel,
  pruneLearnerBeliefs,
  propertyGate,
  type BeliefLike,
} from '../src/lib/openEnded/gates';
import {
  parseProblemDrafts,
  problemDraftPrompt,
  mintProblems,
  problemIsSolvable,
  problemIdFor,
  type MintedProblem,
} from '../src/lib/openEnded/problemMint';
import { OpenEndedArchive } from '../src/lib/openEnded/archive';
import { runOpenEndedCycle, rewardForResult, capabilityKeyFor } from '../src/lib/openEnded/engine';
import { parseSearchReplace, applySearchReplace, runPatchAttempt } from '../src/lib/openEnded/patchMode';
import {
  canonicalOutcomeId,
  dedupeFleetOutcomes,
  summarizeFleetRecursion,
  FleetRecursionLedger,
} from '../src/lib/openEnded/fleetRecursion';
import { FileLearnerStore, RecursiveLearner } from '../src/dream/learner';
import type { GeneBelief } from '../src/dream/learner-types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'open-ended-'));
}

function mkProblem(over: Partial<MintedProblem> = {}): MintedProblem {
  const functionName = over.functionName ?? 'solveThing';
  return {
    id: over.id ?? problemIdFor(over.domain ?? 'coding', functionName),
    domain: over.domain ?? 'coding',
    title: over.title ?? 'Solve the thing',
    statement: over.statement ?? `Implement ${functionName}.`,
    functionName,
    acceptanceTest: over.acceptanceTest ?? 'assert solveThing(1) === 2; // OK',
    referenceSource: over.referenceSource ?? 'function solveThing(x) { return x + 1; } // OK',
    ...(over.vectors ? { vectors: over.vectors } : {}),
    hints: over.hints ?? { requiredPrimitives: 1, acceptanceLines: 1, dataDims: 1 },
    createdAt: over.createdAt ?? 1,
  };
}

const verifyMarker = (src: string, suite: string) => ({
  passed: src.includes('OK') && suite.includes('OK'),
  testDetails: ['[PASS] marker'],
});

function belief(domain: string, alpha: number, beta: number, attempts: number, name = `${domain}_gene`): GeneBelief {
  return {
    geneId: `real:${name}`,
    geneName: name,
    domain: domain as GeneBelief['domain'],
    alpha,
    beta,
    attempts,
    meanReward: alpha / (alpha + beta),
    weight: alpha / (alpha + beta),
    lastEpisode: 1,
  };
}

// ---------------------------------------------------------------------------

describe('openEnded gates', () => {
  it('canonicalizes hex-suffixed / prefixed / cased name variants to one identity', () => {
    const canonical = canonicalToolKey('real:MATH_LAGRANGE_4776');
    expect(canonicalToolKey('real:MATH_LAGRANGE_b76a')).toBe(canonical);
    expect(canonicalToolKey('MATH_LAGRANGE')).toBe(canonical);
    expect(canonicalToolKey('real:math_lagrange')).toBe(canonical);
    expect(canonicalToolKey('real:dedupeStable')).not.toBe(canonical);
  });

  it('novelty gate rejects a duplicate and admits a distinct candidate', () => {
    expect(noveltyVerdict('exactly the same text here', ['exactly the same text here']).novel).toBe(false);
    expect(noveltyVerdict('a totally different idea', ['exactly the same text here']).novel).toBe(true);
    expect(noveltyVerdict('anything at all', []).novel).toBe(true);
  });

  it('filterNovel keeps survivors and records rejections', () => {
    const items = ['alpha beta gamma', 'alpha beta gamma', 'delta epsilon zeta'];
    const { kept, rejected } = filterNovel(items, (x) => x, ['alpha beta gamma']);
    expect(kept).toEqual(['delta epsilon zeta']);
    expect(rejected).toHaveLength(2);
  });

  it('prunes behavioral-duplicate gene beliefs without touching distinct ones', () => {
    const state = {
      episode: 100,
      geneBeliefs: {
        'real:Foo_1234': { ...belief('coding', 5, 5, 10, 'Foo_1234') },
        'real:Foo_ab12': { ...belief('coding', 5, 5, 10, 'Foo_ab12') },
        'real:Foo': { ...belief('coding', 5, 5, 10, 'Foo') },
        'real:Bar': { ...belief('math', 9, 1, 10, 'Bar') },
      } as Record<string, BeliefLike>,
    };
    const { state: next, report } = pruneLearnerBeliefs(state);
    expect(report.before).toBe(4);
    expect(report.duplicatesRemoved).toBe(2);
    expect(Object.keys(next.geneBeliefs).filter((k) => canonicalToolKey(k) === 'foo')).toHaveLength(1);
    expect(Object.keys(next.geneBeliefs).some((k) => canonicalToolKey(k) === 'bar')).toBe(true);
    // input untouched
    expect(Object.keys(state.geneBeliefs)).toHaveLength(4);
  });

  it('honors an explicit noise floor when retiring dead beliefs', () => {
    const state = {
      episode: 500,
      geneBeliefs: {
        'real:Dead_1': { ...belief('coding', 1, 999, 1000, 'Dead_1') },
        'real:Alive_1': { ...belief('coding', 900, 100, 1000, 'Alive_1') },
      } as Record<string, BeliefLike>,
    };
    const { state: next, report } = pruneLearnerBeliefs(state, { minWeight: 0.01, minMeanReward: 0.01, maxAgeEpisodes: 10 });
    expect(report.droppedNoise).toContain('real:Dead_1');
    expect(Object.keys(next.geneBeliefs)).toEqual(['real:Alive_1']);
  });

  it('property gate passes a pure function and catches an impure one', () => {
    const good = propertyGate('function f(x) { return x; }', [1, 2, 3]);
    expect(good.available).toBe(true);
    expect(good.passed).toBe(true);

    const impure = propertyGate('function f(a) { a.push(1); return a.length; }', [[1, 2, 3]]);
    expect(impure.available).toBe(true);
    expect(impure.passed).toBe(false);
    expect(impure.report.properties.find((p) => p.name === 'InputPurity')?.passed).toBe(false);
  });

  it('property gate tests the named export from an export-style source', () => {
    const good = propertyGate('export function f(x) { return x; }', [[0], [1]], undefined, 30, 'f');
    expect(good.available).toBe(true);
    expect(good.passed).toBe(true);

    const mutates = propertyGate('export function f(a) { a.push(1); return a.length; }', [[[1, 2, 3]]], undefined, 30, 'f');
    expect(mutates.passed).toBe(false);
    expect(mutates.report.properties.find((p) => p.name === 'InputPurity')?.passed).toBe(false);
  });
});

describe('openEnded problem minting', () => {
  const validDraft = JSON.stringify({
    problems: [
      {
        title: 'Add one',
        domain: 'coding',
        statement: 'Return n+1.',
        functionName: 'addOne',
        acceptanceTest: 'assert addOne(1) === 2; // OK',
        referenceSource: 'export function addOne(n){ return n+1; } // OK',
        vectors: [[1], [0]],
      },
      {
        title: 'Broken reference',
        domain: 'math',
        statement: 'Impossible.',
        functionName: 'impossibleFn',
        acceptanceTest: 'assert impossibleFn(1) === 2; // OK',
        referenceSource: 'export function impossibleFn(){ return 9; }',
      },
    ],
  });

  it('parses a well-formed response and rejects malformed fields', () => {
    expect(parseProblemDrafts(validDraft).ok).toBe(true);
    expect(parseProblemDrafts('not json').ok).toBe(false);
    expect(parseProblemDrafts(JSON.stringify({ problems: [{ title: 'x' }] })).ok).toBe(false);
  });

  it('includes the domain vocabulary in the prompt', () => {
    const { user } = problemDraftPrompt('ctx', 2);
    expect(user).toContain('coding');
    expect(user).toContain('quantum_sim');
  });

  it('admits only problems whose reference passes its own acceptance test', async () => {
    const res = await mintProblems({
      context: 'ctx',
      count: 2,
      draft: async () => `\`\`\`json\n${validDraft}\n\`\`\``,
      verify: verifyMarker,
    });
    expect(res.minted).toHaveLength(1);
    expect(res.minted[0].functionName).toBe('addOne');
    expect(res.minted[0].vectors).toEqual([[1], [0]]);
    expect(res.rejected.some((r) => r.reason === 'reference_failed_acceptance')).toBe(true);
  });

  it('rejects acceptance tests that reference host access', async () => {
    const unsafe = JSON.stringify({
      problems: [
        {
          title: 'Unsafe',
          domain: 'coding',
          statement: 'x',
          functionName: 'unsafeFn',
          acceptanceTest: 'assert require("fs").existsSync("/") === unsafeFn(); // OK',
          referenceSource: 'export function unsafeFn(){ return 1; } // OK',
        },
      ],
    });
    const res = await mintProblems({ context: 'c', count: 1, draft: async () => unsafe, verify: verifyMarker });
    expect(res.minted).toHaveLength(0);
    expect(res.rejected[0].reason).toBe('unsafe_acceptance_test');
  });

  it('repairs single-quoted / trailing-comma JSON from small local models', () => {
    const lenient =
      "{'problems':[{'title':'x','domain':'coding','statement':'s','functionName':'f'," +
      "'acceptanceTest':'assert f(1)===1;','referenceSource':'function f(x){return x;}',},]}";
    const parsed = parseProblemDrafts(lenient);
    expect(parsed.ok).toBe(true);
    expect(parsed.drafts?.[0]?.functionName).toBe('f');
  });

  it('re-proves solvability from the hidden reference', () => {
    const p = mkProblem();
    expect(problemIsSolvable(p, verifyMarker)).toBe(true);
    expect(problemIsSolvable({ ...p, referenceSource: 'nope' }, verifyMarker)).toBe(false);
  });
});

describe('openEnded archive', () => {
  it('dedupes exact ids and near-duplicate titles, and tracks solved state', () => {
    const archive = new OpenEndedArchive(null, 4);
    const p = mkProblem({ id: 'p1', title: 'Alpha problem', domain: 'coding' });
    expect(archive.add(p).added).toBe(true);
    expect(archive.add({ ...p }).reason).toBe('exact_id');
    expect(archive.add(mkProblem({ id: 'p2', title: 'Alpha problem', domain: 'coding' })).reason).toBe('near_title');
    expect(archive.size).toBe(1);

    archive.markAttempt('p1', true);
    expect(archive.solvedIds()).toEqual(['p1']);
    expect(archive.snapshot().solved).toBe(1);
  });

  it('selects the least-confident domain first, easiest problem within it', () => {
    const archive = new OpenEndedArchive(null, 4);
    archive.add(mkProblem({ id: 'm_hard', domain: 'math', title: 'hard math', hints: { requiredPrimitives: 8, acceptanceLines: 20, dataDims: 3 } }));
    archive.add(mkProblem({ id: 'm_easy', domain: 'math', title: 'easy math', hints: { requiredPrimitives: 1, acceptanceLines: 1, dataDims: 1 } }));
    archive.add(mkProblem({ id: 'c_easy', domain: 'coding', title: 'easy coding', hints: { requiredPrimitives: 1, acceptanceLines: 1, dataDims: 1 } }));
    const beliefs = [belief('math', 8, 2, 10), belief('coding', 1, 9, 10)];
    const pick = archive.nextByCurriculum(beliefs);
    expect(pick?.id).toBe('c_easy');
  });

  it('persists to disk atomically and reloads', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'problems.json');
    const a = new OpenEndedArchive(file, 4);
    a.add(mkProblem({ id: 'persisted', title: 'Persisted problem', domain: 'math' }));
    const b = new OpenEndedArchive(file, 4);
    expect(b.size).toBe(1);
    expect(b.get('persisted')?.title).toBe('Persisted problem');
  });
});

describe('openEnded cycle engine', () => {
  // A real verifier is injected; for the unit test it rejects only source
  // marked BAD, which lets us exercise every gate without a sandbox.
  const okIfNotBad = (src: string, _suite: string) => ({ passed: !src.includes('BAD'), testDetails: [] });

  function seededArchive(): OpenEndedArchive {
    const archive = new OpenEndedArchive(null, 4);
    archive.add(mkProblem({ id: 'coding:1', domain: 'coding', title: 'Coding problem', functionName: 'codingFn', referenceSource: 'function codingFn(x){return x;}' }));
    archive.add(mkProblem({ id: 'math:1', domain: 'math', title: 'Math problem', functionName: 'mathFn', referenceSource: 'function mathFn(x){return x;}', acceptanceTest: 'assert mathFn(1)===1;' }));
    return archive;
  }

  it('mints, curriculum-picks, solves through all gates, and archives the win', async () => {
    const archive = new OpenEndedArchive(null, 4);
    const result = await runOpenEndedCycle({
      archive,
      beliefs: [belief('coding', 1, 9, 10)],
      minUnsolved: 1,
      mint: {
        context: 'ctx',
        count: 1,
        draft: async () =>
          JSON.stringify({
            problems: [
              {
                title: 'Fresh problem',
                domain: 'coding',
                statement: 'Return the input.',
                functionName: 'identityFn',
                acceptanceTest: 'assert identityFn(2) === 2;',
                referenceSource: 'export function identityFn(x){ return x; }',
              },
            ],
          }),
        verify: okIfNotBad,
      },
      solver: async () => ({ ok: true, source: 'function identityFn(x) { return x; }', detail: 'generated' }),
      verify: okIfNotBad,
      propertyVectorsFor: () => [1, 2, 3],
    });
    expect(result.minted).toBe(1);
    expect(result.solved).toBe(true);
    expect(result.acceptance?.passed).toBe(true);
    expect(result.property?.passed).toBe(true);
    expect(result.archive.solved).toBe(1);
    expect(rewardForResult(result)).toBe(1);
  });

  it('treats the property gate as advisory when the hidden reference fails it', async () => {
    const archive = new OpenEndedArchive(null, 4);
    archive.add(
      mkProblem({
        id: 'adv:1',
        domain: 'coding',
        title: 'Advisory property problem',
        functionName: 'advFn',
        referenceSource: 'export function advFn(a){ a.push(1); return a.length; }',
        acceptanceTest: 'assert advFn([1]) === 2;',
        vectors: [[[1]]],
      }),
    );
    const result = await runOpenEndedCycle({
      archive,
      beliefs: [belief('coding', 1, 9, 10)],
      solver: async () => ({ ok: true, source: 'export function advFn(a){ a.push(1); return a.length; }', detail: 'g' }),
      verify: () => ({ passed: true, testDetails: [] }),
      propertyVectorsFor: (p) => p.vectors ?? null,
      maxSolveAttempts: 1,
    });
    expect(result.solved).toBe(true);
    expect(result.property?.enforced).toBe(false);
  });

  it('retries minting when a round admits nothing (transient model failure)', async () => {
    const archive = new OpenEndedArchive(null, 4);
    let calls = 0;
    const result = await runOpenEndedCycle({
      archive,
      beliefs: [belief('coding', 1, 9, 10)],
      minUnsolved: 1,
      maxMintRounds: 3,
      mint: {
        context: 'c',
        count: 1,
        draft: async () => {
          calls += 1;
          if (calls < 3) return 'not valid json';
          return JSON.stringify({
            problems: [
              {
                title: 'Retry problem',
                domain: 'coding',
                statement: 'Return the input.',
                functionName: 'retryFn',
                acceptanceTest: 'assert retryFn(1) === 1;',
                referenceSource: 'export function retryFn(x){ return x; }',
              },
            ],
          });
        },
        verify: okIfNotBad,
      },
      solver: async () => ({ ok: true, source: 'function retryFn(x) { return x; }', detail: 'generated' }),
      verify: okIfNotBad,
    });
    expect(calls).toBe(3);
    expect(result.minted).toBe(1);
    expect(result.solved).toBe(true);
    expect(result.mintRejections?.some((r) => r.reason === 'parse_error')).toBe(true);
  });

  it('reports an honest failure when the solver never satisfies the acceptance test', async () => {
    const archive = seededArchive();
    const result = await runOpenEndedCycle({
      archive,
      beliefs: [belief('coding', 1, 9, 10), belief('math', 9, 1, 10)],
      solver: async () => ({ ok: true, source: 'function codingFn(x) { return null; } // BAD', detail: 'generated' }),
      verify: okIfNotBad,
      maxSolveAttempts: 1,
    });
    expect(result.solved).toBe(false);
    expect(result.reason).toContain('acceptance failed');
    expect(rewardForResult(result)).toBe(0.3);
    expect(archive.get('coding:1')?.attempts).toBe(1);
  });

  it('rejects a near-duplicate solution via the novelty gate', async () => {
    const archive = new OpenEndedArchive(null, 4);
    archive.add(mkProblem({ id: 'dup:1', domain: 'coding', title: 'Unique prefix', functionName: 'solver', referenceSource: 'function solver(x){return x;}' }));
    const problem = archive.get('dup:1')!;
    const source = 'function solver(x) { return x; }';
    const result = await runOpenEndedCycle({
      archive,
      beliefs: [belief('coding', 1, 9, 10)],
      solver: async () => ({ ok: true, source, detail: 'generated' }),
      verify: okIfNotBad,
      noveltyPool: [`${problem.title} ${source}`],
    });
    expect(result.solved).toBe(false);
    expect(result.reason).toContain('near-duplicate');
  });

  it('skips a problem whose stored reference no longer passes', async () => {
    const archive = new OpenEndedArchive(null, 4);
    archive.add(mkProblem({ id: 'stale:1', domain: 'coding', title: 'Stale', functionName: 'staleFn', referenceSource: 'function staleFn(x) { return null; } // BAD' }));
    const result = await runOpenEndedCycle({
      archive,
      beliefs: [belief('coding', 1, 9, 10)],
      solver: async () => ({ ok: true, source: 'function staleFn(){}', detail: 'generated' }),
      verify: okIfNotBad,
    });
    expect(result.solved).toBe(false);
    expect(result.reason).toContain('not provably solvable');
  });

  it('derives a capability key from the picked problem', () => {
    expect(capabilityKeyFor({ picked: { id: 'x', title: 'My_Capability_ab12', domain: 'coding' } } as never)).toBe('real:mycapability');
    expect(capabilityKeyFor({ picked: null } as never)).toBeNull();
  });
});

describe('openEnded patch mode', () => {
  const original = 'export function add(a, b) {\n  return a + b;\n}\n\nexport function keep() { return 1; }\n';

  it('parses a search/replace patch and refuses no-ops', () => {
    const ok = parseSearchReplace(JSON.stringify({ file: 'x.ts', search: 'a + b', replace: 'a - b' }));
    expect(ok.ok).toBe(true);
    expect(parseSearchReplace(JSON.stringify({ file: 'x.ts', search: 'a', replace: 'a' })).ok).toBe(false);
    expect(parseSearchReplace('nope').ok).toBe(false);
  });

  it('applies a unique replacement and preserves the rest of the file', () => {
    const res = applySearchReplace(original, 'return a + b;', 'return a - b;');
    expect(res.ok).toBe(true);
    expect(res.output).toContain('return a - b;');
    expect(res.output).toContain('export function keep() { return 1; }');
  });

  it('refuses a missing or ambiguous search string', () => {
    expect(applySearchReplace(original, 'not present', 'x').ok).toBe(false);
    const ambiguous = applySearchReplace('a a a', 'a', 'b');
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.occurrences).toBe(3);
  });

  it('produces and verifies a patch, applying it only through the writer', async () => {
    let written: string | undefined;
    const result = await runPatchAttempt({
      file: 'x.ts',
      goal: 'make add subtract',
      original,
      draft: async () => JSON.stringify({ file: 'x.ts', search: 'return a + b;', replace: 'return a - b;' }),
      verify: (output) => ({ ok: output.includes('a - b'), detail: 'ok' }),
      apply: async (patch) => {
        written = patch.output;
        return { applied: true, revertToken: 'rt1' };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.revertToken).toBe('rt1');
    expect(written).toContain('a - b');
  });

  it('reports failure when the model cannot produce an applicable patch', async () => {
    const result = await runPatchAttempt({
      file: 'x.ts',
      goal: 'do something impossible',
      original,
      draft: async () => JSON.stringify({ file: 'x.ts', search: 'not in the file', replace: 'x' }),
      maxTries: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBe(2);
  });
});

describe('openEnded fleet recursion', () => {
  it('canonicalizes identities and keeps the most-progressed report', () => {
    expect(canonicalOutcomeId({ source: 'Axiom', goal: 'Loop_A' })).toBe('axiom:loopa');
    const { kept, dropped } = dedupeFleetOutcomes([
      { source: 'axiom', goal: 'loop a', iteration: 1, status: 'ok' },
      { source: 'axiom', goal: 'loop a', iteration: 3, status: 'ok' },
      { source: 'openhub', goal: 'loop b', iteration: 1, status: 'fail' },
    ]);
    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(1);
    expect(kept.find((k) => k.canonicalId === 'axiom:loopa')?.iteration).toBe(3);
  });

  it('summarizes progress and surfaces regressions', () => {
    const summary = summarizeFleetRecursion([
      { source: 'axiom', goal: 'loop a', iteration: 1, status: 'ok', score: 0.9 },
      { source: 'axiom', goal: 'loop a', iteration: 2, status: 'ok', score: 0.4 },
      { source: 'openhub', goal: 'loop b', iteration: 1, status: 'fail' },
    ]);
    expect(summary.distinctGoals).toBe(2);
    expect(summary.regressions).toHaveLength(1);
    expect(summary.bySource.find((s) => s.source === 'axiom')?.bestIteration).toBe(2);
    expect(summary.bySource.find((s) => s.source === 'openhub')?.failures).toBe(1);
  });

  it('appends a hash-chained ledger, ignores re-reports, and detects tampering', () => {
    const file = path.join(tmpDir(), 'fleet.jsonl');
    const ledger = new FleetRecursionLedger(file);
    const first = ledger.append({ source: 'axiom', goal: 'loop a', iteration: 1, status: 'ok' }, 1000);
    const reReport = ledger.append({ source: 'axiom', goal: 'loop a', iteration: 1, status: 'ok' }, 2000);
    expect(reReport.seq).toBe(first.seq);
    ledger.append({ source: 'axiom', goal: 'loop a', iteration: 2, status: 'ok' }, 3000);
    expect(ledger.read()).toHaveLength(2);
    expect(ledger.verifyChain().valid).toBe(true);

    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    entry.summary = 'tampered';
    lines[0] = JSON.stringify(entry);
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');
    const chain = ledger.verifyChain();
    expect(chain.valid).toBe(false);
    expect(chain.divergedAtSeq).toBe(first.seq);
  });
});

describe('learner gene-belief hygiene integration', () => {
  it('prunes duplicate real-tool beliefs through RecursiveLearner.pruneBeliefs', async () => {
    const file = path.join(tmpDir(), 'learner.json');
    const store = new FileLearnerStore(file);
    const learner = new RecursiveLearner(store);
    const base = await learner.status();
    const dup = { ...belief('coding', 5, 5, 10, 'Foo_1234') };
    base.geneBeliefs['real:Foo_1234'] = { ...dup, geneId: 'real:Foo_1234', geneName: 'Foo_1234' };
    base.geneBeliefs['real:Foo_ab12'] = { ...dup, geneId: 'real:Foo_ab12', geneName: 'Foo_ab12' };
    base.geneBeliefs['real:Foo'] = { ...dup, geneId: 'real:Foo', geneName: 'Foo' };
    await store.saveState(base);

    const report = await learner.pruneBeliefs();
    expect(report.duplicatesRemoved).toBeGreaterThanOrEqual(2);
    const after = await learner.status();
    expect(Object.keys(after.geneBeliefs).filter((k) => canonicalToolKey(k) === 'foo')).toHaveLength(1);
  });
});
