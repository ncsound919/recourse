#!/usr/bin/env tsx
/**
 * train-music-therapy-concordance.ts — enqueue a music therapy concordance run on Kaggle CPU.
 * Generates music therapy stimuli, models biomarker responses, trains outcome predictor.
 * Result feeds the recursive learner (externalScore = best R2).
 */
import { initializeComputePlatforms } from '../src/lib/computePlatforms.js';
import { enqueueMusicTherapyConcordanceTraining, registerRemoteComputeAppliers, readMusicTherapyConcordanceRegistry } from '../src/lib/remoteComputeIntegrations.js';
import { drainRemoteTasks, readRemoteQueue } from '../src/lib/remoteCompute.js';

async function main() {
  await initializeComputePlatforms();
  registerRemoteComputeAppliers({
    applyExternalScore: async (score, task) => console.log(`[music-therapy] learner externalScore <- ${score} (task ${task.id})`),
    appendProvenance: (type, data) => console.log(`[music-therapy] provenance: ${type}`, data),
  });

  const res = await enqueueMusicTherapyConcordanceTraining({ hardware: { type: 'cpu' }, maxRuntimeMs: 60 * 60 * 1000 });
  if (!res.queued || !res.task) {
    console.error('enqueue refused:', res.reason);
    process.exit(1);
  }
  console.log('queued task', res.task.id, 'on', res.task.platform);

  const deadline = Date.now() + 70 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 30_000));
    const summary = await drainRemoteTasks({}, 5);
    const t = readRemoteQueue().tasks.find((x) => x.id === res.task!.id);
    console.log(`status: ${t?.status}${t?.result?.error ? ' err=' + t.result.error : ''}`);
    if (t && (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')) {
      if (t.status !== 'completed') {
        console.error('training failed:', t.result?.error);
        process.exit(1);
      }
      const reg = readMusicTherapyConcordanceRegistry();
      const last = reg.models[reg.models.length - 1];
      console.log('last run:', JSON.stringify(last, null, 2));
      process.exit(0);
    }
  }
  console.error('timeout');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
