import { describe, it, expect } from 'vitest';
import {
  emptyRepairCounters,
  nextRepairCounters,
  verifiedHealRatio,
} from '../src/lib/repairCounters';

describe('repairCounters', () => {
  it('starts at zero', () => {
    expect(emptyRepairCounters()).toEqual({ repairAttempts: 0, unverifiedRepairAttempts: 0 });
  });

  it('counts every attempt, not just the healed ones', () => {
    let c = emptyRepairCounters();
    c = nextRepairCounters(c, 'healed');
    c = nextRepairCounters(c, 'failed');
    c = nextRepairCounters(c, 'smoke-only');
    expect(c.repairAttempts).toBe(3);
    expect(c.unverifiedRepairAttempts).toBe(2);
  });

  it('treats a smoke-only pass as unverified', () => {
    const c = nextRepairCounters(emptyRepairCounters(), 'smoke-only');
    expect(c.repairAttempts).toBe(1);
    expect(c.unverifiedRepairAttempts).toBe(1);
  });

  it('accumulates across separate calls and never mutates the previous value', () => {
    const first = nextRepairCounters(undefined, 'healed');
    const second = nextRepairCounters(first, 'healed');
    expect(first.repairAttempts).toBe(1);
    expect(second.repairAttempts).toBe(2);
    expect(second.unverifiedRepairAttempts).toBe(0);
  });

  it('is defensive about absent or garbage persisted counters', () => {
    expect(nextRepairCounters(undefined, 'failed').repairAttempts).toBe(1);
    expect(nextRepairCounters({ repairAttempts: NaN }, 'failed').repairAttempts).toBe(1);
    expect(nextRepairCounters({ repairAttempts: -7 }, 'failed').repairAttempts).toBe(1);
    expect(nextRepairCounters({ repairAttempts: 'many' } as never, 'failed').repairAttempts).toBe(1);
  });

  it('returns null rather than a fabricated rate before any attempt', () => {
    expect(verifiedHealRatio(undefined)).toBeNull();
    expect(verifiedHealRatio(emptyRepairCounters())).toBeNull();
    expect(verifiedHealRatio({ repairAttempts: 0, unverifiedRepairAttempts: 0 })).toBeNull();
  });

  it('reports verified heals per attempt, counting smoke-only as unverified', () => {
    let c = emptyRepairCounters();
    c = nextRepairCounters(c, 'healed');
    c = nextRepairCounters(c, 'smoke-only');
    c = nextRepairCounters(c, 'failed');
    c = nextRepairCounters(c, 'healed');
    expect(verifiedHealRatio(c)).toBe(0.5);
  });

  it('never reports a negative ratio when persisted counters disagree', () => {
    expect(verifiedHealRatio({ repairAttempts: 2, unverifiedRepairAttempts: 9 })).toBe(0);
  });
});
