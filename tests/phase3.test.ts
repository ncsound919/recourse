import { describe, it, expect } from 'vitest';
import { ProblemArchive, curriculumQueue } from '../src/lib/problemArchive';
import { problemFromVerifiedTool, seedArchiveFromVerifiedTools, safeProblemId, resemblesProblem } from '../src/lib/problemGenerator';
import { inspire } from '../src/lib/inspirationCrossover';

describe('problem generator from verified tools (phase 3 #10)', () => {
  const tool = {
    name: 'lru_cache',
    domain: 'coding',
    description: 'bounded lru cache',
    suite: 'const c = new LRUCache(2);\nc.set("a", 1);\nassert c.get("a") === 1;',
  };

  it('turns a verified tool into a problem whose acceptance test is its real suite', () => {
    const p = problemFromVerifiedTool(tool)!;
    expect(p).not.toBeNull();
    expect(p.id).toBe(safeProblemId('lru_cache'));
    expect(p.domain).toBe('coding');
    expect(p.acceptanceTest).toBe(tool.suite);
    // The reference solution must NOT be embedded as an answer.
    expect(p.statement).not.toContain('new LRUCache(2)');
    expect(p.hints?.acceptanceLines).toBe(3);
  });

  it('skips tools without a suite (never fakes a spec)', () => {
    expect(problemFromVerifiedTool({ name: 'x', domain: 'math' })).toBeNull();
  });

  it('seeds an archive and dedupes re-added tools', () => {
    const archive = new ProblemArchive();
    const res = seedArchiveFromVerifiedTools(archive, [tool, { ...tool, name: 'lru_cache' }, { name: 'nosuite', domain: 'math' }]);
    expect(res.added).toBe(1);
    expect(res.duplicates).toBe(1);
    expect(res.skippedNoSuite).toBe(1);
    expect(archive.size).toBe(1);
  });

  it('resemblesProblem flags a near-identical title', () => {
    expect(resemblesProblem([{ title: 'Reproduce: lru_cache' }], 'Reproduce: lru_cache', 0.7)).toBe(true);
    expect(resemblesProblem([{ title: 'Reproduce: lru_cache' }], 'Reproduce: fast_fourier', 0.7)).toBe(false);
  });
});

describe('cross-run inspiration crossover (phase 3 #11)', () => {
  it('recalls the top-k most similar memory items above threshold', () => {
    const memory = [
      { id: 'a', text: 'implement a bloom filter over hashed tokens' },
      { id: 'b', text: 'landing page with pricing tiers' },
      { id: 'c', text: 'build a probabilistic membership set' },
    ];
    const r = inspire('bloom filter membership probe', memory, { k: 2, threshold: 0.2 });
    expect(r.hits.length).toBeGreaterThanOrEqual(1);
    expect(r.hits.length).toBeLessThanOrEqual(2);
    expect(r.hits[0].similarity).toBeGreaterThanOrEqual(r.hits[r.hits.length - 1].similarity);
  });

  it('returns nothing when memory is empty or nothing clears threshold', () => {
    expect(inspire('anything', []).hits).toHaveLength(0);
    expect(inspire('totally unique idea', [{ id: 'z', text: 'unrelated' }], { threshold: 0.9 }).hits).toHaveLength(0);
  });

  it('renders a prompt hint only when inspiration exists', () => {
    const r = inspire('merkle root over leaves', [{ id: 'm', text: 'merkle tree root compression' }], { k: 1, threshold: 0.2 });
    expect(r.promptHint).toContain('[inspiration 1');
  });
});

describe('curriculum queue (phase 3 #12)', () => {
  it('orders weak domains first and easy-before-hard within a domain', () => {
    const archive = new ProblemArchive();
    archive.add({ id: 'm1', domain: 'math', title: 'hard math', statement: 'x', acceptanceTest: 'assert true;', hints: { requiredPrimitives: 8 } });
    archive.add({ id: 'm2', domain: 'math', title: 'easy math', statement: 'x', acceptanceTest: 'assert true;', hints: { requiredPrimitives: 1 } });
    archive.add({ id: 'c1', domain: 'coding', title: 'coding', statement: 'x', acceptanceTest: 'assert true;', hints: { requiredPrimitives: 2 } });
    // coding is weak -> coding first, then math easiest-first
    const q = curriculumQueue(archive, [
      { domain: 'math', alpha: 8, beta: 2, attempts: 10 },
      { domain: 'coding', alpha: 1, beta: 9, attempts: 10 },
    ]);
    expect(q.map((x) => x.problem.id)).toEqual(['c1', 'm2', 'm1']);
  });

  it('excludes solved problems', () => {
    const archive = new ProblemArchive();
    archive.add({ id: 'a', domain: 'coding', title: 'a', statement: 'x', acceptanceTest: 'assert true;', hints: { requiredPrimitives: 1 } });
    const q = curriculumQueue(archive, [{ domain: 'coding', alpha: 1, beta: 1, attempts: 2 }], ['a']);
    expect(q).toHaveLength(0);
  });
});
