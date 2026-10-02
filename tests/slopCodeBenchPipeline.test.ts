import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SLOP_CODE_ENV_KEYS,
  slopCodeAgent,
  slopCodeBenchPipeline,
  slopCodeDir,
  slopCodeModel,
  slopCodeProblems,
} from '../src/lib/codingPipelines/index.js';

const tmpRoots: string[] = [];
function freshRoot(prefix = 'scb-'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('slopCodeBench config resolution', () => {
  it('honours the per-run env override for the checkout dir', () => {
    expect(slopCodeDir({ [SLOP_CODE_ENV_KEYS.dir]: '/tmp/scb' })).toBe('/tmp/scb');
  });

  it('falls back to the process env for the checkout dir', () => {
    vi.stubEnv(SLOP_CODE_ENV_KEYS.dir, '/tmp/from-process');
    expect(slopCodeDir()).toBe('/tmp/from-process');
  });

  it('threads agent/model/problem overrides and falls back to defaults', () => {
    expect(slopCodeAgent({ [SLOP_CODE_ENV_KEYS.agent]: 'codex' })).toBe('codex');
    expect(slopCodeAgent()).toBe('claude_code');
    expect(slopCodeModel({ [SLOP_CODE_ENV_KEYS.model]: 'openai/gpt-5' })).toBe('openai/gpt-5');
    expect(slopCodeModel()).toBe('anthropic/opus-4.5');
    expect(slopCodeProblems({ [SLOP_CODE_ENV_KEYS.problems]: 'a, b ,c' })).toEqual(['a', 'b', 'c']);
    expect(slopCodeProblems()).toEqual(['file_backup', 'execution_server']);
  });
});

describe('slopCodeBench pipeline', () => {
  it('is a standalone pipeline (excluded from the worktree runner)', () => {
    expect(slopCodeBenchPipeline.spec.mode).toBe('standalone');
  });

  it('reports the missing checkout honestly in status()', async () => {
    const empty = freshRoot('empty-');
    vi.stubEnv(SLOP_CODE_ENV_KEYS.dir, empty);
    const status = await slopCodeBenchPipeline.status();
    expect(status.available).toBe(false);
    expect(status.detail).toContain(empty);
  });

  it('fails honestly (no throw) when the checkout is missing', async () => {
    const empty = freshRoot('empty-');
    vi.stubEnv(SLOP_CODE_ENV_KEYS.dir, empty);
    const res = await slopCodeBenchPipeline.run({ task: 'x', workdir: empty });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('SlopCodeBench not found');
  });
});
