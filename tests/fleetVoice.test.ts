import { describe, it, expect } from 'vitest';
import {
  buildFleetBriefs,
  diffFleetVoice,
  summarizeAxiom,
  summarizeOpenHub,
  takeFleetSnapshot,
  type FleetAxiomState,
  type FleetOpenHubState,
  type FleetVoiceState,
} from '../src/lib/fleetVoice';
import type { ReporterAuditFact } from '../src/lib/selfReporter';

function axiom(over: Partial<FleetAxiomState> = {}): FleetAxiomState {
  return {
    online: false,
    url: 'http://127.0.0.1:3198',
    auth: 'none',
    loop: null,
    noLoopYet: false,
    loopError: null,
    ...over,
  };
}

function audit(over: Partial<ReporterAuditFact> = {}): ReporterAuditFact {
  return {
    grade: 'B',
    score: 82,
    deterministicScore: 74,
    coveragePercent: 80,
    scope: 'full',
    dimensions: [
      { dimension: 'tests', label: 'Tests', status: 'covered', score: 90 },
      { dimension: 'docs', label: 'Docs', status: 'partial', score: 60 },
      { dimension: 'security', label: 'Security', status: 'uncovered', score: null },
    ],
    findings: { total: 10, new: 2, fixed: 3, persisted: 5 },
    reasons: [],
    ...over,
  };
}

function state(a: Partial<FleetAxiomState> = {}, o: Partial<FleetOpenHubState> = {}): FleetVoiceState {
  return { axiom: axiom(a), openhub: { recorded: false, audit: null, ...o } };
}

describe('summarizeAxiom', () => {
  it('states the bridge is offline and names the URL', () => {
    const text = summarizeAxiom(axiom({ online: false, url: 'http://axiom.local:3198' }));
    expect(text).toContain('offline');
    expect(text).toContain('http://axiom.local:3198');
  });

  it('says plainly when no loop has been recorded (not a read failure)', () => {
    const text = summarizeAxiom(axiom({ online: true, auth: 'keywire', noLoopYet: true }));
    expect(text).toContain('online');
    expect(text).toContain('keywire auth');
    expect(text).toContain('No project loop has been recorded yet');
    expect(text).not.toContain('could not be read');
  });

  it('surfaces a loop-read failure instead of implying success', () => {
    const text = summarizeAxiom(axiom({ online: true, auth: 'token', loopError: 'HTTP 401' }));
    expect(text).toContain('HTTP 401');
  });

  it('reports the loop id, status, iteration and goal', () => {
    const text = summarizeAxiom(
      axiom({
        online: true,
        auth: 'token',
        loop: { id: 'loop-7', status: 'running', iteration: 4, goal: 'repair the parser' },
      }),
    );
    expect(text).toContain('loop-7');
    expect(text).toContain('running');
    expect(text).toContain('iteration 4');
    expect(text).toContain('repair the parser');
  });

  it('omits iteration and goal when Axiom did not report them', () => {
    const text = summarizeAxiom(axiom({ online: true, loop: { id: 'loop-1', status: 'done', iteration: null, goal: null } }));
    expect(text).toContain('loop-1');
    expect(text).not.toContain('iteration');
  });
});

describe('summarizeOpenHub', () => {
  it('reports honestly when no audit is recorded rather than guessing a grade', () => {
    const text = summarizeOpenHub({ recorded: false, audit: null });
    expect(text).toContain('has not recorded an audit snapshot');
    expect(text).not.toMatch(/grade [A-F]/);
  });

  it('reads the real grade, coverage and findings', () => {
    const text = summarizeOpenHub({ recorded: true, audit: audit() });
    expect(text).toContain('B');
    expect(text).toContain('82 out of 100');
    expect(text).toContain('80 percent');
    expect(text).toContain('1 of 3 dimensions covered');
    expect(text).toContain('10');
    expect(text).toContain('3 fixed');
  });

  it('includes the reasons when the grade moved', () => {
    const text = summarizeOpenHub({ recorded: true, audit: audit({ reasons: ['new tests landed', 'coverage rose'] }) });
    expect(text).toContain('new tests landed');
    expect(text).toContain('coverage rose');
  });

  it('omits the score clause when the audit has no score', () => {
    const text = summarizeOpenHub({ recorded: true, audit: audit({ score: null }) });
    expect(text).toContain('graded the work B.');
    expect(text).not.toContain('out of 100)');
  });
});

