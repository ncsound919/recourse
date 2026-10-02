// Tests for role-aware model routing.
//
// The behaviour that matters is the JUDGEMENT FLOOR: a weak model must not be
// handed the planner or critic seat no matter how preferred it is in config, and
// a role with no evidence must REFUSE rather than silently fall back to whatever
// model happened to be available. That is the whole point of the role split.

import { describe, it, expect } from 'vitest';

import {
  RoleRouter,
  armId,
  parseArmId,
  isJudgementRole,
  DEFAULT_ROLE_POLICY,
  type ModelRole,
  type ModelProfile,
} from '../src/lib/roleRouter.js';
import { ModelBandit } from '../src/lib/modelBandit.js';

/** A router over a plain bandit, with no persistence. */
const makeRouter = (opts: { warmup?: number; preferred?: ModelProfile[] } = {}) =>
  new RoleRouter({
    bandit: new ModelBandit({ priorCount: 1 }),
    warmup: opts.warmup ?? 0,
    policy: { preferred: opts.preferred ?? ['api', 'local'] },
  });

/** Record `plays` outcomes at a fixed mean for each (role, profile). */
function feed(r: RoleRouter, role: ModelRole, profile: ModelProfile, mean: number, plays = 10): void {
  for (let i = 0; i < plays; i++) r.record(role, profile, mean);
}

describe('arm ids', () => {
  it('round-trips role and profile', () => {
    expect(parseArmId(armId('plan', 'api'))).toEqual({ role: 'plan', profile: 'api' });
    expect(parseArmId('critique:local')).toEqual({ role: 'critique', profile: 'local' });
  });

  it('rejects malformed ids rather than guessing', () => {
    expect(parseArmId('nonsense')).toBeNull();
    expect(parseArmId('plan:turbo')).toBeNull();
    expect(parseArmId(':api')).toBeNull();
    expect(parseArmId('plan:')).toBeNull();
  });

  it('classifies judgement roles', () => {
    expect(isJudgementRole('plan')).toBe(true);
    expect(isJudgementRole('critique')).toBe(true);
    expect(isJudgementRole('execute')).toBe(false);
    expect(isJudgementRole('summarize')).toBe(false);
  });
});

describe('judgement floor — the load-bearing rule', () => {
  it('REFUSES to plan when no profile has earned the seat', () => {
    const r = makeRouter();
    const res = r.route('plan', ['local', 'api']);
    // No evidence at all => no planning decision. Crucially NOT a silent
    // fallback to `api` just because api is listed first.
    expect(res.decision).toBeNull();
    expect(res.refusal).toContain('no available profile has it');
  });

  it('refuses even when the preferred profile is the only other option', () => {
    // `api` is first in the preference order but has no data; `local` has bad data.
    const r = makeRouter();
    feed(r, 'plan', 'local', 0.2, 8);
    const res = r.route('plan', ['local', 'api']);
    expect(res.decision).toBeNull();
    expect(res.refusal).toMatch(/api=no data/);
  });

  it('grants the seat once a profile clears the floor', () => {
    const r = makeRouter();
    feed(r, 'plan', 'api', 0.95);
    const res = r.route('plan', ['local', 'api']);
    expect(res.decision?.profile).toBe('api');
  });

  it('rejects a profile below the floor even when it is preferred', () => {
    // Deliberately invert the preference order: local first.
    const r = makeRouter({ preferred: ['local', 'api'] });
    feed(r, 'plan', 'local', 0.1, 8);
    feed(r, 'plan', 'api', 0.9);
    const res = r.route('plan', ['local', 'api']);
    // local is preferred but did not earn it; api did.
    expect(res.decision?.profile).toBe('api');
    expect(res.decision?.reason).toContain('floor');
  });

  it('uses the configured floor value', () => {
    expect(DEFAULT_ROLE_POLICY.judgementFloor).toBeGreaterThan(0);
    const strict = new RoleRouter({
      bandit: new ModelBandit({ priorCount: 1 }),
      policy: { judgementFloor: 0.99 },
    });
    feed(strict, 'plan', 'api', 0.8);
    expect(strict.route('plan', ['api', 'local']).decision).toBeNull();

    const loose = new RoleRouter({
      bandit: new ModelBandit({ priorCount: 1 }),
      policy: { judgementFloor: 0.5 },
    });
    feed(loose, 'plan', 'api', 0.8);
    expect(loose.route('plan', ['api', 'local']).decision?.profile).toBe('api');
  });
});

