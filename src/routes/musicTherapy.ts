/**
 * musicTherapy.ts — the music sector descriptor plus the music-therapy research
 * instrument (trial design, tuning contrast, Europe PMC evidence feed),
 * extracted from the `server.ts` monolith.
 *
 * The pooled-evidence state and the Cochrane anchors stay in the host (the
 * Global Lens publish pass also reads the evidence pool), so they are injected
 * via getters/setters rather than owned here.
 */
import { Router } from 'express';
import { listStyles } from '../lib/composer/index.js';
import {
  TUNING_GRID,
  TUNING_RECORDS,
  TUNING_CAVEATS,
  tuningContrastModel,
  tuningContrastDetailed,
  benchmarkComparison,
  musicVsControlBenchmark,
  BENCHMARK_NOTE,
  renderTuningContrast,
  renderTuningSummary,
} from '../lib/musicTherapyTuning.js';

export interface MusicTherapyRouterDeps {
  anchors(): Record<string, { mean: number; sd: number; source: string }>;
  getEvidence(): any[];
  getQualitative(): any[];
  getFeedAt(): number | null;
  setFeed(poolable: any[], qualitative: any[], fetchedAt: number): void;
}

export function createMusicTherapyRouter(deps: MusicTherapyRouterDeps): Router {
  const router = Router();

  // --- Music sector descriptor (read-only) ---------------------------------
  router.get('/music/sector', (_req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-store');
    res.json({
      success: true,
      sector: {
        id: 'music',
        label: 'Music / composition (SoundLab)',
        verified: true,
        sources: ['recourse composer (deterministic)', 'SoundLab chord/song bridge'],
      },
      styles: listStyles(),
    });
  });

  // --- Music therapy trial design ------------------------------------------
  router.post('/music-therapy/design', async (req, res) => {
    try {
      const { designMusicTherapyTrial, designMusicTherapyBatch, renderTrialBatch } = await import('../lib/musicTherapyResearch.js');
      const { calibratePriors } = await import('../lib/musicTherapyEvidence.js');
      const evidence = deps.getEvidence();
      const body = req.body || {};
      const variants = Math.min(8, Number(body.variants) || 1);
      const base = {
        bpm: Number(body.bpm) || 60,
        key: Number(body.key) || 0,
        major: body.major === true,
        style: typeof body.style === 'string' ? body.style : 'jasper-ballad',
        seed: Number(body.seed) || 42,
        intensity: (body.intensity === 'stimulative' ? 'stimulative' : 'sedative') as 'sedative' | 'stimulative',
        tuningHz: Number(body.tuningHz) || 440,
      };
      let priors: any = undefined;
      if (body.useEvidence === true && evidence.length > 0) {
        const calibrated = calibratePriors(evidence, deps.anchors());
        priors = Object.fromEntries(calibrated.map((p: any) => [p.biomarker, { mean: p.mean, sd: p.sd, calibrated: p.calibrated, source: p.source }]));
      }
      const trials = variants > 1
        ? designMusicTherapyBatch(base, variants, priors)
        : [designMusicTherapyTrial(base, priors)];
      res.json({
        success: true,
        count: trials.length,
        useEvidence: body.useEvidence === true,
        calibrated: trials[0].calibratedCount,
        trials: trials.map((t) => ({
          id: t.id,
          stimulus: t.stimulus,
          biomarkers: t.biomarkers,
          evidenceTier: t.artifact.evidenceTier,
          artifactHash: t.artifact.artifactHash,
          claim: t.artifact.claim,
          calibratedCount: t.calibratedCount,
          tuningContrast: t.tuningContrast,
          tuningNote: t.tuningNote,
        })),
        report: renderTrialBatch(trials),
        honestNote: 'Biomarker responses are literature-prior models with uncertainty, not measurements. Music therapy is a supportive intervention, not a cancer treatment.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  // --- Tuning contrast -----------------------------------------------------
  router.get('/music-therapy/tuning', async (_req, res) => {
    try {
      res.json({
        success: true,
        grid: TUNING_GRID,
        contrasts: TUNING_GRID.map((hz) => ({ tuningHz: hz, records: tuningContrastModel(hz) })),
        detailedContrast: {
          432: tuningContrastDetailed(432),
          440: tuningContrastDetailed(440),
          443: tuningContrastDetailed(443),
          415: tuningContrastDetailed(415),
        },
        records: TUNING_RECORDS,
        benchmark: benchmarkComparison(),
        benchmarkRows: musicVsControlBenchmark(),
        benchmarkNote: BENCHMARK_NOTE,
        caveats: TUNING_CAVEATS,
        render: renderTuningContrast(),
        report: renderTuningSummary(TUNING_RECORDS, tuningContrastDetailed(432), musicVsControlBenchmark()),
        honestNote: 'Tuning contrasts are seeded design-specified records with PMIDs pending verification; biomarker responses are estimates, not measurements.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  // --- Evidence feed -------------------------------------------------------
  router.get('/music-therapy/evidence', async (_req, res) => {
    try {
      const { calibratePriors, renderCalibration } = await import('../lib/musicTherapyEvidence.js');
      const evidence = deps.getEvidence();
      const qualitative = deps.getQualitative();
      const priors = calibratePriors(evidence, deps.anchors());
      res.json({
        success: true,
        fetchedAt: deps.getFeedAt(),
        feedIdle: deps.getFeedAt() == null,
        poolableRecords: evidence.length,
        qualitativeRecords: qualitative.length,
        calibrated: priors.map((p: any) => ({
          biomarker: p.biomarker,
          mean: p.mean,
          sd: p.sd,
          calibrated: p.calibrated,
          source: p.source,
          k: p.pooled?.k ?? 0,
          totalN: p.pooled?.totalN ?? 0,
          iSquared: p.pooled?.iSquared ?? null,
          unpoolable: p.unpoolableCount,
        })),
        rawRecords: evidence.map((r: any) => ({
          biomarker: r.biomarker,
          effect: r.effect,
          se: r.se,
          n: r.n,
          year: r.year,
          source: r.source,
          pmid: r.pmid,
          detail: r.detail,
        })),
        report: renderCalibration(priors),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  router.post('/music-therapy/evidence/refresh', async (req, res) => {
    try {
      const { fetchMusicTherapyTrials } = await import('../lib/musicTherapyFeed.js');
      const body = req.body || {};
      const feed = await fetchMusicTherapyTrials({
        pageSize: Math.min(50, Number(body.pageSize) || 25),
        fullText: body.fullText === true,
        maxFullText: Math.min(20, Number(body.maxFullText) || 10),
      });
      deps.setFeed(feed.poolable, feed.qualitative, feed.fetchedAt);
      res.json({
        success: true,
        hitCount: feed.hitCount,
        trialsFetched: feed.trials.length,
        poolableRecords: feed.poolable.length,
        qualitativeRecords: feed.qualitative.length,
        fullTextFetched: feed.fullTextFetched,
        fullTextExtracted: feed.fullTextExtracted,
        errors: feed.errors,
        honestNote: 'Only machine-parseable effect statements (MD + 95% CI, regression coefficients with SE, or per-arm mean±SD with n) from real articles were pooled. Median (IQR) rows and unattributed rows are never turned into numbers.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  return router;
}
