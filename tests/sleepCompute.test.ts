import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  planSleepTasks,
  runSleepComputeUnit,
  takeReadySleepArtifact,
  sleepComputeSnapshot,
  readSleepStore,
  type SleepTask,
} from '../src/lib/sleepCompute';

const dirs: string[] = [];
function tmpFile(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sleep-'));
  dirs.push(d);
  return path.join(d, 'sleep.json');
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  delete process.env.SLEEP_COMPUTE_FILE;
});

const tasks: SleepTask[] = [
  { name: 'alpha', domain: 'coding', prompt: 'do alpha', refSuite: 'assert alpha()' },
  { name: 'beta', domain: 'math', prompt: 'do beta', refSuite: 'assert beta()' },
];

describe('sleepCompute — offline precompute of verified artifacts (arXiv:2504.13171)', () => {
  it('plans only uncovered specs, bounded', () => {
    expect(planSleepTasks(tasks, ['alpha'], 3).map((t) => t.name)).toEqual(['beta']);
    expect(planSleepTasks(tasks, [], 1).map((t) => t.name)).toEqual(['alpha']);
  });

  it('stores only sandbox-verified artifacts as ready, and serves them', async () => {
    process.env.SLEEP_COMPUTE_FILE = tmpFile();
    const result = await runSleepComputeUnit({
      specs: tasks,
      generate: async (t) => ({ ok: true, source: `export function ${t.name}(){}` }),
      verify: (_source, suite) => ({ passed: suite.includes('alpha') }), // beta fails verification
    });
    expect(result.attempted).toBe(2);
    expect(result.ready).toBe(1);
    expect(takeReadySleepArtifact('alpha')?.source).toContain('alpha');
    // beta was generated but failed its suite -> NOT served as ready
    expect(takeReadySleepArtifact('beta')).toBeNull();
    const snap = sleepComputeSnapshot();
    expect(snap.ready).toBe(1);
    expect(snap.names).toContain('alpha');
  });

  it('is a no-op (not a fabricated artifact) when generation fails', async () => {
    process.env.SLEEP_COMPUTE_FILE = tmpFile();
    const result = await runSleepComputeUnit({
      specs: tasks,
      generate: async () => ({ ok: false }),
      verify: () => ({ passed: true }),
    });
    expect(result.ready).toBe(0);
    expect(readSleepStore().artifacts).toHaveLength(0);
  });

  it('does not re-precompute an already-ready name', async () => {
    process.env.SLEEP_COMPUTE_FILE = tmpFile();
    const gen = async (t: SleepTask) => ({ ok: true, source: `${t.name}` });
    await runSleepComputeUnit({ specs: tasks, generate: gen, verify: () => ({ passed: true }) });
    const second = await runSleepComputeUnit({ specs: tasks, generate: gen, verify: () => ({ passed: true }) });
    expect(second.attempted).toBe(0); // both already verified
    expect(second.note).toContain('nothing to precompute');
  });
});
