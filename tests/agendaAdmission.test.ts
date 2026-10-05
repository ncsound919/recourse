/**
 * The agenda admission gate is the only thing standing between the forge and
 * another 1,000x overproduction. These tests exist because a cap that silently
 * stops admitting is indistinguishable from a cap that is not running.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planSleepTasks, type SleepTask } from '../src/lib/sleepCompute.js';

/** Minimal valid SleepTask — `planSleepTasks` takes the full shape, not just a name. */
const task = (name: string, domain = 'coding'): SleepTask => ({
  name,
  domain,
  prompt: `implement ${name}`,
  refSuite: `assert ${name}(1) === 1;`,
});

describe('sleep compute task planning', () => {
  it('never re-plans a spec that already has a ready artifact', () => {
    const specs = [task('a', 'math'), task('b')];
    // 'a' already has work; it must not be handed out again.
    const plan = planSleepTasks(specs, ['a'], 3);
    expect(plan.map((s) => s.name)).not.toContain('a');
    expect(plan.map((s) => s.name)).toContain('b');
  });

  it('respects the limit even when more specs are available than slots', () => {
    const specs = Array.from({ length: 50 }, (_, i) => task(`t${i}`));
    expect(planSleepTasks(specs, [], 3).length).toBe(3);
  });

  it('returns fewer tasks than the limit when there is less work left', () => {
    expect(planSleepTasks([task('only', 'math')], [], 5).length).toBe(1);
  });
});

describe('agenda admission invariant (structural)', () => {
  /**
   * A source-level guard rather than a behavioural one: `admitAgendaSpec` is a
   * module-local closure over live registry state, so it cannot be imported in
   * isolation. This asserts the invariant that actually matters — that no code
   * path pushes onto `dynamicAgenda` without going through the gate.
   */
  it('no writer bypasses the admission gate', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    // Every `dynamicAgenda.push` must be inside admitAgendaSpec itself.
    const pushes = [...src.matchAll(/dynamicAgenda\.push\(/g)];
    const gateStart = src.indexOf('function admitAgendaSpec');
    const gateEnd = src.indexOf('export function agendaAdmissionStats');
    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);

    const bypasses = pushes.filter((m) => {
      const at = m.index ?? 0;
      return at < gateStart || at > gateEnd;
    });
    expect(
      bypasses.map((m) => src.slice(Math.max(0, m.index - 80), m.index + 30)),
      'dynamicAgenda.push outside admitAgendaSpec bypasses the overproduction cap',
    ).toEqual([]);
  });

  it('refusal counters exist so a closed gate is never silent', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    expect(src).toMatch(/agendaRefusedCount/);
    expect(src).toMatch(/agendaRefusedLastReason/);
    expect(src).toMatch(/agendaRefusedByWriter/);
  });

  it('the cap is derived from measured consumption, not a constant', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const gate = src.slice(src.indexOf('function admitAgendaSpec'), src.indexOf('export function agendaAdmissionStats'));
    // Must consult the live consumption report.
    expect(gate).toMatch(/consumptionReport\(registry\)/);
    // Headroom scales with what is actually being consumed.
    expect(gate).toMatch(/consumed \* AGENDA_OVERPRODUCTION_RATIO/);
  });

  it('the intel path does not mark a refused proposal as adopted', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const idx = src.indexOf("admitAgendaSpec(spec, 'intel')");
    expect(idx).toBeGreaterThan(-1);
    // The refusal must return before `prop.status = 'adopted'` is reached.
    const refusal = src.slice(idx, idx + 700);
    expect(refusal).toMatch(/return \{ ok: false/);
    expect(refusal.indexOf('return { ok: false')).toBeLessThan(refusal.indexOf("prop.status = 'adopted'"));
  });
});

describe('backfill reachability (regression guard)', () => {
  /**
   * The bug this guards: the dream-gene backfill used to live ONLY in the
   * non-safe-boot `else` branch. Acceptance autonomy is an `else if` that
   * REPLACES that branch, so under RECOURSE_ACCEPTANCE_AUTONOMY=1 the agenda
   * stayed empty, no writer ran, and the overproduction cap never executed once.
   * The cap looked correct in code review and in its unit tests while being
   * structurally unreachable in the only mode we actually run.
   */
  it('the acceptance-autonomy branch also triggers the backfill', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const accBranch = src.indexOf('} else if (autonomySettings.safeBoot) {');
    const nonSafeBranch = src.indexOf('// Non-safe boot:', accBranch);
    expect(accBranch).toBeGreaterThan(-1);
    expect(nonSafeBranch).toBeGreaterThan(accBranch);

    const accBody = src.slice(accBranch, nonSafeBranch);
    expect(
      accBody,
      'acceptance autonomy must seed the agenda, or admitAgendaSpec is unreachable and the cap never runs',
    ).toMatch(/backfillDreamGenesIntoAgenda\(\)/);
  });

  it('the non-safe-boot branch still triggers it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const nonSafe = src.indexOf('// Non-safe boot:');
    const after = src.slice(nonSafe, nonSafe + 3000);
    expect(after).toMatch(/backfillDreamGenesIntoAgenda\(\)/);
  });

  it('the backfill routes through the admission gate, not a raw push', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const fn = src.slice(src.indexOf('function backfillDreamGenesIntoAgenda'));
    const end = fn.indexOf('\nfunction ') + 1 || fn.length;
    const body = fn.slice(0, end);
    expect(body).toMatch(/admitAgendaSpec\(/);
    expect(body).not.toMatch(/dynamicAgenda\.push\(/);
  });

  it('backfill reports refusals instead of silently admitting nothing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const fn = src.slice(src.indexOf('function backfillDreamGenesIntoAgenda'));
    expect(fn).toMatch(/refused by the overproduction cap/);
  });
});

describe('sleep compute rendezvous (F7)', () => {
  it('readySleepComputeNames only reports verified artifacts', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'lib', 'sleepCompute.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function readySleepComputeNames'));
    expect(fn).toMatch(/filter\(\(a\) => a\.verified\)/);
  });

  it('the forge prefers a spec that already has verified sleep-compute work', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const fn = src.slice(src.indexOf('function nextForgeSpec'), src.indexOf('async function literatureScoreForSpec') + 4000);
    expect(fn).toMatch(/readySleepComputeNames\(\)/);
    // The ready artifact must win over plain agenda order.
    expect(fn).toMatch(/const ready = candidates\.find\(\(s\) => readySleep\.has\(s\.name\)\)/);
    expect(fn).toMatch(/if \(ready\) return ready/);
  });
});

describe('environment sanity', () => {
  it('temp dir is writable (guards against vacuous passes)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admission-'));
    const f = path.join(dir, 'probe.txt');
    fs.writeFileSync(f, 'x');
    expect(fs.readFileSync(f, 'utf8')).toBe('x');
  });
});