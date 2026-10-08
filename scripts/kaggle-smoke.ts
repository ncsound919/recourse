/**
 * kaggle-smoke.ts — the one test that matters for the Kaggle integration: does a
 * REAL kernel round-trip? Everything else is tested against a fake CLI; this is
 * the only thing that can tell you the fake matches Kaggle.
 *
 *   npm run kaggle:smoke
 *
 * Costs nothing from the GPU quota (CPU kernel, ~1-3 min). Needs the `kaggle` CLI
 * on PATH and credentials (KAGGLE_USERNAME + KAGGLE_KEY, or ~/.kaggle/kaggle.json).
 * Exits non-zero on the first thing that does not work and says which stage failed.
 */
import { initializeComputePlatforms, getPlatform } from '../src/lib/computePlatforms.js';
import { enqueueRemoteTask, drainRemoteTasks, readRemoteQueue } from '../src/lib/remoteCompute.js';
import { resolveKaggleCredentials, readQuota, quotaFilePath } from '../src/lib/kaggleClient.js';

const log = (s: string) => console.log(`[kaggle-smoke] ${s}`);
const fail = (stage: string, why: string): never => {
  console.error(`[kaggle-smoke] FAIL at ${stage}: ${why}`);
  process.exit(1);
};

async function main() {
  const creds = resolveKaggleCredentials();
  if (!creds) fail('credentials', 'no KAGGLE_USERNAME/KAGGLE_KEY and no kaggle.json found');
  log(`credentials: ${creds!.username} (from ${creds!.source})`);

  await initializeComputePlatforms();
  const kaggle = getPlatform('kaggle')!;
  if (!kaggle.configured) fail('cli', '`kaggle --version` failed — install the CLI (pip install kaggle) and put it on PATH');
  log('kaggle CLI reachable');

  const marker = `smoke-${Date.now()}`;
  const q = await enqueueRemoteTask(
    'learner_stress_eval',
    { script: `import platform\nresult = {"ok": True, "marker": "${marker}", "python": platform.python_version()}`, requirements: [] },
    { platform: 'kaggle', hardware: { type: 'cpu' }, maxRuntimeMs: 15 * 60_000 },
  );
  if (!q.queued) fail('push', q.reason ?? 'enqueue refused');
  log(`pushed kernel ${q.task!.handle.externalId} (task ${q.task!.id})`);

  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20_000));
    await drainRemoteTasks({}, 5);
    const t = readRemoteQueue().tasks.find((x) => x.id === q.task!.id);
    log(`status: ${t?.status}`);
    if (t && (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')) {
      if (t.status !== 'completed') fail('run', t.result?.error ?? t.status);
      if (t.result?.data?.marker !== marker) fail('result', `envelope came back but marker did not match: ${JSON.stringify(t.result?.data)}`);
      const quota = readQuota();
      log(`OK — round trip works. kernel python ${String(t.result?.data?.python)}; took ${t.result?.durationMs}ms`);
      log(`quota ledger (${quotaFilePath()}): gpu ${quota.gpuHours.toFixed(2)}h, cpu ${quota.cpuHours.toFixed(2)}h, unsettled ${Object.keys(quota.reserved).length}`);
      process.exit(0);
    }
  }
  fail('timeout', 'kernel did not finish in 20 minutes');
}

main().catch((e) => fail('unexpected', e instanceof Error ? e.message : String(e)));
