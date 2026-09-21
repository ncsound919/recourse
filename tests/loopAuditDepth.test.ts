import { describe, it, expect } from 'vitest';
import { resolveAuditDepth } from '../src/autopilot/loopStateMachine';
import type { AuditAdapters } from '../src/autopilot/auditRunner';
import type { GeneBelief, LearnerState } from '../src/dream/learner-types';

const ok: NonNullable<AuditAdapters['grader']> = async () => ({ included: true });
const allAdapters: AuditAdapters = { grader: ok, reporank: ok, deep: ok, codegang: ok };

function belief(domain: GeneBelief['domain'], alpha: number, beta: number, meanReward: number): GeneBelief {
  return {
    geneId: `g_${domain}`, geneName: `gene_${domain}`, domain,
    alpha, beta, attempts: alpha + beta, meanReward, weight: meanReward, lastEpisode: 1,
  };
}

function learnerWith(geneBeliefs: Record<string, GeneBelief>) {
  const state = { geneBeliefs, directives: [] } as Pick<LearnerState, 'geneBeliefs' | 'directives'>;
  return { status: () => state };
}

const provenCoding = learnerWith({ c: belief('coding', 30, 1, 0.95) });

describe('resolveAuditDepth — recursive learning sets audit depth', () => {
  it('honors an explicit operator depth without consulting the learner', async () => {
    expect(await resolveAuditDepth({ auditDepth: 2, adapters: allAdapters })).toBe(2);
  });

  it('returns undefined (full team) when there is no learner', async () => {
    expect(await resolveAuditDepth({ adapters: allAdapters })).toBeUndefined();
  });

  it('triages a proven domain to depth 1 when that tier is staffable', async () => {
    expect(await resolveAuditDepth({ auditDomain: 'coding', learner: provenCoding, adapters: allAdapters })).toBe(1);
  });

  it('audits an unevidenced domain at maximum depth', async () => {
    expect(await resolveAuditDepth({ auditDomain: 'biotech', learner: provenCoding, adapters: allAdapters })).toBe(4);
  });

  it('defaults to the deepest-needed domain across all domains', async () => {
    // coding is proven, but the other domains are unevidenced -> depth 4.
    expect(await resolveAuditDepth({ learner: provenCoding, adapters: allAdapters })).toBe(4);
  });

  it('never returns a depth it cannot staff (keeps the full team instead)', async () => {
    // depth 1 needs `grader`; only `deep` is available -> fall back to full team.
    expect(await resolveAuditDepth({ auditDomain: 'coding', learner: provenCoding, adapters: { deep: ok } })).toBeUndefined();
  });

  it('degrades to the full team when the learner throws', async () => {
    const broken = { status: () => { throw new Error('learner offline'); } };
    expect(await resolveAuditDepth({ learner: broken, adapters: allAdapters })).toBeUndefined();
  });

  it('never audits shallower than an external fleet signal demands', async () => {
    const depth = await resolveAuditDepth({
      auditDomain: 'coding',
      learner: provenCoding, // would otherwise triage to depth 1
      adapters: allAdapters,
      externalAuditSignals: [{ uncertainty: 1, meanReward: 0, attempts: 5 }],
    });
    expect(depth).toBe(4);
  });

  it('uses the fleet signal even when there is no learner', async () => {
    const depth = await resolveAuditDepth({
      adapters: allAdapters,
      externalAuditSignals: [{ uncertainty: 0, meanReward: 1, attempts: 10 }],
    });
    expect(depth).toBe(1);
  });

  it('ignores a fleet signal whose tier it cannot staff', async () => {
    const depth = await resolveAuditDepth({
      adapters: { deep: ok },
      externalAuditSignals: [{ uncertainty: 0, meanReward: 1, attempts: 10 }], // depth 1 needs grader
    });
    expect(depth).toBeUndefined();
  });
});
