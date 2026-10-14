/**
 * externalIdeas.test.ts — the telemetry→forge intake contract.
 *
 * What must never break:
 *  - cards without a testable contract (refSuite < 2 asserts) are refused;
 *  - duplicate ids are NOT silently re-ingested (refresh semantics only for
 *    still-pending cards);
 *  - pickIdeasForForge skips built/failed/unknown statuses and sorts by score;
 *  - markIdeaOutcome never guesses (unknown id returns false);
 *  - state is bounded (MAX_IDEAS).
 */
import { describe, it, expect } from 'vitest';
import {
  ingestIdeas, markIdeaOutcome, pickIdeasForForge, pickScaffoldIdeas, specFromIdea, summarizeIdeas,
  ideaSpecId, type ExternalStateIdea,
} from './externalIdeas.js';

const base = {
  id: 'sieve:idea:canary-routes',
  source: 'sieve',
  domain: 'systemic',
  toolName: 'canaryRouteBudgetCheck',
  title: 'Health canary for hot 5xx routes',
  prompt: 'Telemetry saw /review flapping 500s. Build a pure deterministic canary function returning pass/fail with an over-budget reason.',
  refSuite: 'assert canaryRouteBudgetCheck({status:200,ms:50}) === true;\nassert canaryRouteBudgetCheck({status:500,ms:50}) === false;',
  score: 0.9,
};

describe('ingestIdeas', () => {
  it('accepts a fully-shaped card with a testable refSuite', () => {
    const state: ExternalStateIdea[] = [];
    const r = ingestIdeas([base], state);
    expect(r.accepted).toHaveLength(1);
    expect(state[0].status).toBe('pending');
    expect(state[0].specId).toBe(ideaSpecId(base as never));
  });

  it('refuses cards with fewer than 2 asserts (no judgment = no idea)', () => {
    const r = ingestIdeas([{ ...base, refSuite: 'assert x === x;' }], []);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/refSuite/);
  });

  it('refuses unknown domains and bad tool names', () => {
    const r1 = ingestIdeas([{ ...base, domain: 'marketing' }], []);
    expect(r1.rejected[0].reason).toMatch(/domain/);
    const r2 = ingestIdeas([{ ...base, toolName: '9tool' }], []);
    expect(r2.rejected[0].reason).toMatch(/toolName/);
  });

  it('treats a re-post of the same id as duplicate unless still pending (refresh)', () => {
    const state: ExternalStateIdea[] = [];
    ingestIdeas([base], state);
    const pending = ingestIdeas([{ ...base, score: 0.99, evidence: { hot: 5 } }], state);
    expect(pending.accepted).toHaveLength(1);            // refresh, not reject
    expect(state).toHaveLength(1);                        // no second row
    expect(state[0].score).toBe(0.99);                    // refreshed
    markIdeaOutcome(state, base.id, { status: 'built', toolName: 'canaryRouteBudgetCheck', versionHash: 'abc' });
    expect(state[0].status).toBe('built');
    const dupAfterBuild = ingestIdeas([base], state);
    expect(dupAfterBuild.accepted).toHaveLength(0);       // a BUILT id is closed
    expect(dupAfterBuild.rejected[0].reason).toMatch(/duplicate id \(status built\)/);
  });

  it('lets a source REVISE a failed card (bounded retries), then keeps it pending', () => {
    const state: ExternalStateIdea[] = [];
    ingestIdeas([base], state);
    markIdeaOutcome(state, base.id, { status: 'failed', failureReason: 'bad fixture' });
    expect(state[0].status).toBe('failed');
    // The source fixed its own acceptance suite and re-posts the same id.
    const revised = ingestIdeas([{ ...base, refSuite: base.refSuite + '\nassert canaryRouteBudgetCheck({status:200,ms:0}) === true;' }], state);
    expect(revised.accepted).toHaveLength(1);
    expect(state[0].status).toBe('pending');
    expect(state[0].retries).toBe(1);
    expect(state[0].failureReason).toBeUndefined();
    // ...but the retry budget is finite.
    for (let i = 0; i < 2; i++) {
      markIdeaOutcome(state, base.id, { status: 'failed' });
      ingestIdeas([base], state);
    }
    markIdeaOutcome(state, base.id, { status: 'failed' });
    const exhausted = ingestIdeas([base], state);
    expect(exhausted.accepted).toHaveLength(0);
    expect(exhausted.rejected[0].reason).toMatch(/duplicate id/);
  });

  it('enforces the store cap with an honest reason', () => {
    const state: ExternalStateIdea[] = Array.from({ length: 64 }, (_, i) => ({
      ...base, id: `other:idea:${i}`, toolName: `t_${i}`, status: 'pending' as const,
    }));
    const r = ingestIdeas([{ ...base, id: 'new:one' }], state);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/store full/);
  });
});

