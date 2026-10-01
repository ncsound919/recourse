import { describe, it, expect } from 'vitest';
import { propertyVectorsForProblem } from '../src/lib/openEnded/propertyVectors';

const ARRAY_PROBLEM = {
  functionName: 'chunk',
  acceptanceTest:
    'assert chunk([1,2,3,4], 2).length === 2;\n' +
    "assert chunk('abc', 2).length === 2;\n",
};

const NUMERIC_PROBLEM = {
  functionName: 'gcdPair',
  acceptanceTest: 'assert gcdPair(48, 18) === 6;\nassert gcdPair(17, 5) === 1;\n',
};

describe('propertyVectorsForProblem', () => {
  it('prefers the vectors the problem declares at mint time', () => {
    const vectors = [[{ a: 1 }], [{ a: 2 }]];
    expect(
      propertyVectorsForProblem({
        functionName: 'chunk',
        vectors,
        acceptanceTest: 'assert chunk([], 1).length === 0;',
      }),
    ).toEqual(vectors);
  });

  it('derives sample calls from the acceptance test when no vectors are declared', () => {
    expect(propertyVectorsForProblem(NUMERIC_PROBLEM)).toEqual([[48, 18], [17, 5]]);
  });

  it('derives mixed-shape calls from the acceptance test', () => {
    expect(propertyVectorsForProblem(ARRAY_PROBLEM)).toEqual([[[1, 2, 3, 4], 2], ['abc', 2]]);
  });

  it('is name-agnostic: renaming the export changes nothing about the shapes', () => {
    const before = propertyVectorsForProblem({ functionName: 'chunk', acceptanceTest: ARRAY_PROBLEM.acceptanceTest });
    const after = propertyVectorsForProblem({
      functionName: 'sliceInto',
      acceptanceTest: ARRAY_PROBLEM.acceptanceTest.replace(/chunk/g, 'sliceInto'),
    });
    expect(after).toEqual(before);
  });

  it('does not invent array shapes for a numeric problem (the old name-regex behaviour)', () => {
    // "chunk" used to match /arr|list|chunk|merge/ and get array samples even
    // when the contract was numeric; now the contract decides.
    const vectors = propertyVectorsForProblem(NUMERIC_PROBLEM);
    expect(vectors).not.toContainEqual([]);
  });

  it('returns null when the problem declares no shapes at all', () => {
    expect(propertyVectorsForProblem({ functionName: 'mysteryFn' })).toBeNull();
    expect(propertyVectorsForProblem({ functionName: 'mysteryFn', acceptanceTest: '   ' })).toBeNull();
  });

  it('returns null when the acceptance test never calls the export', () => {
    expect(
      propertyVectorsForProblem({
        functionName: 'thing',
        acceptanceTest: 'assert other([1, 2]).length === 2;',
      }),
    ).toBeNull();
  });

  it('treats an empty vectors array as "not declared" rather than as no inputs', () => {
    expect(propertyVectorsForProblem({ functionName: 'gcdPair', vectors: [], acceptanceTest: NUMERIC_PROBLEM.acceptanceTest }))
      .toEqual([[48, 18], [17, 5]]);
  });

  it('ignores non-array junk in vectors instead of throwing', () => {
    expect(
      propertyVectorsForProblem({ functionName: 'gcdPair', vectors: 'nope' as never }),
    ).toBeNull();
  });
});
