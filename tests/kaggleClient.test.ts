import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveKaggleCredentials, kaggleSlug, kernelMetadata, parseKernelStatus, parseKernelLog,
  reserveQuota, settleQuota, readQuota, committedHours, weekStartUtc, setKaggleRunner, type KaggleRunner,
} from '../src/lib/kaggleClient';
import { kagglePlatform, setKaggleSleep, type ComputeJob } from '../src/lib/computePlatforms';

let dir: string;
let qfile: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-test-'));
  qfile = path.join(dir, 'q.json');
  process.env.KAGGLE_QUOTA_FILE = qfile;
  setKaggleSleep(async () => {});
});
afterEach(() => {
  delete process.env.KAGGLE_QUOTA_FILE;
  setKaggleRunner(null);
  setKaggleSleep(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('credentials', () => {
  it('env wins over a file', () => {
    const c = resolveKaggleCredentials({ env: { KAGGLE_USERNAME: 'u', KAGGLE_KEY: 'k' }, home: dir });
    expect(c).toEqual({ username: 'u', key: 'k', source: 'env' });
  });
  it('reads <home>/.kaggle/kaggle.json (home is os.homedir-style, not $HOME), tolerating a BOM', () => {
    fs.mkdirSync(path.join(dir, '.kaggle'));
    fs.writeFileSync(path.join(dir, '.kaggle', 'kaggle.json'), '﻿' + JSON.stringify({ username: 'fu', key: 'fk' }));
    expect(resolveKaggleCredentials({ env: {}, home: dir })).toEqual({ username: 'fu', key: 'fk', source: 'file' });
  });
  it('null when nothing is configured', () => {
    expect(resolveKaggleCredentials({ env: {}, home: dir })).toBeNull();
  });
});

describe('addressing + metadata', () => {
  it('slugs are lowercase kebab, 3..50', () => {
    expect(kaggleSlug('rc_forge_precompute_179_AbC')).toBe('rc-forge-precompute-179-abc');
    expect(kaggleSlug('x')).toBe('recourse-x');
    expect(kaggleSlug('a'.repeat(80)).length).toBeLessThanOrEqual(50);
  });
  it('id is username/slug and the title slugifies back to the slug', () => {
    const m = kernelMetadata({ username: 'bob', slug: 'recourse-forge-precompute', codeFile: 'n.ipynb', gpu: true, tpu: false });
    expect(m.id).toBe('bob/recourse-forge-precompute');
    expect(kaggleSlug(String(m.title))).toBe('recourse-forge-precompute');
    expect(m).toMatchObject({ enable_gpu: true, enable_tpu: false, enable_internet: true, is_private: true });
    expect((m as any).dataset_sources).toEqual([]);
  });
  it('mounts requested dataset sources, else empty', () => {
    const m = kernelMetadata({ username: 'bob', slug: 'recourse-onco-survival', codeFile: 'n.ipynb', gpu: false, tpu: false, datasetSources: ['tcga/brca', 'owner/kaggle-onco'] });
    expect((m as any).dataset_sources).toEqual(['tcga/brca', 'owner/kaggle-onco']);
  });
});

describe('parsing', () => {
  it('status: old and new CLI spellings', () => {
    expect(parseKernelStatus('bob/x has status "KernelWorkerStatus.COMPLETE"').state).toBe('complete');
    expect(parseKernelStatus('bob/x has status "complete"').state).toBe('complete');
    expect(parseKernelStatus('bob/x has status "running"').state).toBe('running');
    expect(parseKernelStatus('bob/x has status "queued"').state).toBe('queued');
    expect(parseKernelStatus('bob/x has status "KernelWorkerStatus.CANCEL_ACKNOWLEDGED"').state).toBe('cancelled');
    const e = parseKernelStatus('bob/x has status "error"\nFailure message: OOM');
    expect(e).toMatchObject({ state: 'error', failure: 'OOM' });
    expect(parseKernelStatus('garbage').state).toBe('unknown');
  });
  it('log: joins stdout events, separates stderr, survives non-JSON', () => {
    const log = JSON.stringify([{ stream_name: 'stdout', data: 'a\n' }, { stream_name: 'stderr', data: 'warn' }, { stream_name: 'stdout', data: '__RECOURSE_RESULT__{"ok":true}\n' }]);
    expect(parseKernelLog(log)).toEqual({ stdout: 'a\n__RECOURSE_RESULT__{"ok":true}\n', stderr: 'warn' });
    expect(parseKernelLog('plain text').stdout).toBe('plain text');
    expect(parseKernelLog('[{"stream_name":"stdout","data":"x\\n"},').stdout).toBe('x\n'); // truncated array
  });
});

describe('quota ledger', () => {
  it('reserves, blocks overshoot, settles to ACTUAL usage (never above the reservation)', () => {
    reserveQuota('j1', 'gpu', 12, qfile);
    reserveQuota('j2', 'gpu', 12, qfile);
    expect(() => reserveQuota('j3', 'gpu', 12, qfile)).toThrow(/quota would be exceeded/);
    settleQuota('j1', 30 * 60_000, qfile); // ran 30 min of a 12h reservation
    const d = readQuota(qfile);
    expect(d.gpuHours).toBeCloseTo(0.5, 5);
    expect(committedHours(d, 'gpu')).toBeCloseTo(12.5, 5);
    settleQuota('j1', 999 * 3_600_000, qfile); // idempotent: already settled
    expect(readQuota(qfile).gpuHours).toBeCloseTo(0.5, 5);
    reserveQuota('j3', 'gpu', 12, qfile); // fits now that j1 settled low
  });
  it('resets on a new week', () => {
    reserveQuota('j1', 'gpu', 5, qfile);
    settleQuota('j1', 5 * 3_600_000, qfile);
    const later = Date.now() + 8 * 86_400_000;
    expect(weekStartUtc(later)).not.toBe(readQuota(qfile).weekStart);
    expect(readQuota(qfile, later).gpuHours).toBe(0);
  });
});

function fakeKaggle(script: { status?: string[]; log?: string; pushOut?: string }) {
  const calls: string[][] = [];
  const statuses = [...(script.status ?? ['complete'])];
  const run: KaggleRunner = async (args) => {
    calls.push(args);
    if (args[0] === '--version') return { stdout: 'Kaggle API 1.7', stderr: '' };
    if (args[1] === 'status') {
      const s = statuses.length > 1 ? statuses.shift()! : statuses[0];
      return { stdout: `bob/recourse-forge-precompute has status "${s}"`, stderr: '' };
    }
    if (args[1] === 'push') return { stdout: script.pushOut ?? 'Kernel version 1 successfully pushed.', stderr: '' };
    if (args[1] === 'output') {
      const dest = args[args.indexOf('-p') + 1];
      fs.writeFileSync(path.join(dest, 'recourse-forge-precompute.log'), script.log ?? '[]');
      return { stdout: 'Output file downloaded', stderr: '' };
    }
    throw new Error('unexpected ' + args.join(' '));
  };
  setKaggleRunner(run);
  return calls;
}

const job = (over: Partial<ComputeJob> = {}): ComputeJob => ({
  id: 'rc_forge_precompute_1', platform: 'kaggle', kind: 'notebook',
  payload: { kernel: 'python3', cells: [{ type: 'code', source: 'print(1)' }] },
  hardware: { type: 'gpu' }, maxRuntimeMs: 3_600_000, meta: { kernelSlug: 'recourse-forge-precompute' }, ...over,
});

async function configured() {
  process.env.KAGGLE_USERNAME = 'bob'; process.env.KAGGLE_KEY = 'k';
  await kagglePlatform.initialize?.();
  delete process.env.KAGGLE_USERNAME; delete process.env.KAGGLE_KEY;
}

describe('kagglePlatform with a fake CLI', () => {
  it('submit → poll → fetch returns the NOTEBOOK log (envelope parseable) and settles quota to actual', async () => {
    const log = JSON.stringify([{ stream_name: 'stdout', data: '__RECOURSE_RESULT__{"ok":true,"n":3}\n' }]);
    const calls = fakeKaggle({ status: ['complete', 'running', 'running', 'complete'], log });
    await configured();
    expect(kagglePlatform.configured).toBe(true);
    // 1st status call (busy guard) says complete => free to push
    const h = await kagglePlatform.submit(job());
    expect(h.externalId).toBe('bob/recourse-forge-precompute');
    const push = calls.find((c) => c[1] === 'push')!;
    expect(push.slice(0, 3)).toEqual(['kernels', 'push', '-p']);
    const r = await kagglePlatform.fetch(h, 60_000);
    expect(r.success).toBe(true);
    expect(r.stdout).toContain('__RECOURSE_RESULT__{"ok":true,"n":3}');
    const q = readQuota(qfile);
    expect(Object.keys(q.reserved)).toHaveLength(0);
    expect(q.gpuHours).toBeLessThan(0.01); // ran for ms, not the 1h reserved
  });

  it('refuses to push over a kernel that is still running, and releases the reservation', async () => {
    fakeKaggle({ status: ['running'] });
    await configured();
    await expect(kagglePlatform.submit(job())).rejects.toThrow(/still running/);
    expect(Object.keys(readQuota(qfile).reserved)).toHaveLength(0);
  });

  it('treats a rejected push (error text, exit 0) as a failure and releases quota', async () => {
    fakeKaggle({ status: ['complete'], pushOut: "Kernel push error: The kernel title does not resolve to the specified id" });
    await configured();
    await expect(kagglePlatform.submit(job())).rejects.toThrow(/rejected the push/);
    expect(Object.keys(readQuota(qfile).reserved)).toHaveLength(0);
  });

  it('a failed kernel is reported failed with its failure message, not a fake success', async () => {
    fakeKaggle({ status: ['complete', 'error'] });
    await configured();
    const h = await kagglePlatform.submit(job());
    const r = await kagglePlatform.fetch(h, 60_000);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/error/);
  });

  it('tolerates transient status failures, then fails loudly after 5', async () => {
    let n = 0;
    setKaggleRunner(async (args) => {
      if (args[0] === '--version') return { stdout: '', stderr: '' };
      n++; throw new Error('network down');
    });
    await configured();
    const h = { id: 'jx', platform: 'kaggle' as const, externalId: 'bob/s', submittedAt: Date.now(), status: 'running' as const };
    for (let i = 0; i < 4; i++) expect((await kagglePlatform.poll(h)).state).toBe('running');
    const last = await kagglePlatform.poll(h);
    expect(last.state).toBe('failed');
    expect(n).toBe(5);
  });

  it('a hostile job id cannot reach a shell: it is slugified and passed as an argv element', async () => {
    const calls = fakeKaggle({ status: ['complete'] });
    await configured();
    await kagglePlatform.submit(job({ id: 'x"; rm -rf / #', meta: {} }));
    const statusCall = calls.find((c) => c[1] === 'status')!;
    expect(statusCall[2]).toMatch(/^bob\/[a-z0-9-]+$/);
  });

  it('quota: submit is refused when the weekly GPU limit would be exceeded', async () => {
    fakeKaggle({ status: ['complete'] });
    await configured();
    await expect(kagglePlatform.submit(job({ maxRuntimeMs: 31 * 3_600_000 }))).rejects.toThrow(/quota would be exceeded/);
  });
});
