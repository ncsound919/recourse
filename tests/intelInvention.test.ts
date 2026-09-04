import { describe, it, expect } from 'vitest';
import { guessDomain, bbtchIdeaToProposal, heuristicScore, sortProposals, nextProposalToPursue } from '../src/lib/intelInvention';
import type { IntelProposal } from '../src/lib/intelInvention';

function prop(title: string, id = title, status: IntelProposal['status'] = 'new', score = 50): IntelProposal {
  return {
    id, source: 'bbtech', title, description: `idea about ${title} with enough text to matter here`,
    domain: guessDomain(title), tags: [], rationale: 'intel', score, createdAt: 0, status,
  };
}

describe('Intel → Invention (proposal model)', () => {
  it('classifies an idea domain by transparent keyword heuristic', () => {
    expect(guessDomain('quantum qubit entanglement simulator')).toBe('quantum_sim');
    expect(expect(guessDomain('protein gene clinical cell')).toBe('biotech'));
    expect(guessDomain('merkle hash cipher sanitizer')).toBe('cyber_defense');
    expect(guessDomain('prime gcd fibonacci')).toBe('math');
    expect(guessDomain('agent orchestration workflow')).toBe('systemic');
    expect(guessDomain('lru cache dedup')).toBe('coding');
  });

  it('builds a durable proposal from an intel idea without claiming it is built', () => {
    const p = bbtchIdeaToProposal('p1', { title: 'A bloom filter variant', description: 'Compact membership with tunable false positives' }, 'bbtech');
    expect(p.status).toBe('new');
    expect(p.source).toBe('bbtech');
    expect(p.domain).toBe('coding');
    expect(p.adoptedSpecId).toBeUndefined();
  });

  it('scores and ranks proposals deterministically', () => {
    const a = prop('a', 'a'); a.score = 10;
    const b = prop('b', 'b'); b.score = 90;
    const c = prop('c', 'c'); c.score = 50;
    const sorted = sortProposals([a, b, c]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(nextProposalToPursue([a, b, c])!.id).toBe('b');
  });

  it('does not offer adopted or declined proposals as the next to pursue', () => {
    const done = prop('done', 'done', 'adopted', 99);
    const fresh = prop('fresh', 'fresh', 'new', 5);
    expect(nextProposalToPursue([done, fresh])!.id).toBe('fresh');
  });

  it('assigns a transparent local heuristic score when no strategy brain is up', () => {
    const p = prop('agent route planner with many details and structure');
    expect(heuristicScore(p)).toBeGreaterThan(20);
    expect(heuristicScore(p)).toBeLessThanOrEqual(100);
  });
});