describe('pickIdeasForForge', () => {
  it('skips built tool names, failed status, and quarantined tools; best score first', () => {
    const state: ExternalStateIdea[] = [
      { ...base, id: 'a', toolName: 'BuiltOne', status: 'pending', score: 0.9 },           // built -> skip
      { ...base, id: 'b', toolName: 'FailedOne', status: 'failed', score: 0.95 },          // failed -> skip
      { ...base, id: 'c', toolName: 'Quarantined', status: 'pending', score: 0.99 },       // quarantined -> skip
      { ...base, id: 'd', toolName: 'GoodOne', status: 'pending', score: 0.6 },
      { ...base, id: 'e', toolName: 'BetterOne', status: 'pending', score: 0.8 },
    ];
    const out = pickIdeasForForge(state, {
      built: new Set(['BuiltOne']),
      quarantine: new Map([['Quarantined', 1]]),
      limit: 5,
    });
    expect(out.map((x) => x.toolName)).toEqual(['BetterOne', 'GoodOne']);
  });
});

describe('markIdeaOutcome', () => {
  it('returns false for unknown ids (never guesses)', () => {
    const state: ExternalStateIdea[] = [];
    expect(markIdeaOutcome(state, 'nope', { status: 'built' })).toBe(false);
  });
  it('records built with toolName + hash (the accountable shape)', () => {
    const state: ExternalStateIdea[] = [];
    ingestIdeas([base], state);
    expect(markIdeaOutcome(state, base.id, { status: 'built', toolName: 'canaryRouteBudgetCheck', versionHash: 'h1' })).toBe(true);
    expect(state[0].status).toBe('built');
    expect(state[0].builtTool).toBe('canaryRouteBudgetCheck');
    expect(state[0].builtVersionHash).toBe('h1');
    expect(summarizeIdeas(state).built).toBe(1);
  });
});

describe('specFromIdea', () => {
  it('emits a forge spec with a stable id and the exact contract fields', () => {
    const state: ExternalStateIdea[] = [];
    ingestIdeas([base], state);
    const spec = specFromIdea(state[0]);
    expect(spec.id).toMatch(/^ext_/);
    expect(spec.name).toBe('canaryRouteBudgetCheck');
    expect(spec.domain).toBe('systemic');
    expect(spec.refSuite).toContain('assert');
    expect(spec.externalIdeaId).toBe(base.id);
  });
});

describe('scaffold cards (full-stack, deterministic — no refSuite)', () => {
  const scaffoldCard = {
    id: 'sieve:idea:scaffold-usefetch',
    source: 'sieve',
    domain: 'coding',
    toolName: 'scaffold_hook',
    title: 'A useDebounce hook with its test',
    prompt: 'Build the hook boilerplate deterministically.',
    kind: 'scaffold',
    scaffold: { factoryKind: 'hook', name: 'useDebounce' },
    score: 0.8,
  };

  it('accepts a scaffold card WITHOUT a refSuite (it is not model-generated)', () => {
    const state: ExternalStateIdea[] = [];
    const r = ingestIdeas([scaffoldCard], state);
    expect(r.accepted).toHaveLength(1);
    expect(state[0].kind).toBe('scaffold');
    expect(state[0].scaffold?.factoryKind).toBe('hook');
  });

  it('refuses a scaffold card with an unknown factoryKind', () => {
    const r = ingestIdeas([{ ...scaffoldCard, scaffold: { factoryKind: 'microservice' } }], []);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/factoryKind/);
  });

  it('routes scaffold cards to the FACTORY lane, never the forge', () => {
    const state: ExternalStateIdea[] = [];
    ingestIdeas([scaffoldCard], state);
    // The forge picker must not take a scaffold card (no refSuite to judge).
    expect(pickIdeasForForge(state, { built: new Set() })).toHaveLength(0);
    const picked = pickScaffoldIdeas(state);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe(scaffoldCard.id);
    // A tool card is never picked by the scaffold lane.
    ingestIdeas([base], state);
    expect(pickScaffoldIdeas(state).every((i) => i.kind === 'scaffold')).toBe(true);
  });

  it('a built scaffold card is no longer picked', () => {
    const state: ExternalStateIdea[] = [];
    ingestIdeas([scaffoldCard], state);
    markIdeaOutcome(state, scaffoldCard.id, { status: 'built', toolName: 'hook', versionHash: 'h' });
    expect(pickScaffoldIdeas(state)).toHaveLength(0);
    expect(summarizeIdeas(state).built).toBe(1);
  });
});
