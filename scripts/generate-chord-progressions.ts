/**
 * generate-chord-progressions.ts — generate a fresh pool of ChordStudio
 * progressions, have the TRAINED model score it on the remote box, and save the
 * model's top picks.
 *
 *   npx tsx scripts/generate-chord-progressions.ts <poolDir> <outDir> [trainCount] [topK]
 *
 * `poolDir` holds a freshly generated corpus (see ChordProgressionCorpusGen);
 * the first `trainCount` files train the model, the rest are the unseen
 * candidate pool the model ranks. Uses an isolated remote queue so it does not
 * interfere with the running server's.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const poolDir = process.argv[2];
const outDir = process.argv[3];
const trainCount = Number(process.argv[4] ?? 300);
const topK = Number(process.argv[5] ?? 24);

if (!poolDir || !outDir) {
  console.error('usage: tsx scripts/generate-chord-progressions.ts <poolDir> <outDir> [trainCount] [topK]');
  process.exit(2);
}

// Isolate the remote queue from the running server's.
process.env.REMOTE_COMPUTE_FILE = path.join(os.tmpdir(), `rc-chordgen-${Date.now()}.json`);

const { initializeComputePlatforms } = await import('../src/lib/computePlatforms.js');
const { readChordStudioProgressions, buildChordStudioTrainingRows, chordStudioFeatures } = await import(
  '../src/lib/chordStudioSource.js'
);
const { isComposerTrainingSet } = await import('../src/lib/composerTraining.js');
const { latestRunGrade } = await import('../src/lib/runGradeLedger.js');
const { fromChordStudioProgression, theoryMetrics, theoryScore, weakestMetric, novelty, conventionalReference } = await import(
  '../src/lib/theoryComparison.js'
);
const { enqueueRemoteTask, drainRemoteTasks, readRemoteQueue } = await import('../src/lib/remoteCompute.js');

const indexOf = (file: string | undefined): number => {
  const m = /cs-(\d+)\.progression$/i.exec(path.basename(file ?? ''));
  return m ? Number(m[1]) : NaN;
};

async function main(): Promise<void> {
  const scan = readChordStudioProgressions(poolDir);
  const train = scan.progressions.filter((p) => indexOf(p.file) < trainCount);
  const cand = scan.progressions.filter((p) => indexOf(p.file) >= trainCount);
  console.log(`pool: ${scan.progressions.length} scanned; train=${train.length} candidates=${cand.length}`);

  const set = buildChordStudioTrainingRows(train);
  if (!isComposerTrainingSet(set)) {
    console.error(`cannot train: ${set.reason}`);
    process.exit(1);
  }

  const predictRows = cand.map(chordStudioFeatures);
  await initializeComputePlatforms();

  const q = await enqueueRemoteTask(
    'train_small_model',
    { rows: set.rows, target: set.target, task: 'regression', model: 'mlp', predictRows },
    { platform: 'kaggle', hardware: { type: 'cpu' } },
  );
  if (!q.queued) {
    console.error(`enqueue refused: ${q.reason}`);
    process.exit(1);
  }
  console.log(`queued ${q.task!.id} (external ${q.task!.handle.externalId}); training on ${set.rows.length} rows, scoring ${predictRows.length} candidates`);

  const deadline = Date.now() + 25 * 60_000;
  let task = q.task!;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20_000));
    await drainRemoteTasks({}, 5);
    task = readRemoteQueue().tasks.find((t) => t.id === task.id) ?? task;
    process.stdout.write(`\r  status: ${task.status}      `);
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') break;
  }
  console.log('');

  if (task.status !== 'completed') {
    console.error(`task ${task.status}: ${task.result?.error ?? ''}`);
    process.exit(1);
  }

  const data = task.result?.data as { metric?: number; metricName?: string; predictions?: number[] } | undefined;
  const preds = data?.predictions;
  if (!Array.isArray(preds) || preds.length !== cand.length) {
    console.error(`no predictions (${preds?.length ?? 0} for ${cand.length} candidates)`);
    process.exit(1);
  }
  console.log(`model ${data?.metricName}=${data?.metric} (held-out); scored ${preds.length} candidates`);

  // Closed loop: bias this run's selection toward the metric the PREVIOUS
  // ChordStudio run was graded weakest on, so grading a run actually changes the
  // next one. No previous grade => selection is the model alone.
  const prevGrade = latestRunGrade('chordstudio');
  const biasKey = prevGrade ? weakestMetric(prevGrade).key : null;
  const BIAS_WEIGHT = 5; // max points added to the model's predicted score
  console.log(
    biasKey
      ? `closed loop: biasing selection toward previous run's weakest metric "${biasKey}" (was ${(weakestMetric(prevGrade!).value).toFixed(2)})`
      : 'closed loop: no previous ChordStudio grade; selecting on the model alone',
  );

  const reference = conventionalReference();
  // Exploration quota: reserve a slice of the output for the most NOVEL coherent
  // candidates, so the loop keeps uncovering new styles/feels instead of
  // converging on safe convention. The rest is conformance-biased as before.
  const exploreQuota = Math.max(1, Math.round(topK * 0.25));

  const ranked = cand
    .map((p, i) => {
      const theory = fromChordStudioProgression(p);
      const metrics = theoryMetrics(theory);
      const bias = biasKey ? BIAS_WEIGHT * (metrics.find((m) => m.key === biasKey)?.value ?? 0) : 0;
      const ts = theoryScore(theory);
      const nov = novelty(theory, reference);
      return {
        p,
        predicted: preds[i],
        critic: typeof p.score === 'number' ? p.score : null,
        theoryScore: ts,
        novelty: nov,
        exploration: nov * ts, // coherence-gated novelty
        rank: preds[i] + bias,
      };
    })
    .sort((a, b) => b.rank - a.rank);

  // Selection: style-diverse conformance picks first, then a novelty quota, then
  // fill by rank.
  const chosen: typeof ranked = [];
  const seenStyle = new Set<string>();
  for (const r of ranked) {
    if (chosen.length >= topK - exploreQuota) break;
    const s = r.p.styleId ?? '';
    if (!seenStyle.has(s)) {
      seenStyle.add(s);
      chosen.push(r);
    }
  }
  for (const r of [...ranked].sort((a, b) => b.exploration - a.exploration)) {
    if (chosen.length >= topK) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  for (const r of ranked) {
    if (chosen.length >= topK) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  console.log(`selection: ${chosen.length - exploreQuota} conformance + ${exploreQuota} exploration quota`);

  fs.mkdirSync(outDir, { recursive: true });
  const manifest: Array<Record<string, unknown>> = [];
  chosen.forEach((r, i) => {
    const n = String(i + 1).padStart(2, '0');
    const style = (r.p.styleId ?? 'prog').replace(/[^a-z0-9-]/gi, '');
    const root = (r.p.rootNote ?? '').replace(/[^a-z0-9#]/gi, '');
    const dest = path.join(outDir, `${n}-${style}-${root}.progression`);
    if (r.p.file) fs.copyFileSync(r.p.file, dest);
    manifest.push({
      file: path.basename(dest),
      name: r.p.name,
      styleId: r.p.styleId ?? null,
      writerId: r.p.writerId ?? null,
      predictedScore: r.predicted,
      criticScore: r.critic,
      theoryScore: r.theoryScore,
      novelty: r.novelty,
      exploration: r.exploration,
      biasedToward: biasKey,
      chords: r.p.chords.map((c) => c.name),
    });
  });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${chosen.length} progressions + manifest.json to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