describe('buildFleetBriefs', () => {
  it('produces one brief per fleet peer', () => {
    const briefs = buildFleetBriefs(state({ online: true, auth: 'keywire' }, { recorded: true, audit: audit() }));
    expect(briefs.axiom).toContain('Axiom bridge');
    expect(briefs.openhub).toContain('OpenHub');
  });
});

describe('diffFleetVoice', () => {
  const snap = (s: FleetVoiceState) => takeFleetSnapshot(s);

  it('returns nothing for an unchanged state', () => {
    const s = state({ online: true }, { recorded: true, audit: audit() });
    expect(diffFleetVoice(snap(s), snap(s))).toEqual([]);
  });

  it('speaks Axiom bridge reachability changes', () => {
    const offline = snap(state({ online: false }));
    const online = snap(state({ online: true }));
    expect(diffFleetVoice(offline, online)).toEqual([
      { kind: 'major', text: 'Axiom bridge is reachable again.' },
    ]);
    const down = diffFleetVoice(online, offline);
    expect(down[0].kind).toBe('critical');
    expect(down[0].text).toContain('unreachable');
  });

  it('speaks a loop finishing and a loop failing', () => {
    const running = snap(state({ online: true, loop: { id: 'l1', status: 'running', iteration: 3, goal: null } }));
    const done = snap(state({ online: true, loop: { id: 'l1', status: 'done', iteration: 6, goal: null } }));
    expect(diffFleetVoice(running, done)).toEqual([
      { kind: 'major', text: 'Axiom loop l1 finished after 6 iterations.' },
    ]);

    const failed = snap(state({ online: true, loop: { id: 'l1', status: 'failed', iteration: 2, goal: null } }));
    const ev = diffFleetVoice(running, failed);
    expect(ev[0].kind).toBe('critical');
    expect(ev[0].text).toContain('failed');
  });

  it('speaks a new loop starting and iteration progress', () => {
    const none = snap(state({ online: true, loop: null }));
    const started = snap(state({ online: true, loop: { id: 'l9', status: 'running', iteration: 1, goal: null } }));
    expect(diffFleetVoice(none, started)[0].text).toContain('started project loop l9');

    const later = snap(state({ online: true, loop: { id: 'l9', status: 'running', iteration: 4, goal: null } }));
    expect(diffFleetVoice(started, later)).toEqual([
      { kind: 'minor', text: 'Axiom loop iteration 4.' },
    ]);
  });

  it('speaks OpenHub audit arrival, grade movement, findings and fixes', () => {
    const none = snap(state({}, { recorded: false, audit: null }));
    const first = snap(state({}, { recorded: true, audit: audit({ grade: 'C' }) }));
    const arrived = diffFleetVoice(none, first);
    expect(arrived.some((e) => e.kind === 'major' && e.text.includes('recorded an audit: grade C'))).toBe(true);

    const improved = snap(state({}, { recorded: true, audit: audit({ grade: 'A', score: 95 }) }));
    const moved = diffFleetVoice(first, improved);
    expect(moved.some((e) => e.text.includes('from C to A') && e.text.includes('95 out of 100'))).toBe(true);

    const moreFindings = snap(state({}, { recorded: true, audit: audit({ findings: { total: 14, new: 6, fixed: 3, persisted: 5 } }) }));
    expect(diffFleetVoice(first, moreFindings).some((e) => e.text.includes('findings rose to 14'))).toBe(true);

    const moreFixed = snap(state({}, { recorded: true, audit: audit({ findings: { total: 10, new: 2, fixed: 8, persisted: 0 } }) }));
    expect(diffFleetVoice(first, moreFixed).some((e) => e.text.includes('fixed 5 findings'))).toBe(true);
  });

  it('stays silent when a value is absent on either side (no invented events)', () => {
    const noAudit = snap(state({}, { recorded: false, audit: null }));
    expect(diffFleetVoice(noAudit, noAudit)).toEqual([]);
  });
});
