#!/usr/bin/env tsx
/**
 * train-mixing-model.ts — enqueue a Qwen 3.5 4B audio-mixing fine-tune on Kaggle GPU
 * and register the applier so the result feeds the recursive learner (externalScore).
 *
 * Usage:
 *   tsx scripts/train-mixing-model.ts
 *   # then drain: tsx scripts/drain-remote.ts (or call drainRemoteTasks in the server)
 *
 * The training keeps improving: each completed run records metrics to
 * data/mixing-models.json and feeds json_validity into the learner as externalScore,
 * so the next cycle can decide to retrain with more/better data.
 */
import { initializeComputePlatforms } from '../src/lib/computePlatforms.js';
import { enqueueMixingModelTraining, registerRemoteComputeAppliers, readMixingModelRegistry } from '../src/lib/remoteComputeIntegrations.js';
import { drainRemoteTasks, readRemoteQueue } from '../src/lib/remoteCompute.js';

async function main() {
  await initializeComputePlatforms();
  registerRemoteComputeAppliers({
    applyExternalScore: async (score, task) => {
      console.log(`[train-mixing] learner externalScore <- ${score} (task ${task.id})`);
    },
    appendProvenance: (type, data) => console.log(`[train-mixing] provenance: ${type}`, data),
  });

  const res = await enqueueMixingModelTraining({ hardware: { type: 'gpu' }, maxRuntimeMs: 4 * 60 * 60 * 1000 });
  if (!res.queued || !res.task) {
    console.error('enqueue refused:', res.reason);
    process.exit(1);
  }
  console.log('queued task', res.task.id, 'on', res.task.platform);
  console.log('kernel:', res.task.handle?.externalId);

  // Drain until finished (poll every 30s, up to 4.5h)
  const deadline = Date.now() + 4.5 * 60 * 60 * 1000;
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
      const reg = readMixingModelRegistry();
      console.log('registry entries:', reg.models.length);
      const last = reg.models[reg.models.length - 1];
      console.log('last run:', JSON.stringify(last, null, 2));
      console.log('HF repo:', last?.hfRepo);
      process.exit(0);
    }
  }
  console.error('timeout waiting for training');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
