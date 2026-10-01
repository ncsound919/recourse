import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SUBSYSTEMS,
  decideOrchestration,
  resolveActivePhase,
  sampleResources,
  pm2Table,
  pm2Start,
  pm2Stop,
  probeSubsystem,
  orchestrate,
  type PhaseId,
} from '../src/lib/subsystemOrchestrator.js';

const mockProc = vi.hoisted(() => ({ stdout: '[]', code: 0, error: false, calls: [] as string[][] }));

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const spawn = vi.fn((_exe: string, args: string[]) => {
    mockProc.calls.push(args);
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    setImmediate(() => {
      if (mockProc.error) {
        child.emit('error', new Error('spawn failed'));
        return;
      }
      if (mockProc.stdout) child.stdout.emit('data', mockProc.stdout);
      child.emit('close', mockProc.code);
    });
    return child;
  });
  return { spawn };
});

const online = (ids: string[]): Record<string, { status: string; cpu: number; mem: number }> => {
  const out: Record<string, { status: string; cpu: number; mem: number }> = {};
  for (const id of ids) {
    const def = SUBSYSTEMS.find((s) => s.id === id);
    out[def ? def.pm2Name : id] = { status: 'online', cpu: 1, mem: 50 };
  }
  return out;
};

const freeMem = (mb: number) => ({ freeMemMB: mb, totalMemMB: 16104, loadAvg1: 0.5, loadAvg5: 0.4 });

const jlist = (entries: Array<{ name: string; status: string; cpu?: number; memory?: number }>) =>
  JSON.stringify(entries.map((e) => ({ name: e.name, pm2_env: { status: e.status }, monit: { cpu: e.cpu ?? 0, memory: e.memory ?? 0 } })));

