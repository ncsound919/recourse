// Tests for the tool value ledger.
//
// The behaviour that matters is the invocation/consumption distinction. The
// system's history: 475 `selfhosted_tool_called` events fired across 5 tools
// exactly 95 each — a heartbeat walking a fixed list with empty arguments. If
// that had counted as use, all five would look equally valuable and the reward
// gate would be pure noise. So:
//
//   - an invocation with no consumption scores 0 usefulness
//   - a liveness probe (empty args) does not enter the denominator at all
//   - a consumption must NAME its consumer
//   - verification is never consumption

import { describe, it, expect, beforeEach } from 'vitest';

import { ToolValueLedger, resetToolValueLedger, toolValueLedger } from '../src/lib/toolValueLedger.js';

let L: ToolValueLedger;
beforeEach(() => {
  L = new ToolValueLedger();
});

describe('usefulness requires consumption', () => {
  it('an invoked-but-never-consumed tool scores 0', () => {
    L.noteInvocation('fibonacciN');
    L.noteInvocation('fibonacciN');
    L.noteInvocation('fibonacciN');
    const s = L.stats('fibonacciN');
    expect(s.invoked).toBe(3);
    expect(s.consumed).toBe(0);
    // This is the whole point: running a lot is not being useful.
    expect(s.usefulness).toBe(0);
    expect(L.deadWeight().map((d) => d.tool)).toContain('fibonacciN');
  });

  it('consumption raises usefulness proportionally', () => {
    for (let i = 0; i < 4; i++) L.noteInvocation('dedupeStable');
    for (let i = 0; i < 2; i++) L.noteConsumption('dedupeStable', 'scienceConductor');
    expect(L.usefulness('dedupeStable')).toBeCloseTo(0.5, 5);
  });

  it('caps usefulness at 1 when consumed more often than invoked', () => {
    L.noteInvocation('x');
    L.noteConsumption('x', 'a');
    L.noteConsumption('x', 'b');
    expect(L.usefulness('x')).toBe(1);
  });

  it('a never-invoked tool is not dead weight (it has done nothing at all)', () => {
    // deadWeight is specifically "ran for real, nobody used it". Never-invoked
    // is a separate list, otherwise every untouched tool would be reported.
    expect(L.deadWeight()).toEqual([]);
    expect(L.all()).toEqual([]);
  });
});

describe('liveness probes are not use', () => {
  it('realArguments:false is excluded from the usefulness denominator', () => {
    // The 95-calls-each heartbeat shape. If these entered the denominator, a
    // tool that is only ever self-tested would look increasingly useful.
    for (let i = 0; i < 95; i++) L.noteInvocation('gcdPair', { realArguments: false });
    const s = L.stats('gcdPair');
    expect(s.invoked).toBe(95);
    expect(s.invokedReal).toBe(0);
    expect(s.usefulness).toBe(0);
  });

  it('mixing probes with one real call keeps the denominator honest', () => {
    for (let i = 0; i < 95; i++) L.noteInvocation('gcdPair', { realArguments: false });
    L.noteInvocation('gcdPair');
    L.noteConsumption('gcdPair', 'agent');
    // 1 real invocation, 1 consumption => fully useful. The 95 probes do not
    // drag it down, because they are not attempts at anything.
    expect(L.stats('gcdPair').invokedReal).toBe(1);
    expect(L.usefulness('gcdPair')).toBe(1);
  });
});

describe('a consumption must name its consumer', () => {
  it('refuses an anonymous consumption rather than guessing', () => {
    L.noteInvocation('t');
    const counted = L.noteConsumption('t', '');
    expect(counted).toBe(false);
    expect(L.stats('t').consumed).toBe(0);
    expect(L.usefulness('t')).toBe(0);
  });

  it('records distinct consumers so attribution is possible', () => {
    L.noteInvocation('t');
    L.noteConsumption('t', 'capability:dedupe');
    L.noteConsumption('t', 'agent:tool_calling');
    expect(L.stats('t').consumers).toEqual(['agent:tool_calling', 'capability:dedupe']);
  });

  it('refuses an empty tool name', () => {
    L.noteInvocation('');
    expect(L.all()).toEqual([]);
    expect(L.noteConsumption('', 'c')).toBe(false);
  });
});

describe('ordering and totals', () => {
  it('sorts most-useful first', () => {
    L.noteInvocation('low'); L.noteConsumption('low', 'c');
    L.noteInvocation('high'); L.noteConsumption('high', 'c'); L.noteConsumption('high', 'c');
    const all = L.all();
    expect(all[0].tool).toBe('high');
    expect(all[all.length - 1].tool).toBe('low');
  });

  it('totals aggregate across tools', () => {
    L.noteInvocation('a'); L.noteConsumption('a', 'c');
    L.noteInvocation('b', { realArguments: false });
    const t = L.totals();
    expect(t.tools).toBe(2);
    expect(t.invoked).toBe(2);
    expect(t.invokedReal).toBe(1);
    expect(t.consumed).toBe(1);
  });

  it('bounds the recent-event buffer', () => {
    const small = new ToolValueLedger({ recentCap: 3 });
    for (let i = 0; i < 10; i++) small.noteInvocation('t');
    expect(small.recentEvents()).toHaveLength(3);
  });
});

describe('singleton', () => {
  it('is stable until reset', () => {
    resetToolValueLedger();
    const a = toolValueLedger();
    expect(toolValueLedger()).toBe(a);
    resetToolValueLedger();
    expect(toolValueLedger()).not.toBe(a);
  });
});