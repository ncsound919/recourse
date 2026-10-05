import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { swallow, swallowCounts, swallowLastMessage, swallowReport, resetSwallowCounts } from '../src/lib/swallow';

const ROOT = process.cwd();

describe('swallow', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSwallowCounts();
    // Re-spying an already-spied method returns the SAME spy with its history
    // intact, so the call list has to be cleared explicitly or every later
    // assertion sees the earlier tests' calls.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
  });

  it('returns the fallback unchanged, so behaviour is not altered', () => {
    expect(swallow('a', new Error('boom'), [])).toEqual([]);
    expect(swallow('a', new Error('boom'), null)).toBeNull();
    expect(swallow('a', 'string failure', 0)).toBe(0);
  });

  it('counts per tag and keeps the last message', () => {
    swallow('route.a', new Error('first'), undefined);
    swallow('route.a', new Error('second'), undefined);
    swallow('route.b', new Error('other'), undefined);
    expect(swallowCounts.get('route.a')).toBe(2);
    expect(swallowCounts.get('route.b')).toBe(1);
    expect(swallowLastMessage.get('route.a')).toBe('second');
  });

  it('logs with a tag that says where it happened', () => {
    swallow('dedupe.recordRefusal', new Error('ledger locked'), undefined);
    expect(warn).toHaveBeenCalledWith('[swallow:dedupe.recordRefusal]', 'ledger locked');
  });

  it('never throws, even for an error that cannot be printed', () => {
    const hostileToString = { toString() { throw new Error('cannot stringify'); } };
    expect(swallow('a', hostileToString, 'fallback')).toBe('fallback');
    expect(swallowLastMessage.get('a')).toBe('<unprintable error>');
  });

  it('survives an error object whose message getter throws', () => {
    const hostile = Object.create(Error.prototype, {
      message: { get() { throw new Error('no message for you'); } },
    });
    expect(swallow('b', hostile, 7)).toBe(7);
  });

  it('reports sorted totals for the status surface', () => {
    swallow('z', new Error('1'), undefined);
    swallow('a', new Error('1'), undefined);
    swallow('a', new Error('2'), undefined);
    const report = swallowReport();
    expect(report.total).toBe(3);
    expect(report.tags.map((t) => t.tag)).toEqual(['a', 'z']);
    expect(report.tags[0]).toEqual({ tag: 'a', count: 2, lastMessage: '2' });
  });
});

describe('server.ts has no silent catch blocks', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');

  it('every catch block names itself through swallow()', () => {
    // The F9 done-when: `grep -nE "catch\s*\{\s*(return|//|/\*)" server.ts`
    // returns nothing. Asserted here so it cannot regress on the next edit.
    const silent = src.match(/catch\s*\{\s*(?:return|\/\/|\/\*)/g) ?? [];
    expect(silent).toEqual([]);
  });

  it('and there is a meaningful number of swallows wired', () => {
    const wired = src.match(/swallow\('/g) ?? [];
    // A gate that passed because zero catches existed would be theatre; assert
    // the replacements are actually present and spread across subsystems.
    expect(wired.length).toBeGreaterThan(20);
    for (const area of ['boot.', 'shutdown.', 'forge.', 'novelty.', 'bridge.', 'tick.']) {
      expect(src).toContain(`swallow('${area}`);
    }
  });

  it('imports swallow so the counters are the same module the status route reads', () => {
    expect(src).toContain("from './src/lib/swallow.js'");
  });

  it('the status route surfaces the counters', () => {
    const readout = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'readout.ts'), 'utf8');
    expect(readout).toContain('swallowReport()');
    expect(readout).toContain('status.swallowed');
    const types = fs.readFileSync(path.join(ROOT, 'src', 'types.ts'), 'utf8');
    expect(types).toContain('swallowed?:');
  });
});