beforeEach(() => {
  mockProc.stdout = '[]';
  mockProc.code = 0;
  mockProc.error = false;
  mockProc.calls.length = 0;
  vi.unstubAllGlobals();
  // A subsystem with no `healthPath` is probed at `http://127.0.0.1:<port>/`,
  // so `orchestrate` reaches the real network unless fetch is stubbed. That
  // made "everything is already online" depend on whether chemlab happened to
  // be listening on 8096 on the host: with it down, the orchestrator correctly
  // wanted to start it and this file failed for reasons that had nothing to do
  // with the code under test. Default to "no probe succeeds"; the tests that
  // care about probe results stub it themselves.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('probe unavailable in tests'); }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('subsystem registry', () => {
  it('registers the science subsystems with control-plane flagged and distinct ports', () => {
    expect(SUBSYSTEMS.length).toBeGreaterThanOrEqual(10);
    const control = SUBSYSTEMS.filter((s) => s.control).map((s) => s.id);
    expect(control).toContain('recourse');
    expect(control).toContain('brain');
    expect(control).toContain('oncology');
    const ports = SUBSYSTEMS.map((s) => s.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('resolveActivePhase defaults to triage and honours an explicit phase', () => {
    expect(resolveActivePhase()).toBe('triage');
    expect(resolveActivePhase('simulate' as PhaseId)).toBe('simulate');
  });

  it('sampleResources returns real finite OS numbers', () => {
    // Deliberately NOT mocked: the contract under test is that a real host
    // sample is always finite and positive (never NaN/undefined/negative), and
    // that can only be checked against the real OS. Memory *decisions* are
    // pinned by passing `resources` explicitly, never by mocking this.
    const r = sampleResources();
    expect(Number.isFinite(r.totalMemMB)).toBe(true);
    expect(r.totalMemMB).toBeGreaterThan(0);
    expect(Number.isFinite(r.freeMemMB)).toBe(true);
    expect(r.freeMemMB).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.loadAvg1)).toBe(true);
    expect(Number.isFinite(r.loadAvg5)).toBe(true);
  });
});

describe('decideOrchestration', () => {
  it('starts control services that are down but never itself', () => {
    const d = decideOrchestration('triage' as PhaseId, {}, freeMem(5000));
    expect(d.shouldStart).toContain('brain');
    expect(d.shouldStart).toContain('oncology');
    expect(d.shouldStart).not.toContain('recourse');
  });

  it('starts the active phase batch that is down and not other phases', () => {
    const d = decideOrchestration('simulate' as PhaseId, online(['recourse', 'brain', 'oncology']), freeMem(4000));
    expect(d.shouldStart).toContain('qlcce');
    expect(d.shouldStart).toContain('chemlab');
    expect(d.shouldStart).not.toContain('decon');
    expect(d.shouldStart).not.toContain('oncograph');
  });

  it('keeps non-phase services warm when memory is ample', () => {
    const d = decideOrchestration('analyze' as PhaseId, online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce']), freeMem(6000));
    expect(d.shouldStop).not.toContain('qlcce');
  });

  it('downscales non-phase heavy services under memory pressure but never control', () => {
    const d = decideOrchestration('analyze' as PhaseId, online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce', 'bam']), freeMem(600));
    expect(d.shouldStop).toContain('qlcce');
    expect(d.shouldStop).toContain('bam');
    expect(d.shouldStop).not.toContain('brain');
    expect(d.shouldStop).not.toContain('recourse');
    expect(d.shouldStop).not.toContain('oncology');
  });

  it('does not stop an already-down service', () => {
    const d = decideOrchestration('analyze' as PhaseId, online(['recourse', 'brain', 'oncology']), freeMem(400));
    expect(d.shouldStop).not.toContain('qlcce');
  });

  it('very-tight tier downscales the active phase heavy engines too', () => {
    const d = decideOrchestration(
      'analyze' as PhaseId,
      online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce', 'bam']),
      freeMem(500),
      { minFreeMemMB: 1200, tightFreeMemMB: 2400 },
    );
    expect(d.shouldStop).toContain('qlcce');
    expect(d.shouldStop).toContain('bam');
    expect(d.shouldStop.filter((id) => ['decon', 'oncograph'].includes(id)).length).toBeGreaterThan(0);
    expect(d.shouldStop).not.toContain('brain');
    expect(d.shouldStop).not.toContain('recourse');
    expect(d.shouldStop).not.toContain('oncology');
  });

  it('keeps the lightest in-phase service when the heaviest is the only one online', () => {
    const d = decideOrchestration(
      'analyze' as PhaseId,
      online(['recourse', 'brain', 'oncology', 'decon']),
      freeMem(500),
      { minFreeMemMB: 1200, tightFreeMemMB: 2400 },
    );
    // oncograph (the other in-phase service) is down, so nothing in-phase is stopped.
    expect(d.shouldStop.filter((id) => ['decon', 'oncograph'].includes(id))).toHaveLength(0);
  });

  it('does not duplicate stop entries across tiers', () => {
    const d = decideOrchestration(
      'analyze' as PhaseId,
      online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce']),
      freeMem(400),
    );
    expect(new Set(d.shouldStop).size).toBe(d.shouldStop.length);
    expect(d.reason).toContain('phase=analyze');
  });

  it('flips the downscale decision exactly at each configured threshold', () => {
    // Probed AT the boundary, not merely either side of it: with only 2401/2399
    // sampled, flipping `<` to `<=` in the tier comparison changed nothing and
    // this test stayed green. The strict/non-strict distinction only shows up at
    // the threshold value itself.
    const table = online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce']);
    const opts = { minFreeMemMB: 1200, tightFreeMemMB: 2400 };
    const stops = (mb: number) => decideOrchestration('analyze' as PhaseId, table, freeMem(mb), opts).shouldStop;

    // minFree (< 1200 to downscale): exactly at the threshold is NOT pressure.
    expect(stops(1201)).not.toContain('qlcce');
    expect(stops(1200)).not.toContain('qlcce');
    expect(stops(1199)).toContain('qlcce');

    // tightFree (< 2400): the active phase's heavier in-phase service yields
    // only strictly below it, so 2400 must not trigger the tight tier.
    const inPhase = (mb: number) => stops(mb).filter((id) => ['decon', 'oncograph'].includes(id)).length;
    expect(inPhase(2401)).toBe(0);
    expect(inPhase(2400)).toBe(0);
    expect(inPhase(2399)).toBeGreaterThan(0);
  });

  it('honours caller-supplied threshold overrides at their exact values', () => {
    const table = online(['recourse', 'brain', 'oncology', 'decon', 'oncograph', 'qlcce']);
    const inPhaseStops = (mb: number, opts: { minFreeMemMB: number; tightFreeMemMB: number }) =>
      decideOrchestration('analyze' as PhaseId, table, freeMem(mb), opts)
        .shouldStop.filter((id) => ['decon', 'oncograph'].includes(id)).length;

    // Same memory, different threshold: the caller's value must decide, not a
    // hardcoded default.
    expect(inPhaseStops(2400, { minFreeMemMB: 1200, tightFreeMemMB: 2400 })).toBe(0);
    expect(inPhaseStops(2400, { minFreeMemMB: 1200, tightFreeMemMB: 3000 })).toBeGreaterThan(0);
  });

  it('never stops a control-plane service, at any memory level', () => {
    // The safety property, swept across the whole range rather than sampled once.
    const table = online(SUBSYSTEMS.map((s) => s.id));
    const control = SUBSYSTEMS.filter((s) => s.control).map((s) => s.id);
    for (const mb of [0, 500, 1199, 2400, 8000, 64000]) {
      for (const phase of ['triage', 'simulate', 'analyze', 'synthesize'] as PhaseId[]) {
        const d = decideOrchestration(phase, table, freeMem(mb));
        for (const id of control) {
          if (id === 'recourse') continue; // never even started
          expect(d.shouldStop).not.toContain(id);
        }
      }
    }
  });
});

describe('pm2 table / start / stop (spawn mocked)', () => {
  it('parses the real jlist shape into name → status/cpu/mem', async () => {
    mockProc.stdout = jlist([{ name: 'recourse', status: 'online', cpu: 3, memory: 2 * 1024 * 1024 }]);
    const table = await pm2Table();
    expect(table.recourse).toEqual({ status: 'online', cpu: 3, mem: 2 });
  });

  it('returns an empty table on a non-zero exit, bad JSON, or non-array output', async () => {
    mockProc.code = 1;
    expect(await pm2Table()).toEqual({});
    mockProc.code = 0;
    mockProc.stdout = 'not json';
    expect(await pm2Table()).toEqual({});
    mockProc.stdout = '{"a":1}';
    expect(await pm2Table()).toEqual({});
  });

  it('skips entries without a name and defaults missing monit fields', async () => {
    mockProc.stdout = JSON.stringify([{ pm2_env: { status: 'online' } }, { name: 'x' }]);
    const table = await pm2Table();
    expect(Object.keys(table)).toEqual(['x']);
    expect(table.x).toEqual({ status: 'unknown', cpu: 0, mem: 0 });
  });

  it('returns an empty table when spawn errors', async () => {
    mockProc.error = true;
    expect(await pm2Table()).toEqual({});
  });

  it('pm2Start / pm2Stop report the child exit status', async () => {
    expect(await pm2Start('bam')).toBe(true);
    mockProc.code = 1;
    expect(await pm2Start('bam')).toBe(false);
    expect(await pm2Stop('bam')).toBe(false);
    mockProc.code = 0;
    expect(await pm2Stop('bam')).toBe(true);
    expect(mockProc.calls.some((c) => c.includes('start'))).toBe(true);
    expect(mockProc.calls.some((c) => c.includes('stop'))).toBe(true);
  });

  it('probeSubsystem reflects the HTTP response and network failures', async () => {
    const bam = SUBSYSTEMS.find((s) => s.id === 'bam')!;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    expect(await probeSubsystem(bam)).toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    expect(await probeSubsystem(bam)).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    expect(await probeSubsystem(bam)).toBe(false);
  });
});

describe('orchestrate', () => {
  it('apply:false decides without starting or stopping anything', async () => {
    mockProc.stdout = jlist([{ name: 'recourse', status: 'online' }]);
    // Memory is an explicit input, not an inherited one: this decision must not
    // change because the host's free RAM moved.
    const run = await orchestrate('simulate' as PhaseId, { apply: false, resources: freeMem(8000) });
    expect(run.activePhase).toBe('simulate');
    expect(run.started).toEqual([]);
    expect(run.stopped).toEqual([]);
    expect(run.decisions).toHaveLength(1);
    expect(run.decisions[0].shouldStart).toContain('qlcce');
    expect(run.reason).toContain('phase=simulate');
  });

  it('apply:true with everything already online is a no-op (no sleeps/health probes)', async () => {
    mockProc.stdout = jlist(SUBSYSTEMS.map((s) => ({ name: s.pm2Name, status: 'online', cpu: 0, memory: 50 * 1024 * 1024 })));
    // Probes succeed, so a pm2 "online" row is not second-guessed by the
    // health check. The default stub in beforeEach fails every probe.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    const run = await orchestrate('simulate' as PhaseId, { resources: freeMem(8000) });
    expect(run.started).toEqual([]);
    expect(run.stopped).toEqual([]);
    expect(mockProc.calls.filter((c) => c[0] === 'start' || c[0] === 'stop')).toHaveLength(0);
  });

  it('reports the resource sample it was given, not a fresh host sample', async () => {
    // Proves the seam is load-bearing: if `orchestrate` ignored `opts.resources`
    // and re-sampled the host, this would report the host's real free RAM.
    mockProc.stdout = jlist(SUBSYSTEMS.map((s) => ({ name: s.pm2Name, status: 'online' })));
    const run = await orchestrate('analyze' as PhaseId, { apply: false, resources: freeMem(4321) });
    expect(run.resources.freeMemMB).toBe(4321);
  });

  it('acts on memory pressure when the sample says there is pressure', async () => {
    // The counterpart to the no-op test: the same "everything online" table must
    // produce a downscale when the sample is tight, which is only reachable if
    // the supplied resources actually drive the decision.
    mockProc.stdout = jlist(SUBSYSTEMS.map((s) => ({ name: s.pm2Name, status: 'online' })));
    const run = await orchestrate('analyze' as PhaseId, { apply: false, resources: freeMem(500) });
    expect(run.decisions[0].shouldStop).toContain('qlcce');
  });
});
