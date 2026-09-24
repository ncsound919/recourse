import { describe, it, expect } from 'vitest';
import { AsyncMutex } from '../src/lib/asyncMutex';

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

describe('AsyncMutex', () => {
  it('never lets two critical sections overlap', async () => {
    const mutex = new AsyncMutex();
    let active = 0;
    let maxActive = 0;
    const events: string[] = [];
    const section = (id: string, ms: number) => mutex.runExclusive(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      events.push(`start-${id}`);
      await sleep(ms);
      events.push(`end-${id}`);
      active--;
      return id;
    });

    const out = await Promise.all([section('a', 20), section('b', 5), section('c', 1)]);
    expect(maxActive).toBe(1);
    expect(out).toEqual(['a', 'b', 'c']);
    // FIFO: each section fully completes before the next starts.
    expect(events).toEqual(['start-a', 'end-a', 'start-b', 'end-b', 'start-c', 'end-c']);
  });

  it('survives a rejected section and still runs the next', async () => {
    const mutex = new AsyncMutex();
    await expect(mutex.runExclusive(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(mutex.runExclusive(async () => 42)).resolves.toBe(42);
  });
});
