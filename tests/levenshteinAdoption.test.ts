/**
 * levenshteinAdoption.test.ts — the forge-built tool, load-bearing.
 *
 * `deterministicResearch.levenshteinDistance` runs on a live path: the science
 * conductor's evidence phase dedups sources by title distance every cycle, and a
 * wrong distance silently deletes an evidence source. This module therefore lets
 * the generated tool answer ONLY after it proves it equals the local reference
 * on every equivalence vector. These tests pin both halves of that bargain:
 * the tool is actually adopted, and a wrong tool is refused rather than trusted.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  adoptForgeLevenshtein,
  checkLevenshteinEquivalence,
  levenshteinAdoption,
  levenshteinDistance,
  levenshteinImplementation,
  referenceLevenshteinDistance,
  resetForgeLevenshtein,
  stringSimilarity,
  LEVENSHTEIN_TOOL,
} from '../src/lib/deterministicResearch';
import { listSelfHostedEntries } from '../src/lib/selfHosting';

const VECTORS: Array<[string, string]> = [
  ['kitten', 'sitting'],
  ['', 'abc'],
  ['same', 'same'],
  ['Deterministic Web Research', 'deterministic web research'],
  ['mémoire', 'memoire'],
  ['日本語のタイトル', '日本語タイトル'],
  ['x', 'x'.repeat(120)],
];

afterEach(() => resetForgeLevenshtein());

describe('forge levenshtein adoption', () => {
  it('starts on the local reference, not the tool', () => {
    expect(levenshteinImplementation().source).toBe('local_reference');
    expect(levenshteinAdoption().status).toBe('pending');
  });

  it('adopts the real self-hosted tool when one is present', async () => {
    const present = listSelfHostedEntries().some((e) => e.name === LEVENSHTEIN_TOOL);
    const a = await adoptForgeLevenshtein({ force: true });
    if (!present) {
      // No tool on this host: the honest outcome is "unavailable", and the
      // reference must still be answering.
      expect(a.status).toBe('unavailable');
      expect(levenshteinImplementation().source).toBe('local_reference');
      return;
    }
    expect(a.status).toBe('adopted');
    if (a.status === 'adopted') {
      expect(a.vectors).toBeGreaterThanOrEqual(10);
      expect(a.hash).toMatch(/^[0-9a-f]{16,}$/);
    }
    expect(levenshteinImplementation().source).toBe('forge_tool');
  });

  it('produces identical distances through the tool and the reference', async () => {
    const before = VECTORS.map(([a, b]) => [levenshteinDistance(a, b), stringSimilarity(a, b)]);
    const a = await adoptForgeLevenshtein({ force: true });
    if (a.status !== 'adopted') return; // nothing to compare on this host
    const after = VECTORS.map(([x, y]) => [levenshteinDistance(x, y), stringSimilarity(x, y)]);
    expect(after).toEqual(before);
  });

  it('is idempotent and cheap after the first adoption', async () => {
    const first = await adoptForgeLevenshtein({ force: true });
    if (first.status !== 'adopted') return;
    const second = await adoptForgeLevenshtein();
    expect(second.status).toBe('adopted');
  });
});

describe('the equivalence gate itself', () => {
  const referenceDistance = referenceLevenshteinDistance;

  it('accepts an implementation that matches the reference', () => {
    expect(checkLevenshteinEquivalence((a, b) => referenceDistance(a, b))).toBeNull();
  });

  it('refuses an off-by-one distance', () => {
    const bad = checkLevenshteinEquivalence((a, b) => referenceDistance(a, b) + 1);
    expect(bad).toMatch(/expected/);
  });

  it('refuses an implementation that returns 0 for everything (passes the suite, wrong in fact)', () => {
    // Satisfies `same === 0` and every empty-side case; fails on real pairs.
    const alwaysZero = () => 0;
    expect(checkLevenshteinEquivalence(alwaysZero)).toMatch(/expected/);
  });

  it('refuses an implementation that throws', () => {
    const boom = () => {
      throw new Error('nope');
    };
    expect(checkLevenshteinEquivalence(boom)).toMatch(/threw on/);
  });

  it('refuses a distance that drifts on long strings', () => {
    const lossy = (a: string, b: string) => Math.round(referenceDistance(a, b) * 1.01);
    expect(checkLevenshteinEquivalence(lossy)).toMatch(/expected/);
  });

  it('KNOWN LIMIT: a drift smaller than half a unit passes this gate', () => {
    // Stated rather than hidden. 1e-7 relative drift rounds back to the exact
    // integer on every equivalence vector, so equivalence alone cannot see it.
    // That is precisely why adoption is not the only check: the forge's own
    // differential + scale probes and the promoted-tool audit still judge the
    // implementation, and this gate is only the "is it the same function" test.
    const subHalf = (a: string, b: string) => Math.round(referenceDistance(a, b) * 1.0000001);
    expect(checkLevenshteinEquivalence(subHalf)).toBeNull();
  });
});