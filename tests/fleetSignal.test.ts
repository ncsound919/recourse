import { describe, it, expect } from 'vitest';
import {
  OPENHUB_SELF_REPORT_TOPIC,
  deriveOpenHubAuditSignals,
  deriveOpenHubBelief,
  latestReportFromDocs,
  mergeFleetBeliefs,
  reportFromMeta,
  updateOpenHubHealth,
  type OpenHubSelfReportView,
} from '../src/lib/fleetSignal';
import { summarizeBeliefsByDomain } from '../src/lib/learnerGenerationPlan';
import { planAuditDepth } from '../src/autopilot/auditDepth';

const healthy: OpenHubSelfReportView = {
  at: '2026-09-20T10:00:00Z',
  activity: { total: 10, passRate: 0.9 },
  incidents: { recent: [] },
  runs: { active: 0, total: 1 },
  bridges: { axiom: { ok: true, online: true }, recourse: { ok: true, available: true } },
};

const degraded: OpenHubSelfReportView = {
  at: '2026-09-20T11:00:00Z',
  activity: { total: 0, passRate: null },
  incidents: { recent: [{}, {}] },
  runs: { active: 1, total: 1 },
  bridges: { axiom: { ok: true, online: false }, recourse: { ok: true, available: false } },
};

describe('reportFromMeta / latestReportFromDocs', () => {
  it('only returns reports carrying the OpenHub topic', () => {
    expect(reportFromMeta({ topic: OPENHUB_SELF_REPORT_TOPIC, data: healthy })).toEqual(healthy);
    expect(reportFromMeta({ topic: 'other', data: healthy })).toBeNull();
    expect(reportFromMeta({ topic: OPENHUB_SELF_REPORT_TOPIC })).toBeNull();
    expect(reportFromMeta(null)).toBeNull();
  });

  it('picks the newest report by `at`', () => {
    const docs = [
      { meta: { topic: OPENHUB_SELF_REPORT_TOPIC, data: degraded } },
      { meta: { topic: OPENHUB_SELF_REPORT_TOPIC, data: healthy } },
      { meta: { topic: 'noise' } },
    ];
    expect(latestReportFromDocs(docs)).toEqual(degraded);
    expect(latestReportFromDocs([])).toBeNull();
  });
});

describe('updateOpenHubHealth — real signals only', () => {
  it('counts every healthy signal for a healthy report', () => {
    const h = updateOpenHubHealth(healthy);
    expect(h.alpha).toBe(5);
    expect(h.beta).toBe(0);
  });

  it('counts degraded signals for an unhealthy report', () => {
    const h = updateOpenHubHealth(degraded);
    expect(h.alpha).toBe(0);
    expect(h.beta).toBe(5);
    expect(h.degraded).toContain('incidents');
  });

  it('contributes nothing for a report with no usable signals', () => {
    expect(updateOpenHubHealth({ at: 'x' })).toMatchObject({ alpha: 0, beta: 0 });
  });
});

describe('deriveOpenHubBelief / deriveOpenHubAuditSignals', () => {
  it('returns null when there is no evidence (never invents a neutral belief)', () => {
    expect(deriveOpenHubBelief({ at: 'x' })).toBeNull();
    expect(deriveOpenHubAuditSignals({ at: 'x' })).toBeNull();
  });

  it('derives a systemic belief from a healthy report', () => {
    const b = deriveOpenHubBelief(healthy)!;
    expect(b).not.toBeNull();
    expect(b.domain).toBe('systemic');
    expect(b.meanReward).toBe(1);
    expect(b.attempts).toBe(5);
  });

  it('derives a maximally-uncertain signal from a degraded report', () => {
    const s = deriveOpenHubAuditSignals(degraded)!;
    expect(s.uncertainty).toBe(1);
    expect(s.meanReward).toBe(0);
    expect(s.attempts).toBe(5);
  });
});

describe('the signal actually feeds the planners', () => {
  it('moves the systemic domain belief and the systemic audit depth', () => {
    const beliefs = { 'fleet:openhub': deriveOpenHubBelief(degraded)! };
    const summary = summarizeBeliefsByDomain(Object.values(beliefs)).find((s) => s.domain === 'systemic')!;
    expect(summary.uncertainty).toBe(1);

    const depth = planAuditDepth({ geneBeliefs: beliefs, directives: [] }, { domains: ['systemic'] })[0].depth;
    expect(depth).toBe(4);

    const healthyDepth = planAuditDepth(
      { geneBeliefs: { 'fleet:openhub': deriveOpenHubBelief(healthy)! }, directives: [] },
      { domains: ['systemic'] },
    )[0].depth;
    expect(healthyDepth).toBe(1);
  });

  it('mergeFleetBeliefs replaces by id so re-reading does not double-count', () => {
    const state = { geneBeliefs: {}, directives: [] };
    const once = mergeFleetBeliefs(state, [deriveOpenHubBelief(degraded)]);
    const twice = mergeFleetBeliefs(once, [deriveOpenHubBelief(degraded)]);
    expect(Object.keys(twice.geneBeliefs)).toEqual(['fleet:openhub']);
    expect(twice.geneBeliefs['fleet:openhub'].attempts).toBe(5);
  });
});