describe('mechanical roles have no floor', () => {
  it('routes execute with no evidence at all', () => {
    const r = makeRouter();
    const res = r.route('execute', ['local', 'api']);
    expect(res.decision?.profile).toBe('api'); // preference order
    expect(res.decision?.byBandit).toBe(false);
  });

  it('routes summarize to the only available profile', () => {
    const r = makeRouter();
    const res = r.route('summarize', ['local']);
    expect(res.decision?.profile).toBe('local');
    expect(res.decision?.reason).toContain('only');
  });

  it('still routes a mechanical role to a low-mean profile (no floor)', () => {
    // The floor is deliberately scoped to judgement: a model that is bad at
    // mechanical work still gets mechanical work until the bandit says otherwise.
    const r = makeRouter();
    feed(r, 'execute', 'api', 0.0, 5);
    expect(r.route('execute', ['local', 'api']).decision).not.toBeNull();
  });
});

describe('unavailable profiles', () => {
  it('never selects a profile the caller said is not reachable', () => {
    const r = makeRouter();
    feed(r, 'execute', 'api', 0.9);
    const res = r.route('execute', ['local']); // api is NOT available
    expect(res.decision?.profile).toBe('local');
  });

  it('refuses cleanly when nothing is available', () => {
    const r = makeRouter();
    const res = r.route('plan', []);
    expect(res.decision).toBeNull();
    expect(res.refusal).toContain('no available provider profile');
  });

  it('honours a disabled role', () => {
    const r = new RoleRouter({
      bandit: new ModelBandit({ priorCount: 1 }),
      policy: { disabledRoles: ['critique'] },
    });
    feed(r, 'critique', 'api', 0.99);
    const res = r.route('critique', ['api']);
    expect(res.decision).toBeNull();
    expect(res.refusal).toContain('disabled by policy');
  });
});

describe('bandit can override within a role', () => {
  it('lets UCB pick between two qualified profiles once warm', () => {
    const r = makeRouter({ warmup: 4 });
    // Both qualify; local is preferred in order but the bandit has seen more of api.
    feed(r, 'plan', 'api', 0.92, 12);
    feed(r, 'plan', 'local', 0.65, 12);
    const res = r.route('plan', ['local', 'api']);
    expect(res.decision?.byBandit).toBe(true);
    expect(['local', 'api']).toContain(res.decision?.profile);
  });

  it('does not let one role\'s evidence leak into another', () => {
    // A model that excels at execution must not thereby earn the planner seat.
    const r = makeRouter();
    feed(r, 'execute', 'local', 0.99, 20);
    const res = r.route('plan', ['local', 'api']);
    expect(res.decision).toBeNull();
    expect(res.refusal).toMatch(/local=no data/);
  });
});

describe('auditability', () => {
  it('always reports what it considered', () => {
    const r = makeRouter();
    feed(r, 'critique', 'api', 0.9);
    const res = r.route('critique', ['local', 'api']);
    expect(res.decision?.considered.length).toBeGreaterThan(0);
    expect(res.decision?.reason).toBeTruthy();
  });

  it('clamps out-of-range rewards rather than corrupting the mean', () => {
    const r = makeRouter();
    r.record('execute', 'api', 5);
    const rec = r.snapshot().find((a) => a.id === 'execute:api');
    expect(rec!.mean).toBeLessThanOrEqual(1);
  });
});
